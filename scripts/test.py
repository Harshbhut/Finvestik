# tools/fetch_no_proxy.py
import os
import time
import sys
from textwrap import shorten

print("=== NSE fetch_no_proxy test ===\n")

HOME = "https://www.nseindia.com"
CSV_TEMPLATE = "https://nsearchives.nseindia.com/content/equities/sec_list_{date}.csv"
DATE = os.getenv("NSE_DATE", "11092025")
CSV_URL = CSV_TEMPLATE.format(date=DATE)

LOGFILE = "fetch_no_proxy_output.txt"

def log(s):
    print(s)
    with open(LOGFILE, "a", encoding="utf-8") as f:
        f.write(s + "\n")

# helpers
def print_resp_info(resp_label, resp):
    try:
        status = getattr(resp, "status_code", getattr(resp, "status", "n/a"))
        headers = getattr(resp, "headers", {})
        body = getattr(resp, "text", None)
    except Exception as e:
        log(f"{resp_label} - exception reading response: {e}")
        return
    log(f"\n--- {resp_label} ---")
    log(f"Status: {status}")
    if headers:
        for k in ("Server","Via","Akamai-GRN","Content-Type","Content-Length"):
            if k in headers:
                log(f"{k}: {headers.get(k)}")
    if body:
        snippet = shorten(body.replace("\n"," "), width=800, placeholder="...")
        log("Body snippet: " + snippet)
    else:
        log("No body available")

# 1) curl-like quick check using python requests (simple)
try:
    import requests
    log("1) requests GET home")
    r = requests.get(HOME, headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"}, timeout=20)
    print_resp_info("requests: home", r)

    log("requests GET CSV")
    r2 = requests.get(CSV_URL, headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124", "Referer": HOME}, timeout=30)
    print_resp_info("requests: csv", r2)
except Exception as e:
    log(f"requests exception: {e}")

# 2) cloudscraper (attempt to pass JS challenges)
try:
    import cloudscraper
    log("\n2) cloudscraper GET home")
    scraper = cloudscraper.create_scraper(browser={'custom': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124'})
    cr = scraper.get(HOME, timeout=20)
    print_resp_info("cloudscraper: home", cr)

    log("cloudscraper GET CSV")
    cr2 = scraper.get(CSV_URL, headers={"Referer": HOME}, timeout=30)
    print_resp_info("cloudscraper: csv", cr2)
except Exception as e:
    log(f"cloudscraper exception: {e}")

# 3) Selenium headless attempt (uses Selenium Manager - will download a browser)
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    log("\n3) Selenium (headless) - visiting home then CSV")

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124")

    log("Launching browser (Selenium Manager will auto-download driver/browser if needed)...")
    driver = webdriver.Chrome(options=opts)

    log("Selenium -> GET HOME")
    driver.get(HOME)
    time.sleep(4)
    body_home = driver.execute_script("return document.body ? document.body.innerText : ''")
    # try get some header-like info via JS if possible
    log("Selenium home body snippet: " + (body_home or "")[:1000])

    log("Selenium -> GET CSV")
    driver.get(CSV_URL)
    time.sleep(2)
    body_csv = driver.execute_script("return document.body ? document.body.innerText : ''")
    if body_csv:
        log("Selenium CSV snippet: " + (body_csv or "")[:1000])
    else:
        log("Selenium CSV: no body or blocked")
    driver.quit()
except Exception as e:
    log(f"Selenium exception: {e}")

log("\n=== Test complete. Check above logs and fetch_no_proxy_output.txt (uploaded as artifact). ===")
# exit with non-zero if evidence of blocking (quick heuristic)
with open(LOGFILE, "r", encoding="utf-8") as f:
    txt = f.read().lower()
if "access denied" in txt or "403" in txt or "akamai" in txt:
    log("Detected probable Akamai/IP block from runner -> exit 2")
    sys.exit(2)
else:
    log("No obvious block detected; network appears OK -> exit 0")
    sys.exit(0)
