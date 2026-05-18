# AI Travel Planner — Setup Guide

## Step 1 — Create API Keys

---

# 1. GROQ API

Used for:

- AI itinerary generation
- Chatbot responses
- Query classification

### Get API Key

Open:

https://console.groq.com/keys

Create a new API key.

Copy the key.

Example:

```env
GROQ_API_KEY=gsk_xxxxxxxxx
```

---

# 2. Geoapify API

Used for:

- Restaurants
- Hotels
- Places nearby
- Geolocation data

### Get API Key

Open:

https://myprojects.geoapify.com/

Create:

- Free account
- New project
- Generate API key

Example:

```env
GEOAPIFY_API_KEY=xxxxxxxxx
```

---

# 3. OpenRouteService API

Used for:

- Route distance
- Travel duration
- Transport estimation

### Get API Key

Open:

https://openrouteservice.org/dev/#/signup

Create account and generate API key.

Example:

```env
ORS_API_KEY=xxxxxxxxx
```

---

## Step 2 — Create `.env`

Inside project root:

```env
GROQ_API_KEY=your_key_here

GEOAPIFY_API_KEY=your_key_here

ORS_API_KEY=your_key_here
```

---

## Step 3 — Install Requirements

```bash
pip install -r requirements.txt
```

If requirements file does not exist:

```bash
pip install flask
pip install langchain
pip install langchain-groq
pip install python-dotenv
pip install wikipedia
pip install requests
pip install pydantic
```

---

## Step 4 — Run Project

```bash
python app.py
```

Open:

```text
http://127.0.0.1:5001
```

---

# Features

- AI Travel Chatbot
- Timeline Based Itinerary
- Real Restaurants
- Real Routes
- Hotel Suggestions
- Budget Estimation
- Energy / Risk Analysis
- Goal Matching
- Travel Query Assistant

---

# Example Prompts

```text
5 day Paris trip under 3000 euros
```

```text
Adventure trip in Switzerland
```

```text
How much energy does Hyde Park require?
```

```text
Best season to visit Iceland?
```

---

# Notes

- Geoapify free tier has daily limits.
- OpenRouteService free tier also has request limits.
- Groq is used for LLM inference.
- Use realistic budgets for better plans.
