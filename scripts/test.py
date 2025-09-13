#!/usr/bin/env python3
"""
fetch_priceband.py

Fetch pPriceBand for HDFCBANK using jugaad-data and append result to a CSV
in the same directory as this script.

CSV columns:
  timestamp_ist, symbol, pPriceBand

Usage:
  python fetch_priceband.py
"""

import os
import csv
from datetime import datetime
from zoneinfo import ZoneInfo
from jugaad_data.nse import NSELive

# Config
SYMBOL = "HDFCBANK"
FNAME = "priceband.csv"  # written in same folder as this script

def get_priceband_for(symbol: str):
    n = NSELive()
    q = n.stock_quote(symbol)
    # Safe access
    price_info = q.get("priceInfo", {}) if isinstance(q, dict) else {}
    return price_info.get("pPriceBand")

def make_timestamp_ist():
    try:
        tz = ZoneInfo("Asia/Kolkata")
        return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, FNAME)

    symbol = SYMBOL
    try:
        p_price_band = get_priceband_for(symbol)
    except Exception as e:
        # In case of failure, record error text in the CSV
        p_price_band = f"ERROR: {e}"

    timestamp = make_timestamp_ist()

    # Append to CSV (create header if new)
    file_exists = os.path.exists(out_path)
    with open(out_path, "a", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        if not file_exists:
            writer.writerow(["timestamp_ist", "symbol", "pPriceBand"])
        writer.writerow([timestamp, symbol, p_price_band])

    print(f"{timestamp} | {symbol} pPriceBand: {p_price_band} -> saved to {out_path}")

if __name__ == "__main__":
    main()
