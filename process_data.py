import urllib.request
import os
import sys
import json

url = "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/export?format=xlsx"
output_path = r"e:\Antigravity\GHN_luan_chuyen_thang_V2\data.xlsx"
data_dir = r"e:\Antigravity\GHN_luan_chuyen_thang_V2\data"

if not os.path.exists(data_dir):
    os.makedirs(data_dir)

print("Downloading Excel from Google Sheets...")
try:
    urllib.request.urlretrieve(url, output_path)
    print(f"Downloaded successfully to {output_path}. Size: {os.path.getsize(output_path)} bytes")
except Exception as e:
    print(f"Error downloading file: {e}")
    sys.exit(1)

def convert_excel_to_json():
    try:
        import pandas as pd
    except ImportError:
        print("Pandas is not installed. Trying to install pandas and openpyxl...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"])
        import pandas as pd

    print("Loading sheets...")
    xl = pd.ExcelFile(output_path)
    print("Sheets found:", xl.sheet_names)
    
    # We will save each sheet as a separate JSON file
    for name in xl.sheet_names:
        df = xl.parse(name)
        # Convert NaN to None for JSON serialization
        df = df.where(pd.notnull(df), None)
        # Convert to list of dicts
        data = df.to_dict(orient='records')
        
        # Save to JSON
        safe_name = name.replace(" ", "_").lower()
        json_path = os.path.join(data_dir, f"{safe_name}.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"Saved {name} to {json_path} ({len(data)} records)")

if __name__ == "__main__":
    convert_excel_to_json()
    print("Data processing complete.")
