import os
import json
import math
import requests
import pandas as pd
from datetime import datetime
from bs4 import BeautifulSoup as bs
from typing import List, Dict, Any, Optional

# --- 1. CONFIGURATION (No changes) ---
DASHBOARD_URL = "https://chartink.com/dashboard/364713"
WIDGET_URL = "https://chartink.com/widget/process"
QUERY = (
    "select latest Close as 'Close', latest High as 'High', "
    "latest Low as 'Low', latest Volume as 'Volume', "
    'latest "close - 1 candle ago close / 1 candle ago close * 100" as \'%Change\' '
    "WHERE ( {cash} ( market cap > 0 ) ) ORDER BY 4 desc"
)
PAYLOAD = {
    "query": QUERY, "use_live": "1", "limit": "5000",
    "size": "1", "widget_id": "3810138"
}
HEADERS = {
    "Referer": DASHBOARD_URL, "Origin": "https://chartink.com",
    "x-requested-with": "XMLHttpRequest", "User-Agent": "python-requests/2.x",
}

# --- 2. HELPER FUNCTIONS ---

def get_file_paths() -> Dict[str, str]:
    # (No changes)
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    static_data_dir = os.path.join(script_dir, "..", "static", "data")
    return {
        "output": os.path.join(static_data_dir, "Chartink.json"),
        "sector": os.path.join(script_dir, "Sector_Industry.json"),
        "high_low": os.path.join(script_dir, "52_wk_High_Low.json"),
        "circuit_limit": os.path.join(script_dir, "Circuit_Limits.json"),
        "historical_data": os.path.join(script_dir, "stock_historical_universe.json"),
        "static_dir": static_data_dir
    }

def fetch_chartink_data() -> Optional[Dict[str, Any]]:
    # (No changes)
    print("Step 1: Fetching data from Chartink...")
    try:
        with requests.Session() as s:
            response = s.get(DASHBOARD_URL, timeout=20)
            response.raise_for_status()
            soup = bs(response.content, "html.parser")
            token = soup.find("meta", {"name": "csrf-token"})["content"]
            headers = HEADERS.copy()
            headers["x-csrf-token"] = token
            resp = s.post(WIDGET_URL, headers=headers, data=PAYLOAD, timeout=30)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"  ERROR fetching Chartink data: {e}")
    return None

def process_chartink_response(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    # (No changes)
    print("Step 2: Processing fetched data...")
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
    print(f"  Processed {len(stocks)} stocks.")
    return stocks

def load_json_file(file_path: str) -> Optional[Dict[str, Any]]:
    # (No changes)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"  WARNING: Data file not found at {file_path}. This is optional.")
    except json.JSONDecodeError:
        print(f"  ERROR: Could not decode JSON from {file_path}.")
    return None

def map_sector_data(stocks: List[Dict], sector_data: List[Dict]):
    # (No changes)
    print("Step 3: Mapping sector/industry data...")
    sector_map = {item["Symbol"]: item for item in sector_data if "Symbol" in item}
    for stock in stocks:
        symbol = stock.get("symbol")
        sector_info = sector_map.get(symbol)
        if sector_info:
            sector_info.pop("Symbol", None)
            stock.update(sector_info)
    print("  Sector mapping complete.")

def map_circuit_limits(stocks: List[Dict], circuit_data: List[Dict]):
    # (No changes)
    print("Step 4: Mapping circuit limit data...")
    circuit_map = {item["SYMBOL"]: item.get("BAND") for item in circuit_data}
    for stock in stocks:
        symbol = stock.get("symbol")
        band_value = circuit_map.get(symbol)
        stock["circuitLimit"] = band_value
    print("  Circuit limit mapping complete.")

def map_52_week_high_low(stocks: List[Dict], high_low_data: List[Dict]):
    # (No changes)
    print("Step 5: Mapping 52-week high/low data and calculating percentages...")
    high_low_map = {}
    for item in high_low_data:
        symbol = item.get("SYMBOL")
        if symbol:
            high_val = next((item[k] for k in item if 'High' in k), None)
            low_val = next((item[k] for k in item if 'Low' in k), None)
            high_low_map[symbol] = {"high": high_val, "low": low_val}

    for stock in stocks:
        day_high = stock.get("high")
        day_low = stock.get("low")
        close_price = stock.get("close")
        stored_data = high_low_map.get(stock.get("symbol"))
        
        stored_high = stored_data.get("high") if stored_data else None
        stored_low = stored_data.get("low") if stored_data else None
        
        valid_highs = [h for h in [stored_high, day_high] if isinstance(h, (int, float))]
        high_52w = max(valid_highs) if valid_highs else None
        stock["fifty_two_week_high"] = high_52w
        
        valid_lows = [l for l in [stored_low, day_low] if isinstance(l, (int, float))]
        low_52w = min(valid_lows) if valid_lows else None
        stock["fifty_two_week_low"] = low_52w

        if isinstance(high_52w, (int, float)) and isinstance(close_price, (int, float)) and high_52w != 0:
            down_perc = ((high_52w - close_price) / high_52w) * 100
            stock["Down from 52W High (%)"] = round(down_perc, 2)
        else:
            stock["Down from 52W High (%)"] = None

        if isinstance(low_52w, (int, float)) and isinstance(close_price, (int, float)) and low_52w != 0:
            up_perc = ((close_price - low_52w) / low_52w) * 100
            stock["Up from 52W Low (%)"] = round(up_perc, 2)
        else:
            stock["Up from 52W Low (%)"] = None
            
    print("  52-week mapping and calculations complete.")

def calculate_turnover_sma20(stocks: List[Dict], historical_data: List[Dict], trade_date: str):
    # (No changes)
    print("Step 6: Calculating 20-day Turnover SMA...")
    hist_map = {item["Symbol"]: item["candles"] for item in historical_data if "Symbol" in item and "candles" in item}
    count = 0
    for stock in stocks:
        close_price = stock.get("close")
        volume = stock.get("volume")
        symbol = stock.get("symbol")
        today_turnover = 0
        if isinstance(close_price, (int, float)) and isinstance(volume, (int, float)):
            today_turnover = (close_price * volume) / 1e7
        stock["turnover"] = round(today_turnover, 2)
        candles = hist_map.get(symbol)
        if not candles or not isinstance(candles, list) or not candles:
            stock["TurnoverSMA20"] = round(today_turnover, 2)
            continue
        first_candle_date = str(candles[0][0])[:10]
        if first_candle_date == trade_date:
            selected_candles = candles[1:20]
        else:
            selected_candles = candles[0:19]
        turnover_values = [today_turnover] + [c[7] for c in selected_candles if len(c) >= 8 and isinstance(c[7], (int, float)) and c[7] > 0]
        if turnover_values:
            sma20 = sum(turnover_values) / len(turnover_values)
            stock["TurnoverSMA20"] = round(sma20, 2)
            count += 1
        else:
            stock["TurnoverSMA20"] = 0
    print(f"  Turnover SMA20 calculated for {count} stocks.")

def calculate_tomcap(stocks: List[Dict]):
    # (No changes)
    print("Step 7: Calculating Tomcap...")
    count = 0
    for stock in stocks:
        sma20 = stock.get("TurnoverSMA20")
        mcap = stock.get("Market Cap")
        if isinstance(sma20, (int, float)) and isinstance(mcap, (int, float)) and mcap > 0:
            tomcap_value = math.floor((sma20 * 100 / mcap) * 100) / 100
            stock["Tomcap"] = tomcap_value
            count += 1
        else:
            stock["Tomcap"] = None
    print(f"  Tomcap calculated for {count} stocks.")

def calculate_rs_rating(stocks: List[Dict], historical_data: List[Dict], trade_date: str):
    # (No changes)
    print("Step 8: Calculating RS Rating...")
    hist_map = {item["Symbol"]: item["candles"] for item in historical_data if "Symbol" in item and "candles" in item}
    rs_values_3m, rs_values_6m = [], []
    for stock in stocks:
        symbol = stock.get("symbol")
        today_close = stock.get("close")
        candles = hist_map.get(symbol)
        stock["RS_3M"], stock["RS_6M"] = 100, 100
        if not all([symbol, today_close, candles]):
            continue
        first_hist_date = str(candles[0][0])[:10]
        historical_slice = candles[1:] if first_hist_date == trade_date else candles
        closes = [today_close] + [c[4] for c in historical_slice if len(c) >= 5 and isinstance(c[4], (int, float))]
        days_1m, days_2m, days_3m = 21, 42, 65
        if len(closes) > days_3m:
            ret_1m = (closes[0] / closes[days_1m] - 1) * 100
            ret_2m = (closes[0] / closes[days_2m] - 1) * 100
            ret_3m = (closes[0] / closes[days_3m] - 1) * 100
            rs_3m = 0.40 * ret_1m + 0.35 * ret_2m + 0.25 * ret_3m
            stock["_RS_3M_value"] = rs_3m
            rs_values_3m.append(rs_3m)
        days_6m = 120
        if len(closes) > days_6m:
            ret_1m_6 = (closes[0] / closes[days_1m] - 1) * 100
            ret_3m_6 = (closes[0] / closes[days_3m] - 1) * 100
            ret_6m = (closes[0] / closes[days_6m] - 1) * 100
            rs_6m = 0.4 * ret_1m_6 + 0.35 * ret_3m_6 + 0.25 * ret_6m
            stock["_RS_6M_value"] = rs_6m
            rs_values_6m.append(rs_6m)
    rs_values_3m.sort()
    rs_values_6m.sort()
    total_3m, total_6m = len(rs_values_3m), len(rs_values_6m)
    if total_3m > 1 and total_6m > 1:
        for stock in stocks:
            if "_RS_3M_value" in stock:
                rank = rs_values_3m.index(stock["_RS_3M_value"])
                stock["RS_3M"] = round(rank / (total_3m - 1) * 99)
            if "_RS_6M_value" in stock:
                rank = rs_values_6m.index(stock["_RS_6M_value"])
                stock["RS_6M"] = round(rank / (total_6m - 1) * 99)
    print(f"  RS Rating calculated for 3M ({total_3m} stocks) and 6M ({total_6m} stocks).")

# --- FUNCTION HAS BEEN MODIFIED ---
def save_final_data(stocks: List[Dict], paths: Dict[str, str], timestamp: str):
    """Prepares and saves the final enriched data, formatting it for final output."""
    print("Step 9: Preparing and saving final JSON file...")
    
    # Clean up temporary fields used for RS calculation
    for stock in stocks:
        stock.pop("_RS_3M_value", None)
        stock.pop("_RS_6M_value", None)
        
    df = pd.DataFrame(stocks)

    # --- NEW MINOR CHANGES ---
    # 1. Round the '%change' column if it exists
    if '%change' in df.columns:
        df['%change'] = df['%change'].round(2)
        

    # 2. Define columns to remove and drop them
    columns_to_drop = ['SecurityID', 'ListingID', 'SME Stock?', 'Industry ID']
    df.drop(columns=columns_to_drop, inplace=True, errors='ignore')
    
    # --- END OF NEW CHANGES ---

    # Define the mapping for renaming columns
    rename_map = {
        'close': 'current_price',
        'high': 'day_high',
        'low': 'day_low',
        'volume': 'day_volume',
        '%change': 'change_percentage',
        'symbol': 'Symbol'
    }
    df.rename(columns=rename_map, inplace=True)
   

    records = df.where(pd.notnull(df), None).to_dict(orient="records")
    output_data = {
        "last_updated": timestamp,
        "stocks": records
    }
    os.makedirs(paths["static_dir"], exist_ok=True)
    with open(paths["output"], "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"\nSuccessfully saved {len(records)} stocks to: {paths['output']}")

# --- 3. MAIN EXECUTION (No changes) ---
def main():
    """Main function to orchestrate the data fetching and processing workflow."""
    run_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    trade_date = run_timestamp[:10]
    print(f"Established consistent trade date for this run: {trade_date}")
    paths = get_file_paths()
    raw_data = fetch_chartink_data()
    if not raw_data: return
    stocks = process_chartink_response(raw_data)
    if not stocks: return
    sector_data_full = load_json_file(paths["sector"])
    high_low_data_full = load_json_file(paths["high_low"])
    circuit_data_full = load_json_file(paths["circuit_limit"])
    historical_data_full = load_json_file(paths["historical_data"])
    if sector_data_full:
        map_sector_data(stocks, sector_data_full)
    if circuit_data_full:
        map_circuit_limits(stocks, circuit_data_full.get("data", []))
    if high_low_data_full:
        map_52_week_high_low(stocks, high_low_data_full.get("data", []))
    if historical_data_full:
        calculate_turnover_sma20(stocks, historical_data_full, trade_date)
        calculate_tomcap(stocks)
        calculate_rs_rating(stocks, historical_data_full, trade_date)
    save_final_data(stocks, paths, run_timestamp)

if __name__ == "__main__":
    main()