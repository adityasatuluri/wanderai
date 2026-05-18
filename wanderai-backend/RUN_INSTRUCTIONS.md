# WanderAI Backend Run Instructions

## Prerequisites
- Node.js v22+
- npm

## Step 1 — Setup
```
"c:\Users\kesha\OneDrive\Desktop\New folder\.venv\Scripts\activate.bat"
cd wanderai-backend
npm install
```

## Step 2 — Configure Environment
Edit `.env` file:
```
OPENAI_API_KEY=sk-proj-...
JWT_SECRET=your-secret-key
```

## Step 3 — Start Server
```
npm start
```

**Expected output:**
```
SQLite Connected
Server running on port 4000
```

## Step 4 — Test API
cd wanderai
python app.py

```
curl -X POST http://localhost:4000/api/chat -H "Content-Type: application/json" -d "{\"message\":\"Best travel June\"}" -H "Authorization: Bearer <token>"
```

## Auth Endpoints
- POST `/api/auth/register`
- POST `/api/auth/login`
- All chat/trip routes require `Authorization: Bearer <token>` header

## AI Features
- **Itinerary Generation** - AI generates personalized travel plans from user prompts, trip details, and saved conversation context.
- **User Preference Processing** - The backend interprets interests like destination, budget, and travel goal and converts them into structured inputs.
- **Decision-Making Logic** - A rule-based recommendation engine scores destinations and activities against the user's travel profile.
- **Goal Evaluation** - Recommendations are checked against user-defined goals through category and activity-tag matching.
- **Energy Analysis** - Destination energy levels are compared with user energy preferences to help avoid fatigue.
- **Risk Evaluation** - Destination risk levels are compared with the user's comfort threshold to keep suggestions safe and suitable.
- **Multi-Constraint Handling** - Budget, duration, goals, energy, risk, and optional location preference are evaluated together.
- **Recommendation System** - The system returns ranked destination recommendations tailored to the user's needs.

## Recommendation API
- `GET /api/recommend` - returns all destinations in the recommendation dataset
- `POST /api/recommend` - returns scored recommendations using budget, goal, energy, risk, days, and location
- `GET /api/recommend/goals` - returns goal-to-activity mappings
- `GET /api/recommend/goal/:goal` - returns activities for a selected goal
- `GET /api/recommend/budget/:amount` - returns budget-filtered destinations

## Frontend Connection
- Flask (localhost:5001) → Backend (localhost:4000)
- CORS configured
- Chat works with 🤖 button

## Database
- SQLite — auto-created as `database.db`
- Tables created on first run: users, chat_history, trips, itinerary, recommendations

## Database
- SQLite database file: `..\data\wanderai-backend.db`
- SQL schema file: `..\data\wanderai-backend-schema.sql`
- Auto-created tables: users, chat_history, trips, itinerary, recommendations, destinations, activities, energy_data, risk_data, goal_mappings

## Troubleshooting

**Port conflict (EADDRINUSE: port 4000)**
```
netstat -ano | findstr :4000
taskkill /PID <pid> /F
```
Then run `npm start` again.

**No OpenAI key:** Returns "AI service unavailable"

**No token:** Returns "Authentication required"
