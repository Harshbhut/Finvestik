import os
import json
import requests
import time
from datetime import datetime, timedelta
import urllib.parse

# ----------------------------------------
# CONFIGURATION
# ----------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# INPUT_JSON = "stock_universe.json"
# OUTPUT_JSON = "stock_historical_universe.json"

#INPUT_JSON = os.path.join(BASE_DIR, "../static/data/stock_universe.json")
INPUT_JSON = os.path.join(BASE_DIR, "Sector_Industry.json")
OUTPUT_JSON = os.path.join(BASE_DIR, "stock_historical_universe.json")


API_BASE = "https://api.upstox.com/v3/historical-candle"
API_DELAY_SECONDS = 0.2
RETRY_COUNT = 3
RETRY_BACKOFF = 2
MAX_CANDLES = 200
FORCE_FULL_FETCH = "N"  # Set to "Y" to force full fetch on any day

today = datetime.today().date()
#is_sunday = datetime.today().weekday() == 6
force_mode = FORCE_FULL_FETCH.strip().upper() == "Y"
#full_mode = is_sunday or force_mode
full_mode = force_mode

# ----------------------------------------
# HELPERS
# ----------------------------------------

def load_json_file(filepath):
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Failed to read {filepath}: {e}")
        return None

def save_json_file(data, filepath):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f"✅ Saved to {filepath}")
    except Exception as e:
        print(f"❌ Failed to write {filepath}: {e}")

def fetch_candle_data(inecode, from_date, to_date):
    encoded_symbol = urllib.parse.quote(f"NSE_EQ|{inecode}")
    url = f"{API_BASE}/{encoded_symbol}/days/1/{to_date}/{from_date}"

    for attempt in range(1, RETRY_COUNT + 1):
        try:
            headers = {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            response = requests.get(url, headers=headers, timeout=20)
            response.raise_for_status()

            data = response.json()
            candles = data.get("data", {}).get("candles", [])
            if isinstance(candles, list):
                return candles
        except Exception as e:
            print(f"⚠️ {inecode} attempt {attempt}: {e}")
            time.sleep(RETRY_BACKOFF ** (attempt - 1))

    print(f"❌ Giving up on {inecode}")
    return []

def build_existing_candle_map(existing_data):
    return {
        entry["INECODE"]: entry
        for entry in existing_data
        if "INECODE" in entry and "candles" in entry and isinstance(entry["candles"], list)
    }

def get_latest_date_from_existing(existing_candles):
    try:
        return datetime.fromisoformat(existing_candles[0][0]).date()
    except:
        return None

def merge_and_trim(existing, new):
    existing_dates = {c[0] for c in existing}
    filtered_new = [c for c in new if c[0] not in existing_dates]
    combined = filtered_new + existing
    return combined[:MAX_CANDLES]

def add_turnover(candle_list):
    for candle in candle_list:
        if len(candle) >= 6 and isinstance(candle[4], (int, float)) and isinstance(candle[5], (int, float)):
            turnover = round(candle[4] * candle[5] / 1e7, 2)  # Convert to crores
            candle.append(turnover)
    return candle_list

# ----------------------------------------
# LOAD INPUTS
# ----------------------------------------

print(f"🚀 Starting Historical_Data.py")
# print(f"📆 Today: {today} | Mode: {'FORCED FULL' if force_mode else 'FULL (Sunday)' if is_sunday else 'INCREMENTAL'}\n")

universe_raw = load_json_file(INPUT_JSON)
if universe_raw is None:
    print(f"❌ {INPUT_JSON} not found or unreadable.")
    exit()

# Normalize and filter entries: keep only valid Symbol + INECODE, skip placeholders like "XXXXXXXXXXXX"
universe_data = []
seen_symbols = set()
for rec in universe_raw:
    symbol = (rec.get("Symbol") or "").strip().upper()
    inecode = (rec.get("INECODE") or "").strip().upper()

    # Skip if missing symbol or inecode
    if not symbol or not inecode:
        continue

    # Explicitly skip placeholder INECODEs (e.g., "XXXXXXXXXXXX") or non-INE codes
    if inecode == "XXXXXXXXXXXX":
        continue

    # Deduplicate by symbol
    if symbol in seen_symbols:
        continue
    seen_symbols.add(symbol)

    universe_data.append({"Symbol": symbol, "INECODE": inecode})

print(f"📥 Loaded {len(universe_data)} valid symbols from {INPUT_JSON} (skipped placeholders/invalid INECODEs).")

historical_data = load_json_file(OUTPUT_JSON) or []
historical_map = build_existing_candle_map(historical_data)

# Prepare output structure
new_historical = []

# Find 1 valid stock for incremental detection
test_ine = None
test_latest_date = None

if not full_mode:
    for entry in historical_data:
        if entry.get("INECODE", "") and entry.get("candles"):
            test_ine = entry["INECODE"]
            test_latest_date = get_latest_date_from_existing(entry["candles"])
            break

    if not test_ine or not test_latest_date:
        print("❌ Could not determine latest candle date. Run full mode or fix existing data.")
        exit()

    from_date = (test_latest_date + timedelta(days=1)).strftime('%Y-%m-%d')
    to_date = today.strftime('%Y-%m-%d')

    print(f"🔍 Checking for new data using {test_ine} from {from_date} to {to_date}")
    test_response = fetch_candle_data(test_ine, from_date, to_date)
    if not test_response:
        print("⚠️ No new data. Skipping update for all valid stocks.\n")

# ----------------------------------------
# MAIN LOOP
# ----------------------------------------

updated = 0
skipped = 0
failures = []

for idx, stock in enumerate(universe_data, start=1):
    symbol = stock.get("Symbol", "").strip().upper()
    inecode = stock.get("INECODE", "").strip().upper()

    if not inecode :
        print(f"{idx}/{len(universe_data)} ⏭️ Skipping {symbol} (invalid INECODE)")
        skipped += 1
        continue

    existing_entry = historical_map.get(inecode)
    existing_candles = existing_entry["candles"] if existing_entry else []

    if not full_mode and test_response == [] and existing_candles:
       # print(f"{idx}/{len(universe_data)} ⏭️ Skipping {symbol} — no new data today")
        skipped += 1
        new_historical.append({
            "Symbol": symbol,
            "INECODE": inecode,
            "candles": existing_candles
        })
        continue

    if full_mode:
        from_date = (today - timedelta(days=MAX_CANDLES)).strftime('%Y-%m-%d')
        to_date = today.strftime('%Y-%m-%d')
    else:
        latest_date = get_latest_date_from_existing(existing_candles) or (today - timedelta(days=MAX_CANDLES))
        from_date = (latest_date + timedelta(days=1)).strftime('%Y-%m-%d')
        to_date = today.strftime('%Y-%m-%d')

    print(f"{idx}/{len(universe_data)} 📡 Fetching candles for {symbol} ({inecode})")

    candles = fetch_candle_data(inecode, from_date, to_date)

    if not candles:
        print(f"⚠️ No candles for {symbol}")
        failures.append(inecode)
        # Still preserve existing if any
        new_historical.append({
            "Symbol": symbol,
            "INECODE": inecode,
            "candles": existing_candles
        })
        continue

    # Add turnover to only new candles
    candles = add_turnover(candles)

    if full_mode:
        combined = candles[:MAX_CANDLES]
    else:
        combined = merge_and_trim(existing_candles, candles)

    new_historical.append({
        "Symbol": symbol,
        "INECODE": inecode,
        "candles": combined
    })

    updated += 1
    time.sleep(API_DELAY_SECONDS)

# ----------------------------------------
# SAVE OUTPUT
# ----------------------------------------

save_json_file(new_historical, OUTPUT_JSON)

# ----------------------------------------
# SUMMARY
# ----------------------------------------

print(f"\n✅ Historical update complete.")
print(f"🟢 Stocks updated: {updated}")
print(f"🟡 Skipped (no update needed or invalid INE): {skipped}")
if failures:
    print(f"🔴 Failed: {len(failures)} → {', '.join(failures)}")
else:
    print("✅ All fetches succeeded.")


