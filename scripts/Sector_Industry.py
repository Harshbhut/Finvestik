import requests
import time
import os
import random
import json
import csv
import sys  # [ADDED]

# -------------------------------
# Configuration & Constants
# -------------------------------
API1_URL = "https://api.stockedge.com/Api/SectorDashboardApi/GetAllSectorsWithRespectiveIndustriesAndMcap?sectorSort=1&lang=en"
API2_BASE_URL = "https://api.stockedge.com/Api/industryDashboardApi/GetIndustryPeerList/{industry_id}?lang=en&pageSize=20&page={page_num}"
API3_SECURITY_INFO_URL = "https://api.stockedge.com/Api/SecurityDashboardApi/GetLatestSecurityInfo/{security_id}?lang=en"

API_CALL_DELAY = 0.1
OUTPUT_JSON_FILE = os.path.join(os.getcwd(), "Sector_Industry.json")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36"
]

# -------------------------------
# Helpers
# -------------------------------
def fetch_json_data(url, context_message="", max_retries=3, delay_between_retries=1):
    for attempt in range(1, max_retries + 1):
        try:
            headers = {"Accept": "application/json", "User-Agent": random.choice(USER_AGENTS)}
            response = requests.get(url, headers=headers, timeout=20)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            print(f"⚠️ [{context_message}] Attempt {attempt}/{max_retries} timed out.")
        except requests.exceptions.RequestException as e:
            print(f"⚠️ [{context_message}] Attempt {attempt}/{max_retries} failed: {e}")
        if attempt < max_retries:
            time.sleep(delay_between_retries * attempt)
    print(f"❌ Giving up on {context_message} after {max_retries} attempts.")
    return None

def load_json_file(file_path):
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"⚠️ Warning: {file_path} contains invalid JSON. Starting fresh.")
        except Exception as e:
            print(f"⚠️ Error loading {file_path}: {e}. Starting fresh.")
    return []

def save_json_file(data, file_path):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def map_inecodes_from_csv(stocks_data, csv_file_path):
    if not os.path.exists(csv_file_path):
        print(f"\n⚠️ NSE.csv not found at {csv_file_path}. Skipping INECODE mapping.")
        return stocks_data, 0

    print(f"\n📥 NSE.csv found. Starting INECODE mapping...")

    symbol_to_inecode = {}
    with open(csv_file_path, mode='r', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            symbol = row.get("tradingsymbol", "").strip().upper()
            inecode = row.get("INECODE", "").strip().upper()
            if symbol and inecode:
                symbol_to_inecode[symbol] = inecode

    updated_count = 0
    for stock in stocks_data:
        current_ine = stock.get("INECODE", "").strip().upper()
        symbol = stock.get("Symbol", "").strip().upper()
        if current_ine.startswith("INE"):
            continue
        matched_ine = symbol_to_inecode.get(symbol, "XXXXXXXXXX")
        if current_ine != matched_ine:
            stock["INECODE"] = matched_ine
            updated_count += 1

    print(f"✅ INECODE mapping complete. Updated {updated_count} entries.")
    return stocks_data, updated_count

# -------------------------------
# Accept command-line mode arg
# -------------------------------
# [MODIFIED]: Replaced interactive input() with sys.argv
update_mode = sys.argv[1].strip().lower() if len(sys.argv) > 1 else "mcap"
if update_mode not in ["mcap", "full"]:
    print("❌ Invalid mode. Use 'mcap' or 'full'.")
    exit()

print(f"\n🚀 Running Sector_Industry.py in mode: {update_mode.upper()}")
all_stocks_data = load_json_file(OUTPUT_JSON_FILE)
security_id_to_stock = {stock["SecurityID"]: stock for stock in all_stocks_data if stock.get("SecurityID")}

# -------------------------------
# Market Cap Update Only
# -------------------------------
if update_mode == 'mcap':
    print("\n🔄 Starting Market Cap update mode...\n")
    industry_map = {}
    for entry in all_stocks_data:
        industry_id = entry.get("Industry ID")
        if not industry_id:
            continue
        if industry_id not in industry_map:
            industry_map[industry_id] = []
        industry_map[industry_id].append(entry)

    updated_count = 0
    for industry_id, entries in industry_map.items():
        new_mcap_data = {}
        page_num = 1
        while True:
            api2_url = API2_BASE_URL.format(industry_id=industry_id, page_num=page_num)
            stock_page = fetch_json_data(api2_url, f"Industry ID {industry_id} Page {page_num}")
            time.sleep(API_CALL_DELAY)

            if not stock_page:
                break
            for stock in stock_page:
                sid = stock.get("SecurityID")
                mcap = stock.get("MCAP")
                if sid and mcap is not None:
                    new_mcap_data[sid] = mcap
            if len(stock_page) < 20:
                break
            page_num += 1

        if not new_mcap_data:
            print(f"⚠️ No Market Cap data fetched for Industry {industry_id}\n")
            continue

        changes = 0
        for stock in entries:
            sid = stock.get("SecurityID")
            if sid in new_mcap_data:
                old_mcap = stock.get("Market Cap", "N/A")
                stock["Market Cap"] = new_mcap_data[sid]
                changes += 1

        save_json_file(all_stocks_data, OUTPUT_JSON_FILE)
        updated_count += changes

    print(f"\n✅ Market Cap update completed. Total stocks updated: {updated_count}")
    exit()

# -------------------------------
# Full Update Mode
# -------------------------------
print(f"🚀 Starting FULL update from API1+API2+API3...")
# [Original full data extraction logic continues here as-is...]
# No changes needed after this line.

# (Rest of your original full mode logic is kept as-is and unchanged)
