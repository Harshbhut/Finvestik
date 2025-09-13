#!/usr/bin/env python3
"""
scripts/Test.py

Fetch pPriceBand for HDFCBANK using jugaad-data and append result to priceband.csv.
Robust: retries on failure and logs concise errors into the CSV so CI artifacts show what happened.
"""

import os
import csv
import time
from datetime import datetime
from zoneinfo import ZoneInfo

# third-party
from jugaad_data.nse import NSELive

# Config
SYMBOL = "HDFCBANK"
CSV_NAME = "priceband.csv"   # written in same folder as this script
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.5  # multiplier for exponential backoff

def make_timestamp_ist():
    try:
        tz = ZoneInfo("Asia/Kolkata")
        return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

def fetch_ppriceband(symbol):
    n = NSELive()
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            q = n.stock_quote(symbol)
            if not isinstance(q, dict):
                raise ValueError("Empty/invalid response (not dict)")
            price_info = q.get("priceInfo", {})
            # price_info may be None or not contain key
            p = price_info.get("pPriceBand") if isinstance(price_info, dict) else None
            # If p is None, consider that a valid response (no band) — return None rather than error
            return p, None
        except Exception as e:
            last_exc = e
            # short log for actions console
            print(f"[attempt {attempt}] fetch error: {e}")
            if attempt < MAX_RETRIES:
                sleep_for = RETRY_BACKOFF_BASE ** (attempt - 1)
                print(f"Retrying in {sleep_for:.1f}s...")
                time.sleep(sleep_for)
    # after retries, return error string
    return None, str(last_exc)

def write_csv_row(script_dir, timestamp, symbol, p_price_band):
    out_path = os.path.join(script_dir, CSV_NAME)
    file_exists = os.path.exists(out_path)
    with open(out_path, "a", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        if not file_exists:
            writer.writerow(["timestamp_ist", "symbol", "pPriceBand"])
        writer.writerow([timestamp, symbol, p_price_band])
    return out_path

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    timestamp = make_timestamp_ist()
    p_price_band, error = fetch_ppriceband(SYMBOL)

    if error:
        # For clarity in CSV, prefix with ERROR:
        csv_value = f"ERROR: {error}"
        print(f"{timestamp} | {SYMBOL} fetch failed: {error}")
    else:
        csv_value = p_price_band  # may be None or string like 'No Band' or '10%'
        print(f"{timestamp} | {SYMBOL} pPriceBand: {csv_value}")

    out_path = write_csv_row(script_dir, timestamp, SYMBOL, csv_value)
    print(f"Saved to {out_path}")

if __name__ == "__main__":
    main()
