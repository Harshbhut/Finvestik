#!/usr/bin/env python3
"""
download_nse_sec_list.py

Usage:
  - Run normally: python download_nse_sec_list.py
  - Enable debug output: DEBUG=1 python download_nse_sec_list.py
  - Override max days to try: MAX_DAYS=7 python download_nse_sec_list.py
  - Override output file: OUT_FILE=/path/to/Circuit_Limits.json python download_nse_sec_list.py

Dependencies:
  pip install requests pandas urllib3
"""

import os
import sys
import time
import random
import json
import requests
import pandas as pd
from io import StringIO
from datetime import datetime, timedelta
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DEBUG = os.environ.get("DEBUG", "0") not in ("0", "false", "False")
MAX_DAYS = int(os.environ.get("MAX_DAYS", "5"))

# Default URLs
DATED_BASE = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
FALLBACK_URLS = [
    "https://nsearchives.nseindia.com/content/equities/sec_list.csv",
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
]

def log(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

def create_session_with_retries(total_retries=3, backoff=0.5):
    session = requests.Session()
    # Browser-like header set
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    session.headers.update(headers)

    retries = Retry(
        total=total_retries,
        backoff_factor=backoff,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(['GET', 'POST'])
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def looks_like_csv(content_bytes):
    try:
        s = content_bytes.decode('utf-8', errors='ignore')
    except Exception:
        return False
    if len(s) < 50:
        return False
    # require presence of "SYMBOL" and comma/tab newlines to be conservative
    if ('SYMBOL' in s.upper()) and (',' in s or '\t' in s):
        return True
    if 'symbol,' in s.lower() or 'symbol\t' in s.lower():
        return True
    return False

def fetch_homepage(session):
    try:
        resp = session.get("https://www.nseindia.com/", timeout=15)
        log(f"Homepage GET: {resp.status_code}; cookie count: {len(session.cookies)}")
        if resp.status_code == 200:
            # small pause to mimic human browsing
            time.sleep(0.5 + random.random() * 1.0)
        else:
            # non-fatal: continue (some runners get 403 but cookies may still exist)
            log("  Note: homepage returned non-200 (commonly seen on cloud runners). Continuing to attempt CSV downloads.")
        if DEBUG:
            # print a tiny snippet for debugging
            try:
                snippet = resp.text[:800]
                log("  Homepage snippet (chars):", len(snippet))
                log(snippet)
            except Exception:
                pass
    except requests.RequestException as e:
        log(f"Failed to fetch homepage (non-fatal): {e}")

def fetch_csv_with_session(session, url, referer="https://www.nseindia.com/"):
    # Narrow headers for CSV request
    headers = {
        "Referer": referer,
        "Accept": "text/csv,application/octet-stream,application/json,*/*;q=0.1",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
    }
    resp = session.get(url, headers=headers, timeout=20)
    return resp

def download_csv_try_all(max_days=MAX_DAYS):
    session = create_session_with_retries(total_retries=4, backoff=1)

    # try to populate cookies from homepage but treat non-200 as non-fatal
    fetch_homepage(session)

    csv_bytes = None
    found_date_str = ""

    log("Attempting dated CSVs (today -> back)...")
    for i in range(max_days):
        dt = datetime.now() - timedelta(days=i)
        date_str = dt.strftime("%d%m%Y")
        url = DATED_BASE.format(date=date_str)
        log(f"  Trying dated URL ({i+1}/{max_days}): {url}")
        try:
            resp = fetch_csv_with_session(session, url)
            ct = resp.headers.get('Content-Type', '')
            log(f"    Status: {resp.status_code}; Content-Type: {ct}")
            if resp.status_code == 200 and looks_like_csv(resp.content):
                csv_bytes = resp.content
                found_date_str = dt.strftime("%Y-%m-%d")
                log(f"    Success: looks like CSV for {found_date_str}")
                break
            else:
                log("    Not CSV or not found.")
                if DEBUG and resp.status_code in (403, 401, 404, 429):
                    try:
                        log("    Debug snippet (first 1000 chars):")
                        log(resp.text[:1000])
                    except Exception:
                        pass
        except requests.RequestException as e:
            log(f"    Network error: {e}")

        # polite pause
        time.sleep(0.5 + random.random() * 1.5)

    if not csv_bytes:
        log("Trying fallback canonical URLs...")
        for url in FALLBACK_URLS:
            log(f"  Trying fallback: {url}")
            try:
                resp = fetch_csv_with_session(session, url)
                ct = resp.headers.get('Content-Type', '')
                log(f"    Status: {resp.status_code}; Content-Type: {ct}")
                if resp.status_code == 200 and looks_like_csv(resp.content):
                    csv_bytes = resp.content
                    found_date_str = "canonical"
                    log("    Success: found CSV on fallback URL.")
                    break
                else:
                    log("    Not CSV or not found.")
                    if DEBUG and resp.status_code in (403, 401, 404, 429):
                        try:
                            log("    Debug snippet (first 1000 chars):")
                            log(resp.text[:1000])
                        except Exception:
                            pass
            except requests.RequestException as e:
                log(f"    Network error: {e}")
            time.sleep(0.5 + random.random() * 1.5)

    return csv_bytes, found_date_str

def process_and_save(csv_bytes, found_date_str, output_file):
    if not csv_bytes:
        log("No CSV bytes provided to process.")
        return False

    try:
        csv_file = StringIO(csv_bytes.decode('utf-8', errors='ignore'))
        df = pd.read_csv(csv_file)

        # normalize headers
        df.columns = df.columns.str.strip().str.upper()

        if 'SYMBOL' not in df.columns or 'BAND' not in df.columns:
            raise ValueError("Required 'Symbol' or 'Band' columns not found in CSV.")

        df = df[['SYMBOL', 'BAND']].copy()
        df['SYMBOL'] = df['SYMBOL'].astype(str).str.strip()
        df['BAND'] = df['BAND'].astype(str).str.strip()

        # replace "No Band" -> 0, then numeric conversion
        df['BAND'] = df['BAND'].replace('No Band', '0')
        df['BAND'] = pd.to_numeric(df['BAND'], errors='coerce')

        initial_rows = len(df)
        df = df.dropna()
        final_rows = len(df)
        log(f"Removed {initial_rows - final_rows} records with missing data.")

        records = df.to_dict(orient="records")
        output_data = {
            "source_date": found_date_str,
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "data": records
        }

        # ensure output directory exists
        out_dir = os.path.dirname(output_file) or "."
        os.makedirs(out_dir, exist_ok=True)

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        log(f"Successfully saved {final_rows} records to: {output_file}")
        return True

    except Exception as e:
        log("An error occurred during CSV processing or JSON conversion:", e)
        if DEBUG:
            import traceback
            traceback.print_exc()
        return False

def determine_output_file():
    # Priority: explicit env OUT_FILE > GITHUB_WORKSPACE/CWD/script dir
    env_out = os.environ.get("OUT_FILE")
    if env_out:
        return env_out

    gh = os.environ.get("GITHUB_WORKSPACE")
    if gh:
        return os.path.join(gh, "Circuit_Limits.json")

    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    return os.path.join(script_dir, "Circuit_Limits.json")

def main():
    log("=== NSE SEC LIST DOWNLOADER ===")
    log(f"DEBUG={DEBUG}; MAX_DAYS={MAX_DAYS}")
    out_file = determine_output_file()
    log(f"Output file: {out_file}")

    csv_bytes, found_date = download_csv_try_all(max_days=MAX_DAYS)
    if not csv_bytes:
        log("Failed to download a valid CSV after all attempts.")
        # If debug, try to give a hint to user
        if DEBUG:
            log("If you repeatedly see 403/HTML, consider using a self-hosted runner or Playwright to emulate a browser.")
        # exit non-zero so CI can detect failure
        sys.exit(2)

    ok = process_and_save(csv_bytes, found_date, out_file)
    if not ok:
        log("Processing failed.")
        sys.exit(3)

    log("Done.")
    sys.exit(0)

if __name__ == "__main__":
    main()
