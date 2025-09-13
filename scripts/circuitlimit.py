# circuitlimit.py
import os
import sys
import traceback
from datetime import datetime, timedelta
from nse import NSE

# choose download dir from env (set in Actions)
DIR = os.environ.get("NSE_DOWNLOAD_DIR", None)  # runner temp or cwd if None

previous_date = datetime.now() - timedelta(days=1)

def get_nse_instance(download_folder, prefer_server=True):
    # Try server=True first for http2 support, else fall back
    if prefer_server:
        try:
            print("Trying NSE(server=True) ...")
            return NSE(download_folder=download_folder, server=True)
        except Exception as e:
            print("NSE(server=True) failed:", repr(e))
            traceback.print_exc()
            print("Falling back to NSE(server=False)...")

    # fallback
    try:
        return NSE(download_folder=download_folder, server=True)
    except Exception as e:
        print("NSE(server=False) also failed:", repr(e))
        traceback.print_exc()
        raise

if __name__ == "__main__":
    nse = get_nse_instance(DIR, prefer_server=True)
    try:
        ct = nse.priceband_report(previous_date)
        # write out result (adjust path as needed)
        out_path = os.path.join(os.getcwd(), "scripts", "Circuit_Limits.json")
        with open(out_path, "w", encoding="utf-8") as f:
            import json
            json.dump(ct, f, ensure_ascii=False, indent=2)
        print("Wrote", out_path)
    finally:
        try:
            nse.close()
        except Exception:
            pass
