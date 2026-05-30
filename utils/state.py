# state.py
from typing import TypedDict, List, Dict, Any, Optional
from utils.schemas import Itinerary

class GraphState(TypedDict):
    messages: List[Dict[str, str]]
    user_prompt: str
    start_date: str
    places: List[str]
    budget: float
    days: int
    travel_type: str
    context: str
    restaurant_data: Dict[str, List[Dict]]
    route_data: str
    weather_data: str     
    hero_image_url: str    
    draft_itinerary: Optional[Itinerary]
    validation_errors: str
    final_html: str
    overridden_weather: Optional[List[Dict[str, str]]]