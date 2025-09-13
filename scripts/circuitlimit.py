import os
import json
import logging
import requests
from datetime import datetime
from typing import Dict, Any, Optional, List

# -------------------------------
# CONFIGURATION
# -------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR)

CONFIG = {
    "api_url": "https://api-v2.strike.money/v2/api/equity/last-traded-state?securities=EQ%3A*",
    "output_file": os.path.join(OUTPUT_DIR, "circuit_limits.json"),
    "request_timeout": 30,
}

# -------------------------------
# HELPER FUNCTIONS
# -------------------------------

def setup_logging():
    """Configures basic logging to the console for essential output."""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def save_json_file(data: Any, path: str):
    """Saves data to a JSON file, creating the directory if needed."""
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except IOError as e:
        logging.error(f"Error: Failed to write to file {path}: {e}")
        raise  # Re-raise the exception to stop the script if saving fails

# -------------------------------
# CORE LOGIC FUNCTIONS
# -------------------------------

def fetch_data_from_api() -> Optional[Dict[str, Any]]:
    """Fetches raw data from the API endpoint."""
    try:
        response = requests.get(CONFIG["api_url"], timeout=CONFIG["request_timeout"])
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Error: API request failed: {e}")
    except json.JSONDecodeError:
        logging.error("Error: Failed to decode JSON from the API response.")
    return None

def process_api_response(api_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Processes the raw API response into the desired final format."""
    try:
        current_data = api_data["data"]["current"]
        fields = current_data["fields"]
        ticks = current_data["ticks"]

        band_index = fields.index("circuitLimit")
        date_index = fields.index("dateTime")

        processed_data_list: List[Dict[str, Any]] = []
        source_date: Optional[str] = None

        for symbol, values_list in ticks.items():
            if values_list and values_list[0]:
                latest_tick = values_list[0]
                if len(latest_tick) > max(band_index, date_index):
                    processed_data_list.append({
                        "SYMBOL": symbol,
                        "BAND": latest_tick[band_index]
                    })
                    if source_date is None:
                        source_date = latest_tick[date_index]
        
        if not processed_data_list:
            logging.warning("Warning: No stock data was found in the API response.")
            return None

        # This is the single success message the user wants
        logging.info(f"Successfully fetched and processed {len(processed_data_list)} stocks.")

        return {
            "source_date": source_date,
            "last_updated": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "data": processed_data_list
        }

    except (KeyError, IndexError, ValueError) as e:
        logging.error(f"Error: Failed to process data due to unexpected format: {e}")
    return None

# -------------------------------
# MAIN EXECUTION
# -------------------------------

def main():
    """Main function to orchestrate the data fetching and processing pipeline."""
    setup_logging()

    raw_api_data = fetch_data_from_api()
    if not raw_api_data:
        return # Error is already logged by the fetch function

    final_data = process_api_response(raw_api_data)
    if not final_data:
        return # Error is already logged by the process function

    save_json_file(final_data, CONFIG["output_file"])

if __name__ == "__main__":
    main()