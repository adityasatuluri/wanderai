from pydantic import BaseModel
from typing import List, Optional


class Activity(BaseModel):
    name: str
    location: str
    cost: float
    duration_hours: float
    type: str  # sightseeing / food / travel / stay
    energy: str
    risk: str
    transport_mode: Optional[str] = None
    expected_weather: Optional[str] = None


class DayPlan(BaseModel):
    day: int
    activities: List[Activity]


class Itinerary(BaseModel):
    start_date: Optional[str] = None
    places: List[str]
    total_budget: float
    days: int
    plan: List[DayPlan]