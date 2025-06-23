import requests
import time
import os
import random
import json

# -------------------------------
# Configuration & Constants
# -------------------------------

STRIKE_API_URL = "https://api-prod.strike.money/v1/api/marketdata/current-activity"

# !! IMPORTANT !!
# !! YOU MUST UPDATE THIS PLACEHOLDER !!
# Inspect the JSON response from STRIKE_API_URL.
# Find the key in the top-level dictionary that holds the list of stock data arrays.
# Examples: "data", "results", "items", "stockDataList", etc.
STRIKE_DATA_LIST_KEY = "data" # e.g., "data" or "results"

API_CALL_DELAY = 0.05 

INPUT_JSON_FILE = os.path.join("scripts", "Sector_Industry.json")
OUTPUT_JSON_FILE = os.path.join("static", "data", "Final_Data.json")

# Full list of field names from the Strike API, IN THE ORDER THEY APPEAR in each inner list.
# This is used for parsing the API response correctly.
STRIKE_API_FULL_FIELD_ORDER = [
    "open", "high", "low", "current_price", "day_open", "day_high", "day_low",
    "previous_close", "change_percentage", "day_volume", "volume", "datetime",
    "symbol", "security_code", "previous_date", "previous_day_open",
    "previous_day_high", "previous_day_low", "fifty_two_week_high", "fifty_two_week_low"
]
# Calculate the index of the 'symbol' field within the full API response order.
# This is CRUCIAL for matching.
try:
    SYMBOL_INDEX_IN_STRIKE_API = STRIKE_API_FULL_FIELD_ORDER.index("symbol")
except ValueError:
    print("CRITICAL ERROR: 'symbol' not found in STRIKE_API_FULL_FIELD_ORDER. Script cannot proceed.")
    exit()

# List of fields FROM THE STRIKE API that we actually want to KEEP AND APPEND to Final_Data.json
STRIKE_FIELDS_TO_APPEND = [
    "open", 
    "high", 
    "low", 
    "current_price", 
    "previous_close", 
    "change_percentage", 
    "day_volume",               # Note: 'volume' is removed, 'day_volume' is kept as per implied request
    "fifty_two_week_high", 
    "fifty_two_week_low"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36"
]

# --- START DEBUGGING ADDITION (Keep this for now if you still have file issues) ---
print(f"--- Debug Information ---")
current_working_directory = os.getcwd()
print(f"Current Working Directory: {current_working_directory}")
print(f"Looking for input file: {os.path.join(current_working_directory, INPUT_JSON_FILE)}")
if os.path.exists(current_working_directory):
    print(f"Files and folders in CWD: {os.listdir('.')}")
else:
    print(f"CWD {current_working_directory} does not exist.")
print(f"--- End Debug Information ---\n")
# --- END DEBUGGING ADDITION ---

# -------------------------------
# Helper: Fetch API JSON
# -------------------------------
def fetch_json_data(url, context_message="", max_retries=3, delay_between_retries=1):
    for attempt in range(1, max_retries + 1):
        try:
            headers = {"Accept": "application/json", "User-Agent": random.choice(USER_AGENTS)}
            response = requests.get(url, headers=headers, timeout=30) 
            response.raise_for_status() 
            return response.json()
        except requests.exceptions.Timeout:
            print(f"⚠️ [{context_message}] Attempt {attempt}/{max_retries} timed out.")
        except requests.exceptions.RequestException as e:
            print(f"⚠️ [{context_message}] Attempt {attempt}/{max_retries} failed: {e}")
        if attempt < max_retries:
            time.sleep(delay_between_retries * attempt)
        else:
            print(f"❌ Giving up on {context_message} after {max_retries} attempts.")
            return None

# -------------------------------
# Helper: Load and Save JSON
# -------------------------------
def load_json_file(file_path):
    # --- Modified to provide more specific feedback on file not found ---
    absolute_file_path = os.path.abspath(file_path)
    if not os.path.exists(absolute_file_path):
        print(f"⚠️ File not found at specified path: {absolute_file_path}")
        return None
    if os.path.getsize(absolute_file_path) == 0:
        print(f"⚠️ File exists at {absolute_file_path} but is empty.")
        return None
    # --- End modification ---
    try:
        with open(absolute_file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        print(f"⚠️ Error: {absolute_file_path} contains invalid JSON. Cannot proceed.")
        return None
    except Exception as e:
        print(f"⚠️ Error loading {absolute_file_path}: {e}. Cannot proceed.")
        return None


def save_json_file(data, file_path):
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

# -------------------------------
# Main Execution: Daily_Data.py
# -------------------------------
print(f"🚀 Starting script: Daily_Data.py (using Strike API for bulk data)")

# 1. Fetch data from the Strike API
print(f"Fetching bulk stock data from Strike API: {STRIKE_API_URL}")
strike_api_response_dict = fetch_json_data(STRIKE_API_URL, "Strike API Bulk Data")

if strike_api_response_dict is None:
    print(f"❌ Failed to fetch data from Strike API. Aborting script.")
    exit()

if not isinstance(strike_api_response_dict, dict):
    print(f"❌ Strike API response is not a dictionary as expected. Aborting. Data received: {type(strike_api_response_dict)}")
    exit()

if STRIKE_DATA_LIST_KEY == "PLEASE_UPDATE_THIS_KEY":
    print(f"❌ CRITICAL ERROR: You must update the 'STRIKE_DATA_LIST_KEY' variable in the script with the correct key from the API response.")
    print(f"    Available top-level keys in the API response are: {list(strike_api_response_dict.keys())}")
    exit()

if STRIKE_DATA_LIST_KEY not in strike_api_response_dict:
    print(f"❌ Key '{STRIKE_DATA_LIST_KEY}' not found in Strike API dictionary response. Aborting.")
    print(f"    Available keys: {list(strike_api_response_dict.keys())}")
    exit()

strike_api_list_of_rows = strike_api_response_dict[STRIKE_DATA_LIST_KEY]

if not isinstance(strike_api_list_of_rows, list):
    print(f"❌ Data under key '{STRIKE_DATA_LIST_KEY}' in Strike API response is not in the expected list format. Aborting. Type found: {type(strike_api_list_of_rows)}")
    exit()
    
print(f"Successfully fetched {len(strike_api_list_of_rows)} records from Strike API (from key '{STRIKE_DATA_LIST_KEY}').")

# 2. Process Strike API data into a usable map (dictionary by symbol)
#    The map will store ALL fields from Strike for efficient lookup.
strike_data_map_full = {}
for data_row_list in strike_api_list_of_rows:
    if not isinstance(data_row_list, list) or len(data_row_list) != len(STRIKE_API_FULL_FIELD_ORDER):
        print(f"⚠️ Skipping invalid data row from Strike API: {data_row_list} (Expected {len(STRIKE_API_FULL_FIELD_ORDER)} items, got {len(data_row_list)})")
        continue
    
    # Extract symbol for key
    symbol_from_api = data_row_list[SYMBOL_INDEX_IN_STRIKE_API]
    if not symbol_from_api or not isinstance(symbol_from_api, str): 
        # print(f"⚠️ Skipping row with invalid or missing symbol from Strike API: {data_row_list}")
        continue

    # Store all fields from Strike API for this symbol
    temp_stock_data = {}
    for idx, field_name in enumerate(STRIKE_API_FULL_FIELD_ORDER):
        temp_stock_data[field_name] = data_row_list[idx]
    
    strike_data_map_full[symbol_from_api.upper()] = temp_stock_data 

print(f"Processed {len(strike_data_map_full)} unique symbols from Strike API data into an internal map.")

# 3. Load base stock data from Sector_Industry.json
print(f"Loading base stock data from: {INPUT_JSON_FILE}")
base_stocks_data = load_json_file(INPUT_JSON_FILE)

if base_stocks_data is None:
    # load_json_file now prints specific error, so we can just exit.
    exit()

if not base_stocks_data: # Should be caught by load_json_file if file is empty
    print(f"ℹ️ Input file {INPUT_JSON_FILE} is empty after loading. Nothing to process.")
    exit()
    
print(f"Loaded {len(base_stocks_data)} base stocks from {INPUT_JSON_FILE}.")
print(f"Output will be incrementally saved to: {OUTPUT_JSON_FILE}\n")

# 4. Merge data and prepare final list
final_data_list = []
stocks_processed_count = 0
stocks_matched_with_strike = 0

for i, stock_base_info in enumerate(base_stocks_data):
    if not isinstance(stock_base_info, dict):
        print(f"⚠️ Skipping invalid entry in {INPUT_JSON_FILE} at index {i}: Not a dictionary.")
        continue

    base_symbol_for_match = stock_base_info.get("Symbol", f"N/A_SYMBOL_IN_BASE_{i}").upper() 
    stock_name = stock_base_info.get("Stock Name", f"Unknown Stock {i}")

    # This dictionary will hold ONLY the fields we want to append from Strike
    fields_to_add_from_strike = {}
    for field_to_append in STRIKE_FIELDS_TO_APPEND:
        fields_to_add_from_strike[field_to_append] = "N/A" # Default to N/A

    # Get the full data record for this symbol from our processed Strike map
    full_technical_data_from_strike_map = strike_data_map_full.get(base_symbol_for_match)

    if full_technical_data_from_strike_map:
        stocks_matched_with_strike += 1
        # Now, populate fields_to_add_from_strike using only the desired fields
        for field_to_append in STRIKE_FIELDS_TO_APPEND:
            if field_to_append in full_technical_data_from_strike_map:
                 fields_to_add_from_strike[field_to_append] = full_technical_data_from_strike_map[field_to_append]
            # else: # Should not happen if STRIKE_FIELDS_TO_APPEND are subset of STRIKE_API_FULL_FIELD_ORDER
            #     print(f"Warning: Field '{field_to_append}' expected but not in Strike data for {base_symbol_for_match}")
    
    # Merge base info with the selected (and N/A-filled if no match) Strike fields
    combined_stock_data = {**stock_base_info, **fields_to_add_from_strike}
    final_data_list.append(combined_stock_data)
    stocks_processed_count += 1
    
    # Incremental save
    if (i + 1) % 100 == 0 or (i + 1) == len(base_stocks_data): 
        save_json_file(final_data_list, OUTPUT_JSON_FILE)
        print(f"  💾 Saved progress to {OUTPUT_JSON_FILE} ({len(final_data_list)} stocks processed).")

# Final save if any remaining items not covered by batch save
if len(final_data_list) > 0 and (len(base_stocks_data) % 100 != 0 or len(base_stocks_data) < 100):
    save_json_file(final_data_list, OUTPUT_JSON_FILE)
    print(f"  💾 Final save to {OUTPUT_JSON_FILE} ({len(final_data_list)} stocks processed).")

print(f"\n✅ Daily_Data.py script completed.")
print(f"Total base stocks processed: {stocks_processed_count}.")
print(f"Stocks matched with Strike API data: {stocks_matched_with_strike}.")
print(f"Final combined data for {len(final_data_list)} stocks saved to: {OUTPUT_JSON_FILE}")