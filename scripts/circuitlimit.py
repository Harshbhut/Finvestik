from nse import NSE
from pathlib import Path
from datetime import datetime, timedelta
import os
# Working directory
script_dir = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(script_dir)

nse = NSE(download_folder=DIR, server=True)
previous_date = datetime.now() - timedelta(days=1)
ct = nse.priceband_report(previous_date)

