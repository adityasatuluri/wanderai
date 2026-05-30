import os
import json
import logging
from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

from utils.schemas import Itinerary
from utils.state import GraphState
from utils.scoring import validate_itinerary, goal_score, energy_score, risk_score, interpret_goal, interpret_energy, interpret_risk
from utils.maps import get_restaurants, get_route, get_weather, get_weather_forecast, get_unsplash_image
import wikipedia
from datetime import datetime
import concurrent.futures
from langchain_core.globals import set_llm_cache
try:
    from langchain_community.cache import SQLiteCache
    set_llm_cache(SQLiteCache(database_path=".langchain.db"))
except ImportError:
    pass

load_dotenv()
os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY")

# --- LOGGING SETUP ---
logging.basicConfig(
    filename='wander_ai.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - [%(name)s] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("LangGraph_Agent")


llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

# --- NODES ---

def extractor_node(state: GraphState) -> GraphState:
    """Extracts trip parameters from the user prompt."""
    prompt = f"""
    Extract travel details from the user prompt. Return ONLY valid JSON.
    Default budget: ₹50000. Default days: 3. Default type: leisure. 
    Current Date: {datetime.now().strftime('%Y-%m-%d')}
    Extract the 'start_date' if the user mentions dates (e.g. 'tomorrow', 'next week', '25th Oct'). If not mentioned, default to the Current Date.
    CRITICAL: If the user mentions a broad state or region (e.g., 'Kerala', 'Goa', 'Rajasthan'), you MUST pick 1 to 3 SPECIFIC famous tourist cities/towns in that region that match the requested travel type (e.g., instead of 'Kerala', pick 'Munnar' or 'Alleppey'; instead of 'Goa', pick 'North Goa'). Return those specific cities in the 'places' array. Do NOT return the broad state name in the places array.
    User: {state['user_prompt']}
    Format: {{"start_date": "YYYY-MM-DD", "places": ["specific_city1"], "budget": number, "days": number, "travel_type": "string"}}
    """
    try:
        raw = llm.invoke(prompt).content
        # Basic JSON extraction
        json_str = raw[raw.find("{"):raw.rfind("}")+1]
        data = json.loads(json_str)
        return {
            "start_date": data.get("start_date", datetime.now().strftime('%Y-%m-%d')),
            "places": data.get("places", []),
            "budget": float(data.get("budget", 50000)),
            "days": int(data.get("days", 3)),
            "travel_type": data.get("travel_type", "leisure")
        }
    except:
        return {"start_date": datetime.now().strftime('%Y-%m-%d'), "places": [], "budget": 50000, "days": 3, "travel_type": "leisure"}


def researcher_node(state: GraphState) -> GraphState:
    logger.info("Researcher Agent is pulling live API data...")
    places = state.get("places", [])
    if not places:
        return {"context": "", "restaurant_data": {}, "route_data": "", "weather_data": "", "hero_image_url": ""}

    primary_place = places[0]
    
    # 1. Wiki Data Wrapper
    def get_wiki_texts(places):
        texts = []
        for p in places:
            try:
                texts.append(wikipedia.summary(p, sentences=2))
            except: pass
        return " ".join(texts)
        
    # 2. Restaurant Data Wrapper
    def get_rest_data(places):
        return {p: get_restaurants(p) for p in places}
        
    # 3. Route Data Wrapper
    def get_routes(places):
        route_data = ""
        if len(places) > 1:
            routes = []
            for i in range(len(places) - 1):
                start, end = places[i], places[i + 1]
                route = get_route(start, end)
                if route:
                    routes.append(f"{start} → {end}: {route['distance_km']}km ({route['duration_min']} mins)")
            route_data = "\n".join(routes)
        return route_data
        
    # Execute API calls concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        f_wiki = executor.submit(get_wiki_texts, places)
        f_rest = executor.submit(get_rest_data, places)
        f_route = executor.submit(get_routes, places)
        f_weather = executor.submit(get_weather, primary_place)
        f_forecast = executor.submit(get_weather_forecast, primary_place)
        f_image = executor.submit(get_unsplash_image, primary_place)
        
        context = f_wiki.result()
        rest_data = f_rest.result()
        route_data = f_route.result()
        weather = f_weather.result()
        forecast = f_forecast.result()
        hero_image = f_image.result()

    return {
        "context": context, 
        "restaurant_data": rest_data, 
        "route_data": route_data,
        "weather_data": f"Current: {weather} | Forecast: {forecast}",
        "hero_image_url": hero_image
    }
def planner_node(state: GraphState) -> GraphState:
    """Generates the itinerary draft."""
    budget = state['budget']
    
    prompt = f"""
    Generate a REALISTIC Indian travel itinerary in JSON.
    
    STRICT RULES:
    START DATE: {state.get('start_date', 'Unknown')}
    TOTAL BUDGET: ₹{budget}
    TOTAL DAYS: {state['days']}
    MAX TOTAL COST: DO NOT exceed ₹{budget}
    TRIP TYPE: {state['travel_type']}
    PLACES: {state['places']}
    
    RESEARCH DATA:
    Context: {state['context']}
    Restaurants: {state['restaurant_data']}
    Routes: {state['route_data']}
    Weather Information: {state.get('weather_data', 'Unknown')}
    
    IMPORTANT WEATHER INSTRUCTION:
    Assign 'expected_weather' for each activity based on the weather information provided. 
    You MUST format it precisely as "Temperature, Condition" (e.g., "29°C, Overcast Clouds", "22°C, Light Rain").
    If the weather contains rain, thunderstorms, or extreme heat, prioritize indoor activities (museums, cafes, spas). If it is clear, prioritize outdoor sightseeing.
    
    SUDDEN WEATHER OVERRIDES (CRITICAL):
    The user might have injected sudden weather overrides. You MUST respect these overrides for the specific day and time.
    Overrides: {state.get('overridden_weather', 'None')}
    If an override applies, you MUST change the activity to suit the overridden weather, and set the 'expected_weather' to the overridden weather condition.
    
    PREVIOUS ERRORS (Fix these if they exist):
    {state.get('validation_errors', 'None')}

    INDIAN PRICING GUIDELINES (INR ₹):
    - Budget Hotel: ₹2000 - ₹5000/night
    - Standard Hotel: ₹5000 - ₹12000/night
    - Breakfast: ₹150 - ₹500
    - Lunch/Dinner: ₹400 - ₹1500
    - Local Transport (Auto/Cab): ₹150 - ₹800/trip
    - Intercity Travel: ₹1000 - ₹4000
    - Attractions: ₹50 - ₹500

    Return ONLY valid JSON matching this schema:
    {{
      "start_date": "YYYY-MM-DD",
      "places": [], "total_budget": number, "days": number,
      "plan": [
        {{ "day": number, "activities": [
            {{ "name": "", "location": "", "cost": number, "duration_hours": number, "type": "sightseeing/food/travel/stay", "energy": "low/medium/high", "risk": "low/medium/high", "transport_mode": "", "expected_weather": "" }}
          ]
        }}
      ]
    }}
    """
    try:
        raw = llm.invoke(prompt).content
        json_text = raw[raw.find("{"):raw.rfind("}")+1]
        parsed = Itinerary.model_validate_json(json_text)
        return {"draft_itinerary": parsed}
    except Exception as e:
        return {"validation_errors": f"Failed to parse JSON: {str(e)}"}


def critic_node(state: GraphState) -> GraphState:
    """Validates the draft. If it fails, sends it back to planner."""
    draft = state.get("draft_itinerary")
    if not draft:
        return {"validation_errors": "Draft is missing. Regenerate."}

    is_valid, message = validate_itinerary(draft, state["budget"], state["days"])
    
    if not is_valid:
        if message == "Days mismatch":
            error = f"You generated {len(draft.plan)} days, but I need exactly {state['days']} days."
        else:
            error = f"Your draft costs ₹{message}, which EXCEEDS the budget of ₹{state['budget']}. Lower the costs of hotels and food."
        return {"validation_errors": error}
    
    return {"validation_errors": "PASS"}


def formatter_node(state: GraphState) -> GraphState:
    """Converts the valid itinerary to the UI HTML payload."""
    itinerary = state["draft_itinerary"]
    details = state
    
    total_cost = sum(act.cost for day in itinerary.plan for act in day.activities)
    
    g_score = goal_score(itinerary, details["travel_type"])
    e_score = energy_score(itinerary)
    r_score = risk_score(itinerary)
    g_label, g_icon = interpret_goal(g_score)
    e_label, e_icon = interpret_energy(e_score)
    r_label, r_icon = interpret_risk(r_score)

    time_slots = ["08:00 AM", "10:30 AM", "01:00 PM", "04:00 PM", "07:30 PM", "09:30 PM"]

    
    html_output = f"<div class='trip-wrapper'>... (Formatted HTML with ₹{total_cost}) ...</div>"
    return {"final_html": html_output}


# --- GRAPH ROUTING ---

def validation_router(state: GraphState):
    """Decides if we need to replan or if we are done."""
    if state.get("validation_errors") == "PASS":
        return "formatter"
    return "planner"

# --- BUILD GRAPH ---
workflow = StateGraph(GraphState)

workflow.add_node("extractor", extractor_node)
workflow.add_node("researcher", researcher_node)
workflow.add_node("planner", planner_node)
workflow.add_node("critic", critic_node)
workflow.add_node("formatter", formatter_node)

workflow.add_edge(START, "extractor")
workflow.add_edge("extractor", "researcher")
workflow.add_edge("researcher", "planner")
workflow.add_edge("planner", "critic")
workflow.add_conditional_edges("critic", validation_router)
workflow.add_edge("formatter", END)

# Compile the agent
wander_agent = workflow.compile()