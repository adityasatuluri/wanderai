# utils/llm_ops.py

from langchain_groq import ChatGroq
from schemas import Itinerary

from dotenv import load_dotenv

import os
import wikipedia
import re

from utils.maps import (
    get_restaurants,
    get_route
)

ENV_PATH = os.path.join(
    os.path.dirname(__file__),
    ".env"
)

load_dotenv(
    dotenv_path=ENV_PATH
)

api_key = os.getenv(
    "GROQ_API_KEY"
)

if not api_key:
    raise Exception(
        "GROQ_API_KEY not found"
    )

os.environ["GROQ_API_KEY"] = api_key

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0
)


# ---------- WIKI CONTEXT ----------

def wiki_context(places):

    texts = []

    for p in places:

        try:

            texts.append(
                wikipedia.summary(
                    p,
                    sentences=2
                )
            )

        except:
            pass

    return " ".join(texts)


# ---------- JSON EXTRACTION ----------

def extract_json(text):

    match = re.search(
        r"\{.*\}",
        text,
        re.DOTALL
    )

    return (
        match.group(0)
        if match
        else None
    )


# ---------- GENERATE ITINERARY ----------

def generate_itinerary(
    places,
    budget,
    days,
    travel_type
):

    context = wiki_context(
        places
    )

    # ---------- REAL DATA ----------

    restaurants_data = {

        p: get_restaurants(p)

        for p in places
    }

    route_data = ""

    if len(places) > 1:

        routes = []

        for i in range(
            len(places) - 1
        ):

            start = places[i]
            end = places[i + 1]

            route = get_route(
                start,
                end
            )

            if route:

                routes.append(
                    f"{start} → {end}: {route}"
                )

        route_data = "\n".join(
            routes
        )

    # ---------- BUDGET DISTRIBUTION ----------

    stay_budget = round(
        budget * 0.35,
        2
    )

    food_budget = round(
        budget * 0.25,
        2
    )

    travel_budget = round(
        budget * 0.20,
        2
    )

    activity_budget = round(
        budget * 0.20,
        2
    )

    per_day_budget = round(
        budget / days,
        2
    )

    # ---------- PROMPT ----------

    prompt = f"""
Generate a REALISTIC European travel itinerary in JSON.

STRICT RULES:

TOTAL BUDGET:
€{budget}

TOTAL DAYS:
{days}

MAX TOTAL COST:
DO NOT exceed €{budget}

TARGET:
Use around 85%–100% of total budget.

TRIP TYPE:
{travel_type}

PLACES:
{places}

REAL RESTAURANTS:
{restaurants_data}

ROUTES:
{route_data}

------------------------
BUDGET DISTRIBUTION
------------------------

Stay Budget:
€{stay_budget}

Food Budget:
€{food_budget}

Travel Budget:
€{travel_budget}

Activities Budget:
€{activity_budget}

Per Day Budget:
€{per_day_budget}

------------------------
PRICING RULES
------------------------

FOOD:
- breakfast: €8–€20
- lunch: €15–€35
- dinner: €20–€50

HOTELS:
- budget stay:
  €50–€120 PER NIGHT

TRAVEL:
- walk: €0
- bus: €2–€10
- metro: €2–€15
- ferry: €20–€60
- taxi: €15–€40

ACTIVITIES:
- beaches: free
- sightseeing: €0–€25
- museums: €5–€20
- adventure: €20–€80

------------------------
DAY STRUCTURE
------------------------

Every day MUST contain:

1. Breakfast
2. Morning activity
3. Lunch
4. Afternoon activity
5. Dinner
6. Hotel stay

Activities should be NEARBY geographically.

Avoid unrealistic travel.

Minimize long-distance movement in same day.

Use real restaurants from provided data.

Use realistic European pricing.

------------------------
ACTIVITY TYPE RULES
------------------------

Adventure Trips:
- trekking
- hiking
- water sports
- exploration
- adventure activities

Leisure Trips:
- beaches
- sightseeing
- cafes
- nature
- relaxing places

Family Trips:
- sightseeing
- parks
- museums
- food streets

Romantic Trips:
- beaches
- sunset spots
- cruises
- scenic restaurants

------------------------
OUTPUT FORMAT
------------------------

Return ONLY valid JSON.

{{
  "places": [],
  "total_budget": number,
  "days": number,
  "plan": [
    {{
      "day": number,
      "activities": [
        {{
          "name": "",
          "location": "",
          "cost": number,
          "duration_hours": number,
          "type": "",
          "energy": "",
          "risk": "",
          "transport_mode": ""
        }}
      ]
    }}
  ]
}}

Context:
{context}
"""

    # ---------- GENERATION ----------

    for _ in range(3):

        try:

            raw = llm.invoke(
                prompt
            ).content

            json_text = extract_json(
                raw
            )

            if json_text:

                parsed = (
                    Itinerary
                    .model_validate_json(
                        json_text
                    )
                )

                # ---------- FIX TOTAL COST ----------

                total_cost = sum(

                    act.cost

                    for day in parsed.plan

                    for act in day.activities
                )

                # scale if exceeding budget
                if total_cost > budget:

                    ratio = (
                        budget /
                        total_cost
                    )

                    for day in parsed.plan:

                        for act in day.activities:

                            act.cost = round(
                                act.cost * ratio,
                                2
                            )

                if parsed.plan:

                    parsed._raw = raw

                    return parsed

        except Exception as e:

            print(
                "Retry:",
                e
            )

    # ---------- FALLBACK ----------

    return Itinerary(
        places=places,
        total_budget=budget,
        days=days,
        plan=[]
    )