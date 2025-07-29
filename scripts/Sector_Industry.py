import requests
import time
import os
import random
import json
import csv

# -------------------------------
# Configuration & Constants
# -------------------------------

# API Endpoints
API1_URL = "https://api.stockedge.com/Api/SectorDashboardApi/GetAllSectorsWithRespectiveIndustriesAndMcap?sectorSort=1&lang=en"
API2_BASE_URL = "https://api.stockedge.com/Api/industryDashboardApi/GetIndustryPeerList/{industry_id}?lang=en&pageSize=20&page={page_num}"
API3_SECURITY_INFO_URL = "https://api.stockedge.com/Api/SecurityDashboardApi/GetLatestSecurityInfo/{security_id}?lang=en"

# Delay between API calls
API_CALL_DELAY = 0.1  

# Output file path

OUTPUT_JSON_FILE = os.path.join(os.getcwd(), "Sector_Industry.json")

# User-Agents
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36"
]

# -------------------------------
# Helper: Fetch API JSON
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
        else:
            print(f"❌ Giving up on {context_message} after {max_retries} attempts.")
            return None

# -------------------------------
# Helper: Load and Save JSON
# -------------------------------
def load_json_file(file_path):
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"⚠️ Warning: {file_path} contains invalid JSON. Starting fresh.")
            return []
        except Exception as e:
            print(f"⚠️ Error loading {file_path}: {e}. Starting fresh.")
            return []
    return []

def save_json_file(data, file_path):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

# -------------------------------
# Main Execution: Sector_Industry.py
# -------------------------------
print(f"🚀 Starting script: Sector_Industry.py")
print(f"Output will be incrementally saved to: {OUTPUT_JSON_FILE}\n")



all_stocks_data = load_json_file(OUTPUT_JSON_FILE)
processed_security_ids = {stock.get("SecurityID") for stock in all_stocks_data if stock.get("SecurityID")}
print(f"Found {len(processed_security_ids)} already processed SecurityIDs in {OUTPUT_JSON_FILE}.")

sectors_data = fetch_json_data(API1_URL, "Sectors (API1)")
time.sleep(API_CALL_DELAY)

if not sectors_data:
    print("❌ No sectors found from API1. Aborting."); exit()

total_new_stocks_added_this_run = 0

for sector in sectors_data:
    sector_name = sector.get("Name", "N/A")
    print(f"🔍 Processing Sector: {sector_name}")
    
    current_sector_stocks_added = False

    for industry in sector.get("IndustriesForSector", []):
        industry_id = industry.get("ID")
        industry_name = industry.get("Name", "N/A")
        if not industry_id: 
            print(f"  ⚠️ Skipping industry with no ID in sector {sector_name}.")
            continue
        print(f"  🏭 Processing Industry: {industry_name} (ID: {industry_id})")
        page_num = 1

        while True:
            api2_url = API2_BASE_URL.format(industry_id=industry_id, page_num=page_num)
            stocks_page_summary = fetch_json_data(api2_url, f"Industry Peers (API2) for {industry_name}, Page {page_num}")
            time.sleep(API_CALL_DELAY)
            
            if not stocks_page_summary: 
                print(f"    ⚠️ No more stocks found for Industry {industry_name} on page {page_num} or fetch failed.")
                break

            for stock_summary in stocks_page_summary:
                if stock_summary.get("Exchange", "NSE") == "BSE": 
                    continue
                
                security_id_val = stock_summary.get("SecurityID")
                stock_name_val = stock_summary.get("Name", "N/A")
                mcap_val = stock_summary.get("MCAP", "N/A")

                if not security_id_val:
                    print(f"    ⚠️ Skipping stock with no SecurityID in Industry {industry_name}.")
                    continue

                if security_id_val in processed_security_ids:
                    continue
                
                print(f"      ➕ Processing New Stock: {stock_name_val} (SecurityID: {security_id_val})")

                listing_id_val = "N/A" # Initialize
                symbol_val = "N/A"
                sme_stock_val = "N/A"

                api3_url = API3_SECURITY_INFO_URL.format(security_id=security_id_val)
                security_info = fetch_json_data(api3_url, f"Security Info (API3) for {security_id_val}")
                time.sleep(API_CALL_DELAY)

                if security_info:
                    listings_array = security_info.get("Listings", [])
                    if listings_array:
                        first_listing = listings_array[0] 
                        symbol_val = first_listing.get("ListingSymbol", "N/A")
                        sme_stock_val = "Yes" if first_listing.get("IsSME") else "No" # Or N/A if IsSME is not present
                        if first_listing.get("IsSME") is None:
                            sme_stock_val = "N/A"

                        # CORRECTED: Use "ListingID" key as per user feedback and original script's intent
                        temp_listing_id = first_listing.get("ListingID") 
                        if temp_listing_id is not None:
                            listing_id_val = str(temp_listing_id)
                            # print(f"        Found ListingID: {listing_id_val}.")
                        # else:
                            # print(f"        No 'ListingID' field in first listing for SecurityID {security_id_val}.")
                
                stock_data_entry = {
                    "SecurityID": security_id_val,
                    "ListingID": listing_id_val, # This is now the primary ID for API4
                    "SME Stock?": sme_stock_val,
                    "Sector Name": sector_name,
                    "Industry Name": industry_name,
                    "Symbol": symbol_val,
                    "Stock Name": stock_name_val,
                    "Market Cap": mcap_val
                }
                
                all_stocks_data.append(stock_data_entry)
                processed_security_ids.add(security_id_val)
                total_new_stocks_added_this_run += 1
                current_sector_stocks_added = True
            
            if not stocks_page_summary or len(stocks_page_summary) < 20 : 
                 break
            page_num += 1
            if page_num > 50: 
                print(f"   ⚠️ Exceeded 50 pages for industry {industry_name}. Moving to next.")
                break

    if current_sector_stocks_added:
        save_json_file(all_stocks_data, OUTPUT_JSON_FILE)
        print(f"  💾 Saved progress to {OUTPUT_JSON_FILE} after Sector: {sector_name}\n")
    else:
        print(f"  ✅ No new stocks added for sector: {sector_name}. JSON file not re-saved for this sector.\n")

print(f"\n✅ Sector_Industry.py script completed.")
print(f"Total new stocks added in this run: {total_new_stocks_added_this_run}.")
print(f"Total stocks in {OUTPUT_JSON_FILE}: {len(all_stocks_data)}.")
print(f"File saved at: {OUTPUT_JSON_FILE}")

# -------------------------------
# Append INECODE from NSE.csv
# -------------------------------

csv_file_path = os.path.join(os.getcwd(),"NSE.csv")

if os.path.exists(csv_file_path):
    print(f"\n📥 NSE.csv found. Starting INECODE mapping...")

    # Load CSV into a dict for quick lookup: {tradingsymbol: INECODE}
    symbol_to_inecode = {}
    with open(csv_file_path, mode='r', encoding='utf-8-sig') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            symbol = row.get("tradingsymbol", "").strip().upper()
            inecode = row.get("INECODE", "").strip().upper()
            if symbol and inecode:
                symbol_to_inecode[symbol] = inecode

    updated_count = 0
    for stock in all_stocks_data:
        current_ine = stock.get("INECODE", "").strip().upper()
        symbol = stock.get("Symbol", "").strip().upper()

        if current_ine.startswith("INE"):
            continue  # Already has valid INECODE

        # If not valid, try to find from CSV
        matched_ine = symbol_to_inecode.get(symbol, "XXXXXXXXXX")
        if current_ine != matched_ine:
            stock["INECODE"] = matched_ine
            updated_count += 1

    save_json_file(all_stocks_data, OUTPUT_JSON_FILE)
    print(f"✅ INECODE mapping complete. Updated {updated_count} entries.")
else:
    print(f"\n⚠️ NSE.csv not found at {csv_file_path}. Skipping INECODE mapping.")