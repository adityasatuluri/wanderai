import requests
import os
from dotenv import load_dotenv

load_dotenv()

GEO_KEY = os.getenv("GEOAPIFY_KEY")
ORS_KEY = os.getenv("ORS_KEY")


def get_coords(place):
    url = "https://api.geoapify.com/v1/geocode/search"

    params = {
        "text": place,
        "apiKey": GEO_KEY
    }

    res = requests.get(url, params=params).json()

    if res.get("features"):
        coords = res["features"][0]["geometry"]["coordinates"]
        return coords[1], coords[0]

    return None


def get_restaurants(place):
    coords = get_coords(place)
    if not coords:
        return []

    lat, lon = coords

    url = "https://api.geoapify.com/v2/places"

    params = {
        "categories": "catering.restaurant",
        "filter": f"circle:{lon},{lat},5000",
        "limit": 5,
        "apiKey": GEO_KEY
    }

    res = requests.get(url, params=params).json()

    results = []
    for r in res.get("features", []):
        props = r["properties"]

        results.append({
            "name": props.get("name", "Unknown"),
            "address": props.get("formatted", "")
        })

    return results


def get_route(origin, destination):
    o = get_coords(origin)
    d = get_coords(destination)

    if not o or not d:
        return None

    url = "https://api.openrouteservice.org/v2/directions/driving-car"

    headers = {
        "Authorization": ORS_KEY,
        "Content-Type": "application/json"
    }

    body = {
        "coordinates": [
            [o[1], o[0]],
            [d[1], d[0]]
        ]
    }

    res = requests.post(url, json=body, headers=headers).json()

    try:
        summary = res["routes"][0]["summary"]

        return {
            "distance_km": round(summary["distance"] / 1000, 2),
            "duration_min": round(summary["duration"] / 60, 2)
        }

    except:
        return None