from jugaad_data.nse import NSELive

n = NSELive()
q = n.stock_quote("HDFCBANK")

p_price_band = q["priceInfo"].get("pPriceBand")
print(p_price_band)