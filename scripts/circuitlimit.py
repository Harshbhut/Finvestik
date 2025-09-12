#!/usr/bin/env python3
"""
circuitlimit_debug.py

Requests-only downloader with deep diagnostics targeted to debug "works locally but 403 on GitHub Actions".

Usage:
  DEBUG=1 MAX_DAYS=7 python circuitlimit_debug.py

Environment:
  DEBUG=1       -> prints HTML snippets and extra debug data
  MAX_DAYS=n    -> how many recent dated files to try (default 5)
  OUT_FILE=...  -> override output path (default: GITHUB_WORKSPACE/Circuit_Limits.json or script dir)
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

# ---- Config ----
DEBUG = os.environ.get("DEBUG", "0") not in ("0", "false", "False")
MAX_DAYS = int(os.environ.get("MAX_DAYS", "5"))
BASE_URL = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
FALLBACKS = [
    "https://nsearchives.nseindia.com/content/equities/sec_list.csv",
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
]
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
]

def log(*args, **kwargs):
    print(*args, **kwargs)
    sys.stdout.flush()

def default_output_file():
    env = os.environ.get("OUT_FILE")
    if env:
        return env
    gh = os.environ.get("GITHUB_WORKSPACE")
    if gh:
        return os.path.join(gh, "Circuit_Limits.json")
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        script_dir = os.getcwd()
    return os.path.join(script_dir, "Circuit_Limits.json")

# create session with retry/backoff
def create_session(total_retries=4, backoff_factor=0.8, ua=None):
    s = requests.Session()
    headers = {
        "User-Agent": ua or random.choice(USER_AGENTS),
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }
    s.headers.update(headers)
    retries = Retry(total=total_retries, backoff_factor=backoff_factor,
                    status_forcelist=(429, 500, 502, 503, 504),
                    allowed_methods=frozenset(['GET', 'POST']))
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s

def looks_like_csv(content_bytes: bytes) -> bool:
    try:
        s = content_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return False
    if len(s) < 50:
        return False
    if 'SYMBOL' in s.upper() and (',' in s or '\t' in s):
        return True
    return False

def debug_print_response(resp):
    """
    Print response housekeeping that help determine why there was a 403 or HTML.
    Only prints big content when DEBUG=True.
    """
    try:
        log("    Status:", resp.status_code)
        log("    Content-Type:", resp.headers.get('Content-Type'))
        log("    Server:", resp.headers.get('Server'))
        log("    Date:", resp.headers.get('Date'))
        log("    Cookies set (count):", len(resp.cookies))
        if DEBUG:
            # print a snippet to analyze block pages (first 1200 chars)
            try:
                text = resp.text
                snippet = text[:1200]
                log("    Snippet (first ~1200 chars):")
                log(snippet)
                if len(text) > 1200:
                    log("    ... (snippet truncated)")
            except Exception as e:
                log("    Could not decode response.text:", e)
    except Exception as e:
        log("    debug_print_response error:", e)

def seed_cookies(session):
    """
    Visit homepage(s) to seed cookies/tokens. Treat non-200 as non-fatal.
    """
    seed_urls = [
        "https://www.nseindia.com/",
        "https://nsearchives.nseindia.com/",
    ]
    for u in seed_urls:
        try:
            r = session.get(u, timeout=15)
            log(f"[seed] GET {u} -> {r.status_code}; cookies={len(session.cookies)}")
            if DEBUG:
                try:
                    log("  snippet (seed):", r.text[:400])
                except Exception:
                    pass
            # short wait to mimic real browser
            time.sleep(0.4 + random.random()*0.6)
        except requests.RequestException as e:
            log(f"[seed] Error hitting {u}: {e}")

def attempt_once(session, url, referer="https://www.nseindia.com/"):
    """
    Single attempt to GET the url with appropriate headers and return (resp or None)
    """
    headers = {
        "Referer": referer,
        "Accept": "text/csv,application/octet-stream,application/json,*/*;q=0.1",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        # keep UA from session.headers
    }
    try:
        resp = session.get(url, headers=headers, timeout=20)
        return resp
    except requests.RequestException as e:
        log("    Network error on GET:", e)
        return None

def download_csv_with_diagnostics(max_days=MAX_DAYS):
    """
    Main sequence: try multiple UAs / seed cookies / backoff / fallbacks
    Returns (csv_bytes, found_date_str) or (None, None)
    """
    # try a few UA rotations and header sets to probe server behavior
    for ua_try in range(3):
        ua = random.choice(USER_AGENTS)
        session = create_session(ua=ua)
        log(f"[attempt] Trying with UA: {session.headers.get('User-Agent')}")
        # seed cookies (non-fatal)
        seed_cookies(session)

        # try dated files
        for i in range(max_days):
            dt = datetime.now() - timedelta(days=i)
            date_str = dt.strftime("%d%m%Y")
            url = BASE_URL.format(date=date_str)
            log(f"  Trying URL for {dt.strftime('%Y-%m-%d')}: {url}")
            resp = attempt_once(session, url)
            if resp is None:
                log("    No response (network error).")
                continue
            # give detailed debug info
            debug_print_response(resp)
            # success heuristic: 200 + looks like csv
            if resp.status_code == 200 and looks_like_csv(resp.content):
                log("    Success! Looks like CSV.")
                return resp.content, dt.strftime('%Y-%m-%d')
            # Sometimes server returns 200 but HTML (an interstitial) so we treat as non-CSV
            log(f"    Not CSV. Status {resp.status_code}.")
            # small polite delay
            time.sleep(0.6 + random.random()*1.3)

        # try fallback urls
        for url in FALLBACKS:
            log(f"  Trying fallback URL: {url}")
            resp = attempt_once(session, url)
            if resp is None:
                continue
            debug_print_response(resp)
            if resp.status_code == 200 and looks_like_csv(resp.content):
                log("    Success on fallback.")
                return resp.content, "canonical"
            time.sleep(0.6 + random.random()*1.3)

        # Exponential backoff and rotate UA before next try
        wait = 1.5 * (ua_try + 1)
        log(f"[attempt] rotating UA / waiting {wait}s before next UA attempt...")
        time.sleep(wait)

    # If we reach here, we've tried multiple approaches
    log("[final] All UA/header attempts exhausted; download failed.")
    return None, None

def process_and_save(csv_content: bytes, found_date_str: str, output_file: str):
    try:
        log("\nProcessing CSV into JSON...")
        csv_file = StringIO(csv_content.decode('utf-8', errors='ignore'))
        df = pd.read_csv(csv_file)
        df.columns = df.columns.str.strip().str.upper()
        if 'SYMBOL' not in df.columns or 'BAND' not in df.columns:
            raise ValueError("The required 'Symbol' or 'Band' columns were not found in the CSV.")
        df = df[['SYMBOL', 'BAND']].copy()
        df['SYMBOL'] = df['SYMBOL'].astype(str).str.strip()
        df['BAND'] = df['BAND'].astype(str).str.strip().replace('No Band', '0')
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
        os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        log(f"\nSuccessfully saved {final_rows} complete records to: {output_file}")
        return True
    except Exception as e:
        log("Processing error:", e)
        if DEBUG:
            import traceback; traceback.print_exc()
        return False

def main():
    log("=== NSE SEC LIST DOWNLOADER (debug) ===")
    output_file = default_output_file()
    log(f"DEBUG={DEBUG}; MAX_DAYS={MAX_DAYS}; OUT_FILE={output_file}")

    csv_content, found_date = download_csv_with_diagnostics(MAX_DAYS)

    if csv_content:
        ok = process_and_save(csv_content, found_date, output_file)
        if not ok:
            sys.exit(3)
        sys.exit(0)
    else:
        log("\nCould not download a valid CSV after trying multiple header/UA combinations.")
        log("If you see repeated 403 pages in the logs, likely GitHub Actions runner IPs or the nsearchives host is blocking cloud-run IP ranges.")
        log("Next steps: see suggestions printed below.")
        # print helpful troubleshooting hints
        if DEBUG:
            log("\n--- Troubleshooting hints ---")
            log("1) Inspect the DEBUG snippets printed above — they often contain Cloudflare/Block messages.")
            log("2) Try a self-hosted runner (your own VM) - often easiest fix if GH IPs blocked.")
            log("3) If you must remain on GH runners, consider Playwright (headful browser) or an upstream API/data provider.")
            log("4) Paste the debug snippet here and I'll analyze the block content for exact cause.")
        sys.exit(2)

if __name__ == "__main__":
    main()
