import os
import csv
import json
import time
import requests
from io import StringIO
from datetime import datetime, timedelta

def process_csv_and_save(csv_content: bytes, output_file: str, source_date: str):
    """
    Reads CSV content, processes it row-by-row, and saves as a JSON file.
    This logic directly mirrors the style of your working NSE.py script.
    """
    print("\nProcessing and cleaning CSV data...")
    try:
        # Use StringIO to treat the decoded byte string as a file
        lines = StringIO(csv_content.decode('utf-8'))
        reader = csv.DictReader(lines)

        records = []
        for row in reader:
            # Clean up keys and values from the CSV row
            cleaned_row = { (key or "").strip().upper(): (value or "").strip() for key, value in row.items() }

            # Ensure the essential columns are present in this row
            if "SYMBOL" in cleaned_row and "BAND" in cleaned_row:
                band_value_str = cleaned_row.get("BAND", "0")
                if band_value_str.upper() == 'NO BAND':
                    band_value_str = "0"
                
                # Convert band value to a number
                try:
                    band_value = int(float(band_value_str))
                except (ValueError, TypeError):
                    band_value = 0 # Default to 0 if conversion fails

                records.append({
                    "SYMBOL": cleaned_row.get("SYMBOL"),
                    "BAND": band_value
                })

        output_data = {
            "source_date": source_date,
            "last_updated": datetime.now().strftime("%Y-m-d %H:%M:%S"),
            "data": records
        }

        with open(output_file, "w", encoding="utf-8") as out:
            json.dump(output_data, out, ensure_ascii=False, indent=2)

        print(f"✅ Done — processed {len(records)} rows. Saved: {os.path.abspath(output_file)}")

    except Exception as e:
        print(f"An error occurred during CSV processing: {e}")

def download_circuit_limit_data():
    """
    Downloads the daily circuit limit file by first establishing a
    valid session to bypass server security, then saving the result.
    """
    # Configuration
    BASE_URL = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
    NSE_HOME_URL = "https://www.nseindia.com/"
    MAX_RETRIES = 5
    
    script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else os.getcwd()
    output_file = os.path.join(script_dir, "Circuit_Limits.json")
    
    # Headers adapted from your working reference files
    initial_header = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    }
    data_header = {
        "Referer": "https://www.nseindia.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    }
    
    with requests.Session() as s:
        # Establish a valid session to get necessary cookies
        try:
            print("Establishing a browser-like session with NSE...")
            s.get(NSE_HOME_URL, headers=initial_header, timeout=20)
            print("Session established successfully.")
        except requests.exceptions.RequestException as e:
            print(f"Could not establish a session. Error: {e}")
            return

        # Attempt to download the file for the last few days
        print("\nAttempting to download NSE security band data...")
        for i in range(MAX_RETRIES):
            current_date = datetime.now() - timedelta(days=i)
            date_str = current_date.strftime("%d%m%Y")
            url = BASE_URL.format(date=date_str)
            
            try:
                print(f"Trying URL for {current_date.strftime('%Y-%m-%d')}: {url}")
                response = s.get(url, headers=data_header, timeout=20)
                
                if response.status_code == 200 and 'html' not in response.headers.get('Content-Type', ''):
                    print(f"Success! File found for date: {current_date.strftime('%Y-%m-%d')}")
                    # Process and save the file, then exit the function
                    process_csv_and_save(response.content, output_file, current_date.strftime('%Y-%m-%d'))
                    return
                else:
                    print(f"File not found for {current_date.strftime('%Y-%m-%d')} (Status: {response.status_code}).")

            except requests.exceptions.RequestException as e:
                print(f"A network error occurred: {e}")
                break

    print(f"\nCould not download the file after trying for {MAX_RETRIES} days.")

if __name__ == "__main__":
    start_time = time.time()
    try:
        download_circuit_limit_data()
    except Exception as e:
        print("An unexpected error occurred:", e)
    print(f"Total time elapsed: {time.time() - start_time:.2f}s")
