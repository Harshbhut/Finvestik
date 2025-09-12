import requests
import csv
import json
import os
import time
from datetime import datetime, timedelta
import pytz  # <-- needed for IST timezone

URL = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
OUTPUT = os.path.join(os.path.dirname(__file__), "NSE.json")
TIMEOUT = (10, 60)  # (connect, read) seconds

# Browser-like headers so server treats request like a browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/csv, */*; q=0.01",
}


def stream_csv_to_json(url, output_file):
    print("Downloading (browser-like):", url)
    resp = requests.get(url, stream=True, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()

    lines = resp.iter_lines(decode_unicode=True)
    reader = csv.DictReader(lines)

    total = 0
    with open(output_file, "w", encoding="utf-8") as out:
        out.write("[")
        first = True
        for row in reader:
            record = {}
            for key, value in row.items():
                if key is None:
                    continue
                val = (value or "").strip()
                ku = key.strip().upper()
                if ku == "SYMBOL":
                    record["trading_symbol"] = val
                elif ku == "ISIN NUMBER":
                    record["isin"] = val
                else:
                    record[key.strip().lower().replace(" ", "_")] = val

            if not first:
                out.write(",\n")
            json.dump(record, out, ensure_ascii=False)
            first = False
            total += 1

        out.write("]")

    resp.close()
    print(f"✅ Done — processed {total} rows. Saved: {os.path.abspath(output_file)}")


if __name__ == "__main__":
    start = time.time()

    # Get IST time, then subtract 1 day
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    prev_day = now_ist - timedelta(days=1)
    date_str = prev_day.strftime("%d%m%Y")  # format DDMMYYYY

    # Build URL with yesterday’s date
    url = URL.format(date=date_str)

    try:
        stream_csv_to_json(url, OUTPUT)
    except Exception as e:
        print("ERROR:", e)

    print(f"Time elapsed: {time.time() - start:.2f}s")
