# Wander AI: Intelligent Agentic Travel Planner 🌍✈️

Wander AI is an advanced, highly interactive travel planning assistant powered by **LangGraph**, **Groq (Llama-3.3-70b)**, and **Flask**. Instead of just returning static text, Wander AI operates as a true Agentic workflow—it researches destinations in real-time, checks live weather and routing, plans mathematically sound itineraries, self-critiques its drafts against strict budgets, and delivers a stunning visual UI.

## ✨ Features

- **Multi-Agent LangGraph Architecture:** Dedicated agents for Data Extraction, Live Research, Planning, Critiquing, and Formatting.
- **Live External APIs:** Connects to OpenWeatherMap, OpenRouteService, Geoapify, Wikipedia, and Unsplash to ground its itineraries in reality.
- **Interactive Weather Simulator:** Inject sudden weather anomalies (like a Heatwave or Storm) into specific days of the generated itinerary to watch the agent seamlessly re-route and adapt in real-time.
- **Visual Mismatch Highlights:** If weather disruptions occur, the UI pulsates the affected activity blocks in red with inline warning tags before replanning.
- **GUI Settings Modal:** Manage all your API keys dynamically through the web interface without restarting the server.
- **Persistent Chat Sessions:** Local database architecture (`chats_db.pkl`) saves your itineraries and chat histories across sessions.
- **Optimized Performance:** Utilizes Python `ThreadPoolExecutor` for concurrent data fetching and LangChain `SQLiteCache` for lightning-fast semantic caching.

## 🔑 Prerequisites & API Keys

To run Wander AI locally, you will need the following API keys (which can be configured via the UI Settings Modal after launching):

- **Groq API Key**: For the core LLM (`llama-3.3-70b-versatile`).
- **Geoapify Key**: For locating real-world restaurants and POIs.
- **OpenRouteService Key**: For driving durations and distances.
- **OpenWeatherMap Key**: For current weather and 5-day forecasts.
- **Unsplash Access Key** _(Optional)_: For fetching beautiful destination landscape photography.

## 🚀 Installation & Setup

1. **Clone the Repository** (or download the project folder):

   ```bash
   git clone <repository_url>
   cd WANDER AI
   ```

2. **Create a Virtual Environment (Recommended):**

   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install Dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

   _(Ensure you have packages like `flask`, `langgraph`, `langchain-groq`, `python-dotenv`, `pydantic`, `wikipedia`, etc., installed)._

4. **Environment Variables:**
   You can either manually create a `.env` file in the root directory and add your keys, or launch the app first and use the built-in **Settings Modal** to enter them.
   ```ini
   # Example .env structure
   GROQ_API_KEY=your_key_here
   GEOAPIFY_KEY=your_key_here
   ORS_KEY=your_key_here
   OPEN_WEATHER_MAP=your_key_here
   UNSPLASH_ACCESS_KEY=your_key_here
   ```

## 💻 Running the Application

Start the Flask server:

```bash
python app.py
```

- Open your web browser and navigate to: `http://localhost:5001`
- Select a suggested prompt or type your own (e.g., _"Plan a weekend trip to Coorg under ₹30000"_).
- Watch the **Agent Thinking Widget** as Wander AI researches and calculates your trip!

## 📂 Code Structure Highlights

- `app.py`: Core Flask routing, persistence logic, and API overrides.
- `ai_chatbot.py`: Interface bridging user queries and the LangGraph agent.
- `utils/agent.py`: The entire LangGraph DAG (Extractor -> Researcher -> Planner -> Critic -> Formatter).
- `utils/maps.py`: API integration layer for Geoapify, ORS, Unsplash, and Weather.
- `utils/schemas.py`: Strict Pydantic models for enforcing JSON structure.
- `templates/`: HTML/CSS/JS frontend files featuring dynamic DOM manipulation and responsive design.

## 🛠️ Built With

- **Backend:** Python, Flask
- **AI Framework:** LangChain, LangGraph
- **LLM:** Groq (Llama-3)
- **Frontend:** HTML, Vanilla CSS, JavaScript
