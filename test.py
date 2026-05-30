import os
import requests
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("UNSPLASH_ACCESS_KEY")
print(f"Loaded Key: {key[:5]}... (length: {len(key) if key else 0})")

url = "https://api.unsplash.com/search/photos"
params = {
    "query": "Jaipur tourism landmark", 
    "client_id": key, 
    "per_page": 1, 
    "orientation": "landscape"
}

res = requests.get(url, params=params)
print(f"Status Code: {res.status_code}")

if res.status_code == 200:
    data = res.json()
    if data.get("results"):
        print("SUCCESS! Image URL:", data["results"][0]["urls"]["regular"])
    else:
        print("API connected, but no images found for that query.")
else:
    print("API ERROR:", res.text)