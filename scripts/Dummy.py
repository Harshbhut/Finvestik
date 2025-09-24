import os
import json
import math
import time
import requests
import logging
import pandas as pd
from datetime import datetime
from bs4 import BeautifulSoup as bs
from typing import List, Dict, Any, Optional

# -------------------------------
# CONFIGURATION
# -------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "static", "data")

CONFIG = {
    "dashboard_url": "https://chartink.com/dashboard/364713",
    "widget_url": "https://chartink.com/widget/process",
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

def fetch_chartink_data() -> Optional[Dict[str, Any]]:
    """Fetches raw stock data from Chartink's widget endpoint."""
    logging.info("Step 1: Fetching data from Chartink...")
    try:
        QUERY = (
            "select latest Close as 'Close', latest High as 'High', "
            "latest Low as 'Low', latest Volume as 'Volume', "
            'latest "close - 1 candle ago close / 1 candle ago close * 100" as \'%Change\' '
            "WHERE ( {cash} 1 = 1 ) ORDER BY 4 desc"
        )
        PAYLOAD = {
            "query": QUERY, "use_live": "1", "limit": "5000",
            "size": "1", "widget_id": "3810138"
        }
        HEADERS = {
            "Referer": CONFIG["dashboard_url"], "Origin": "https://chartink.com",
            "x-requested-with": "XMLHttpRequest", "User-Agent": "python-requests/3.x",
        }
        
        with requests.Session() as s:
            response = s.get(CONFIG["dashboard_url"], timeout=20)
            response.raise_for_status()
            soup = bs(response.content, "html.parser")
            token = soup.find("meta", {"name": "csrf-token"})["content"]
            HEADERS["x-csrf-token"] = token
            resp = s.post(CONFIG["widget_url"], headers=HEADERS, data=PAYLOAD, timeout=30)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logging.error(f"ERROR fetching Chartink data: {e}")
    return None

def process_chartink_response(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Processes the raw JSON response from Chartink into a clean list of stocks."""
    logging.info("Step 2: Processing fetched data...")
    stocks = []
    for item in data.get("groupData", []):
        stock = {"symbol": item.get("name")}
        for res in item.get("results", []):
            if isinstance(res, dict):
                for key, val in res.items():
                    normalized_key = key.lower()
                    value = val[0] if isinstance(val, list) and val else val
                    if isinstance(value, str):
                        cleaned_value = value.replace(',', '')
                        try:
                            stock[normalized_key] = float(cleaned_value)
                        except (ValueError, TypeError):
                            stock[normalized_key] = value
                    else:
                        stock[normalized_key] = value
        stocks.append(stock)
    logging.info(f"  Processed {len(stocks)} stocks.")
    return stocks

# --- 3. DATA MAPPING AND CALCULATION FUNCTIONS (WITH ENHANCED LOGGING) ---

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

    # unwrap payload
    if isinstance(high_low_data, dict) and "data" in high_low_data:
        hl_list = high_low_data["data"]
    else:
        hl_list = high_low_data or []

    # Build lookup map symbol → {"high": ..., "low": ...}
    hl_map = {}
    for item in hl_list:
        if not isinstance(item, dict):
            continue
        sym = (item.get("Symbol") or "").strip().upper()
        if sym:
            hl_map[sym] = {
                "high": item.get("52_Weeks_High"),
                "low": item.get("52_Weeks_Low"),
            }

    processed = 0
    for stock in stocks:
        sym = (stock.get("symbol") or stock.get("Symbol") or "").strip().upper()
        if not sym:
            continue

        day_high = stock.get("high")
        day_low = stock.get("low")
        close_price = stock.get("close")

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
        today_close, symbol, candles = stock.get("close"), stock.get("symbol"), hist_map.get(stock.get("symbol"))
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
            stock["RS_3M"] =  100

        if len(closes) > days_6m:
            ret_1m_6 = (closes[0] / closes[days_1m] - 1) * 100
            ret_3m_6 = (closes[0] / closes[days_3m] - 1) * 100
            ret_6m = (closes[0] / closes[days_6m] - 1) * 100
            stock["_RS_6M_value"] = 0.4 * ret_1m_6 + 0.35 * ret_3m_6 + 0.25 * ret_6m
            rs_values_6m.append(stock["_RS_6M_value"])
        else:
            stock["RS_6M"] =  100

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
    df = pd.DataFrame(stocks)
    if '%change' in df.columns:
        df['%change'] = df['%change'].round(2)
    columns_to_drop = ['SecurityID', 'ListingID', 'SME Stock?', 'Industry ID']
    df.drop(columns=columns_to_drop, inplace=True, errors='ignore')
    rename_map = {
        'close': 'current_price', 'high': 'day_high', 'low': 'day_low',
        'volume': 'day_volume', '%change': 'change_percentage', 'symbol': 'Symbol'
    }
    df.rename(columns=rename_map, inplace=True)
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    for rec in records:
        v = rec.get("change_percentage")
        if isinstance(v, float) and not math.isfinite(v):
            rec["change_percentage"] = 0
    # --- NEW: Filter out records with INECODE "XXXXXXXXXXXX" ---
    initial_count = len(records)
    filtered_records = [
    rec for rec in records 
    if rec.get("INECODE") and rec.get("INECODE") != "XXXXXXXXXXXX"]
    removed_count = initial_count - len(filtered_records)
    if removed_count > 0:
        logging.info(f"  Removed {removed_count} records where INECODE is 'XXXXXXXXXXXX'.")
    else:
        logging.info("  No records found with INECODE 'XXXXXXXXXXXX' to remove.")
    # --- END NEW ---

    save_json_file(filtered_records, CONFIG["output_file"])
    logging.info(f"  Successfully saved {len(filtered_records)} stocks.")


# --- 4. MAIN EXECUTION ---
def main():
    """Main function to orchestrate the data fetching and processing workflow."""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    logging.info("🚀 Starting Chartink data pipeline")
    
    run_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    trade_date = run_timestamp[:10]
    
    raw_data = fetch_chartink_data()
    if not raw_data: return
    stocks = process_chartink_response(raw_data)
    if not stocks: return

    sector_data = load_json_file(CONFIG["sector_file"])
    high_low_data = load_json_file(CONFIG["high_low_file"])
    circuit_data = load_json_file(CONFIG["circuit_limit_file"])
    historical_data = load_json_file(CONFIG["historical_file"])

    if sector_data: map_sector_data(stocks, sector_data)
    if circuit_data: map_circuit_limits(stocks, circuit_data.get("data", []))
    if high_low_data: map_52_week_high_low(stocks, high_low_data.get("data", []))
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
