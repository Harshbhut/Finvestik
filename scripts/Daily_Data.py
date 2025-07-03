import requests
import time
import os
import random
import json

# -------------------------------
# Configuration & Constants
# -------------------------------
STRIKE_API_URL = "https://api.strike.money/v1/api/marketdata/current-activity"
CIRCUIT_API_URL = "https://api-v2.strike.money/v2/api/equity/last-traded-state?securities=EQ%3A*"

STRIKE_DATA_LIST_KEY = "data"
API_CALL_DELAY = 0.05

INPUT_JSON_FILE = os.path.join("scripts", "Sector_Industry.json")
OUTPUT_JSON_FILE = os.path.join("static", "data", "stock_universe.json")

STRIKE_API_FULL_FIELD_ORDER = [
    "open", "high", "low", "current_price", "day_open", "day_high", "day_low",
    "previous_close", "change_percentage", "day_volume", "volume", "datetime",
    "symbol", "security_code", "previous_date", "previous_day_open",
    "previous_day_high", "previous_day_low", "fifty_two_week_high", "fifty_two_week_low"
]

STRIKE_FIELDS_TO_APPEND = [
    "current_price", "day_open", "day_high", "day_low", "previous_close",
    "change_percentage", "day_volume", "fifty_two_week_high", "fifty_two_week_low"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36"
]

# -------------------------------
# Internal Field Toggle
# -------------------------------
INCLUDE_INTERNAL_FIELDS = False
INTERNAL_FIELDS = ["SecurityID", "ListingID", "SME Stock?"]

try:
    SYMBOL_INDEX_IN_STRIKE_API = STRIKE_API_FULL_FIELD_ORDER.index("symbol")
except ValueError:
    print("CRITICAL ERROR: 'symbol' not found in STRIKE_API_FULL_FIELD_ORDER.")
    exit()


# -------------------------------
# Utility Functions
# -------------------------------
def fetch_json_data(url, context_message="", max_retries=3, delay_between_retries=1):
    for attempt in range(1, max_retries + 1):
        try:
            headers = {"Accept": "application/json", "User-Agent": random.choice(USER_AGENTS)}
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"⚠️ [{context_message}] Attempt {attempt} failed: {e}")
            if attempt < max_retries:
                time.sleep(delay_between_retries * attempt)
    print(f"❌ Giving up on {context_message} after {max_retries} attempts.")
    return None


def load_json_file(path):
    if not os.path.exists(path):
        print(f"❌ File not found: {path}")
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json_file(data, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)


def get_circuit_limit_data():
    print("📡 Fetching circuitLimit data from Strike V2 API...")
    response = fetch_json_data(CIRCUIT_API_URL, "Circuit Limit")
    if not response or "data" not in response:
        print("❌ 'data' key missing in response.")
        return {}

    current_data = response["data"].get("current", {})
    if "fields" not in current_data or "ticks" not in current_data:
        print("❌ 'fields' or 'ticks' missing in response['data']['current'].")
        return {}

    try:
        circuit_index = current_data["fields"].index("circuitLimit")
    except ValueError:
        print("❌ 'circuitLimit' field not found.")
        return {}

    circuit_map = {}
    for symbol, values in current_data["ticks"].items():
        if isinstance(values, list) and len(values) > 0:
            last_tick = values[-1]
            if isinstance(last_tick, list) and len(last_tick) > circuit_index:
                circuit_map[symbol.upper()] = last_tick[circuit_index]

    print(f"✅ Got circuitLimit for {len(circuit_map)} symbols.")
    return circuit_map


# -------------------------------
# START
# -------------------------------
print(f"🚀 Starting Daily_Data.py (Optimized version)")

# Load Sector_Industry and apply filter
print("📄 Loading Sector_Industry.json and filtering...")
base_data = load_json_file(INPUT_JSON_FILE)
if base_data is None:
    exit()

filtered_base_data = [
    stock for stock in base_data
    if stock.get("SME Stock?", "No") != "Yes" and stock.get("Market Cap", 1) != 0
]
print(f"✅ Retained {len(filtered_base_data)} out of {len(base_data)} stocks after filtering.")

# Fetch Strike API data
print("🌐 Fetching Strike API data...")
strike_response = fetch_json_data(STRIKE_API_URL, "Strike Bulk")
if not strike_response or STRIKE_DATA_LIST_KEY not in strike_response:
    print("❌ Invalid response from Strike API.")
    exit()

strike_raw_list = strike_response[STRIKE_DATA_LIST_KEY]
strike_data_map = {}
for row in strike_raw_list:
    if not isinstance(row, list) or len(row) != len(STRIKE_API_FULL_FIELD_ORDER):
        continue
    if row[STRIKE_API_FULL_FIELD_ORDER.index("day_volume")] == 0:
        continue
    symbol = row[SYMBOL_INDEX_IN_STRIKE_API].upper()
    stock_data = {k: row[i] for i, k in enumerate(STRIKE_API_FULL_FIELD_ORDER)}
    strike_data_map[symbol] = stock_data

print(f"🔍 Processed {len(strike_data_map)} stocks from Strike.")

# Enrich with circuitLimit
circuit_limit_map = get_circuit_limit_data()
for symbol, stock_data in strike_data_map.items():
    stock_data["circuitLimit"] = circuit_limit_map.get(symbol, 0)

# Merge with static data
final_data = []
match_count = 0
for stock in filtered_base_data:
    symbol = stock.get("Symbol", "").upper()
    if not symbol:
        continue
    strike_entry = strike_data_map.get(symbol)
    if not strike_entry:
        continue

    current_price = strike_entry.get("current_price")
    high_52w = strike_entry.get("fifty_two_week_high")
    low_52w = strike_entry.get("fifty_two_week_low")
    day_volume = strike_entry.get("day_volume")

    down_from_52wh = 0
    up_from_52wl = 0
    turnover = 0

    try:
        if isinstance(current_price, (int, float)) and isinstance(high_52w, (int, float)) and high_52w > 0:
            down_from_52wh = max(0, round((high_52w - current_price) / high_52w * 100, 2))
        if isinstance(current_price, (int, float)) and isinstance(low_52w, (int, float)) and low_52w > 0:
            up_from_52wl = round((current_price - low_52w) / low_52w * 100, 2)
        if isinstance(current_price, (int, float)) and isinstance(day_volume, (int, float)):
            turnover = round((current_price * day_volume) / 1e7, 2)
    except:
        pass

    new_data = {
        k: v for k, v in stock.items()
        if INCLUDE_INTERNAL_FIELDS or k not in INTERNAL_FIELDS
    }

    for field in STRIKE_FIELDS_TO_APPEND:
        new_data[field] = strike_entry.get(field, "N/A")

    new_data["Down from 52W High (%)"] = down_from_52wh
    new_data["Up from 52W Low (%)"] = up_from_52wl
    new_data["Turnover"] = turnover
    new_data["circuitLimit"] = strike_entry.get("circuitLimit", 0)

    final_data.append(new_data)
    match_count += 1

# Save final JSON
save_json_file(final_data, OUTPUT_JSON_FILE)
print(f"✅ Done. {match_count} stocks saved to {OUTPUT_JSON_FILE}")
if not INCLUDE_INTERNAL_FIELDS:
    print("🧹 Internal fields (e.g., SecurityID, ListingID, SME Stock?) were excluded.")