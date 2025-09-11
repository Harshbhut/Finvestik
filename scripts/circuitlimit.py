import os
import json
import requests
import pandas as pd
from datetime import datetime, timedelta
from io import StringIO

def download_and_process_band_data():
    """
    Downloads the NSE security list (circuit limits) CSV.
    Uses a robust requests.Session with default headers (including Referer)
    to avoid being blocked by the server.
    """
    # --- Configuration ---
    BASE_URL = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
    MAX_RETRIES = 5
    NSE_HOMEPAGE = "https://www.nseindia.com/" # The page we will claim to be "coming from"

    # --- Define Output Path ---
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    
    output_file = os.path.join(script_dir, "Circuit_Limits.json")

    # --- UPDATED: More comprehensive headers to mimic a real browser ---
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': NSE_HOMEPAGE, # <-- THE CRITICAL ADDITION
        'Connection': 'keep-alive',
    }
    
    csv_content = None
    found_date_str = ""

    print("Attempting to download NSE security band data...")

    # --- Use a Session object to persist cookies and headers ---
    with requests.Session() as s:
        # THE FIX: Update the session with these headers.
        # Every subsequent request made with 's' will now use them automatically.
        s.headers.update(headers)

        # Step 1: "Warm up" the session by visiting the homepage to get cookies.
        try:
            print(f"Visiting NSE homepage to establish a session...")
            s.get(NSE_HOMEPAGE, timeout=20)
            print("Session established successfully.")
        except requests.exceptions.RequestException as e:
            print(f"Could not visit NSE homepage to get cookies. Error: {e}")
            return # Exit if we can't establish a session

        # Step 2: Now try to download the file with the established session
        for i in range(MAX_RETRIES):
            current_date = datetime.now() - timedelta(days=i)
            date_str = current_date.strftime("%d%m%Y")
            url = BASE_URL.format(date=date_str)
            
            try:
                print(f"Trying URL for {current_date.strftime('%Y-%m-%d')}: {url}")
                # We no longer need to pass headers here; the session handles it.
                response = s.get(url, timeout=20) 
                
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

    # --- The rest of your processing logic is unchanged ---
    if csv_content:
        try:
            print("\nProcessing and cleaning CSV data...")
            csv_file = StringIO(csv_content.decode('utf-8'))
            df = pd.read_csv(csv_file)

            df.columns = df.columns.str.strip().str.upper()
            if 'SYMBOL' not in df.columns or 'BAND' not in df.columns:
                raise ValueError("The required 'SYMBOL' or 'BAND' columns were not found.")

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
            print(f"An error occurred during CSV processing or JSON conversion: {e}")
    else:
        print(f"\nCould not download the file after trying for {MAX_RETRIES} days.")

if __name__ == "__main__":
    download_and_process_band_data()
