import requests
import gzip
import ijson
import json
from decimal import Decimal
import os

# Custom encoder to handle Decimal
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)

# Path to save in same folder as this script
output_path = os.path.join(os.path.dirname(__file__), "NSE.json")

url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
response = requests.get(url, stream=True)
response.raise_for_status()

with gzip.GzipFile(fileobj=response.raw) as gz, open(output_path, "w", encoding="utf-8") as out_file:
    out_file.write("[")
    first = True

    for obj in ijson.items(gz, "item"):
        if (
            obj.get("exchange") == "NSE"
            and obj.get("lot_size") == 1
            and (obj.get("instrument_type") == "EQ" or obj.get("instrument_type") == "BE")
        ):
            if not first:
                out_file.write(",\n")
            json.dump(obj, out_file, ensure_ascii=False, cls=DecimalEncoder)
            first = False

    out_file.write("]")

print(f"✅ Filtered instruments saved to {output_path}")
