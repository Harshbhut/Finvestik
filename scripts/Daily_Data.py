import os
import json
import math
import time
import requests
import logging
import pandas as pd
from datetime import datetime, timedelta
import pytz
# The corrected import line is here:
from typing import List, Dict, Any, Optional

# -------------------------------
# CONFIGURATION
# -------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "static", "data")

CONFIG = {
    "strike_api_url_template": "https://api-v2a.strike.money/v2/api/equity/last-traded-state?securities=EQ%3A*&onlyFaoStocks=false&lastTradedTime={date}",
    #"strike_api_url_template": "https://api-v2a.strike.money/v2/api/equity/priceticks?securities=EQ%3A*&onlyFaoStocks=false&candleInterval=1d&dateTimes={date}",
    "output_file": os.path.join(STATIC_DATA_DIR, "stock_universe.json"),
    "output_version_file": os.path.join(STATIC_DATA_DIR, "data_version.json"),
    "sector_file": os.path.join(SCRIPT_DIR, "Sector_Industry.json"),
    "high_low_file": os.path.join(SCRIPT_DIR, "52_wk_High_Low.json"),
    "circuit_limit_file": os.path.join(SCRIPT_DIR, "circuit_limits.json"),
    "historical_file": os.path.join(SCRIPT_DIR, "stock_historical_universe.json"),
}

# --- 2. HELPER FUNCTIONS ---

def load_json_file(file_path: str) -> Optional[Dict[str, Any]]:
    """A reusable function to load and parse a JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logging.warning(f"Data file not found at {file_path}. This may be optional.")
    except json.JSONDecodeError:
        logging.error(f"Could not decode JSON from {file_path}. Check the file for errors.")
    return None

def save_json_file(data: Any, path: str):
    """A generic function to save data to a JSON file."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logging.error(f"Failed to save JSON file to {path}: {e}")

def find_valid_trading_day_data(start_date: datetime.date, url_template: str, max_lookback_days: int = 30) -> (Optional[datetime.date], Optional[Dict[str, Any]]):
    """
    Looks back day-by-day from a start date to find the first day with valid API data.
    """
    logging.info(f"Searching for valid trading data, starting from {start_date.strftime('%Y-%m-%d')}...")
    current_date = start_date
    for _ in range(max_lookback_days):
        date_str = current_date.strftime("%Y-%m-%d")
        api_url = url_template.format(date=date_str)
        try:
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            data = response.json()
            if data.get("data", {}).get("ticks"):
                logging.info(f"  SUCCESS: Found valid trading data for date: {date_str}")
                return current_date, data
            else:
                logging.info(f"  No trades found for {date_str}, looking back one more day...")
        except requests.exceptions.RequestException as e:
            logging.warning(f"  Could not fetch data for {date_str} ({e}), looking back one more day...")
        
        current_date -= timedelta(days=1)

    logging.error(f"FATAL: Could not find any trading data after looking back {max_lookback_days} days.")
    return None, None

def process_strike_response(today_data: Dict[str, Any], previous_day_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Processes the raw JSON response from Strike API into a clean list of stocks."""
    logging.info("Step 2: Processing today's and previous day's data...")
    
    previous_day_closes = {}
    prev_api_data = previous_day_data.get("data", {})
    prev_ticks = prev_api_data.get("ticks", {})
    for symbol, tick_data in prev_ticks.items():
        if tick_data and isinstance(tick_data, list) and len(tick_data[0]) > 4:
            previous_day_closes[symbol] = tick_data[0][4] 
    logging.info(f"  Created a lookup map with {len(previous_day_closes)} previous day closing prices.")

    stocks = []
    today_api_data = today_data.get("data", {})
    fields = today_api_data.get("fields", [])
    today_ticks = today_api_data.get("ticks", {})

    if not all([fields, today_ticks]):
        logging.error("  Could not find 'fields' or 'ticks' in today's API response. Aborting.")
        return []

    fallback_count = 0
    for symbol, tick_data in today_ticks.items():
        if not tick_data or not isinstance(tick_data, list) or not isinstance(tick_data[0], list):
            continue

        values = tick_data[0]
        stock_info = dict(zip(fields, values))
        
        stock = {
            "symbol": symbol,
            "close": stock_info.get("dayClose"), "high": stock_info.get("dayHigh"),
            "low": stock_info.get("dayLow"), "volume": stock_info.get("dayVolume"),
            "open": stock_info.get("dayOpen")
        }

        today_close = stock.get("dayClose")
        previous_close = previous_day_closes.get(symbol)

        if previous_close is not None and isinstance(today_close, (int, float)) and previous_close != 0:
            stock['%change'] = ((today_close - previous_close) / previous_close) * 100
        else:
            today_open = stock.get("dayOpen")
            if isinstance(today_open, (int, float)) and isinstance(today_close, (int, float)) and today_open != 0:
                stock['%change'] = ((today_close - today_open) / today_open) * 100
                fallback_count += 1
            else:
                stock['%change'] = 0.0

        stocks.append(stock)
    
    logging.info(f"  Processed {len(stocks)} stocks from today's data.")
    if fallback_count > 0:
        logging.info(f"  Used fallback %change calculation for {fallback_count} stocks.")
    return stocks


# --- 3. DATA MAPPING AND CALCULATION FUNCTIONS ---
def map_sector_data(stocks: List[Dict], sector_data: List[Dict]):
    logging.info("Step 3: Mapping sector/industry data...")
    sector_map = {item["Symbol"]: item for item in sector_data if "Symbol" in item}
    count = 0
    for stock in stocks:
        symbol = stock.get("symbol")
        sector_info = sector_map.get(symbol)
        if sector_info:
            sector_info.pop("Symbol", None)
            stock.update(sector_info)
            count += 1
    logging.info(f"  Mapped sector data for {count} of {len(stocks)} stocks.")

def filter_invalid_inecode(stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    logging.info("Step 3.5: Filtering stocks with invalid INECODE...")
    initial_count = len(stocks)
    
    filtered_stocks = [
        stock for stock in stocks
        if stock.get("INECODE") and stock.get("INECODE") != "XXXXXXXXXXXX"
    ]
    removed_count = initial_count - len(filtered_stocks)

    if removed_count > 0:
        logging.info(f"  Removed {removed_count} stocks where INECODE is missing or 'XXXXXXXXXXXX'.")
    else:
        logging.info("  No stocks found with invalid INECODE to remove.")
    
    logging.info(f"  Continuing with {len(filtered_stocks)} stocks.")
    return filtered_stocks

def map_circuit_limits(stocks: List[Dict], circuit_data: List[Dict]):
    logging.info("Step 4: Mapping circuit limit data...")
    circuit_map = {item["SYMBOL"]: item.get("BAND") for item in circuit_data}
    count = 0
    for stock in stocks:
        symbol = stock.get("symbol")
        band_value = circuit_map.get(symbol,0)
        if band_value is not None:
            count += 1
        stock["circuitLimit"] = band_value
    logging.info(f"  Mapped circuit limits for {count} of {len(stocks)} stocks.")

def map_52_week_high_low(stocks: List[Dict], high_low_data) -> List[Dict]:
    logging.info("Step 5: Mapping 52-week high/low data...")

    if isinstance(high_low_data, dict) and "data" in high_low_data:
        hl_list = high_low_data["data"]
    else:
        hl_list = high_low_data or []

    hl_map = {}
    for item in hl_list:
        if not isinstance(item, dict):
            continue
        sym = (item.get("Symbol") or "").strip().upper()
        if sym:
            hl_map[sym] = {"high": item.get("52_Weeks_High"), "low": item.get("52_Weeks_Low")}

    processed = 0
    for stock in stocks:
        sym = (stock.get("symbol") or stock.get("Symbol") or "").strip().upper()
        if not sym:
            continue

        day_high, day_low, close_price = stock.get("high"), stock.get("low"), stock.get("close")

        stored = hl_map.get(sym, {})
        high_candidates = [v for v in (stored.get("high"), day_high) if isinstance(v, (int, float))]
        low_candidates = [v for v in (stored.get("low"), day_low) if isinstance(v, (int, float))]

        fifty_two_week_high = max(high_candidates) if high_candidates else None
        fifty_two_week_low = min(low_candidates) if low_candidates else None

        stock["fifty_two_week_high"] = fifty_two_week_high
        stock["fifty_two_week_low"] = fifty_two_week_low

        if isinstance(fifty_two_week_high, (int, float)) and isinstance(close_price, (int, float)) and fifty_two_week_high != 0:
            stock["Down from 52W High (%)"] = round(((fifty_two_week_high - close_price) / fifty_two_week_high) * 100, 2)
        else:
            stock["Down from 52W High (%)"] = None

        if isinstance(fifty_two_week_low, (int, float)) and isinstance(close_price, (int, float)) and fifty_two_week_low != 0:
            stock["Up from 52W Low (%)"] = round(((close_price - fifty_two_week_low) / fifty_two_week_low) * 100, 2)
        else:
            stock["Up from 52W Low (%)"] = None

        processed += 1

    logging.info(f"  Processed 52-week metrics for {processed} stocks.")
    return stocks

def calculate_turnover_sma20(stocks: List[Dict], historical_data: List[Dict], trade_date: str):
    logging.info("Step 6: Calculating 20-day Turnover SMA...")
    hist_map = {item["Symbol"]: item["candles"] for item in historical_data if "Symbol" in item and "candles" in item}
    count = 0
    for stock in stocks:
        close_price, volume = stock.get("close"), stock.get("volume")
        today_turnover = (close_price * volume) / 1e7 if isinstance(close_price, (int, float)) and isinstance(volume, (int, float)) else 0
        stock["turnover"] = round(today_turnover, 2)
        candles = hist_map.get(stock.get("symbol"))
        if not candles:
            stock["TurnoverSMA20"] = stock["turnover"]
            continue
        first_candle_date = str(candles[0][0])[:10]
        selected_candles = candles[1:20] if first_candle_date == trade_date else candles[0:19]
        turnover_values = [today_turnover] + [c[7] for c in selected_candles if len(c) >= 8 and isinstance(c[7], (int, float)) and c[7] > 0]
        if turnover_values:
            stock["TurnoverSMA20"] = round(sum(turnover_values) / len(turnover_values), 2)
            count += 1
        else:
            stock["TurnoverSMA20"] = 0
    logging.info(f"  Calculated Turnover SMA20 for {count} of {len(stocks)} stocks.")

def calculate_tomcap(stocks: List[Dict]):
    logging.info("Step 7: Calculating Tomcap...")
    count = 0
    for stock in stocks:
        sma20, mcap = stock.get("TurnoverSMA20"), stock.get("Market Cap")
        if isinstance(sma20, (int, float)) and isinstance(mcap, (int, float)) and mcap > 0:
            stock["Tomcap"] = math.floor((sma20 * 100 / mcap) * 100) / 100
            count += 1
        else:
            stock["Tomcap"] = None
    logging.info(f"  Calculated Tomcap for {count} of {len(stocks)} stocks.")

def calculate_rs_rating(stocks: List[Dict], historical_data: List[Dict], trade_date: str):
    logging.info("Step 8: Calculating RS Rating...")
    hist_map = {item["Symbol"]: item["candles"] for item in historical_data if "Symbol" in item and "candles" in item}
    rs_values_3m, rs_values_6m = [], []
    for stock in stocks:
        today_close = stock.get("close")
        candles = hist_map.get(stock.get("symbol"))
        stock["RS_3M"], stock["RS_6M"] = None, None
        if not all([today_close, candles]): continue
        first_hist_date = str(candles[0][0])[:10]
        historical_slice = candles[1:] if first_hist_date == trade_date else candles
        closes = [today_close] + [c[4] for c in historical_slice if len(c) >= 5 and isinstance(c[4], (int, float))]
        days_1m, days_2m, days_3m, days_6m = 21, 42, 65, 120

        if len(closes) > days_3m:
            ret_1m = (closes[0] / closes[days_1m] - 1) * 100
            ret_2m = (closes[0] / closes[days_2m] - 1) * 100
            ret_3m = (closes[0] / closes[days_3m] - 1) * 100
            stock["_RS_3M_value"] = 0.40 * ret_1m + 0.35 * ret_2m + 0.25 * ret_3m
            rs_values_3m.append(stock["_RS_3M_value"])
        else:
            stock["RS_3M"] = 100

        if len(closes) > days_6m:
            ret_1m_6 = (closes[0] / closes[days_1m] - 1) * 100
            ret_3m_6 = (closes[0] / closes[days_3m] - 1) * 100
            ret_6m = (closes[0] / closes[days_6m] - 1) * 100
            stock["_RS_6M_value"] = 0.4 * ret_1m_6 + 0.35 * ret_3m_6 + 0.25 * ret_6m
            rs_values_6m.append(stock["_RS_6M_value"])
        else:
            stock["RS_6M"] = 100

    rs_values_3m.sort(); rs_values_6m.sort()
    total_3m, total_6m = len(rs_values_3m), len(rs_values_6m)
    if total_3m > 1:
        for stock in stocks:
            if "_RS_3M_value" in stock:
                rank = rs_values_3m.index(stock["_RS_3M_value"])
                stock["RS_3M"] = round(rank / (total_3m - 1) * 99)
    if total_6m > 1:
        for stock in stocks:
            if "_RS_6M_value" in stock:
                rank = rs_values_6m.index(stock["_RS_6M_value"])
                stock["RS_6M"] = round(rank / (total_6m - 1) * 99)
    logging.info(f"  Calculated RS Rating for {total_3m} (3M) and {total_6m} (6M) of {len(stocks)} stocks.")

def prepare_and_save_data(stocks: List[Dict]):
    """Prepares and saves the final enriched data, formatting it for final output."""
    logging.info("Step 9: Preparing and saving final JSON file...")
    for stock in stocks:
        stock.pop("_RS_3M_value", None); stock.pop("_RS_6M_value", None)
        stock.pop("open", None)
    df = pd.DataFrame(stocks)
    if '%change' in df.columns:
        df['%change'] = df['%change'].round(2)
    df.drop(columns=['SecurityID', 'ListingID', 'SME Stock?', 'Industry ID'], inplace=True, errors='ignore')
    df.rename(columns={'close': 'current_price', 'high': 'day_high', 'low': 'day_low',
                       'volume': 'day_volume', '%change': 'change_percentage', 'symbol': 'Symbol'}, inplace=True)
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    for rec in records:
        v = rec.get("change_percentage")
        if isinstance(v, float) and not math.isfinite(v):
            rec["change_percentage"] = 0
    
    save_json_file(records, CONFIG["output_file"])
    logging.info(f"  Successfully saved {len(records)} stocks.")


# --- 4. MAIN EXECUTION ---
def main():
    """Main function to orchestrate the data fetching and processing workflow."""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    ist = pytz.timezone('Asia/Kolkata')
    start_date = datetime.now(ist).date()
    logging.info(f"🚀 Starting data pipeline. Current IST date: {start_date.strftime('%Y-%m-%d')}")

    url_template = CONFIG["strike_api_url_template"]
    latest_trade_date, raw_today_data = find_valid_trading_day_data(start_date, url_template)

    if not raw_today_data:
        logging.error("Pipeline stopped: Could not determine the latest trading day.")
        return

    previous_day_start_search = latest_trade_date - timedelta(days=1)
    previous_trade_date, raw_previous_day_data = find_valid_trading_day_data(previous_day_start_search, url_template)

    if not raw_previous_day_data:
        logging.error("Pipeline stopped: Could not determine the previous trading day.")
        return

    trade_date = latest_trade_date.strftime("%Y-%m-%d")
    logging.info(f"Finalized data dates. Latest: {trade_date}, Previous: {previous_trade_date.strftime('%Y-%m-%d')}")
        
    stocks = process_strike_response(raw_today_data, raw_previous_day_data)
    if not stocks: 
        logging.error("Pipeline stopped: Failed to process data.")
        return

    sector_data = load_json_file(CONFIG["sector_file"])
    high_low_data = load_json_file(CONFIG["high_low_file"])
    circuit_data = load_json_file(CONFIG["circuit_limit_file"])
    historical_data = load_json_file(CONFIG["historical_file"])

    if sector_data: 
        map_sector_data(stocks, sector_data)
        stocks = filter_invalid_inecode(stocks)
        if not stocks:
            logging.warning("Pipeline stopped: No valid stocks remaining after INECODE filtering.")
            return

    if circuit_data: map_circuit_limits(stocks, circuit_data.get("data", []))
    if high_low_data: map_52_week_high_low(stocks, high_low_data)
    if historical_data:
        calculate_turnover_sma20(stocks, historical_data, trade_date)
        calculate_tomcap(stocks)
        calculate_rs_rating(stocks, historical_data, trade_date)
    
    prepare_and_save_data(stocks)

    current_timestamp_ms = int(time.time() * 1000)
    version_info = {"timestamp": current_timestamp_ms}
    save_json_file(version_info, CONFIG["output_version_file"])
    logging.info(f"✅ Version file created at {CONFIG['output_version_file']}")
    logging.info("🎯 Pipeline complete.")

if __name__ == "__main__":
    main()
