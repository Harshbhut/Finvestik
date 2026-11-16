"""Offline regression checks: no vendor endpoints and no tracked data are modified."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import Daily_Data as daily
import Historical_Data as historical
import NSE as nse
import Sector_Industry as sector
from data_utils import atomic_write_json

spec = importlib.util.spec_from_file_location("high_low", SCRIPTS / "52_Week_High_Low.py")
high_low = importlib.util.module_from_spec(spec)
spec.loader.exec_module(high_low)


class SnapshotTests(unittest.TestCase):
    def test_invalid_json_preserves_previous_snapshot_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snapshot.json'
            atomic_write_json({'ok': 1}, path)
            before = path.read_bytes()
            with self.assertRaises(ValueError):
                atomic_write_json({'bad': float('nan')}, path)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_write_failure_is_not_silenced(self):
        with patch('data_utils.os.replace', side_effect=OSError('disk unavailable')):
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(OSError):
                    daily.save_json_file([{'Symbol': 'ABC'}], Path(directory) / 'data.json')
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_empty_high_low_preserves_previous_report(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.json'
            path.write_text('{"old":true}')
            with self.assertRaises(ValueError):
                high_low.safe_write_json(path, {'data': []})
            self.assertEqual(json.loads(path.read_text()), {'old': True})

    def test_all_null_high_low_report_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.json'
            atomic_write_json({'data': [{'Symbol': 'ABC', '52_Weeks_High': 200}]}, path)
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'no valid extrema'):
                high_low.safe_write_json(path, {'data': [{'Symbol': 'ABC',
                    '52_Weeks_High': None, '52_Weeks_Low': None}]})
            self.assertEqual(path.read_bytes(), before)

    def test_nse_invalid_csv_does_not_publish(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_lines.return_value = iter(['not,a,security,csv', '1,2,3,4'])
        with patch.object(nse.requests, 'get', return_value=response):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'data.json'
                path.write_text('[{"old":true}]')
                with self.assertRaises(ValueError):
                    nse.stream_csv_to_json('https://example.invalid', path)
                self.assertEqual(json.loads(path.read_text()), [{'old': True}])


class DailyTests(unittest.TestCase):
    def test_published_schema_rounding_nulls_and_union_of_columns(self):
        stocks = [{'symbol': 'ABC', 'close': 123.45, '%change': 1.237,
                   'SecurityID': 1, 'open': 100, '_RS_3M_value': 2,
                   'RS_3M': 99, 'day_extra': float('nan')},
                  {'symbol': 'XYZ', 'close': 10, '%change': -2.345}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'data.json'
            with patch.dict(daily.CONFIG, output_file=path):
                daily.prepare_and_save_data(stocks)
            records = json.loads(path.read_text())
        self.assertEqual(records[0]['Symbol'], 'ABC')
        self.assertEqual(records[0]['current_price'], 123.45)
        self.assertEqual(records[0]['change_percentage'], 1.24)
        self.assertIsNone(records[0]['day_extra'])
        self.assertIsNone(records[1]['RS_3M'])
        self.assertEqual(set(records[0]), set(records[1]))
        self.assertNotIn('SecurityID', records[0])
        self.assertNotIn('open', records[0])
        self.assertNotIn('_RS_3M_value', records[0])

    def test_missing_historical_extrema_do_not_become_daily_range(self):
        stocks = [{'symbol': 'ABC', 'high': 110, 'low': 90, 'close': 100}]
        daily.map_52_week_high_low(stocks, {'data': [{'Symbol': 'ABC',
            '52_Weeks_High': None, '52_Weeks_Low': float('nan')}]})
        for key in ('fifty_two_week_high', 'fifty_two_week_low',
                    'Down from 52W High (%)', 'Up from 52W Low (%)'):
            self.assertIsNone(stocks[0][key])

    def test_known_historical_extrema_expand_with_new_daily_extrema(self):
        stocks = [{'symbol': 'ABC', 'high': 150, 'low': 40, 'close': 100}]
        daily.map_52_week_high_low(stocks, {'data': [{'Symbol': 'ABC',
            '52_Weeks_High': 120, '52_Weeks_Low': 50}]})
        self.assertEqual(stocks[0]['fifty_two_week_high'], 150)
        self.assertEqual(stocks[0]['fifty_two_week_low'], 40)
        self.assertEqual(stocks[0]['Down from 52W High (%)'], 33.33)
        self.assertEqual(stocks[0]['Up from 52W Low (%)'], 150)

    def test_sector_mapping_does_not_mutate_input(self):
        metadata = [{'Symbol': 'ABC', 'Sector Name': 'Technology'}]
        stocks = [{'symbol': 'ABC'}]
        daily.map_sector_data(stocks, metadata)
        self.assertEqual(metadata[0]['Symbol'], 'ABC')
        self.assertEqual(stocks[0]['Sector Name'], 'Technology')

    def test_rs_rank_ties_preserve_first_rank_semantics(self):
        stocks = [{'symbol': 'A', 'close': 100}, {'symbol': 'B', 'close': 100},
                  {'symbol': 'C', 'close': 200}]
        candles = [[f'old-{i}', 0, 0, 0, 100] for i in range(121)]
        history = [{'Symbol': stock['symbol'], 'candles': candles} for stock in stocks]
        daily.calculate_rs_rating(stocks, history, '2026-11-16')
        self.assertEqual([stock['RS_3M'] for stock in stocks], [0, 0, 99])
        self.assertEqual([stock['RS_6M'] for stock in stocks], [0, 0, 99])

    def test_zero_historical_close_does_not_divide_by_zero(self):
        stocks = [{'symbol': 'A', 'close': 100}]
        candles = [['old', 0, 0, 0, 0] for _ in range(122)]
        daily.calculate_rs_rating(stocks, [{'Symbol': 'A', 'candles': candles}], '2026-11-16')
        self.assertEqual(stocks[0]['RS_3M'], 100)

    def test_data_write_failure_does_not_advance_version(self):
        today = {'data': {'current': {'ticks': {'ABC': [['2026-11-16']]}}}}
        with patch.object(daily, 'find_valid_trading_day_data', return_value=(daily.datetime(2026, 11, 16).date(), today)), \
             patch.object(daily, 'process_strike_response', return_value=[{'symbol': 'ABC'}]), \
             patch.object(daily, 'load_json_file', return_value=[{'Symbol': 'ABC'}]), \
             patch.object(daily, 'map_sector_data'), \
             patch.object(daily, 'filter_invalid_inecode', side_effect=lambda value: value), \
             patch.object(daily, 'map_circuit_limits'), \
             patch.object(daily, 'map_52_week_high_low'), \
             patch.object(daily, 'calculate_turnover_sma20'), \
             patch.object(daily, 'calculate_tomcap'), \
             patch.object(daily, 'calculate_rs_rating'), \
             patch.object(daily, 'prepare_and_save_data', side_effect=OSError('disk unavailable')), \
             patch.object(daily, 'save_json_file') as save:
            # Circuit metadata has its own wrapper contract.
            with patch.object(daily, 'load_json_file', side_effect=[[{'Symbol': 'ABC'}], None, None, [{'Symbol': 'ABC'}]]):
                with self.assertRaises(OSError):
                    daily.main()
            save.assert_not_called()


class HistoricalTests(unittest.TestCase):
    def test_merge_replaces_revised_candle_sorts_and_trims(self):
        old = [['2026-11-14T00:00:00+05:30', 1, 2, 3, 4, 5],
               ['2026-11-13T00:00:00+05:30', 1, 2, 3, 4, 5]]
        new = [['2026-11-16T00:00:00+05:30', 1, 2, 3, 4, 5],
               ['2026-11-14T00:00:00+05:30', 1, 2, 3, 99, 5]]
        with patch.object(historical, 'MAX_CANDLES', 2):
            result = historical.merge_and_trim(old, new)
        self.assertEqual(len(result), 2)
        self.assertTrue(result[0][0].startswith('2026-11-16'))
        self.assertEqual(result[1][4], 99)

    def test_turnover_is_idempotent_and_always_at_index_seven(self):
        candle = ['2026-11-16', 1, 2, 3, 100, 1000000]
        historical.add_turnover([candle])
        historical.add_turnover([candle])
        self.assertEqual(len(candle), 8)
        self.assertEqual(candle[7], 10)

    def test_sector_mcap_updates_existing_rows_without_details_api(self):
        old = [{'SecurityID': 1, 'Symbol': 'ABC', 'Market Cap': 1}]
        payloads = [[{'Name': 'Technology', 'IndustriesForSector': [{'ID': 7, 'Name': 'Software'}]}],
                    [{'SecurityID': 1, 'Name': 'ABC', 'MCAP': 99}, {'SecurityID': 2, 'MCAP': 50}]]
        with patch.object(sector, 'load_json_file', return_value=old), \
             patch.object(sector, 'map_inecodes_from_json', side_effect=lambda values, _: (values, 0)), \
             patch.object(sector, 'fetch_json_data', side_effect=payloads) as fetch, \
             patch.object(sector, 'save_json_file') as save, patch.object(sector.time, 'sleep'):
            sector.main(['mcap'])
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(save.call_args.args[0][0]['Market Cap'], 99)
        self.assertEqual(len(save.call_args.args[0]), 1)

    def test_sector_partial_failure_never_publishes(self):
        with patch.object(sector, 'load_json_file', return_value=[{'SecurityID': 1, 'Symbol': 'ABC'}]), \
             patch.object(sector, 'map_inecodes_from_json', side_effect=lambda values, _: (values, 0)), \
             patch.object(sector, 'fetch_json_data', side_effect=[
                 [{'Name': 'Tech', 'IndustriesForSector': [{'ID': 7}]}], None]), \
             patch.object(sector, 'save_json_file') as save, patch.object(sector.time, 'sleep'):
            with self.assertRaises(RuntimeError):
                sector.main(['full'])
            save.assert_not_called()


if __name__ == '__main__':
    unittest.main()
