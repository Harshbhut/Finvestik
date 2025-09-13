import requests
import json
from datetime import datetime

# The API endpoint to fetch circuit limits
API_URL = "https://api-v2.strike.money/v2/api/equity/last-traded-state?securities=EQ%3A*"

def fetch_and_format_circuit_limits():
    """
    Fetches live circuit limit data from the API and formats it
    according to the specified structure.
    """
    try:
        # 1. Fetch data from the API
        print("Fetching data from the API...")
        response = requests.get(API_URL, timeout=15)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        api_data = response.json()
        print("Data fetched successfully.")

        # 2. Navigate to the relevant data points
        current_data = api_data.get("data", {}).get("current", {})
        fields = current_data.get("fields", [])
        ticks = current_data.get("ticks", {})

        if not fields or not ticks:
            print("Error: Could not find 'fields' or 'ticks' in the API response.")
            return

        # 3. Find the index for 'circuitLimit' and 'dateTime' dynamically
        try:
            band_index = fields.index("circuitLimit")
            date_index = fields.index("dateTime")
        except ValueError as e:
            print(f"Error: A required field is missing from the 'fields' list: {e}")
            return

        # 4. Process the data
        processed_data_list = []
        source_date = None

        for symbol, values_list in ticks.items():
            if values_list and values_list[0]:
                # The data is in the first element of the list
                latest_tick = values_list[0]

                # Ensure the list is long enough to have the required data
                if len(latest_tick) > band_index and len(latest_tick) > date_index:
                    # Get the circuit limit (BAND)
                    band_value = latest_tick[band_index]

                    # Create the dictionary for this symbol
                    processed_data_list.append({
                        "SYMBOL": symbol,
                        "BAND": band_value
                    })

                    # Grab the source_date from the first record we process
                    if source_date is None:
                        source_date = latest_tick[date_index]

        # 5. Get the current timestamp for 'last_updated'
        last_updated_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # 6. Assemble the final output structure
        final_output = {
            "source_date": source_date,
            "last_updated": last_updated_time,
            "data": processed_data_list
        }

        # 7. Print the final JSON output
        print("\n--- Generated Output ---")
        print(json.dumps(final_output, indent=2))

    except requests.exceptions.RequestException as e:
        print(f"An error occurred while fetching data from the API: {e}")
    except json.JSONDecodeError:
        print("Failed to decode JSON from the response.")
    except KeyError as e:
        print(f"Error: A required key was not found in the API response: {e}")


if __name__ == "__main__":
    fetch_and_format_circuit_limits()