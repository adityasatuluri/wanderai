import requests
import os
import json
import logging
from dotenv import load_dotenv
from functools import lru_cache

# --- SETUP OUTPUT LOGGER ---
# This creates a specific logger that only writes to 'outputs.log'
api_logger = logging.getLogger("API_Tracker")
api_logger.setLevel(logging.INFO)
file_handler = logging.FileHandler("outputs.log", mode='a')  # 'a' appends to the file
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - [%(funcName)s] \n%(message)s\n' + '-'*50))
api_logger.addHandler(file_handler)

# --- LOAD ENV VARS ---
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=ENV_PATH)

GEO_KEY = os.getenv("GEOAPIFY_KEY")
ORS_KEY = os.getenv("ORS_KEY")


@lru_cache(maxsize=128)
def get_coords(place):
    if not GEO_KEY: return None
    url = "https://api.geoapify.com/v1/geocode/search"
    params = {"text": place, "apiKey": GEO_KEY}
    try:
        res = requests.get(url, params=params, timeout=5).json()
        
        # Log the raw JSON output
        api_logger.info(f"Geocoding API Results for '{place}':\n{json.dumps(res, indent=2)}")
        
        if res.get("features"):
            coords = res["features"][0]["geometry"]["coordinates"]
            return coords[1], coords[0]
    except Exception as e:
        api_logger.error(f"Geocoding API Failed for '{place}': {str(e)}")
    return None


@lru_cache(maxsize=64)
def get_restaurants(place):
    if not GEO_KEY: return []
    coords = get_coords(place)
    if not coords: return []
    
    url = "https://api.geoapify.com/v2/places"
    params = {
        "categories": "catering.restaurant",
        "filter": f"circle:{coords[1]},{coords[0]},5000",
        "limit": 5,
        "apiKey": GEO_KEY
    }
    
    results = []
    try:
        res = requests.get(url, params=params, timeout=5).json()
        
        # Log the raw JSON output
        api_logger.info(f"Places API (Restaurants) Results for '{place}':\n{json.dumps(res, indent=2)}")
        
        for r in res.get("features", []):
            props = r.get("properties", {})
            results.append({
                "name": props.get("name", "Unknown"),
                "address": props.get("formatted", "")
            })
    except Exception as e:
        api_logger.error(f"Places API Failed for '{place}': {str(e)}")
    return results


@lru_cache(maxsize=64)
def get_route(origin, destination):
    if not ORS_KEY: return None
    o = get_coords(origin)
    d = get_coords(destination)
    if not o or not d: return None

    url = "https://api.openrouteservice.org/v2/directions/driving-car"
    headers = {"Authorization": ORS_KEY, "Content-Type": "application/json"}
    body = {"coordinates": [[o[1], o[0]], [d[1], d[0]]]}

    try:
        res = requests.post(url, json=body, headers=headers, timeout=5).json()
        
        # Log the raw JSON output
        api_logger.info(f"OpenRouteService API Results ({origin} -> {destination}):\n{json.dumps(res, indent=2)}")
        
        summary = res["routes"][0]["summary"]
        return {
            "distance_km": round(summary["distance"] / 1000, 2),
            "duration_min": round(summary["duration"] / 60, 2)
        }
    except Exception as e:
        api_logger.error(f"ORS API Failed: {str(e)}")
        return None


@lru_cache(maxsize=128)
def get_weather(place):
    """Fetches current weather for the destination."""
    weather_key = os.getenv("OPEN_WEATHER_MAP")
    if not weather_key:
        return "Weather unavailable"
        
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {"q": place, "appid": weather_key, "units": "metric"}
    
    try:
        res = requests.get(url, params=params, timeout=5).json()
        
        # Log the raw JSON output
        api_logger.info(f"OpenWeather API Results for '{place}':\n{json.dumps(res, indent=2)}")
        
        if res.get("cod") == 200:
            temp = round(res["main"]["temp"])
            desc = res["weather"][0]["description"].title()
            return f"{temp}°C, {desc}"
    except Exception as e:
        api_logger.error(f"Weather API Failed: {str(e)}")
        
    return "Weather unavailable"

@lru_cache(maxsize=128)
def get_weather_forecast(place):
    """Fetches 5-day weather forecast for the destination."""
    weather_key = os.getenv("OPEN_WEATHER_MAP")
    if not weather_key:
        return "Forecast unavailable"
        
    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {"q": place, "appid": weather_key, "units": "metric"}
    
    try:
        res = requests.get(url, params=params, timeout=5).json()
        if str(res.get("cod")) == "200":
            # Just take the first 8 items (approx 24 hours) to pass to LLM, or summarize
            forecast_items = res.get("list", [])[:8]
            forecast_strs = []
            for item in forecast_items:
                dt_txt = item.get("dt_txt", "")
                temp = round(item.get("main", {}).get("temp", 0))
                desc = item.get("weather", [{}])[0].get("description", "").title()
                forecast_strs.append(f"{dt_txt}: {temp}°C, {desc}")
            return " | ".join(forecast_strs)
    except Exception as e:
        api_logger.error(f"Weather Forecast API Failed: {str(e)}")
        
    return "Forecast unavailable"



@lru_cache(maxsize=128)
def get_unsplash_image(place):
    """Fetches a high-quality landscape image of the destination."""
    unsplash_key = os.getenv("UNSPLASH_ACCESS_KEY")
    if not unsplash_key:
        return ""
        
    url = "https://api.unsplash.com/search/photos"
    params = {
        "query": f"{place} india landscape travel", 
        "client_id": unsplash_key, 
        "per_page": 1, 
        "orientation": "landscape"
    }
    
    try:
        res = requests.get(url, params=params, timeout=5).json()
        
        # Log the raw JSON output
        api_logger.info(f"Unsplash API Results for '{place}':\n{json.dumps(res, indent=2)}")
        
        if res.get("results"):
            img_url = res["results"][0]["urls"]["regular"]
            return img_url
    except Exception as e:
        api_logger.error(f"Unsplash API Failed: {str(e)}")
        
    return ""