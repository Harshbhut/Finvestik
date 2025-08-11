# stock_data_pipeline.py

import requests
import time
import os
import random
import json
import math
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

# -------------------------------
# CONFIGURATION
# -------------------------------

# At the top of your script, after CONFIG:
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # Folder where script is located
STATIC_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "static", "data")  # Go one level up to repo root

CONFIG = {
    "sector_input_file": "Sector_Industry.json",  # Input file containing stock list with sector & industry
    "historical_file": "stock_historical_universe.json",  # Input file with historical turnover data
    "output_file": os.path.join(STATIC_DATA_DIR, "stock_universe.json"),
    "OUTPUT_VERSION_FILE": os.path.join(STATIC_DATA_DIR, "data_version.json"),
    "strike_api_url": "https://api.strike.money/v1/api/marketdata/current-activity",  # Live stock data
    "circuit_api_url": "https://api-v2.strike.money/v2/api/equity/last-traded-state?securities=EQ%3A*",  # Circuit limit data
    "user_agents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36"
    ],
    "include_internal_fields": False,
    "internal_fields": ["SecurityID", "ListingID", "SME Stock?"]
}

STRIKE_FIELDS = [
    "open", "high", "low", "current_price", "day_open", "day_high", "day_low",
    "previous_close", "change_percentage", "day_volume", "volume", "datetime",
    "symbol", "security_code", "previous_date", "previous_day_open",
    "previous_day_high", "previous_day_low", "fifty_two_week_high", "fifty_two_week_low"
]

STRIKE_FIELDS_TO_APPEND = [
    "current_price", "day_open", "day_high", "day_low", "previous_close",
    "change_percentage", "day_volume", "fifty_two_week_high", "fifty_two_week_low"
]

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# -------------------------------
# FILE & API HELPERS
# -------------------------------
def fetch_json_data(url: str, context_message: str = "", max_retries: int = 3) -> Optional[Dict[str, Any]]:
    for attempt in range(1, max_retries + 1):
        try:
            headers = {"Accept": "application/json", "User-Agent": random.choice(CONFIG["user_agents"])}
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logging.warning(f"[{context_message}] Attempt {attempt} failed: {e}")
            time.sleep(attempt)
    logging.error(f"❌ Giving up on {context_message} after {max_retries} attempts.")
    return None

def load_json_file(path: str) -> Optional[List[Dict[str, Any]]]:
    if not os.path.exists(path):
        logging.error(f"❌ File not found: {path}")
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_file(data: List[Dict[str, Any]], path: str):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    print(f"✅ Saved output to {path} with {len(data)} stocks")

# -------------------------------
# STEP 1: LOAD & FILTER BASE STOCK DATA
# -------------------------------
def filter_base_stocks(raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [stock for stock in raw_data if stock.get("SME Stock?", "No") != "Yes" and stock.get("Market Cap", 1) != 0]

# -------------------------------
# STEP 2: GET LIVE DATA FROM STRIKE
# -------------------------------
def parse_strike_data(raw_list: List[List[Any]]) -> Dict[str, Dict[str, Any]]:
    symbol_index = STRIKE_FIELDS.index("symbol")
    result = {}
    for row in raw_list:
        if not isinstance(row, list) or len(row) != len(STRIKE_FIELDS):
            continue
        if row[STRIKE_FIELDS.index("day_volume")] == 0:
            continue
        symbol = row[symbol_index].upper()
        result[symbol] = {k: row[i] for i, k in enumerate(STRIKE_FIELDS)}
    return result

def fetch_circuit_limits() -> Dict[str, Any]:
    response = fetch_json_data(CONFIG["circuit_api_url"], "Circuit Limit")
    if not response or "data" not in response:
        return {}
    current_data = response["data"].get("current", {})
    if "fields" not in current_data or "ticks" not in current_data:
        return {}
    try:
        circuit_index = current_data["fields"].index("circuitLimit")
    except ValueError:
        return {}
    result = {}
    for symbol, values in current_data["ticks"].items():
        if isinstance(values, list) and values:
            last_tick = values[-1]
            if isinstance(last_tick, list) and len(last_tick) > circuit_index:
                result[symbol.upper()] = last_tick[circuit_index]
    return result

# -------------------------------
# STEP 3: COMBINE BASE & LIVE DATA
# -------------------------------
def attach_live_data(base_stocks: List[Dict[str, Any]], live_data: Dict[str, Dict[str, Any]], circuit_map: Dict[str, Any]) -> List[Dict[str, Any]]:
    updated = []
    for stock in base_stocks:
        symbol = stock.get("Symbol", "").upper()
        if not symbol or symbol not in live_data:
            continue
        live = live_data[symbol]
        current_price = live.get("current_price")
        high_52w = live.get("fifty_two_week_high")
        low_52w = live.get("fifty_two_week_low")
        volume = live.get("day_volume")

        try:
            down_from_52wh = max(0, round((high_52w - current_price) / high_52w * 100, 2)) if high_52w else 0
            up_from_52wl = round((current_price - low_52w) / low_52w * 100, 2) if low_52w else 0
            turnover = round((current_price * volume) / 1e7, 2) if volume and current_price else 0
        except:
            down_from_52wh = up_from_52wl = turnover = 0

        new_entry = {
            k: v for k, v in stock.items()
            if CONFIG["include_internal_fields"] or k not in CONFIG["internal_fields"]
        }

        for field in STRIKE_FIELDS_TO_APPEND:
            new_entry[field] = live.get(field, "N/A")

        new_entry.update({
            "Down from 52W High (%)": down_from_52wh,
            "Up from 52W Low (%)": up_from_52wl,
            "Turnover": turnover,
            "circuitLimit": circuit_map.get(symbol, 0)
        })

        updated.append(new_entry)
    return updated

# -------------------------------
# STEP 4: HISTORICAL ANALYSIS
# -------------------------------
def build_historical_map(historical_data: List[Dict[str, Any]]) -> Dict[str, List[List[Any]]]:
    return {
        entry["INECODE"]: entry["candles"]
        for entry in historical_data
        if "INECODE" in entry and "candles" in entry
    }

def calculate_sma20(stock_list, historical_map):
    count = 0
    today_str = datetime.now().strftime("%Y-%m-%d")  # format to match candle date

    for stock in stock_list:
        inecode = stock.get("INECODE", "").strip().upper()
        base_turnover = stock.get("Turnover", None)

        if not inecode or base_turnover is None or inecode not in historical_map:
            stock["TurnoverSMA20"] = 0
            continue

        candles = historical_map[inecode]

        if not candles or not isinstance(candles[0], list) or len(candles[0]) < 8:
            stock["TurnoverSMA20"] = 0
            continue

        # Extract date from first candle (YYYY-MM-DD part)
        first_candle_date = str(candles[0][0])[:10]

        # Decide which candles to use based on date check
        if first_candle_date == today_str:
            # Today's data already in historical → skip first entry
            selected_candles = candles[1:20]
        else:
            # Today's data not in historical → take from first entry
            selected_candles = candles[0:19]

        # Build turnover values list: today's turnover + historical turnovers
        values = [base_turnover] + [
            c[7] for c in selected_candles
            if len(c) >= 8 and isinstance(c[7], (int, float)) and c[7] > 0
        ]

        # Need at least 10 data points to calculate SMA20
        if len(values) >= 10:
            stock["TurnoverSMA20"] = round(sum(values) / len(values), 2)
            count += 1
        else:
            stock["TurnoverSMA20"] = 0

    print(f"📊 SMA20 calculated for {count} stocks")
    return stock_list

def calculate_tomcap(stock_list):
    count = 0
    for stock in stock_list:
        sma20 = stock.get("TurnoverSMA20", 0)
        mcap = stock.get("Market Cap", 0)
        if isinstance(sma20, (int, float)) and isinstance(mcap, (int, float)) and mcap > 0:
            stock["Tomcap"] = math.floor(sma20 * 100 / mcap * 100) / 100
            count += 1
        else:
            stock["Tomcap"] = 0
    print(f"📈 Tomcap calculated for {count} stocks")
    return stock_list

# -------------------------------
# MAIN FUNCTION
# -------------------------------
def main():
    print("🚀 Starting stock data pipeline")

    base_data = load_json_file(CONFIG["sector_input_file"])
    if base_data is None:
        return
    print(f"📦 Fetched {len(base_data)} stocks from Sector_Industry.json")

    filtered = filter_base_stocks(base_data)
    print(f"✅ Filtered down to {len(filtered)} valid stocks (non-SME & non-zero Mcap)")

    strike_json = fetch_json_data(CONFIG["strike_api_url"], "Strike API")
    if not strike_json or "data" not in strike_json:
        return
    strike_map = parse_strike_data(strike_json["data"])
    print(f"🌐 Fetched {len(strike_map)} stocks from Strike API")

    circuit_map = fetch_circuit_limits()
    print(f"📉 Fetched circuit limits for {len(circuit_map)} stocks")

    updated_stocks = attach_live_data(filtered, strike_map, circuit_map)
    print(f"🔧 Added live market data to {len(updated_stocks)} stocks")

    historical = load_json_file(CONFIG["historical_file"])
    if historical is None:
        return

    hist_map = build_historical_map(historical)
    updated_stocks = calculate_sma20(updated_stocks, hist_map)
    updated_stocks = calculate_tomcap(updated_stocks)

    save_json_file(updated_stocks, CONFIG["output_file"])
    print(f"🎯 Process complete. Final count: {len(updated_stocks)} stocks written to {CONFIG['output_file']}")

    current_timestamp_ms = int(time.time() * 1000)
    version_info = {"timestamp": current_timestamp_ms}
    save_json_file(version_info, CONFIG["OUTPUT_VERSION_FILE"])
    print(f"✅ Version file created at {CONFIG["OUTPUT_VERSION_FILE"]} with timestamp {current_timestamp_ms}")
# -------------------------------
# ENTRY POINT
# -------------------------------
if __name__ == "__main__":
    main()
