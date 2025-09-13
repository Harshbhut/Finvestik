# fetch_nse.py
import requests
import time
from requests.exceptions import RequestException

HOME = "https://www.nseindia.com"
CSV = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"

# Full Chrome-like headers
BROWSER_HEADERS = {
    "authority": "www.nseindia.com",
    "method": "GET",
    "scheme": "https",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-encoding": "gzip, deflate, br, zstd",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "referer": "https://www.nseindia.com/",
    "sec-ch-ua": '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.6367.207 Safari/537.36"
    ),
    "connection": "keep-alive",
}

session = requests.Session()
session.headers.update(BROWSER_HEADERS)

def robust_get(url, retries=3, sleep_s=2):
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=(10, 60))
            if resp.status_code == 200:
                return resp
            else:
                print(f"Attempt {attempt}: Status {resp.status_code}")
                print("Snippet:", resp.text[:200])
        except RequestException as e:
            print(f"Attempt {attempt}: Exception {e}")
        time.sleep(sleep_s)
    return None

def main():
    # Step 1: Warm-up request to NSE home
    print("Visiting homepage...")
    home = robust_get(HOME)
    if not home:
        print("Failed to fetch homepage. Exiting.")
        return
    time.sleep(1.5)  # human-like pause

    # Step 2: Try to fetch CSV
    date = "11092025"  # ddmmyyyy
    url = CSV.format(date=date)
    print("Downloading:", url)
    csv_resp = robust_get(url)
    if csv_resp and csv_resp.status_code == 200:
        fname = f"sec_list_{date}.csv"
        with open(fname, "wb") as f:
            f.write(csv_resp.content)
        print("Saved:", fname)
    else:
        print("Failed to fetch CSV after retries.")

if __name__ == "__main__":
    main()
