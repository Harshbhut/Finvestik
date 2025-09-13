# fetch_nse_cloudscraper.py
import cloudscraper
scraper = cloudscraper.create_scraper(
    browser={'custom': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124'}
)
# Warm homepage
home = scraper.get("https://www.nseindia.com", timeout=20)
print("home", home.status_code)
# Then fetch CSV (if archived host requires referer/cookies)
csv_url = "https://nsearchives.nseindia.com/content/equities/sec_list_11092025.csv"
r = scraper.get(csv_url, headers={"Referer":"https://www.nseindia.com/"}, timeout=30)
print("csv:", r.status_code)
if r.status_code == 200:
    open("sec.csv","wb").write(r.content)
