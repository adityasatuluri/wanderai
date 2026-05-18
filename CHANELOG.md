### NOTE:

    - This changelog file reflects only about the changes/ new files added into the project.
    - These changes are in flask application only, i.e, in wanderai folder

# AI Travel Planner — Project Structure

---

# Root Files

## app.py

Main Flask application.

Handles:

- Routes
- APIs
- Page rendering
- Chatbot endpoint
- Dashboard endpoint

Main APIs:

- `/api/ai-chat`
- `/api/destinations`

Runs the complete backend server.

---

## ai_chatbot.py

Core AI chatbot engine.

Handles:

- Query classification
- Itinerary generation
- Generic travel questions
- Timeline rendering
- Metrics generation

Main Features:

- Detects itinerary vs normal query
- Generates HTML responses
- Calculates total spend
- Goal match scoring
- Energy scoring
- Risk scoring

---

## schemas.py

Contains Pydantic models.

Used for:

- Itinerary validation
- Structured JSON parsing
- Activity schemas
- Day schemas

Ensures LLM output follows correct structure.

---

# Utils Folder

## utils/llm_ops.py

Main itinerary generation logic.

Handles:

- Prompt engineering
- Restaurant fetching
- Route fetching
- Budget control
- LLM itinerary generation

Uses:

- Groq API
- Geoapify
- OpenRouteService

Main function:

```python
generate_itinerary()
```

---

## utils/maps.py

Map + location utility functions.

Handles:

- Geolocation lookup
- Restaurant search
- Route distance
- Travel duration

Uses:

- Geoapify API
- OpenRouteService API

Main functions:

```python
get_coordinates()
get_restaurants()
get_route()
```

---

## utils/scoring.py

Evaluation system.

Calculates:

- Goal Match
- Energy Score
- Risk Score

Also contains:

- score interpretation
- itinerary validation

Main functions:

```python
goal_score()
energy_score()
risk_score()
```

---

## utils/db.py

Database operations.

Handles:

- Saving itinerary history
- Fetching previous plans
- Clearing history

Optional depending on setup.

---

# Templates Folder

## templates/chatbot.html

Main AI chatbot UI.

Contains:

- Chat layout
- Timeline UI
- Suggestions
- Input box
- Responsive styling

Uses:

- chatbot.js
- backend AI APIs

---

## templates/dashboard.html

Commented out the chat icon (reduncant and not suitable for timeline based display of the activities.)

## templates/base.html

Shared base template.

Contains:

- Navbar
- Shared CSS/JS imports
- Global layout

All pages extend this file.

Changes Added a nav link to chatbot page

---

# Static Folder

## static/chatbot.js

Frontend chatbot logic.

Handles:

- Sending messages
- Fetch API calls
- Chat history
- Loader animation
- Dynamic rendering
- Scroll handling

Uses:

```javascript
fetch("/api/ai-chat");
```

---

# Environment File

## .env

Stores API keys.

Contains:

```env
GROQ_API_KEY=

GEOAPIFY_API_KEY=

ORS_API_KEY=
```

Never upload this file publicly.

---

# APIs Used

## GROQ

Used for:

- LLM responses
- Query understanding
- Itinerary generation

---

## Geoapify

Used for:

- Restaurants
- Hotels
- Geolocation

---

## OpenRouteService

Used for:

- Route distance
- Travel duration
- Transport estimation

---

# Chatbot Frontend Flow

```text
chatbot.html
    ↓
chatbot.js
    ↓
/api/ai-chat
    ↓
ai_chatbot.py
    ↓
utils/llm_ops.py
    ↓
Groq + Maps APIs
```

---

# Chatbot Backend Flow

```text
User Query
    ↓
Query Classification  # whether it is a question / plan generation.
    ↓
(Itinerary OR Question)
    ↓
LLM Processing
    ↓
Timeline HTML / Message Generation
    ↓
Frontend Rendering
```
