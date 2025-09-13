import os
from nse import NSE

# safer for GitHub Actions:
DIR = os.environ.get("NSE_DOWNLOAD_DIR", os.getcwd())  # you can set NSE_DOWNLOAD_DIR in Actions
os.makedirs(DIR, exist_ok=True)

with NSE(download_folder=DIR, server=True) as nse:
    ct = nse.priceband_report(previous_date)
