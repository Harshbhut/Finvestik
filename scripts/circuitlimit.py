import os
import json
import requests
import pandas as pd
from datetime import datetime, timedelta
from io import StringIO
from time import sleep
from numpy import random
from fake_useragent import UserAgent

def download_and_process_band_data():
    """
    Downloads the NSE security list using a robust, multi-pronged approach
    to mimic a real browser and defeat advanced server protection.
    """
    # --- CRITICAL CONFIGURATION (from your reference code) ---
    # 1. Using the correct LEGACY server URL
    BASE_URL = "https://www1.nseindia.com/content/equities/sec_list_{date}.csv"
    # 2. A legitimate page to visit to get initial cookies
    NSE_INITIAL_URL = "https://www1.nseindia.com/products/content/equities/equities/eq_security.htm"
    MAX_RETRIES = 5

    # --- Define Output Path ---
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    output_file = os.path.join(script_dir, "Circuit_Limits.json")

    csv_content = None
    found_date_str = ""
    ua = UserAgent()

    # Create a session that will persist cookies and settings
    with requests.Session() as s:
        # Step 1: "Warm-up" the session with a simple header to get initial cookies
        initial_headers = {'User-Agent': ua.random}
        try:
            print("Visiting NSE page to establish a valid session...")
            s.get(NSE_INITIAL_URL, headers=initial_headers, timeout=20)
            print("Session established successfully.")
        except requests.exceptions.RequestException as e:
            print(f"Could not establish a session. Error: {e}")
            return

        # Step 2: Now try to download the file using the established session and advanced headers
        print("\nAttempting to download NSE security band data...")
        for i in range(MAX_RETRIES):
            # 3. Add a small, random delay to mimic human behavior
            sleep(random.uniform(1, 2))
            
            current_date = datetime.now() - timedelta(days=i)
            # The legacy server uses YY format (2-digit year)
            date_str = current_date.strftime("%d%m%y") 
            url = BASE_URL.format(date=date_str)
            
            try:
                # 4. Use a comprehensive header for the actual data request
                data_header = {
                    'User-Agent': ua.random,
                    'Referer': NSE_INITIAL_URL, # Crucial: claim we came from a real page
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
                
                print(f"Trying URL for {current_date.strftime('%Y-%m-%d')}: {url}")
                response = s.get(url, headers=data_header, timeout=20)
                
                if response.status_code == 200 and 'html' not in response.headers.get('Content-Type', ''):
                    print(f"Success! File found for date: {current_date.strftime('%Y-%m-%d')}")
                    csv_content = response.content
                    found_date_str = current_date.strftime('%Y-%m-%d')
                    break
                else:
                    print(f"File not found for {current_date.strftime('%Y-%m-%d')} (Status: {response.status_code}).")

            except requests.exceptions.RequestException as e:
                print(f"A network error occurred: {e}")
                break

    # --- The rest of your processing logic is unchanged and correct ---
    if csv_content:
        try:
            print("\nProcessing and cleaning CSV data...")
            csv_file = StringIO(csv_content.decode('utf-8'))
            df = pd.read_csv(csv_file)

            df.columns = df.columns.str.strip().str.upper()
            
            # The legacy file uses ' SECURITY BAN' (with a leading space) or similar
            # We find the correct column name dynamically
            band_column = next((col for col in df.columns if 'BAN' in col), None)
            if 'SYMBOL' not in df.columns or not band_column:
                raise ValueError(f"Required columns not found in CSV. Found: {df.columns.to_list()}")
            
            df.rename(columns={band_column: 'BAND'}, inplace=True)
            df = df[['SYMBOL', 'BAND']]

            df['SYMBOL'] = df['SYMBOL'].str.strip()
            df['BAND'] = df['BAND'].astype(str).str.strip().replace('No Band', '0')
            df['BAND'] = pd.to_numeric(df['BAND'], errors='coerce')

            initial_rows = len(df)
            df = df.dropna()
            final_rows = len(df)
            print(f"Removed {initial_rows - final_rows} records with missing data.")
            
            records = df.to_dict(orient="records")
            output_data = {
                "source_date": found_date_str,
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "data": records
            }
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            print(f"\nSuccessfully saved {final_rows} complete records to: {output_file}")
        except Exception as e:
            print(f"An error occurred during CSV processing: {e}")
    else:
        print(f"\nCould not download the file after trying for {MAX_RETRIES} days.")

if __name__ == "__main__":
    download_and_process_band_data()
