import pandas as pd
from stock_data_pipeline import (
    CONFIG,
    load_json_file,
    filter_base_stocks,
    fetch_json_data,
    parse_strike_data,
    attach_live_data,
    build_historical_map,
    get_latest_trade_date,
)

def debug_removed_stocks(output_excel="removed_stocks_debug.xlsx"):
    removed_records = []

    # ---------------- Step 1: Load base ----------------
    base_data = load_json_file(CONFIG["sector_input_file"])
    if base_data is None:
        print("❌ Sector_Industry.json not found")
        return

    print(f"📦 Loaded {len(base_data)} stocks from Sector_Industry.json")

    # ---------------- Step 2: Filter base ----------------
    filtered = filter_base_stocks(base_data)
    removed_in_filter = [
        {"Symbol": stock.get("Symbol"), "Reason": "SME stock or Mcap=0"}
        for stock in base_data
        if stock not in filtered
    ]
    removed_records.extend(removed_in_filter)
    print(f"✅ After filter: {len(filtered)} kept, {len(removed_in_filter)} removed")

    # ---------------- Step 3: Fetch live data ----------------
    strike_json = fetch_json_data(CONFIG["strike_api_url"], "Strike API")
    if not strike_json or "data" not in strike_json:
        print("❌ Failed to fetch Strike API data")
        return
    strike_map = parse_strike_data(strike_json)

    # Check which filtered stocks are missing from live API
    removed_in_live = []
    filtered2 = []
    for stock in filtered:
        symbol = stock.get("Symbol", "").upper()
        if symbol in strike_map:
            filtered2.append(stock)
        else:
            removed_in_live.append({"Symbol": symbol, "Reason": "Not found in Strike API"})
    removed_records.extend(removed_in_live)
    print(f"🌐 After live attach: {len(filtered2)} kept, {len(removed_in_live)} removed")

    # ---------------- Step 4: Historical check ----------------
    trade_date = get_latest_trade_date(strike_map)
    historical = load_json_file(CONFIG["historical_file"])
    if historical is None:
        print("❌ Historical file not found")
        return
    hist_map = build_historical_map(historical)

    removed_in_hist = []
    for stock in filtered2:
        inecode = stock.get("INECODE", "").strip().upper()
        if not inecode or inecode not in hist_map:
            removed_in_hist.append({"Symbol": stock.get("Symbol"), "Reason": "Missing historical data"})
    removed_records.extend(removed_in_hist)
    print(f"📉 {len(removed_in_hist)} stocks missing in historical map")

    # ---------------- Step 5: Save to Excel ----------------
    if removed_records:
        df = pd.DataFrame(removed_records)
        df.to_excel(output_excel, index=False)
        print(f"✅ Debug report saved to {output_excel}")
    else:
        print("🎉 No stocks were removed at any step!")

if __name__ == "__main__":
    debug_removed_stocks()
