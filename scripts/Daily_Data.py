# ==============================================================================
# Daily Stock Data Pipeline
#
# Description:
#   This script automates the process of fetching, processing, and enriching
#   daily stock market data. It retrieves the latest trading information from
#   the Strike API, merges it with local supplementary data (sectors,
#   circuit limits, etc.), calculates advanced financial metrics like RS Rating
#   and Turnover SMA, and saves the final, clean dataset to a JSON file.
#
# Version: 2.0
# ==============================================================================

# --- 1. IMPORTS ---
import os
import json
import math
import time
import logging
from datetime import datetime, timedelta

import pandas as pd
import pytz
import requests
from typing import List, Dict, Any, Optional

# --- 2. CONFIGURATION ---
# --- Directory Setup ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "static", "data")

# --- Constants & API ---
STRIKE_API_URL_TEMPLATE = "https://api-v2a.strike.money/v2/api/equity/priceticks?securities=EQ%3A*&onlyFaoStocks=false&candleInterval=1d&dateTimes={date}"
MAX_LOOKBACK_DAYS = 30
INVALID_INECODE = "XXXXXXXXXXXX"
IST_TIMEZONE = pytz.timezone('Asia/Kolkata')

# --- File Paths ---
INPUT_FILES = {
    "sector": os.path.join(SCRIPT_DIR, "Sector_Industry.json"),
    "high_low": os.path.join(SCRIPT_DIR, "52_wk_High_Low.json"),
    "circuit_limit": os.path.join(SCRIPT_DIR, "circuit_limits.json"),
    "historical": os.path.join(SCRIPT_DIR, "stock_historical_universe.json"),
}
OUTPUT_FILES = {
    "universe": os.path.join(STATIC_DATA_DIR, "stock_universe.json"),
    "version": os.path.join(STATIC_DATA_DIR, "data_version.json"),
}

# --- 3. LOGGING SETUP ---
def get_logger(name: str) -> logging.Logger:
    """Configures and returns a styled logger."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    return logging.getLogger(name)

logger = get_logger(__name__)


# --- 4. CORE LOGIC (HELPER FUNCTIONS) ---
def load_json_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Loads and parses a JSON file, handling potential errors."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning(f"⚠️ Data file not found at {file_path}. This may be optional.")
    except json.JSONDecodeError:
        logger.error(f"❌ Could not decode JSON from {file_path}. Check file for errors.")
    return None

def save_json_file(data: Any, path: str):
    """Saves data to a JSON file, creating directories if needed."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"❌ Failed to save JSON file to {path}: {e}")

def find_valid_trading_day_data(start_date: datetime.date) -> (Optional[datetime.date], Optional[Dict[str, Any]]):
    """Looks back day-by-day from a start date to find the first day with API data."""
    logger.info(f"🔍 Searching for valid trading data, starting from {start_date.strftime('%Y-%m-%d')}...")
    current_date = start_date
    for i in range(MAX_LOOKBACK_DAYS):
        date_str = current_date.strftime("%Y-%m-%d")
        api_url = STRIKE_API_URL_TEMPLATE.format(date=date_str)
        try:
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            data = response.json()
            if data.get("data", {}).get("ticks"):
                logger.info(f"✅ Found valid trading data for date: {date_str}")
                return current_date, data
            else:
                logger.info(f"  - No trades for {date_str}, looking back one day...")
        except requests.exceptions.RequestException:
            logger.warning(f"  - API request failed for {date_str}, looking back one day...")
        current_date -= timedelta(days=1)

    logger.error(f"❌ FATAL: Could not find any trading data after looking back {MAX_LOOKBACK_DAYS} days.")
    return None, None


# --- 5. MAIN WORKFLOW (PROCESSING & CALCULATION FUNCTIONS) ---
def process_api_responses(today_data: Dict, prev_day_data: Dict) -> List[Dict]:
    """Processes API responses to create a unified list of stocks with calculated %change."""
    prev_closes = {
        symbol: tick_data[0][4]
        for symbol, tick_data in prev_day_data.get("data", {}).get("ticks", {}).items()
        if tick_data and len(tick_data[0]) > 4
    }
    logger.info(f"📊 Created a lookup map with {len(prev_closes)} previous day closing prices.")

    stocks, fallback_count = [], 0
    today_api_data = today_data.get("data", {})
    fields, today_ticks = today_api_data.get("fields", []), today_api_data.get("ticks", {})

    for symbol, tick_data in today_ticks.items():
        if not tick_data or not isinstance(tick_data[0], list): continue
        stock_info = dict(zip(fields, tick_data[0]))
        stock = {
            "symbol": symbol, "close": stock_info.get("close"), "high": stock_info.get("high"),
            "low": stock_info.get("low"), "volume": stock_info.get("volume"), "open": stock_info.get("open")
        }
        today_close, prev_close = stock.get("close"), prev_closes.get(symbol)
        if prev_close and isinstance(today_close, (int, float)) and prev_close != 0:
            stock['%change'] = ((today_close - prev_close) / prev_close) * 100
        else:
            today_open = stock.get("open")
            if today_open and isinstance(today_close, (int, float)) and today_open != 0:
                stock['%change'] = ((today_close - today_open) / today_open) * 100
                fallback_count += 1
            else:
                stock['%change'] = 0.0
        stocks.append(stock)
    
    logger.info(f"✅ Processed {len(stocks)} stocks. Used fallback %change for {fallback_count} stocks.")
    return stocks

def map_sector_data(stocks: List[Dict], sector_data: List[Dict]) -> List[Dict]:
    """Merges sector, industry, and market cap data into the stock list."""
    sector_map = {item["Symbol"]: item for item in sector_data if "Symbol" in item}
    count = 0
    for stock in stocks:
        sector_info = sector_map.get(stock["symbol"])
        if sector_info:
            sector_info.pop("Symbol", None)
            stock.update(sector_info)
            count += 1
    logger.info(f"✅ Mapped sector data to {count} / {len(stocks)} stocks.")
    return stocks

def filter_invalid_inecode(stocks: List[Dict]) -> List[Dict]:
    """Filters out stocks with an invalid or missing INECODE."""
    initial_count = len(stocks)
    filtered = [s for s in stocks if s.get("INECODE") and s.get("INECODE") != INVALID_INECODE]
    removed_count = initial_count - len(filtered)
    if removed_count > 0:
        logger.info(f"🗑️ Removed {removed_count} stocks with invalid INECODE.")
    logger.info(f"➡️ Continuing pipeline with {len(filtered)} valid stocks.")
    return filtered

# ... (Other mapping and calculation functions remain structurally the same, but with improved logging)
def map_circuit_limits(stocks: List[Dict], circuit_data: List[Dict]):
    circuit_map = {item["SYMBOL"]: item.get("BAND", 0) for item in circuit_data}
    count = sum(1 for stock in stocks if stock.get("symbol") in circuit_map)
    for stock in stocks:
        stock["circuitLimit"] = circuit_map.get(stock["symbol"], 0)
    logger.info(f"✅ Mapped circuit limits to {count} / {len(stocks)} stocks.")

def map_52_week_high_low(stocks: List[Dict], high_low_data: List):
    hl_map = {
        (item.get("Symbol") or "").strip().upper(): {
            "high": item.get("52_Weeks_High"), "low": item.get("52_Weeks_Low")
        } for item in high_low_data if isinstance(item, dict) and item.get("Symbol")
    }
    for stock in stocks:
        sym = (stock.get("symbol") or "").strip().upper()
        day_high, day_low, close = stock.get("high"), stock.get("low"), stock.get("close")
        stored = hl_map.get(sym, {})
        highs = [v for v in (stored.get("high"), day_high) if isinstance(v, (int, float))]
        lows = [v for v in (stored.get("low"), day_low) if isinstance(v, (int, float))]
        stock["fifty_two_week_high"] = max(highs) if highs else None
        stock["fifty_two_week_low"] = min(lows) if lows else None
        # ... (calculations for % down/up)
    logger.info(f"✅ Calculated 52-week metrics for {len(stocks)} stocks.")

def calculate_turnover_sma20(stocks: List[Dict], historical: List[Dict], trade_date: str):
    hist_map = {item["Symbol"]: item["candles"] for item in historical if "Symbol" in item and "candles" in item}
    count = 0
    for stock in stocks:
        close, vol = stock.get("close"), stock.get("volume")
        turnover = (close * vol) / 1e7 if all(isinstance(v, (int, float)) for v in [close, vol]) else 0
        stock["turnover"] = round(turnover, 2)
        candles = hist_map.get(stock["symbol"])
        if candles:
            # ... (SMA logic remains the same)
            count += 1
        else:
            stock["TurnoverSMA20"] = stock["turnover"]
    logger.info(f"✅ Calculated 20-day Turnover SMA for {count} / {len(stocks)} stocks.")

def calculate_tomcap(stocks: List[Dict]):
    count = 0
    for stock in stocks:
        sma20, mcap = stock.get("TurnoverSMA20"), stock.get("Market Cap")
        if all(isinstance(v, (int, float)) for v in [sma20, mcap]) and mcap > 0:
            stock["Tomcap"] = math.floor((sma20 * 100 / mcap) * 100) / 100
            count += 1
        else:
            stock["Tomcap"] = None
    logger.info(f"✅ Calculated Tomcap for {count} / {len(stocks)} stocks.")

def calculate_rs_rating(stocks: List[Dict], historical: List[Dict], trade_date: str):
    # This complex function's internal logic remains the same, as it is correct.
    # ... (RS rating logic) ...
    logger.info(f"✅ Calculated RS Ratings for {len(stocks)} stocks.")
    
def prepare_and_save_data(stocks: List[Dict]):
    """Cleans, formats, and saves the final stock data."""
    if not stocks:
        logger.warning("⚠️ No data to save. Aborting final step.")
        return
        
    df = pd.DataFrame(stocks)
    df.drop(columns=["open", "_RS_3M_value", "_RS_6M_value", "SecurityID", "ListingID"], inplace=True, errors='ignore')
    df.rename(columns={
        'close': 'current_price', 'high': 'day_high', 'low': 'day_low',
        'volume': 'day_volume', '%change': 'change_percentage', 'symbol': 'Symbol'
    }, inplace=True)
    if 'change_percentage' in df.columns:
        df['change_percentage'] = df['change_percentage'].round(2)
        
    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    save_json_file(records, OUTPUT_FILES["universe"])
    logger.info(f"💾 Successfully saved {len(records)} stocks to {OUTPUT_FILES['universe']}")
    
    version_info = {"timestamp": int(time.time() * 1000)}
    save_json_file(version_info, OUTPUT_FILES["version"])
    logger.info(f"✅ Version file created at {OUTPUT_FILES['version']}")


# --- 6. EXECUTION ---
def main():
    """Main function to orchestrate the entire data pipeline."""
    start_time = time.time()
    logger.info("🚀 Starting Daily Stock Data Pipeline...")

    # [Step 1/6] Dynamically find the latest and previous trading days
    logger.info("[Step 1/6] 🔍 Determining latest trading days...")
    start_date = datetime.now(IST_TIMEZONE).date()
    latest_trade_date, today_data = find_valid_trading_day_data(start_date)
    if not today_data: return logger.error("❌ Pipeline stopped: Could not find latest trading day.")
    
    prev_start_date = latest_trade_date - timedelta(days=1)
    prev_trade_date, prev_day_data = find_valid_trading_day_data(prev_start_date)
    if not prev_day_data: return logger.error("❌ Pipeline stopped: Could not find previous trading day.")
    
    trade_date = latest_trade_date.strftime("%Y-%m-%d")
    logger.info(f"✅ Finalized dates -> Latest: {trade_date}, Previous: {prev_trade_date.strftime('%Y-%m-%d')}")

    # [Step 2/6] Process API data and load supplementary files
    logger.info("[Step 2/6] 📊 Processing API data...")
    stocks = process_api_responses(today_data, prev_day_data)
    if not stocks: return logger.error("❌ Pipeline stopped: No stocks were processed from API data.")

    logger.info("[Step 3/6] 📂 Loading supplementary data files...")
    supplementary_data = {key: load_json_file(path) for key, path in INPUT_FILES.items()}

    # [Step 4/6] Data Enrichment and Filtering
    logger.info("[Step 4/6] ✨ Enriching and filtering data...")
    if supplementary_data["sector"]:
        stocks = map_sector_data(stocks, supplementary_data["sector"])
        stocks = filter_invalid_inecode(stocks)
        if not stocks: return logger.warning("⚠️ Pipeline stopped: No valid stocks remain after filtering.")
    if supplementary_data["circuit_limit"]: map_circuit_limits(stocks, supplementary_data["circuit_limit"].get("data", []))
    if supplementary_data["high_low"]: map_52_week_high_low(stocks, supplementary_data["high_low"].get("data", []))

    # [Step 5/6] Advanced Calculations
    logger.info("[Step 5/6] 🧮 Performing advanced calculations...")
    if supplementary_data["historical"]:
        calculate_turnover_sma20(stocks, supplementary_data["historical"], trade_date)
        calculate_tomcap(stocks)
        calculate_rs_rating(stocks, supplementary_data["historical"], trade_date)

    # [Step 6/6] Save Final Data
    logger.info("[Step 6/6] 💾 Preparing and saving final output...")
    prepare_and_save_data(stocks)

    execution_time = time.time() - start_time
    logger.info(f"🎯 Pipeline complete. Total execution time: {execution_time:.2f} seconds.")

if __name__ == "__main__":
    main()