# ai_chatbot.py

import json
import os
import re

from dotenv import load_dotenv
from langchain_groq import ChatGroq

# Import the LangGraph agent
from utils.agent import wander_agent

from utils.scoring import (
    goal_score,
    energy_score,
    risk_score,
    interpret_goal,
    interpret_energy,
    interpret_risk
)

from langchain_core.globals import set_llm_cache
try:
    from langchain_community.cache import SQLiteCache
    set_llm_cache(SQLiteCache(database_path=".langchain.db"))
except ImportError:
    pass

load_dotenv()

os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY")

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0
)


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
        result = llm.invoke(prompt).content.strip().lower()
        if "question" in result:
            return "question"
        return "itinerary"
    except:
        return "itinerary"


# ---------- GENERIC RESPONSE ----------

def generate_generic_response(message):

    prompt = f"""
    You are an AI travel assistant specializing in Indian travel.
    Answer naturally and conversationally.
    Keep the response concise.

    User:
    {message}
    """

    try:
        response = llm.invoke(prompt).content

        return {
            "html": f"""
            <div class='bot-bubble'>
                <div class='timeline-card'>
                    <div class='timeline-title'>
                        ✈️ Travel Assistant
                    </div>
                    <div class='timeline-location' style='margin-top:18px;'>
                        {response}
                    </div>
                </div>
            </div>
            """,
            "state": None
        }
    except:
        return {
            "html": """
            <div class='bot-bubble'>
                <div class='timeline-card'>
                    Failed to generate response.
                </div>
            </div>
            """,
            "state": None
        }


# ---------- TIMELINE ACTIVITY ----------

def render_activity(activity, time_slot):

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
        
    weather_html = ""
    if hasattr(activity, "expected_weather") and activity.expected_weather:
        weather_html = f"""
        <div class='timeline-chip' style='background: #e0f2fe; color: #0284c7; border-color: #bae6fd;'>
            🌤️ {activity.expected_weather}
        </div>
        """

    return f"""
    <div class='timeline-row'>
        <div class='timeline-time'>
            {time_slot}
        </div>
        <div class='timeline-dot' style='background:{glow}'></div>
        <div class='timeline-card'>
            <div class='timeline-header'>
                <div class='timeline-title'>
                    {icon} {activity.name}
                </div>
                <div class='timeline-cost'>
                    ₹{activity.cost}
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
                {weather_html}
            </div>
        </div>
    </div>
    """


# ---------- MAIN CHAT RESPONSE ----------

def generate_chat_response(message):

    query_type = classify_query(message)

    # ---------- GENERIC QUESTIONS ----------
    if query_type == "question":
        return generate_generic_response(message)


    # ---------- LANGGRAPH ITINERARY FLOW ----------
    
    # Check if we are passing overridden_weather explicitly
    # This might happen when replanning
    overridden_weather = None
    if isinstance(message, dict) and "overridden_weather" in message:
        overridden_weather = message["overridden_weather"]
        user_prompt = message.get("message", "")
    else:
        user_prompt = message

    initial_state = {
        "user_prompt": user_prompt,
        "messages": [],
        "validation_errors": ""
    }
    
    if overridden_weather:
        initial_state["overridden_weather"] = overridden_weather

    # 1. Setup the Agent Thinking UI Container
    thinking_html = """
    <details class='agent-thinking-widget'>
        <summary>🧠 View AI Planning Process</summary>
        <div class='agent-steps'>
    """

    final_state = {}

    try:
        # 2. Use .stream() instead of .invoke() to capture each step
        for event in wander_agent.stream(initial_state, {"recursion_limit": 8}):
            
            # event is a dict where key = node_name, value = node_state
            for node_name, node_state in event.items():
                
                # Update our final_state tracker
                final_state.update(node_state) 
                
                # Build the UI based on which node just ran
                if node_name == "extractor":
                    places = ", ".join(node_state.get("places", ["Unknown"]))
                    budget = node_state.get("budget", 0)
                    thinking_html += f"<div class='step-row'><span>🔍 Extractor:</span> Identified {places} (Budget: ₹{budget})</div>"
                    
                elif node_name == "researcher":
                    thinking_html += f"<div class='step-row'><span>📚 Researcher:</span> Fetched live Wikipedia context, maps, weather, and images.</div>"
                    
                elif node_name == "planner":
                    thinking_html += f"<div class='step-row'><span>📝 Planner:</span> Generated draft itinerary JSON.</div>"
                    
                elif node_name == "critic":
                    err = node_state.get("validation_errors")
                    if err == "PASS":
                        thinking_html += f"<div class='step-row success'><span>✅ Critic:</span> Validation Passed!</div>"
                    else:
                        thinking_html += f"<div class='step-row error'><span>⚖️ Critic Failed:</span> {err} (Routing back to Planner)</div>"

        thinking_html += "</div></details>"
        
        # Check if we actually got an itinerary
        itinerary = final_state.get("draft_itinerary")
        if not itinerary or final_state.get("validation_errors") != "PASS":
            error_msg = final_state.get("validation_errors", "Max retries reached or unable to plan within constraints.")
            return {
                "html": thinking_html + f"""
                <div class='empty-state'>
                    <h3 style="color:#0f172a; margin-bottom:8px;">Planning Failed</h3>
                    <p style="color:#64748b;">The AI couldn't generate a valid plan. Reason: {error_msg}</p>
                    <p style="color:#64748b; margin-top:8px;">Try adjusting your budget or days!</p>
                </div>
                """,
                "state": final_state
            }
            
    except Exception as e:
        return {
            "html": f"<div class='empty-state'>Agent Error: {str(e)}</div>",
            "state": None
        }

    # Retrieve parameters extracted by the graph
    budget = final_state.get("budget", 50000)
    days = final_state.get("days", 3)
    travel_type = final_state.get("travel_type", "leisure")
    
    # Retrieve new dynamic data
    weather_data = final_state.get("weather_data", "Weather unavailable")
    current_weather = weather_data.split(" | Forecast:")[0] if " | Forecast:" in weather_data else weather_data
    hero_image = final_state.get("hero_image_url", "")

    # ---------- TOTAL COST ----------
    total_cost = round(
        sum(act.cost for day in itinerary.plan for act in day.activities), 
        2
    )

    # ---------- METRICS ----------
    g_score = goal_score(itinerary, travel_type)
    e_score = energy_score(itinerary)
    r_score = risk_score(itinerary)

    g_label, g_icon = interpret_goal(g_score)
    e_label, e_icon = interpret_energy(e_score)
    r_label, r_icon = interpret_risk(r_score)

    time_slots = [
        "08:00 AM",
        "10:30 AM",
        "01:00 PM",
        "04:00 PM",
        "07:30 PM",
        "09:30 PM"
    ]

    # ---------- DAYS HTML ----------
    days_html = ""

    for day in itinerary.plan:
        activities_html = ""
        for idx, act in enumerate(day.activities):
            time_slot = time_slots[idx] if idx < len(time_slots) else ""
            activities_html += render_activity(act, time_slot)

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

    places_joined = ' • '.join(itinerary.places) if itinerary.places else "Unknown Destination"
    
    # ---------- HERO STYLING ----------
    hero_style = ""
    text_color = "#0f172a"
    sub_color = "#64748b"
    overlay = ""
    
    if hero_image:
        hero_style = f"background: url('{hero_image}') center/cover no-repeat; color: white; position: relative; overflow: hidden; border-radius: 24px;"
        text_color = "white"
        sub_color = "#f1f5f9"
        overlay = "<div style='position: absolute; inset: 0; background: linear-gradient(to right, rgba(0,0,0,0.8), rgba(0,0,0,0.3)); z-index: 1;'></div>"

    # ---------- FINAL HTML ----------
    return {
        "html": thinking_html + f"""
        <div class='trip-wrapper'>
            
            <div class='trip-hero' style="{hero_style}">
                {overlay}
                <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 20px;">
                    <div>
                        <div class='trip-heading' style='color: {text_color};'>
                            {places_joined}
                        </div>
                        <div class='trip-subheading' style='color: {sub_color}; font-weight: 600;'>
                            {travel_type.title()} Journey • 🌤️ {current_weather}
                        </div>
                    </div>

                    <div class='trip-stats'>
                        <div class='trip-pill' style='background: rgba(255,255,255,0.9); color: #2563eb;'>
                            Spend: ₹{total_cost}
                        </div>
                        <div class='trip-pill' style='background: rgba(255,255,255,0.9); color: #2563eb;'>
                            Budget: ₹{budget}
                        </div>
                        <div class='trip-pill' style='background: rgba(255,255,255,0.9); color: #2563eb;'>
                            {days} Days
                        </div>
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
        """,
        "state": final_state
    }