# ai_chatbot.py

import json
import os
import re

from dotenv import load_dotenv
from langchain_groq import ChatGroq

from utils.llm_ops import generate_itinerary
from utils.scoring import (
    goal_score,
    energy_score,
    risk_score,
    interpret_goal,
    interpret_energy,
    interpret_risk
)

load_dotenv()

os.environ["GROQ_API_KEY"] = os.getenv(
    "GROQ_API_KEY"
)

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0
)


# ---------- JSON EXTRACTION ----------

def extract_json(text):

    match = re.search(
        r"\{[\s\S]*\}",
        text
    )

    if match:

        try:

            return json.loads(
                match.group()
            )

        except:
            return {}

    return {}


# ---------- QUERY CLASSIFIER ----------

def classify_query(message):

    prompt = f"""

    Classify the user message.

    Return ONLY one word.

    Possible outputs:

    itinerary
    question

    Rules:

    itinerary:
    - planning trips
    - travel schedules
    - vacation plans
    - multi-day travel
    - budget trips
    - recommendations

    question:
    - informational questions
    - energy questions
    - safety questions
    - weather
    - cost estimates
    - best time to visit
    - generic travel chat

    User:
    {message}

    """

    try:

        result = llm.invoke(
            prompt
        ).content.strip().lower()

        if "question" in result:
            return "question"

        return "itinerary"

    except:

        return "itinerary"


# ---------- GENERIC RESPONSE ----------

def generate_generic_response(message):

    prompt = f"""

    You are an AI travel assistant.

    Answer naturally and conversationally.

    Keep response concise.

    User:
    {message}

    """

    try:

        response = llm.invoke(
            prompt
        ).content

        return f"""

        <div class='bot-bubble'>

            <div class='timeline-card'>

                <div class='timeline-title'>
                    ✈️ Travel Assistant
                </div>

                <div
                    class='timeline-location'
                    style='margin-top:18px;'
                >

                    {response}

                </div>

            </div>

        </div>

        """

    except:

        return """

        <div class='bot-bubble'>

            <div class='timeline-card'>

                Failed to generate response.

            </div>

        </div>

        """


# ---------- EXTRACT TRIP DETAILS ----------

def extract_trip_details(message):

    prompt = f"""

    Extract travel details.

    Return ONLY JSON.

    Format:

    {{
      "places": [],
      "budget": number,
      "days": number,
      "travel_type": ""
    }}

    Rules:
    - default budget = 1500
    - default days = 3
    - default travel_type = leisure

    User Prompt:
    {message}

    """

    try:

        raw = llm.invoke(
            prompt
        ).content

        parsed = extract_json(raw)

        parsed.setdefault(
            "places",
            []
        )

        parsed.setdefault(
            "budget",
            1500
        )

        parsed.setdefault(
            "days",
            3
        )

        parsed.setdefault(
            "travel_type",
            "leisure"
        )

        return parsed

    except:

        return {
            "places": [],
            "budget": 1500,
            "days": 3,
            "travel_type": "leisure"
        }


# ---------- TIMELINE ACTIVITY ----------

def render_activity(
    activity,
    time_slot
):

    icon = "📍"
    glow = "#ec4899"

    if activity.type == "food":
        icon = "🍽️"
        glow = "#22c55e"

    elif activity.type == "travel":
        icon = "🚘"
        glow = "#3b82f6"

    elif activity.type == "stay":
        icon = "🏨"
        glow = "#8b5cf6"

    elif activity.type == "adventure":
        icon = "🧗"
        glow = "#f97316"

    transport_html = ""

    if activity.transport_mode:

        transport_html = f"""

        <div class='transport-chip'>
            {activity.transport_mode}
        </div>

        """

    return f"""

    <div class='timeline-row'>

        <div class='timeline-time'>
            {time_slot}
        </div>

        <div
            class='timeline-dot'
            style='background:{glow}'
        ></div>

        <div class='timeline-card'>

            <div class='timeline-header'>

                <div class='timeline-title'>
                    {icon} {activity.name}
                </div>

                <div class='timeline-cost'>
                    €{activity.cost}
                </div>

            </div>

            <div class='timeline-location'>
                {activity.location}
            </div>

            <div class='timeline-meta'>

                <div class='timeline-chip'>
                    {activity.type}
                </div>

                <div class='timeline-chip'>
                    Energy: {activity.energy}
                </div>

                <div class='timeline-chip'>
                    Risk: {activity.risk}
                </div>

                {transport_html}

            </div>

        </div>

    </div>

    """


# ---------- MAIN CHAT RESPONSE ----------

def generate_chat_response(message):

    query_type = classify_query(
        message
    )

    # ---------- GENERIC QUESTIONS ----------

    if query_type == "question":

        return generate_generic_response(
            message
        )

    # ---------- ITINERARY FLOW ----------

    details = extract_trip_details(
        message
    )

    itinerary = generate_itinerary(
        details["places"],
        details["budget"],
        details["days"],
        details["travel_type"]
    )

    if not itinerary.plan:

        return """

        <div class='empty-state'>

            Failed to generate itinerary.

        </div>

        """

    # ---------- TOTAL COST ----------

    total_cost = round(

        sum(
            act.cost

            for day in itinerary.plan

            for act in day.activities
        ),

        2
    )

    # ---------- METRICS ----------

    g_score = goal_score(
        itinerary,
        details["travel_type"]
    )

    e_score = energy_score(
        itinerary
    )

    r_score = risk_score(
        itinerary
    )

    g_label, g_icon = interpret_goal(
        g_score
    )

    e_label, e_icon = interpret_energy(
        e_score
    )

    r_label, r_icon = interpret_risk(
        r_score
    )

    # ---------- TIME SLOTS ----------

    time_slots = [
        "08:00 AM",
        "10:00 AM",
        "12:30 PM",
        "03:00 PM",
        "06:00 PM",
        "08:00 PM",
        "10:00 PM"
    ]

    # ---------- DAYS HTML ----------

    days_html = ""

    for day in itinerary.plan:

        activities_html = ""

        for idx, act in enumerate(
            day.activities
        ):

            time_slot = (
                time_slots[idx]
                if idx < len(time_slots)
                else ""
            )

            activities_html += render_activity(
                act,
                time_slot
            )

        days_html += f"""

        <div class='day-section'>

            <div class='day-title'>
                Day {day.day}
            </div>

            <div class='timeline-wrapper'>

                {activities_html}

            </div>

        </div>

        """

    # ---------- FINAL HTML ----------

    return f"""

    <div class='trip-wrapper'>

        <div class='trip-hero'>

            <div>

                <div class='trip-heading'>
                    {' • '.join(itinerary.places)}
                </div>

                <div class='trip-subheading'>
                    {details['travel_type'].title()} Journey
                </div>

            </div>

            <div class='trip-stats'>

                <div class='trip-pill'>
                    Spend: €{total_cost}
                </div>

                <div class='trip-pill'>
                    Budget: €{details['budget']}
                </div>

                <div class='trip-pill'>
                    {details['days']} Days
                </div>

            </div>

        </div>

        <div class='metrics-grid'>

            <div class='metric-card'>

                <div class='metric-name'>
                    Goal Match
                </div>

                <div class='metric-value'>
                    {g_score}
                </div>

                <div class='metric-label'>
                    {g_icon} {g_label}
                </div>

            </div>

            <div class='metric-card'>

                <div class='metric-name'>
                    Energy
                </div>

                <div class='metric-value'>
                    {e_score}
                </div>

                <div class='metric-label'>
                    {e_icon} {e_label}
                </div>

            </div>

            <div class='metric-card'>

                <div class='metric-name'>
                    Risk
                </div>

                <div class='metric-value'>
                    {r_score}
                </div>

                <div class='metric-label'>
                    {r_icon} {r_label}
                </div>

            </div>

        </div>

        {days_html}

    </div>

    """