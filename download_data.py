import urllib.request
import os
import sys

url = "https://docs.google.com/spreadsheets/d/1EFsJvtmSFpgVHs_dexmFJ73qygRBM6vlV2X3d0BhKfk/export?format=xlsx"
output_path = "data.xlsx"

print("Downloading Excel from Google Sheets...")
try:
    urllib.request.urlretrieve(url, output_path)
    print(f"Downloaded successfully to {output_path}. Size: {os.path.getsize(output_path)} bytes")
except Exception as e:
    print(f"Error downloading file: {e}")
    sys.exit(1)

try:
    import pandas as pd
    print("Pandas is installed. Loading sheets...")
    xl = pd.ExcelFile(output_path)
    print("Sheets found:", xl.sheet_names)
    for name in xl.sheet_names:
        print(f"\n--- Sheet: {name} ---")
        df = xl.parse(name)
        print(f"Shape: {df.shape}")
        print("Columns:", df.columns.tolist())
        print("First 3 rows:")
        print(df.head(3))
except ImportError:
    print("Pandas is not installed. Trying to install pandas and openpyxl...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"])
    import pandas as pd
    xl = pd.ExcelFile(output_path)
    print("Sheets found:", xl.sheet_names)
    for name in xl.sheet_names:
        print(f"\n--- Sheet: {name} ---")
        df = xl.parse(name)
        print(f"Shape: {df.shape}")
        print("Columns:", df.columns.tolist())
        print("First 3 rows:")
        print(df.head(3))
