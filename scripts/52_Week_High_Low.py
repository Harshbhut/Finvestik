import requests
import time
import os
import random
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, List, Dict

# -------------------------
# Configuration
# -------------------------
API_URL = "https://webnodejs.chittorgarh.com/cloud/report/data-read/124/1/01/2026/2026-27/0/mainline"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "52_wk_High_Low.json")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36"
]

EXCLUDE_EXCHANGES = {"BSE SME", "NSE SME"}

REQUEST_TIMEOUT = 20  # seconds
MAX_RETRIES = 3
RETRY_BACKOFF = 1.0  # seconds, multiplied by attempt number

# -------------------------
# Helpers
# -------------------------
def fetch_json_data(url: str, max_retries: int = MAX_RETRIES) -> Optional[dict]:
    """Fetch JSON data from URL with retries and rotating user-agents."""
    for attempt in range(1, max_retries + 1):
        try:
            headers = {
                "Accept": "application/json",
                "User-Agent": random.choice(USER_AGENTS),
                "Referer": "https://webnodejs.chittorgarh.com/"
            }
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException:
            if attempt < max_retries:
                time.sleep(RETRY_BACKOFF * attempt)
    return None

def safe_write_json(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def parse_iso_date_get_ymd(iso_str: str) -> Optional[str]:
    """Extract YYYY-MM-DD from an ISO-like string."""
    if not iso_str or not isinstance(iso_str, str):
        return None
    try:
        return iso_str.split("T", 1)[0]
    except Exception:
        return None

# -------------------------
# Transform logic
# -------------------------
def transform_report(json_payload: dict) -> Dict:
    rows = json_payload.get("reportTableData") or []
    total_records = len(rows)
    excluded_count = 0
    filtered: List[Dict] = []
    source_dates: List[str] = []

    for r in rows:
        exchange = (r.get("Exchange") or "").strip()
        if exchange in EXCLUDE_EXCHANGES:
            excluded_count += 1
            continue

        symbol = (r.get("Symbol") or "").strip()
        if not symbol:
            continue

        series = (r.get("Series") or "").strip()
        high_val = r.get("52 Weeks High")
        low_val = r.get("52 Weeks Low")

        try:
            if isinstance(high_val, str) and high_val.strip():
                high_val = float(high_val)
        except Exception:
            high_val = None
        try:
            if isinstance(low_val, str) and low_val.strip():
                low_val = float(low_val)
        except Exception:
            low_val = None

        high_dt = r.get("~high_dt") or r.get("52 Weeks High Date")
        low_dt = r.get("~low_dt") or r.get("52 Weeks Low Date")

        parsed_h = parse_iso_date_get_ymd(high_dt) if isinstance(high_dt, str) else None
        parsed_l = parse_iso_date_get_ymd(low_dt) if isinstance(low_dt, str) else None
        if parsed_h:
            source_dates.append(parsed_h)
        if parsed_l:
            source_dates.append(parsed_l)

        filtered.append({
            "Symbol": symbol,
            "Exchange": exchange,
            "Series": series,
            "52_Weeks_High": high_val,
            "52_Weeks_Low": low_val
        })

    source_date = max(source_dates) if source_dates else datetime.utcnow().strftime("%Y-%m-%d")
    try:
        tz = ZoneInfo("Asia/Kolkata")
        last_updated = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        last_updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return {
        "source_date": source_date,
        "last_updated": last_updated,
        "data": filtered,
        "meta": {
            "total_records": total_records,
            "excluded": excluded_count,
            "inserted": len(filtered)
        }
    }

# -------------------------
# Main
# -------------------------
def main():
    print("📡 Starting data fetch...")
    payload = fetch_json_data(API_URL)
    if not payload:
        print("❌ Failed to fetch data.", file=sys.stderr)
        sys.exit(1)

    transformed = transform_report(payload)
    meta = transformed.pop("meta")

    print(f"📊 Total records fetched: {meta['total_records']}")
    print(f"🚫 Excluded (SME): {meta['excluded']}")
    print(f"✅ Inserted: {meta['inserted']}")

    safe_write_json(OUTPUT_FILE, transformed)
    print(f"💾 File saved: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
