import os
import json
import requests
import pandas as pd
from datetime import datetime, timedelta
from io import StringIO

def download_and_process_nse_data():
    """
    Downloads, cleans, and processes the NSE 52-week high/low CSV.
    It filters out records with missing high/low values, removes date columns,
    and saves the result as a clean JSON file.
    """
    # --- Configuration ---
    BASE_URL = "https://nsearchives.nseindia.com/content/CM_52_wk_High_low_{date}.csv"
    MAX_RETRIES = 5

    # --- Define Output Path ---
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    
    output_file = os.path.join(script_dir, "52_wk_High_Low.json")

    # --- Headers ---
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    }
    
    csv_content = None
    found_date_str = ""

    print("Attempting to download NSE 52-week high/low data...")

    for i in range(MAX_RETRIES):
        current_date = datetime.now() - timedelta(days=i)
        date_str = current_date.strftime("%d%m%Y")
        url = BASE_URL.format(date=date_str)
        
        try:
            print(f"Trying URL for {current_date.strftime('%Y-%m-%d')}: {url}")
            response = requests.get(url, headers=headers, timeout=15)
            
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

    if csv_content:
        try:
            print("\nProcessing and cleaning CSV data...")
            csv_file = StringIO(csv_content.decode('utf-8'))
            df = pd.read_csv(csv_file, skiprows=2)

            # 1. Clean column headers
            df.columns = df.columns.str.strip()

            # 2. Remove date columns
            columns_to_drop = [col for col in df.columns if 'Date' in col or '_DT' in col]
            df.drop(columns=columns_to_drop, inplace=True, errors='ignore')
            
            # 3. Strip whitespace from all data in remaining string columns
            for col in df.select_dtypes(include=['object']).columns:
                df[col] = df[col].str.strip()

            # 4. Identify price columns and convert them to a numeric type
            price_cols = [col for col in df.columns if 'High' in col or 'Low' in col or 'CLOSE' in col]
            for col in price_cols:
                df[col] = pd.to_numeric(df[col], errors='coerce')

            # --- THE FIX IS HERE: Remove rows with missing high/low values ---
            # Identify the specific high/low columns to check for missing values
            high_low_check_cols = [col for col in price_cols if 'High' in col or 'Low' in col]
            initial_rows = len(df)
            df.dropna(subset=high_low_check_cols, inplace=True)
            final_rows = len(df)
            print(f"Removed {initial_rows - final_rows} records with missing 52-week high/low values.")
            # --- End of fix ---

            # 5. Replace any remaining pandas' 'NaN' with 'None' for proper JSON null values
            df = df.where(pd.notnull(df), None)

            print("Converting final data to JSON...")
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
    download_and_process_nse_data()