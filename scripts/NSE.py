from data_utils import atomic_write_json
import requests
import csv
import json
import os
import time

URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
OUTPUT = os.path.join(os.path.dirname(__file__), "NSE.json")
TIMEOUT = (10, 60)  # (connect, read) seconds

# Browser-like headers so server treats request like a browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/csv, */*; q=0.01",
}

def stream_csv_to_json(url, output_file):
    """Parse and validate the CSV before replacing the last known-good snapshot."""
    print("Downloading:", url)
    with requests.get(url, stream=True, headers=HEADERS, timeout=TIMEOUT) as resp:
        resp.raise_for_status()
        resp.encoding = "utf-8-sig"
        reader = csv.DictReader(resp.iter_lines(decode_unicode=True))
        columns = {(key or "").strip().upper() for key in (reader.fieldnames or [])}
        if not {"SYMBOL", "ISIN NUMBER"}.issubset(columns):
            raise ValueError("NSE response is missing required CSV columns")
        records = []
        for row in reader:
            record = {}
            for key, value in row.items():
                if key is None:
                    continue
                field = {"SYMBOL": "trading_symbol", "ISIN NUMBER": "isin"}.get(
                    key.strip().upper(), key.strip().lower().replace(" ", "_"))
                record[field] = (value or "").strip()
            if not record.get("trading_symbol") or not record.get("isin"):
                raise ValueError("NSE response contains a row without a symbol or ISIN")
            records.append(record)
        if not records:
            raise ValueError("NSE response contains no securities")
        atomic_write_json(records, output_file)
    print(f"✅ Done — processed {len(records)} rows. Saved: {os.path.abspath(output_file)}")

if __name__ == "__main__":
    start = time.time()
    try:
        stream_csv_to_json(URL, OUTPUT)
    except Exception as e:
        print("ERROR:", e)
        raise
    print(f"Time elapsed: {time.time() - start:.2f}s")
