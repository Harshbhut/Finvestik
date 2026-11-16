# Market-data pipeline

The website reads `static/data/stock_universe.json`. `data_version.json` announces the published snapshot using a millisecond timestamp. The scanner uses version polling to detect changes.

| Collector | Inputs / purpose | Output |
| --- | --- | --- |
| `NSE.py` | NSE equity instrument list | `scripts/NSE.json` |
| `Sector_Industry.py` | StockEdge sector/industry classification and market cap | `scripts/Sector_Industry.json` |
| `Historical_Data.py` | Upstox historical candles and NSE instruments | `scripts/stock_historical_universe.json` |
| `circuitlimit.py` | Strike circuit limits | `scripts/circuit_limits.json` |
| `52_Week_High_Low.py` | Provider 52-week extrema | `scripts/52_wk_High_Low.json` |
| `Daily_Data.py` | Strike quotes plus intermediate files above | `static/data/stock_universe.json`, then `data_version.json` |

`.github/workflows/` defines schedules in UTC. Convert with Asia/Kolkata (UTC+05:30) for market operations. GitHub scheduled jobs can be delayed and are not a real-time data service. Some workflows are chained with `workflow_run`; downstream runs should only execute after success.

## Routine maintenance

1. Run `python tools/check.py` and `python -m unittest discover -s scripts/tests -v` before changing collectors.
2. Use small fixtures/mocked HTTP for changes. Run `python tools/check.py --full-data` when changing JSON contracts.
3. For an authorized refresh, install `scripts/requirements.txt`, run the relevant collector, inspect row counts and source dates, and review only expected JSON diffs. Large historical data should be sampled with Python, not printed wholesale.
4. Publish the scanner snapshot before its version metadata. Any failure must fail the job and preserve valid previously published files. Atomic replacement protects each file; it is not a transaction across two files.
5. Review Actions logs for failed upstream calls, stale data, validation errors or push conflicts. Do not force-push to resolve an automated update conflict.

`Dummy.py` is an alternate legacy Chartink collector and is not scheduled by the active workflows. It has extra dependencies and should not be used as the default update path.

## Future work requiring provider validation

Confirm current response schemas and date rollover rules against each provider, document acceptable freshness/coverage thresholds, and consider moving large historical payloads outside git. These need operational decisions and live-provider checks; offline tests cannot establish them.

## Known source-data limitation

At review time, all 3,252 entries in the committed 52-week provider report had null high/low values. The daily collector now preserves missing extrema as null rather than substituting the current day's range and labelling it as a 52-week range. The browser displays unavailable values as N/A after the next authorized refresh. Existing committed snapshots were not regenerated. Verify the provider response mapping before relying on 52-week screens or refreshing production data.
