import json
import os
import re
import sqlite3
import functools
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request
from datetime import datetime, timedelta
from flask import Flask, abort, jsonify, redirect, render_template, request, url_for, g
import bcrypt
import jwt
from recommendation_engine import build_recommendation as engine_build_recommendation, resolve_goal_categories, GOAL_TO_CATEGORIES
from ai_chatbot import generate_chat_response

BASE_DIR = Path(__file__).resolve().parent
CHAT_BACKEND_URL = os.getenv("CHAT_BACKEND_URL", "http://127.0.0.1:4000/api/chat")
DATA_DIR = BASE_DIR / "data"
USERS_FILE = DATA_DIR / "users.json"
DB_FILE = DATA_DIR / "wanderai.db"

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "wanderai-super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
def load_json(filename):
    path = BASE_DIR / filename
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return []
def load_users():
    rows = fetch_all_users()
    if rows:
        return {
            row["email"]: {
                "name": row["name"],
                "email": row["email"],
                "password": row["password"],
                "place": row["place"],
                "goal": row["goal"],
            }
            for row in rows
            if row["email"]
        }
    users = load_json("data/users.json")
    return {user["email"]: user for user in users if "email" in user}
def save_users(users):
    for email, user in users.items():
        save_user_record({
            "email": email,
            "name": user.get("name", ""),
            "password": user.get("password", ""),
            "place": user.get("place", "London"),
            "goal": user.get("goal", "Nature"),
        })
def hash_password(password):
    """Hash password using bcrypt for secure storage."""
    if isinstance(password, str):
        password = password.encode('utf-8')
    return bcrypt.hashpw(password, bcrypt.gensalt(rounds=12)).decode('utf-8')

def verify_password(password, hashed):
    """Verify password against bcrypt hash."""
    if isinstance(password, str):
        password = password.encode('utf-8')
    if isinstance(hashed, str):
        hashed = hashed.encode('utf-8')
    return bcrypt.checkpw(password, hashed)

def validate_password(password):
    """Validate password meets security requirements."""
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least 1 uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must contain at least 1 lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must contain at least 1 number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return "Password must contain at least 1 special character (!@#$%^&* etc.)."
    return None

def generate_token(user_email):
    """Generate JWT token for user."""
    payload = {
        'email': user_email,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token):
    """Verify JWT token and return payload."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """Decorator to require valid JWT token for route."""
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Authentication required. Please login.'}), 401
        
        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token. Please login again.'}), 401
        
        # Get current user and attach to g
        user = fetch_user_by_email(payload['email'])
        if not user:
            return jsonify({'error': 'User not found.'}), 401
        
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function
def get_db_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection
def init_db():
    """Initialize database with optimized schema including indexes."""
    with get_db_connection() as connection:
        # Users table with all profile fields
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                place TEXT NOT NULL DEFAULT 'London',
                goal TEXT NOT NULL DEFAULT 'Nature',
                interests TEXT DEFAULT '[]',
                preferred_locations TEXT DEFAULT '[]',
                onboarding_complete INTEGER DEFAULT 0,
                avatar_url TEXT,
                bio TEXT,
                phone TEXT,
                is_active INTEGER DEFAULT 1,
                last_login TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        
        # User trips with enhanced fields
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                destination_slug TEXT NOT NULL,
                destination_name TEXT NOT NULL,
                location TEXT,
                budget INTEGER DEFAULT 0,
                days INTEGER DEFAULT 0,
                start_date TEXT,
                end_date TEXT,
                status TEXT DEFAULT 'planned',
                trip_notes TEXT,
                rating INTEGER,
                is_favorite INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        
        # User statistics
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_stats (
                user_email TEXT PRIMARY KEY,
                total_expense INTEGER DEFAULT 0,
                goals_achieved INTEGER DEFAULT 0,
                trips_completed INTEGER DEFAULT 0,
                trips_planned INTEGER DEFAULT 0,
                progress_percent INTEGER DEFAULT 0,
                favorite_destination TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        
        # Chat history
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT,
                session_id TEXT DEFAULT 'default',
                message TEXT NOT NULL,
                reply TEXT NOT NULL,
                intent TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE SET NULL
            )
            """
        )
        
        # Saved destinations
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_destinations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                destination_slug TEXT NOT NULL,
                destination_name TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_email, destination_slug),
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        
        # User activity log for analytics
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT,
                activity_type TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        
        # Daily schedule table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                title TEXT NOT NULL,
                location TEXT,
                schedule_time TEXT NOT NULL,
                schedule_date TEXT,
                notes TEXT,
                is_completed INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        
        # Create indexes for better performance
        connection.execute("CREATE INDEX IF NOT EXISTS idx_schedules_user ON user_schedules(user_email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_schedules_date ON user_schedules(schedule_date)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_schedules_time ON user_schedules(schedule_time)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_users_goal ON users(goal)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_trips_user ON user_trips(user_email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_trips_status ON user_trips(status)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_trips_dates ON user_trips(start_date, end_date)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_destinations(user_email)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity(user_email)")
        
        connection.commit()
def fetch_all_users():
    with get_db_connection() as connection:
        return connection.execute(
            "SELECT name, email, password, place, goal FROM users ORDER BY id"
        ).fetchall()
def fetch_user_by_email(email):
    """Fetch user by email with all profile fields."""
    with get_db_connection() as connection:
        try:
            return connection.execute(
                """SELECT name, email, password, place, goal,
                        interests, preferred_locations, onboarding_complete,
                        bio, phone, avatar_url, is_active, last_login, created_at, updated_at
                 FROM users WHERE email = ? AND is_active = 1""",
                (email,),
            ).fetchone()
        except sqlite3.OperationalError as e:
            # Fallback for schema variations
            columns = ["name", "email", "password", "place", "goal"]
            try:
                return connection.execute(
                    """SELECT name, email, password, place, goal,
                            interests, preferred_locations, onboarding_complete
                     FROM users WHERE email = ?""",
                    (email,),
                ).fetchone()
            except sqlite3.OperationalError:
                return connection.execute(
                    "SELECT name, email, password, place, goal FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
def update_user_onboarding(email, interests, preferred_locations):
    """Update user onboarding data after signup."""
    with get_db_connection() as connection:
        connection.execute(
            """UPDATE users SET
                interests = ?,
                preferred_locations = ?,
                onboarding_complete = 1
            WHERE email = ?""",
            (json.dumps(interests), json.dumps(preferred_locations), email),
        )
        connection.commit()
def check_onboarding_status(email):
    """Check if user has completed onboarding."""
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT onboarding_complete FROM users WHERE email = ?",
            (email,)
        ).fetchone()
        return row["onboarding_complete"] == 1 if row else False
def get_or_create_user_stats(email):
    """Get user stats or create if not exists."""
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM user_stats WHERE user_email = ?",
            (email,)
        ).fetchone()
        if not row:
            connection.execute(
                """INSERT INTO user_stats (user_email, total_expense, goals_achieved,
                    trips_completed, progress_percent)
                VALUES (?, 0, 0, 0, 0)""",
                (email,)
            )
            connection.commit()
            return {"total_expense": 0, "goals_achieved": 0, "trips_completed": 0, "progress_percent": 0}
        return dict(row)
def update_user_stats(email, total_expense=None, goals_achieved=None, trips_completed=None):
    """Update user stats dynamically."""
    with get_db_connection() as connection:
        updates = []
        params = []
        if total_expense is not None:
            updates.append("total_expense = ?")
            params.append(total_expense)
        if goals_achieved is not None:
            updates.append("goals_achieved = ?")
            params.append(goals_achieved)
        if trips_completed is not None:
            updates.append("trips_completed = ?")
            params.append(trips_completed)
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(email)
            connection.execute(
                f"UPDATE user_stats SET {', '.join(updates)} WHERE user_email = ?",
                params
            )
            connection.commit()
def recalculate_user_stats(email):
    """Recalculate user stats based on their trips."""
    with get_db_connection() as connection:
        trip_stats = connection.execute(
            """SELECT COUNT(*) as trip_count,
                COALESCE(SUM(budget), 0) as total_budget
             FROM user_trips
             WHERE user_email = ? AND status != 'cancelled'""",
            (email,)
        ).fetchone()
        completed_trips = connection.execute(
            "SELECT COUNT(*) as completed FROM user_trips WHERE user_email = ? AND status = 'completed'",
            (email,)
        ).fetchone()["completed"]
        total_expense = trip_stats["total_budget"] or 0
        trip_count = trip_stats["trip_count"] or 0
        goals_achieved = completed_trips
        progress_percent = min(trip_count * 10, 100)
        connection.execute(
            """UPDATE user_stats SET
                total_expense = ?,
                goals_achieved = ?,
                trips_completed = ?,
                progress_percent = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_email = ?""",
            (total_expense, goals_achieved, completed_trips, progress_percent, email)
        )
        connection.commit()
        return {
            "total_expense": total_expense,
            "goals_achieved": goals_achieved,
            "trips_completed": completed_trips,
            "progress_percent": progress_percent
        }
def get_user_trips(email, status=None):
    """Get all trips for a user, optionally filtered by status."""
    with get_db_connection() as connection:
        if status:
            rows = connection.execute(
                "SELECT * FROM user_trips WHERE user_email = ? AND status = ? ORDER BY created_at DESC",
                (email, status)
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM user_trips WHERE user_email = ? ORDER BY created_at DESC",
                (email,)
            ).fetchall()
        return [dict(row) for row in rows]
def add_user_trip(email, destination_slug, destination_name, location, budget, days, start_date, end_date):
    """Add a new trip for a user."""
    with get_db_connection() as connection:
        connection.execute(
            """INSERT INTO user_trips
                (user_email, destination_slug, destination_name, location, budget, days, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (email, destination_slug, destination_name, location, budget, days, start_date, end_date)
        )
        connection.commit()
        recalculate_user_stats(email)
def save_user_record(user):
    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO users (name, email, password, place, goal)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                name = excluded.name,
                password = excluded.password,
                place = excluded.place,
                goal = excluded.goal
            """,
            (
                user.get("name", ""),
                user.get("email", "").lower(),
                user.get("password", ""),
                user.get("place", "London"),
                user.get("goal", "Nature"),
            ),
        )
        connection.commit()
def migrate_users_json_to_sqlite():
    if not USERS_FILE.exists():
        return
    existing_rows = fetch_all_users()
    if existing_rows:
        return
    users = load_json("data/users.json")
    if not isinstance(users, list):
        return
    for user in users:
        email = (user.get("email") or "").strip().lower()
        if not email:
            continue
        save_user_record(
            {
                "name": user.get("name") or email.split("@")[0],
                "email": email,
                "password": user.get("password") or "",
                "place": user.get("place", "London"),
                "goal": user.get("goal", "Nature"),
            }
        )

# ─── NEW HELPER FUNCTIONS ───────────────────────────────────────────────────

def log_user_activity(email, activity_type, details=None):
    """Log user activity for analytics."""
    if not email:
        return
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO user_activity (user_email, activity_type, details) VALUES (?, ?, ?)",
            (email, activity_type, json.dumps(details) if details else None)
        )
        conn.commit()

def get_saved_destinations(email):
    """Get all saved destinations for a user."""
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM saved_destinations WHERE user_email = ? ORDER BY created_at DESC",
            (email,)
        ).fetchall()
        return [dict(row) for row in rows]

def save_destination(email, destination_slug, destination_name, notes=None):
    """Save a destination for a user."""
    with get_db_connection() as conn:
        try:
            conn.execute(
                """INSERT INTO saved_destinations (user_email, destination_slug, destination_name, notes)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_email, destination_slug) DO UPDATE SET
                    notes = excluded.notes,
                    created_at = CURRENT_TIMESTAMP""",
                (email, destination_slug, destination_name, notes)
            )
            conn.commit()
            return True
        except Exception as e:
            print(f"Error saving destination: {e}")
            return False

def unsave_destination(email, destination_slug):
    """Remove a saved destination."""
    with get_db_connection() as conn:
        conn.execute(
            "DELETE FROM saved_destinations WHERE user_email = ? AND destination_slug = ?",
            (email, destination_slug)
        )
        conn.commit()

def update_trip_status(trip_id, email, new_status):
    """Update trip status."""
    valid_statuses = ['planned', 'active', 'completed', 'cancelled']
    if new_status not in valid_statuses:
        return False
    with get_db_connection() as conn:
        cursor = conn.execute(
            "UPDATE user_trips SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?",
            (new_status, trip_id, email)
        )
        conn.commit()
        if cursor.rowcount > 0:
            recalculate_user_stats(email)
            return True
        return False

def update_trip_notes(trip_id, email, notes):
    """Update trip notes."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "UPDATE user_trips SET trip_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?",
            (notes, trip_id, email)
        )
        conn.commit()
        return cursor.rowcount > 0

def update_user_profile(email, updates):
    """Update user profile fields."""
    allowed_fields = ['name', 'place', 'goal', 'bio', 'phone', 'avatar_url']
    updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if not updates:
        return False
    with get_db_connection() as conn:
        set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
        params = list(updates.values()) + [email]
        conn.execute(
            f"UPDATE users SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE email = ?",
            params
        )
        conn.commit()
        return True

def update_user_last_login(email):
    """Update user's last login timestamp."""
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE email = ?",
            (email,)
        )
        conn.commit()

# ─── SCHEDULE MANAGEMENT FUNCTIONS ────────────────────────────────────────────

def get_user_schedules(email, date=None):
    """Get all schedules for a user, optionally filtered by date."""
    with get_db_connection() as conn:
        if date:
            rows = conn.execute(
                """SELECT * FROM user_schedules 
                   WHERE user_email = ? AND schedule_date = ? 
                   ORDER BY schedule_time ASC""",
                (email, date)
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM user_schedules 
                   WHERE user_email = ? 
                   ORDER BY schedule_date DESC, schedule_time ASC""",
                (email,)
            ).fetchall()
        return [dict(row) for row in rows]

def add_user_schedule(email, title, location, schedule_time, schedule_date=None, notes=None):
    """Add a new schedule item for a user."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO user_schedules 
                (user_email, title, location, schedule_time, schedule_date, notes)
                VALUES (?, ?, ?, ?, ?, ?)""",
            (email, title, location, schedule_time, schedule_date or datetime.now().strftime("%Y-%m-%d"), notes)
        )
        conn.commit()
        return cursor.lastrowid

def update_user_schedule(schedule_id, email, updates):
    """Update a schedule item."""
    allowed_fields = ['title', 'location', 'schedule_time', 'schedule_date', 'notes', 'is_completed']
    updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if not updates:
        return False
    
    with get_db_connection() as conn:
        set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
        params = list(updates.values()) + [schedule_id, email]
        cursor = conn.execute(
            f"""UPDATE user_schedules 
                SET {set_clause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND user_email = ?""",
            params
        )
        conn.commit()
        return cursor.rowcount > 0

def delete_user_schedule(schedule_id, email):
    """Delete a schedule item."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM user_schedules WHERE id = ? AND user_email = ?",
            (schedule_id, email)
        )
        conn.commit()
        return cursor.rowcount > 0

def toggle_schedule_complete(schedule_id, email):
    """Toggle completion status of a schedule item."""
    with get_db_connection() as conn:
        cursor = conn.execute(
            """UPDATE user_schedules 
                SET is_completed = CASE WHEN is_completed = 1 THEN 0 ELSE 1 END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_email = ?""",
            (schedule_id, email)
        )
        conn.commit()
        return cursor.rowcount > 0

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
)
init_db()
migrate_users_json_to_sqlite()
@functools.lru_cache(maxsize=1)
def load_all_data():
    return (
        load_json("data/destinations.json"),
        load_json("data/activities.json"),
        load_json("data/energy_data.json"),
        load_json("data/risk_data.json"),
        load_json("data/goals_mapping.json")
    )
DESTINATIONS, ACTIVITIES, ENERGY_DATA, RISK_DATA, GOALS_MAPPING = load_all_data()
ENERGY_BY_ACTIVITY = {item["activity"]: item["energy_level"] for item in ENERGY_DATA}
RISK_BY_ACTIVITY = {item["activity"]: item["risk_level"] for item in RISK_DATA}
if isinstance(GOALS_MAPPING, list):
    GOALS_MAPPING = {item["goal_name"]: item["activity_categories"] for item in GOALS_MAPPING}
GOALS_MAPPING_LOWER = {k.lower(): k for k in GOALS_MAPPING}
DESTINATION_DURATION_DAYS = {
    "hyde-park": 2, "cliffs-of-moher": 3, "santorini": 4, "machu-picchu": 4,
    "kyoto": 4, "banff": 5, "bali": 6, "new-york-city": 4,
    "cape-town": 5, "reykjavik": 5, "rome": 4,
}
DESTINATIONS_SORTED_BY_COST = sorted(DESTINATIONS, key=lambda d: d.get("average_cost", float("inf")))
for destination in DESTINATIONS:
    if "average_duration_days" not in destination:
        destination["average_duration_days"] = DESTINATION_DURATION_DAYS.get(destination["slug"], 4)
@functools.lru_cache(maxsize=128)
def get_destinations_by_slug():
    return {d["slug"]: d for d in DESTINATIONS}
@functools.lru_cache(maxsize=128)
def get_activities_by_destination():
    result = {}
    for activity in ACTIVITIES:
        dest_slug = activity.get("destination")
        if dest_slug:
            result.setdefault(dest_slug, []).append(activity)
    return result
DESTINATIONS_BY_SLUG = get_destinations_by_slug()
ACTIVITIES_BY_DESTINATION = get_activities_by_destination()
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
def normalize_budget_text(message):
    budget_pattern = re.search(
        r'(?:under|budget|cost|spend|£|\$|usd|gbp|eur)\s*[£$]?\s*(\d[\d,]*)',
        message.lower()
    )
    if budget_pattern:
        return int(budget_pattern.group(1).replace(',', ''))
    return None
def estimate_trip_cost(destination):
    return destination.get("average_cost", 2500)
def normalize_energy_level(value):
    if not value:
        return 3
    value = str(value).strip().lower()
    return {"low": 2, "moderate": 3, "high": 5}.get(value, 3)
def normalize_risk_level(value):
    if not value:
        return "Moderate"
    value = str(value).strip().lower()
    if value.startswith("low"):
        return "Low"
    if value.startswith("high"):
        return "High"
    return "Moderate"
def risk_score(risk_level):
    return {"Low": 1, "Moderate": 2, "High": 3}.get(risk_level, 2)
def get_goal_categories(goals):
    return resolve_goal_categories(goals)
def sanitize_plan_input(data):
    budget = int(data.get("budget") or 0)
    trip_duration = int(data.get("days") or data.get("trip_duration") or 0)
    travel_goals = data.get("travel_goals") or data.get("goals") or data.get("preferences") or []
    if isinstance(travel_goals, str):
        travel_goals = [travel_goals]
    normalised = [GOALS_MAPPING_LOWER.get(g.lower(), g) for g in travel_goals]
    selected_goals = [g for g in normalised if g in GOALS_MAPPING]
    if not selected_goals:
        fallback = GOALS_MAPPING_LOWER.get((data.get("primary_goal") or "").lower())
        selected_goals = [fallback] if fallback else ["Nature"]
    raw_energy = (data.get("energy") or "").strip()
    raw_risk = (data.get("risk") or "").strip()
    return {
        "budget": budget if budget > 0 else 2500,
        "trip_duration": trip_duration if trip_duration > 0 else 4,
        "travel_goals": selected_goals,
        "currency": data.get("currency") or "GBP",
        "energy_level": normalize_energy_level(raw_energy),
        "risk_level": normalize_risk_level(raw_risk),
        "preferences": data.get("preferences") or [],
        "dates": data.get("dates") or "",
        "location": (data.get("location") or "").strip(),
    }
def build_recommendation(plan):
    return engine_build_recommendation(
        plan, DESTINATIONS, ACTIVITIES, ENERGY_BY_ACTIVITY, RISK_BY_ACTIVITY
    )
def detect_trip_style(message_lower):
    style_keywords = {
        "Relaxation": ["relax", "beach", "honeymoon", "calm", "chill"],
        "Adventure": ["adventure", "hike", "trek", "thrill", "mountain"],
        "Nature": ["nature", "park", "green", "outdoor", "scenic"],
        "Sightseeing": ["city", "sightseeing", "culture", "museum", "history"],
    }
    for style, keywords in style_keywords.items():
        if any(keyword in message_lower for keyword in keywords):
            return style
    return None
@functools.lru_cache(maxsize=256)
def rank_destinations(destinations_tuple, preferred_style, budget):
    destinations = list(destinations_tuple)
    ranked = []
    for destination in destinations:
        score = 0
        if preferred_style and destination["category"] == preferred_style:
            score += 3
        if destination["risk"] == "Low":
            score += 2
        if destination["energy"] <= 3:
            score += 1
        estimated_cost = estimate_trip_cost(destination)
        if budget is not None:
            if estimated_cost <= budget:
                score += 3
            else:
                score -= 2
        ranked.append((score, destination, estimated_cost))
    ranked.sort(key=lambda item: (-item[0], item[2], item[1]["name"]))
    return tuple(ranked)  # Return tuple for cacheability
def month_in_best_time(best_window, month_name):
    best_window = (best_window or "").strip()
    if not best_window or "-" not in best_window:
        return False
    start_name, end_name = [part.strip() for part in best_window.split("-", 1)]
    try:
        start_index = MONTHS.index(start_name)
        end_index = MONTHS.index(end_name)
        month_index = MONTHS.index(month_name)
    except ValueError:
        return False
    if start_index <= end_index:
        return start_index <= month_index <= end_index
    return month_index >= start_index or month_index <= end_index
COUNTRY_CITIES = {
    "japan": ["Tokyo", "Kyoto", "Osaka", "Hiroshima", "Nara"],
    "france": ["Paris", "Nice", "Lyon", "Bordeaux", "Marseille"],
    "italy": ["Rome", "Florence", "Venice", "Milan", "Naples"],
    "usa": ["New York", "Los Angeles", "Chicago", "San Francisco", "Miami"],
    "india": ["Delhi", "Mumbai", "Jaipur", "Goa", "Agra"],
    "thailand": ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Pattaya"],
    "australia": ["Sydney", "Melbourne", "Brisbane", "Cairns", "Perth"],
    "spain": ["Barcelona", "Madrid", "Seville", "Granada", "Valencia"],
    "greece": ["Athens", "Santorini", "Mykonos", "Rhodes", "Crete"],
    "canada": ["Toronto", "Vancouver", "Banff", "Montreal", "Quebec City"],
    "uk": ["London", "Edinburgh", "Bath", "Oxford", "Cambridge"],
    "london": ["Hyde Park", "Tower Bridge", "British Museum", "Buckingham Palace", "Camden Market"],
    "indonesia": ["Bali", "Jakarta", "Yogyakarta", "Lombok", "Komodo"],
    "bali": ["Ubud", "Seminyak", "Kuta Beach", "Nusa Penida", "Uluwatu Temple"],
    "peru": ["Lima", "Cusco", "Machu Picchu", "Arequipa", "Iquitos"],
    "iceland": ["Reykjavik", "Akureyri", "Vik", "Selfoss", "Husavik"],
    "reykjavik": ["Golden Circle", "Blue Lagoon", "Hallgrimskirkja", "Harpa Concert Hall", "Northern Lights Tour"],
    "south africa": ["Cape Town", "Johannesburg", "Kruger", "Durban", "Stellenbosch"],
    "rome": ["Colosseum", "Vatican City", "Trevi Fountain", "Piazza Navona", "Borghese Gallery"],
    "kyoto": ["Fushimi Inari", "Arashiyama Bamboo Grove", "Kinkaku-ji", "Gion District", "Nishiki Market"],
    "santorini": ["Oia Sunset", "Fira Town", "Red Beach", "Akrotiri Ruins", "Catamaran Cruise"],
    "banff": ["Lake Louise", "Johnston Canyon", "Banff Gondola", "Moraine Lake", "Wildlife Drive"],
    "paris": ["Eiffel Tower", "Louvre Museum", "Montmartre", "Seine River Cruise", "Versailles"],
    "tokyo": ["Shibuya Crossing", "Shinjuku", "Akihabara", "Senso-ji Temple", "Harajuku"],
    "dubai": ["Burj Khalifa", "Dubai Mall", "Desert Safari", "Palm Jumeirah", "Gold Souk"],
    "singapore": ["Marina Bay Sands", "Gardens by the Bay", "Sentosa Island", "Hawker Centres", "Universal Studios"],
    "new zealand": ["Queenstown", "Milford Sound", "Hobbiton", "Rotorua", "Bay of Islands"],
    "morocco": ["Marrakech", "Fes", "Sahara Desert", "Chefchaouen", "Casablanca"],
    "turkey": ["Istanbul", "Cappadocia", "Pamukkale", "Ephesus", "Bodrum"],
    "portugal": ["Lisbon", "Porto", "Algarve", "Sintra", "Madeira"],
    "mexico": ["Mexico City", "Cancun", "Tulum", "Oaxaca", "Guadalajara"],
    "brazil": ["Rio de Janeiro", "Sao Paulo", "Amazon", "Iguazu Falls", "Salvador"],
    "egypt": ["Cairo", "Luxor", "Aswan", "Alexandria", "Hurghada"],
    "vietnam": ["Hanoi", "Ho Chi Minh City", "Ha Long Bay", "Hoi An", "Da Nang"],
    "nepal": ["Kathmandu", "Pokhara", "Everest Base Camp", "Chitwan", "Lumbini"],
    "switzerland": ["Zurich", "Geneva", "Interlaken", "Lucerne", "Zermatt"],
    "germany": ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt"],
    "netherlands": ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Delft"],
    "scotland": ["Edinburgh", "Glasgow", "Highlands", "Isle of Skye", "St Andrews"],
    "ireland": ["Dublin", "Galway", "Cork", "Cliffs of Moher", "Killarney"],
    "maldives": ["Male", "Baa Atoll", "Ari Atoll", "Maafushi", "Veligandu"],
    "sri lanka": ["Colombo", "Kandy", "Sigiriya", "Galle", "Ella"],
    "kenya": ["Nairobi", "Masai Mara", "Amboseli", "Diani Beach", "Lamu"],
    "croatia": ["Dubrovnik", "Split", "Plitvice Lakes", "Hvar", "Zadar"],
    "norway": ["Oslo", "Bergen", "Fjords", "Tromso", "Lofoten Islands"],
    "sweden": ["Stockholm", "Gothenburg", "Malmo", "Uppsala", "Kiruna"],
    "south korea": ["Seoul", "Busan", "Jeju Island", "Gyeongju", "Incheon"],
    "philippines": ["Manila", "Palawan", "Boracay", "Cebu", "Siargao"],
    "malaysia": ["Kuala Lumpur", "Penang", "Langkawi", "Borneo", "Malacca"],
    "china": ["Beijing", "Shanghai", "Xian", "Guilin", "Chengdu"],
    "argentina": ["Buenos Aires", "Patagonia", "Mendoza", "Iguazu Falls", "Bariloche"],
    "colombia": ["Bogota", "Medellin", "Cartagena", "Coffee Region", "Tayrona"],
}
DESTINATION_FOODS = {
    "london": ["Fish & Chips", "Full English Breakfast", "Afternoon Tea", "Pie & Mash", "Chicken Tikka Masala"],
    "uk": ["Fish & Chips", "Full English Breakfast", "Afternoon Tea", "Scotch Egg", "Sticky Toffee Pudding"],
    "japan": ["Ramen", "Sushi", "Tempura", "Takoyaki", "Matcha Desserts"],
    "kyoto": ["Kaiseki", "Yudofu (Tofu Hot Pot)", "Matcha Sweets", "Obanzai", "Kyo-wagashi"],
    "tokyo": ["Ramen", "Sushi", "Yakitori", "Tonkatsu", "Taiyaki"],
    "france": ["Croissant", "Crêpes", "Boeuf Bourguignon", "Ratatouille", "Crème Brûlée"],
    "paris": ["Croissant", "French Onion Soup", "Escargot", "Macarons", "Crème Brûlée"],
    "italy": ["Pizza Napoletana", "Pasta Carbonara", "Gelato", "Risotto", "Tiramisu"],
    "rome": ["Cacio e Pepe", "Supplì", "Gelato", "Saltimbocca", "Maritozzi"],
    "bali": ["Nasi Goreng", "Babi Guling", "Satay", "Gado-Gado", "Pisang Goreng"],
    "indonesia": ["Nasi Goreng", "Rendang", "Satay", "Gado-Gado", "Soto Ayam"],
    "thailand": ["Pad Thai", "Tom Yum Soup", "Green Curry", "Mango Sticky Rice", "Som Tum"],
    "india": ["Butter Chicken", "Biryani", "Dosa", "Chaat", "Gulab Jamun"],
    "greece": ["Moussaka", "Souvlaki", "Spanakopita", "Baklava", "Fresh Seafood"],
    "santorini": ["Fava Dip", "Grilled Octopus", "Tomatokeftedes", "Fresh Seafood", "Local Wine"],
    "usa": ["Burger", "BBQ Ribs", "Clam Chowder", "Lobster Roll", "Key Lime Pie"],
    "new york": ["NY Pizza", "Bagel with Lox", "Pastrami Sandwich", "Cheesecake", "Hot Dog"],
    "canada": ["Poutine", "Butter Tarts", "Nanaimo Bars", "Tourtière", "BeaverTails"],
    "banff": ["Elk Burger", "Poutine", "Bison Steak", "Wild Mushroom Soup", "Maple Syrup Treats"],
    "peru": ["Ceviche", "Lomo Saltado", "Causa", "Anticuchos", "Picarones"],
    "iceland": ["Skyr", "Lamb Soup", "Plokkfiskur", "Hákarl", "Kleinur"],
    "reykjavik": ["Skyr", "Lamb Soup", "Fresh Arctic Char", "Hot Dog (Pylsur)", "Kleinur"],
    "south africa": ["Braai (BBQ)", "Bobotie", "Biltong", "Bunny Chow", "Malva Pudding"],
    "cape town": ["Braai", "Bobotie", "Cape Malay Curry", "Biltong", "Koeksisters"],
    "spain": ["Paella", "Tapas", "Churros", "Gazpacho", "Jamón Ibérico"],
    "barcelona": ["Paella", "Pan con Tomate", "Patatas Bravas", "Crema Catalana", "Jamón"],
    "australia": ["Meat Pie", "Vegemite Toast", "Tim Tams", "Barramundi", "Pavlova"],
    "morocco": ["Tagine", "Couscous", "Harira Soup", "Bastilla", "Mint Tea"],
    "turkey": ["Kebab", "Baklava", "Meze", "Lahmacun", "Turkish Delight"],
    "vietnam": ["Pho", "Banh Mi", "Bun Bo Hue", "Goi Cuon", "Banh Xeo"],
    "portugal": ["Pastéis de Nata", "Bacalhau", "Francesinha", "Caldo Verde", "Piri Piri Chicken"],
    "mexico": ["Tacos al Pastor", "Guacamole", "Enchiladas", "Chiles en Nogada", "Churros"],
    "singapore": ["Hainanese Chicken Rice", "Chilli Crab", "Laksa", "Char Kway Teow", "Kaya Toast"],
    "dubai": ["Shawarma", "Al Harees", "Machboos", "Luqaimat", "Camel Milk Ice Cream"],
    "egypt": ["Koshari", "Ful Medames", "Hawawshi", "Basbousa", "Feteer Meshaltet"],
    "nepal": ["Dal Bhat", "Momo Dumplings", "Thukpa", "Sel Roti", "Gundruk"],
    "sri lanka": ["Rice & Curry", "Kottu Roti", "Hoppers", "Pol Sambol", "Watalappan"],
    "malaysia": ["Nasi Lemak", "Char Kway Teow", "Roti Canai", "Laksa", "Cendol"],
    "south korea": ["Bibimbap", "Korean BBQ", "Tteokbokki", "Kimchi Jjigae", "Japchae"],
    "germany": ["Bratwurst", "Pretzels", "Schnitzel", "Sauerkraut", "Black Forest Cake"],
    "netherlands": ["Stroopwafel", "Herring", "Bitterballen", "Poffertjes", "Stamppot"],
    "ireland": ["Irish Stew", "Soda Bread", "Boxty", "Colcannon", "Black Pudding"],
    "norway": ["Salmon", "Rakfisk", "Fårikål", "Brunost", "Lefse"],
    "switzerland": ["Fondue", "Raclette", "Rösti", "Zürcher Geschnetzeltes", "Swiss Chocolate"],
    "argentina": ["Asado", "Empanadas", "Chimichurri Steak", "Dulce de Leche", "Medialunas"],
    "brazil": ["Feijoada", "Churrasco", "Pão de Queijo", "Açaí Bowl", "Brigadeiro"],
    "colombia": ["Bandeja Paisa", "Arepas", "Sancocho", "Empanadas", "Buñuelos"],
    "maldives": ["Mas Huni", "Garudhiya", "Rihaakuru", "Fresh Tuna", "Coconut Sambal"],
    "kenya": ["Nyama Choma", "Ugali", "Sukuma Wiki", "Mandazi", "Pilau Rice"],
    "croatia": ["Peka", "Black Risotto", "Prstaci", "Pasticada", "Fritule"],
    "sweden": ["Meatballs", "Gravlax", "Smörgåsbord", "Cinnamon Buns", "Surströmming"],
    "philippines": ["Adobo", "Sinigang", "Lechon", "Halo-Halo", "Kare-Kare"],
    "china": ["Peking Duck", "Dim Sum", "Kung Pao Chicken", "Xiaolongbao", "Hot Pot"],
    "new zealand": ["Hangi", "Pavlova", "Whitebait Fritters", "Lamb Roast", "Hokey Pokey Ice Cream"],
}
TRIP_TIPS = {
    "london": ["Get an Oyster card for public transport", "Book popular attractions in advance", "Carry an umbrella — weather changes fast"],
    "bali": ["Respect temple dress codes (bring a sarong)", "Bargain at local markets", "Stay hydrated — it's tropical"],
    "japan": ["Get a Suica/IC card for trains", "Cash is still king in many places", "Remove shoes before entering homes/temples"],
    "italy": ["Validate train tickets before boarding", "Avoid tourist traps near major landmarks", "Lunch is the main meal — dinner is late"],
    "france": ["Learn a few French phrases — locals appreciate it", "Museums are often free on first Sundays", "Tipping is not mandatory but appreciated"],
    "thailand": ["Dress modestly at temples", "Negotiate tuk-tuk prices upfront", "Try street food — it's safe and delicious"],
    "india": ["Drink only bottled water", "Dress conservatively at religious sites", "Bargain at markets — it's expected"],
    "greece": ["Visit islands early morning to avoid crowds", "Try local tavernas over tourist restaurants", "Siesta time is real — plan accordingly"],
    "usa": ["Tip 15–20% at restaurants", "Book accommodation early in peak season", "Public transport varies hugely by city"],
    "canada": ["Weather can change rapidly — layer up", "Wildlife encounters are real — keep distance", "Book national park permits in advance"],
    "peru": ["Acclimatise to altitude before trekking", "Book Machu Picchu tickets months ahead", "Carry local currency (Soles)"],
    "iceland": ["Northern Lights are best Sep–Mar", "Rent a car for flexibility", "Geothermal pools are everywhere — enjoy them"],
    "south africa": ["Book safari lodges early", "Be vigilant in cities", "Rent a car for the Garden Route"],
    "australia": ["Apply sunscreen — UV is intense", "Book Great Barrier Reef tours in advance", "Distances are huge — plan travel time"],
    "spain": ["Dinner is after 9 PM", "Siesta is still observed in smaller towns", "Validate metro tickets before boarding"],
    "turkey": ["Haggle at the Grand Bazaar", "Carry cash for smaller shops", "Dress modestly at mosques"],
    "vietnam": ["Motorbike taxis are cheap and fun", "Eat where locals eat", "Bargain at markets"],
    "morocco": ["Hire a local guide in medinas", "Dress conservatively", "Bargain is expected in souks"],
    "singapore": ["Hawker centres are the best value food", "MRT is excellent — use it", "Fines for littering are real"],
    "dubai": ["Dress modestly in public areas", "Alcohol only in licensed venues", "Summers are extremely hot — plan indoor activities"],
    "default": ["Keep copies of important documents", "Get travel insurance", "Learn a few local phrases"],
}
CITY_HIGHLIGHTS = {
    "Hyde Park": ["Serpentine Lake", "Speakers Corner", "Diana Memorial Fountain", "Kensington Gardens"],
    "Tower Bridge": ["Bridge Tower Tour", "Glass Floor Walkway", "Engine Rooms", "Thames Views"],
    "British Museum": ["Rosetta Stone", "Egyptian Mummies", "Elgin Marbles", "Lewis Chessmen"],
    "Buckingham Palace": ["Changing of the Guard", "State Rooms Tour", "Royal Mews", "Queens Gallery"],
    "Camden Market": ["Street Food", "Vintage Shopping", "Live Music", "Canal Walk"],
    "Tokyo": ["Shibuya Crossing", "Shinjuku", "Akihabara", "Senso-ji Temple"],
    "Kyoto": ["Fushimi Inari Shrine", "Arashiyama Bamboo Grove", "Kinkaku-ji", "Gion District"],
    "Osaka": ["Dotonbori", "Osaka Castle", "Namba", "Street Food Tour"],
    "Hiroshima": ["Peace Memorial Park", "Miyajima Island", "Hiroshima Castle", "Local Cuisine"],
    "Nara": ["Nara Deer Park", "Todai-ji Temple", "Kasuga Shrine", "Naramachi District"],
    "Paris": ["Eiffel Tower", "Louvre Museum", "Montmartre", "Seine River Cruise"],
    "Rome": ["Colosseum", "Vatican City", "Trevi Fountain", "Piazza Navona"],
    "Bali": ["Ubud Rice Terraces", "Tanah Lot Temple", "Seminyak Beach", "Mount Batur"],
    "Bangkok": ["Grand Palace", "Wat Pho", "Chatuchak Market", "Chao Phraya River"],
    "Sydney": ["Opera House", "Bondi Beach", "Harbour Bridge", "Darling Harbour"],
    "London": ["Big Ben", "Tower of London", "Hyde Park", "Covent Garden"],
    "Edinburgh": ["Edinburgh Castle", "Royal Mile", "Arthurs Seat", "Holyrood Palace"],
    "New York": ["Central Park", "Times Square", "Brooklyn Bridge", "Metropolitan Museum"],
    "Cape Town": ["Table Mountain", "V&A Waterfront", "Cape Point", "Boulders Beach"],
    "Reykjavik": ["Golden Circle", "Blue Lagoon", "Northern Lights", "Hallgrimskirkja"],
    "Santorini": ["Oia Sunset", "Caldera Views", "Wine Tasting", "Catamaran Cruise"],
    "Banff": ["Lake Louise", "Johnston Canyon", "Banff Gondola", "Wildlife Drive"],
    "Dubai": ["Burj Khalifa", "Dubai Mall", "Desert Safari", "Palm Jumeirah"],
    "Singapore": ["Marina Bay Sands", "Gardens by the Bay", "Sentosa Island", "Hawker Centres"],
    "Istanbul": ["Hagia Sophia", "Grand Bazaar", "Bosphorus Cruise", "Topkapi Palace"],
    "Lisbon": ["Belem Tower", "Alfama District", "Sintra Day Trip", "Pasteis de Nata"],
    "Amsterdam": ["Anne Frank House", "Rijksmuseum", "Canal Cruise", "Van Gogh Museum"],
    "Prague": ["Prague Castle", "Charles Bridge", "Old Town Square", "Astronomical Clock"],
    "Vienna": ["Schonbrunn Palace", "St Stephens Cathedral", "Belvedere", "Vienna Opera"],
    "Budapest": ["Parliament Building", "Thermal Baths", "Buda Castle", "Ruin Bars"],
    "Barcelona": ["Sagrada Familia", "Park Guell", "La Rambla", "Gothic Quarter"],
    "Athens": ["Acropolis", "Parthenon", "Plaka District", "National Museum"],
    "Marrakech": ["Djemaa el-Fna", "Majorelle Garden", "Medina Souks", "Bahia Palace"],
    "Cairo": ["Pyramids of Giza", "Egyptian Museum", "Khan el-Khalili", "Nile Cruise"],
    "Hanoi": ["Hoan Kiem Lake", "Old Quarter", "Ho Chi Minh Mausoleum", "Street Food Tour"],
    "Seoul": ["Gyeongbokgung Palace", "Myeongdong", "N Seoul Tower", "Bukchon Hanok Village"],
    "Beijing": ["Great Wall", "Forbidden City", "Temple of Heaven", "Summer Palace"],
    "Mumbai": ["Gateway of India", "Marine Drive", "Elephanta Caves", "Dharavi"],
    "Delhi": ["Red Fort", "Qutub Minar", "India Gate", "Chandni Chowk"],
    "Jaipur": ["Amber Fort", "Hawa Mahal", "City Palace", "Jantar Mantar"],
    "Goa": ["Baga Beach", "Old Goa Churches", "Dudhsagar Falls", "Spice Plantations"],
    "Phuket": ["Patong Beach", "Phi Phi Islands", "Big Buddha", "Old Phuket Town"],
    "Queenstown": ["Bungee Jumping", "Milford Sound", "Skyline Gondola", "Lake Wakatipu"],
    "Nairobi": ["Masai Mara Safari", "Giraffe Centre", "Nairobi National Park", "Karen Blixen Museum"],
    "Rio de Janeiro": ["Christ the Redeemer", "Copacabana Beach", "Sugarloaf Mountain", "Carnival"],
    "Buenos Aires": ["Tango Shows", "La Boca", "Recoleta Cemetery", "Puerto Madero"],
    "Dubrovnik": ["Old City Walls", "Game of Thrones Tour", "Lokrum Island", "Cable Car"],
    "Maldives": ["Overwater Bungalows", "Snorkeling", "Dolphin Watching", "Sunset Cruise"],
    "Kuala Lumpur": ["Petronas Towers", "Batu Caves", "Bukit Bintang", "KL Bird Park"],
    "Cappadocia": ["Hot Air Balloon", "Underground Cities", "Goreme Open Air Museum", "Fairy Chimneys"],
}
def detect_country(message_lower):
    for country in sorted(COUNTRY_CITIES.keys(), key=len, reverse=True):
        if country in message_lower:
            return country
    return None
def build_best_places_reply(place, budget=None, days=None):
    """Smart reply for 'best places in X' queries."""
    cities = COUNTRY_CITIES.get(place, [])
    place_name = place.title()
    lines = [f"Here are the best places to visit in {place_name}:\n"]
    for city in cities[:5]:
        highlights = CITY_HIGHLIGHTS.get(city, ["Explore local area", "Visit landmarks"])
        lines.append(f"• {city} — {highlights[0]}, {highlights[1] if len(highlights) > 1 else 'local experiences'}")
    if budget:
        lines.append(f"\nEstimated budget: £{budget} should cover a great trip!")
    if days:
        lines.append(f"\nWant a day-by-day itinerary? Try: '{days} day plan in {place_name}'")
    else:
        lines.append(f"\nWant a day-by-day itinerary? Just ask: 'X day plan in {place_name}'")
    return "\n".join(lines)
@functools.lru_cache(maxsize=512)
def build_fallback_reply(message_hash, budget_hash, goal_hash, location_hash):
    message = message_hash
    budget = int(budget_hash) if budget_hash != "None" else None
    goal = goal_hash if goal_hash != "None" else None
    location = location_hash if location_hash != "None" else None
    message_lower = message.lower().strip()
    current_month = MONTHS[datetime.now().month - 1]
    if budget is None:
        budget = normalize_budget_text(message)
    else:
        try:
            budget = int(str(budget).replace(",", "").strip())
        except (ValueError, TypeError):
            budget = normalize_budget_text(message)
    days_match = re.search(r"(\d+)\s*(?:day|days|night|nights|week|weeks|say|nite|nites)", message_lower)
    days = int(days_match.group(1)) if days_match else None
    country = detect_country(message_lower)
    greeting_words = {"hi", "hello", "hey", "hii", "hy", "good morning", "good evening", "good afternoon"}
    if message_lower in greeting_words:
        return (
            "Hello! I'm WanderAI, your personal travel assistant. ✈️\n\n"
            "I can help you with:\n"
            "• Best places to visit in any country or city\n"
            "• Day-by-day travel itineraries\n"
            "• Budget travel tips\n"
            "• Daily schedules for any destination\n\n"
            "Try asking me:\n"
            "- Best places in London\n"
            "- 5 day plan in Japan under 10000\n"
            "- Daily schedule for Bali\n"
            "- Relaxation trip under 2000"
        )
    stops_keywords = ["where i need to stop", "where to stop", "stops", "must stop", "places to stop", "highlights", "key stops", "top stops"]
    if any(kw in message_lower for kw in stops_keywords):
        target = country or (location or "").lower()
        if target:
            cities = COUNTRY_CITIES.get(target, [])
            place_name = target.title()
            lines = [f"📍 Key Stops in {place_name}:\n"]
            for city in cities[:5]:
                highlights = CITY_HIGHLIGHTS.get(city, ["Explore local area"])
                lines.append(f"• {city} — {highlights[0]}")
            tips = TRIP_TIPS.get(target, TRIP_TIPS["default"])
            lines.append(f"\n💡 Tip: {tips[0]}")
            lines.append(f"\nWant a full day-by-day plan? Just ask: 'X day itinerary in {place_name}'")
            return "\n".join(lines)
        return "Tell me which destination you're visiting and I'll list the must-stop places! 📍"
    next_trip_keywords = ["next trip", "where to go next", "next destination", "next travel", "next place", "after this", "next holiday", "next vacation"]
    if any(kw in message_lower for kw in next_trip_keywords):
        preferred_style = detect_trip_style(message_lower)
        goal_to_style = {"adventure": "Adventure", "relaxation": "Relaxation", "nature": "Nature", "sightseeing": "Sightseeing"}
        preferred_style = preferred_style or goal_to_style.get((goal or "").lower())
        matching = [d for d in DESTINATIONS if month_in_best_time(d.get("best"), current_month)]
        if preferred_style:
            matching = [d for d in matching if d["category"] == preferred_style] or matching
        ranked = rank_destinations(matching or DESTINATIONS, preferred_style, budget)
        lines = [f"✈️ Great Next Trip Ideas for {current_month}:\n"]
        for _, d, cost in ranked[:5]:
            lines.append(f"• {d['name']} ({d['location']}) — {d['category']}, est. £{cost}")
        lines.append(f"\n💡 Tell me your travel style (adventure, relaxation, nature, sightseeing) or budget for personalised picks!")
        return "\n".join(lines)
    what_keywords = ["what to do", "what can i do", "things to do", "what to see", "what to visit", "places to visit", "must see", "must visit", "top things", "top places", "best things"]
    if any(kw in message_lower for kw in what_keywords) and country:
        return build_best_places_reply(country, budget, days)
    best_keywords = ["best place", "best spot", "best destination", "where to go", "where should i go", "recommend", "suggest", "top place"]
    if any(kw in message_lower for kw in best_keywords):
        if country:
            return build_best_places_reply(country, budget, days)
        preferred_style = detect_trip_style(message_lower)
        goal_to_style = {"adventure": "Adventure", "relaxation": "Relaxation", "nature": "Nature", "sightseeing": "Sightseeing"}
        preferred_style = preferred_style or goal_to_style.get((goal or "").lower())
        matching = [d for d in DESTINATIONS if month_in_best_time(d.get("best"), current_month)]
        if preferred_style:
            matching = [d for d in matching if d["category"] == preferred_style] or matching
        ranked = rank_destinations(matching or DESTINATIONS, preferred_style, budget)
        lines = [f"Top travel picks for {current_month}:\n"]
        for _, d, cost in ranked[:4]:
            lines.append(f"• {d['name']} ({d['location']}) — {d['category']}, est. £{cost}, best {d.get('best', 'year-round')}")
        lines.append("\nTell me a country or city for more specific recommendations!")
        return "\n".join(lines)
    schedule_keywords = ["schedule", "daily schedule", "day schedule", "time schedule", "hourly"]
    if any(kw in message_lower for kw in schedule_keywords):
        return build_schedule_reply(message_lower, country)
    food_keywords = ["food", "eat", "try", "dish", "cuisine", "restaurant", "must eat", "must try", "what to eat", "local food", "best food"]
    if any(kw in message_lower for kw in food_keywords):
        target = country or (location or "").lower() or "default"
        foods = DESTINATION_FOODS.get(target, [])
        tips = TRIP_TIPS.get(target, TRIP_TIPS["default"])
        place_name = (target if target != "default" else "your destination").title()
        if foods:
            lines = [f"🍴 Must-Try Foods in {place_name}:\n"]
            for food in foods:
                lines.append(f"  • {food}")
            lines.append(f"\n💡 Food Tips:")
            lines.append(f"  • Try local street food — it's often the most authentic")
            lines.append(f"  • Ask locals for their favourite spots")
            if tips:
                lines.append(f"  • {tips[0]}")
            lines.append(f"\nWant a full itinerary with food stops? Just ask: 'X day plan in {place_name}'")
            return "\n".join(lines)
        else:
            return (
                f"Tell me which country or city you're visiting and I'll give you a full food guide! 🍽️\n"
                f"Example: 'food to try in Japan' or 'what to eat in Bali'"
            )
    itinerary_keywords = ["itinerary", "travel plan", "trip plan", "day plan", "plan in", "plan for", "full plan", "full itinerary", "make it", "yes make", "create plan", "make a plan"]
    if country and (any(kw in message_lower for kw in itinerary_keywords) or days_match):
        return build_itinerary_reply(message_lower, days, budget, country)
    if "budget" in message_lower or (budget is not None and not country):
        preferred_style = detect_trip_style(message_lower)
        ranked = rank_destinations(DESTINATIONS, preferred_style, budget)
        affordable = [item for item in ranked if budget is None or item[2] <= budget]
        picks = affordable[:4] if affordable else ranked[:4]
        lines = [f"Best destinations for your budget (£{budget or 'flexible'}):\n"]
        for _, d, cost in picks:
            lines.append(f"• {d['name']} ({d['location']}) — est. £{cost}, best {d.get('best', 'year-round')}")
        lines.append("\nWant a full itinerary for any of these? Just ask!")
        return "\n".join(lines)
    if country:
        if days_match:
            return build_itinerary_reply(message_lower, days, budget, country)
        return build_best_places_reply(country, budget, days)
    preferred_style = detect_trip_style(message_lower)
    goal_to_style = {"adventure": "Adventure", "relaxation": "Relaxation", "nature": "Nature", "sightseeing": "Sightseeing"}
    preferred_style = preferred_style or goal_to_style.get((goal or "").lower())
    ranked = rank_destinations(DESTINATIONS, preferred_style, budget)
    lines = [f"Here are some travel recommendations:\n"]
    for _, d, cost in ranked[:4]:
        lines.append(f"• {d['name']} ({d['location']}) — {d['category']}, est. £{cost}")
    lines.append("\nAsk me about any country, city, or travel style for personalised recommendations!")
    return "\n".join(lines)
def build_itinerary_reply(message_lower, days, budget, country):
    if not days or days < 1:
        days = 7
    cities = COUNTRY_CITIES.get(country, [])
    country_name = country.title()
    budget_str = f" under £{budget}" if budget else ""
    foods = DESTINATION_FOODS.get(country, ["Local cuisine", "Street food", "Traditional dishes"])
    tips = TRIP_TIPS.get(country, TRIP_TIPS["default"])
    lines = [f"🗺️ {days}-Day Travel Plan in {country_name}{budget_str}\n"]
    for i in range(days):
        day_num = i + 1
        city = cities[i % len(cities)] if cities else country_name
        all_h = CITY_HIGHLIGHTS.get(city, ["Explore local area", "Visit landmarks", "Try local food", "Evening walk", "Local market", "Cultural experience", "Scenic walk"])
        n = len(all_h)
        food = foods[i % len(foods)]
        lines.append(f"Day {day_num} \u2014 {city}")
        lines.append(f"  \U0001f3db\ufe0f Morning: {all_h[i % n]}")
        lines.append(f"  \U0001f306 Afternoon: {all_h[(i + 1) % n]}")
        lines.append(f"  \U0001f37d\ufe0f Must-try food: {food}")
        lines.append(f"  \U0001f319 Evening: {all_h[(i + 2) % n]}")
        if budget:
            per_day = budget // days
            lines.append(f"  \U0001f4b0 Budget: ~\u00a3{per_day} per day")
        lines.append("")
    if budget:
        lines.append(f"💳 Total estimated budget: £{budget} for {days} days")
    lines.append(f"\n🍴 Top foods to try in {country_name}:")
    for food in foods[:5]:
        lines.append(f"  • {food}")
    lines.append(f"\n💡 Travel Tips:")
    for tip in tips[:3]:
        lines.append(f"  • {tip}")
    lines.append(f"\n🌤️ Best time to visit {country_name}: Spring or Autumn for ideal weather.")
    return "\n".join(lines)
def build_schedule_reply(message_lower, country, city_hint=None):
    country_name = (country or "your destination").title()
    cities = COUNTRY_CITIES.get(country, []) if country else []
    city = city_hint or (cities[0] if cities else country_name)
    highlights = CITY_HIGHLIGHTS.get(city, ["Visit main landmark", "Explore local market", "Try local cuisine", "Evening walk"])
    schedule = [
        f"**Daily Schedule - {city}, {country_name}**\n",
        f"09:00 - {highlights[0] if len(highlights) > 0 else 'Morning sightseeing'}",
        f"11:00 - {highlights[1] if len(highlights) > 1 else 'Local market visit'}",
        "13:00 - Lunch at a local restaurant",
        f"15:00 - {highlights[2] if len(highlights) > 2 else 'Afternoon activity'}",
        "17:00 - Rest / Hotel check-in",
        f"19:00 - {highlights[3] if len(highlights) > 3 else 'Evening walk'}",
        "21:00 - Dinner + local experience",
    ]
    return "\n".join(schedule)
def render_page(template_name, current_page, **context):
    if 'show_right_panel' not in context:
        context['show_right_panel'] = current_page == "dashboard"
    return render_template(
        template_name,
        current_page=current_page,
        destinations=DESTINATIONS,
        **context,
    )
def format_stay_length(days):
    if days <= 1:
        return "1 day"
    return f"{days}-{days + 1} days"
def get_local_image_name(slug):
    image_path = BASE_DIR / "static" / "images" / f"{slug}.jpg"
    if image_path.exists():
        return f"{slug}.jpg"
    return "empty.svg"
def infer_city_name(destination):
    location = destination.get("location", "")
    if "," in location:
        return location.split(",", 1)[0].strip()
    return destination.get("name", "")
def build_destination_overview(destination, city_name):
    category = destination.get("category", "Travel")
    location = destination.get("location", "this destination")
    best_time = destination.get("best", "year-round")
    average_cost = destination.get("average_cost", 0)
    return [
        f"{destination.get('name', city_name)} is a {category.lower()} destination in {location}, ideal for travellers looking for memorable experiences without overcomplicating the trip.",
        f"The destination is especially appealing during {best_time}, with an estimated average trip cost of around GBP {average_cost}.",
    ]
def build_risk_notes(destination):
    risk_level = destination.get("risk", "Moderate")
    city_name = infer_city_name(destination)
    if risk_level == "Low":
        return {
            "risk_title": "Low-risk destination",
            "risks": [
                f"{city_name} is generally comfortable for most travellers.",
                "Normal city awareness and basic travel precautions are enough.",
                "Keep personal items secure in busy public areas.",
            ],
        }
    if risk_level == "High":
        return {
            "risk_title": "Higher planning required",
            "risks": [
                "This destination is better suited to confident and prepared travellers.",
                "Plan routes, timings, and activity safety details in advance.",
                "Check weather, transport, and local guidance before departure.",
            ],
        }
    return {
        "risk_title": "Moderate-risk destination",
        "risks": [
            "This trip is manageable, but a little planning helps.",
            "Stay alert during outdoor or high-movement activities.",
            "Review transport, timing, and local conditions before each day.",
        ],
    }
def enrich_destination(destination):
    enriched = dict(destination)
    city_name = infer_city_name(enriched)
    activities = ACTIVITIES_BY_DESTINATION.get(enriched.get("slug"), [])
    activity_names = [item.get("activity_name") for item in activities if item.get("activity_name")]
    highlights = ", ".join(activity_names[:3]) if activity_names else enriched.get("category", "Top local sights")
    risk_content = build_risk_notes(enriched)
    energy = int(enriched.get("energy", 3) or 3)
    enriched["local_image"] = enriched.get("local_image") or get_local_image_name(enriched.get("slug", ""))
    enriched["overview"] = enriched.get("overview") or build_destination_overview(enriched, city_name)
    enriched["activities"] = enriched.get("activities") or activity_names or CITY_HIGHLIGHTS.get(city_name, [])[:3]
    enriched["duration"] = enriched.get("duration") or format_stay_length(int(enriched.get("average_duration_days", 4) or 4))
    enriched["highlights"] = enriched.get("highlights") or highlights
    enriched["energy_text"] = enriched.get("energy_text") or (
        "Easy-going pace with plenty of room to explore comfortably."
        if energy <= 2 else
        "Balanced trip with a mix of walking, sightseeing, and planned activities."
        if energy <= 3 else
        "More active trip with longer days and higher physical effort."
    )
    enriched["risk_title"] = enriched.get("risk_title") or risk_content["risk_title"]
    enriched["risks"] = enriched.get("risks") or risk_content["risks"]
    enriched["best"] = enriched.get("best") or "Year-round"
    return enriched
def get_destination(slug):
    destination = DESTINATIONS_BY_SLUG.get(slug)
    if not destination:
        abort(404)
    return enrich_destination(destination)
@app.route("/")
@app.route("/index")
@app.route("/index.html")
def home():
    return redirect(url_for("dashboard"))
@app.route("/dashboard")
@app.route("/dashboard.html")
def dashboard():
    return render_page("dashboard.html", "dashboard")
@app.route("/explore")
@app.route("/explore.html")
def explore():
    return render_page("explore.html", "explore")
@app.route("/goal")
@app.route("/goal.html")
def goal():
    return render_page("goal.html", "goal")
@app.route("/saved")
@app.route("/saved.html")
def saved():
    return render_page("saved.html", "saved")
@app.route("/trip")
@app.route("/trip.html")
def trip():
    return render_page("trip.html", "trip")
@app.route("/trip-results")
@app.route("/trip/results")
@app.route("/trip-results.html")
def trip_results():
    return render_page("trip_results.html", "trip-results")
@app.route("/itinerary")
@app.route("/itinerary.html")
def itinerary():
    return render_page("itinerary.html", "itinerary", show_right_panel=True)
@app.route("/itinerary/<slug>")
@app.route("/itinerary/<slug>.html")
def itinerary_detail(slug):
    """Show itinerary for a specific destination."""
    destination = get_destination(slug)
    return render_page("itinerary.html", "itinerary", destination=destination, place_id=slug, show_right_panel=True)
@app.route("/profile")
@app.route("/profile.html")
def profile():
    return render_page("profile.html", "profile")
@app.route("/destination/<slug>")
@app.route("/destination/<slug>.html")
def destination_detail(slug):
    destination = get_destination(slug)
    return render_page("destination.html", "trip", destination=destination)
@app.route("/api/destinations")
def destinations_api():
    return jsonify({"destinations": DESTINATIONS})
@app.route("/api/plan-trip", methods=["POST"])
def plan_trip():
    data = request.get_json(silent=True) or {}
    plan = sanitize_plan_input(data)
    recommendation = build_recommendation(plan)
    return jsonify({"message": "Trip planned!", "recommendation": recommendation})
@app.route("/api/chat/reset", methods=["POST"])
def chat_reset():
    # Also notify the backend to clear its session
    try:
        backend_url = os.getenv("CHAT_BACKEND_URL", "http://127.0.0.1:4000/api/chat")
        reset_url = backend_url.replace("/chat", "/chat/reset")
        req = urllib_request.Request(reset_url, method="POST", data=b"{}",
                                     headers={"Content-Type": "application/json"})
        urllib_request.urlopen(req, timeout=5)
    except Exception:
        pass
    return jsonify({"message": "Chat history cleared"}), 200
@app.route("/api/chat", methods=["POST"])
def chat_proxy():
    payload = request.get_json(silent=True) or {}
    if not payload.get("message"):
        return jsonify({"error": "Message required"}), 400
    user_message = payload["message"]
    user_budget = payload.get("budget")
    user_goal = payload.get("userGoal") or payload.get("goal")
    user_location = payload.get("userLocation") or payload.get("location")
    context = payload.get("context", {})
    history = payload.get("history", [])
    session_id = payload.get("sessionId")

    def fallback():
        return jsonify({"reply": build_fallback_reply(
            user_message,
            str(user_budget) if user_budget else "None",
            user_goal or "None",
            user_location or "None"
        ), "updatedContext": context, "fallback": True}), 200

    # Forward the full payload (including history and context) to the backend
    forward_payload = {
        "message": user_message,
        "sessionId": session_id,
        "context": context,
        "history": history,
        "budget": user_budget,
        "goal": user_goal,
        "location": user_location
    }
    backend_request = urllib_request.Request(
        CHAT_BACKEND_URL,
        data=json.dumps(forward_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    auth_header = request.headers.get("Authorization")
    if auth_header:
        backend_request.add_header("Authorization", auth_header)
    try:
        with urllib_request.urlopen(backend_request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
            response_data = json.loads(response_body or "{}")
            if response_data.get("reply"):
                # Save to local DB for logged-in users
                user = get_current_user_from_request()
                if user:
                    save_chat_message(user["email"], user_message, response_data["reply"])
                return jsonify(response_data), 200
            return fallback()
    except urllib_error.HTTPError as exc:
        try:
            response_data = json.loads(exc.read().decode("utf-8") or "{}")
        except json.JSONDecodeError:
            response_data = {}
        if response_data.get("reply"):
            return jsonify(response_data), 200
        return fallback()
    except Exception:
        return fallback()
@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    place = (data.get("place") or "").strip()
    goal = (data.get("goal") or "").strip()
    if not name or not email or not password:
        return jsonify({"msg": "Name, email and password are required."}), 400
    err = validate_password(password)
    if err:
        return jsonify({"msg": err}), 400
    users = load_users()
    if email in users:
        return jsonify({"msg": "Email already registered."}), 409
    users[email] = {
        "name": name,
        "email": email,
        "password": hash_password(password),
        "place": place,
        "goal": goal,
    }
    save_users(users)
    user = {"name": name, "email": email, "place": place, "goal": goal}
    token = generate_token(email)
    return jsonify({"msg": "Registered successfully.", "user": user, "token": token}), 201
@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Login user and update last login timestamp."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"msg": "Email and password are required."}), 400
    users = load_users()
    stored = users.get(email)
    if not stored:
        return jsonify({"msg": "No account found with this email."}), 401
    if not verify_password(password, stored["password"]):
        return jsonify({"msg": "Wrong password. Please try again."}), 401
    
    # Update last login timestamp
    update_user_last_login(email)
    log_user_activity(email, "login", {"ip": request.remote_addr})
    
    user = {"name": stored["name"], "email": email, "place": stored.get("place", ""), "goal": stored.get("goal", "")}
    token = generate_token(email)
    return jsonify({"msg": "Login successful.", "user": user, "token": token}), 200
@app.route("/api/auth/reset-password", methods=["POST"])
def auth_reset_password():
    """Reset password directly without OTP - simplified flow."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""
    
    if not email:
        return jsonify({"msg": "Email is required."}), 400
    
    # Check if user exists
    users = load_users()
    if email not in users:
        return jsonify({"msg": "No account found with this email."}), 404
    
    # Validate passwords
    if not new_password or not confirm_password:
        return jsonify({"msg": "Both password fields are required."}), 400
    
    if new_password != confirm_password:
        return jsonify({"msg": "Passwords do not match."}), 400
    
    # Validate password strength
    if len(new_password) < 8:
        return jsonify({"msg": "Password must be at least 8 characters."}), 400
    if not re.search(r"[A-Z]", new_password):
        return jsonify({"msg": "Password must contain at least 1 uppercase letter."}), 400
    if not re.search(r"[a-z]", new_password):
        return jsonify({"msg": "Password must contain at least 1 lowercase letter."}), 400
    if not re.search(r"[0-9]", new_password):
        return jsonify({"msg": "Password must contain at least 1 number."}), 400
    
    # Hash and save new password
    users[email]["password"] = hash_password(new_password)
    save_users(users)
    
    return jsonify({"msg": "Password updated successfully."}), 200

def update_user_goal(email, goal):
    """Update user's primary travel goal."""
    with get_db_connection() as connection:
        connection.execute(
            "UPDATE users SET goal = ? WHERE email = ?",
            (goal, email),
        )
        connection.commit()

@app.route("/api/user/update-goal", methods=["POST"])
def update_goal_api():
    """Update user's primary travel goal."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    data = request.get_json(silent=True) or {}
    goal = data.get("goal", "").strip()
    
    if not goal:
        return jsonify({"error": "Goal is required"}), 400
    
    # Validate goal is one of the allowed values
    valid_goals = ["Nature", "Adventure", "Relaxation", "Sightseeing"]
    if goal not in valid_goals:
        return jsonify({"error": f"Invalid goal. Must be one of: {', '.join(valid_goals)}"}), 400
    
    try:
        update_user_goal(user["email"], goal)
        return jsonify({
            "msg": "Goal updated successfully",
            "goal": goal
        })
    except Exception as e:
        return jsonify({"error": f"Failed to update goal: {str(e)}"}), 500

@app.route("/api/user/onboarding", methods=["GET", "POST"])
def user_onboarding():
    """GET: Check onboarding status. POST: Complete onboarding with interests & locations."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    if request.method == "GET":
        is_complete = check_onboarding_status(user["email"])
        row = fetch_user_by_email(user["email"])
        return jsonify({
            "onboarding_complete": is_complete,
            "interests": json.loads(row["interests"]) if row and row["interests"] else [],
            "preferred_locations": json.loads(row["preferred_locations"]) if row and row["preferred_locations"] else []
        })
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        interests = data.get("interests", [])
        preferred_locations = data.get("preferred_locations", [])
        update_user_onboarding(user["email"], interests, preferred_locations)
        get_or_create_user_stats(user["email"])
        return jsonify({"msg": "Onboarding completed successfully."})
@app.route("/api/user/stats", methods=["GET"])
def user_stats():
    """Get current user stats (expense, goals, progress)."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    stats = get_or_create_user_stats(user["email"])
    return jsonify(stats)
@app.route("/api/user/stats/update", methods=["POST"])
def update_stats():
    """Update user stats manually (for testing/admin)."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    data = request.get_json(silent=True) or {}
    result = recalculate_user_stats(user["email"])
    return jsonify({"msg": "Stats recalculated.", "stats": result})
@app.route("/api/user/trips", methods=["GET", "POST"])
def user_trips_api():
    """GET: Get all user trips. POST: Add a new trip."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    if request.method == "GET":
        status = request.args.get("status")
        trips = get_user_trips(user["email"], status)
        return jsonify({"trips": trips})
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        add_user_trip(
            user["email"],
            data.get("destination_slug"),
            data.get("destination_name"),
            data.get("location"),
            data.get("budget", 0),
            data.get("days", 0),
            data.get("start_date"),
            data.get("end_date")
        )
        return jsonify({"msg": "Trip added successfully."})
@app.route("/api/search", methods=["GET"])
def search_destinations():
    """Search destinations by name, location, or category with debouncing support."""
    query = request.args.get("q", "").strip().lower()
    category = request.args.get("category", "").strip()
    if not query and not category:
        return jsonify({"results": [], "count": 0})
    results = []
    for dest in DESTINATIONS:
        match = False
        if query:
            match = (
                query in dest.get("name", "").lower() or
                query in dest.get("location", "").lower() or
                query in dest.get("category", "").lower() or
                any(query in tag.lower() for tag in dest.get("tags", []))
            )
        if category and dest.get("category") == category:
            match = True
        if match:
            results.append(enrich_destination(dest))
    return jsonify({"results": results, "count": len(results)})
def save_chat_message(email, message, reply):
    """Save chat message to database."""
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO chat_history (user_email, message, reply) VALUES (?, ?, ?)",
            (email, message, reply)
        )
        conn.commit()
def get_current_user_from_request():
    """Extract and verify current user from JWT token in Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.split(" ")[1]
    payload = verify_token(token)
    
    if not payload:
        return None
    
    user = fetch_user_by_email(payload.get("email", ""))
    if user:
        return dict(user)
    return None
def build_fallback_reply_for_chat(message, budget=None, goal=None, location=None):
    """Build a fallback reply when OpenAI is unavailable."""
    message_lower = message.lower()
    if any(word in message_lower for word in ["itinerary", "plan", "schedule"]):
        import re as _re
        days_match = _re.search(r"(\d+)\s*(?:day|days|night|nights)", message_lower)
        days = int(days_match.group(1)) if days_match else 7
        country = location.lower() if location else detect_country(message_lower) or "default"
        return build_itinerary_reply(message_lower, days, budget, country)
    if any(word in message_lower for word in ["best place", "where to go", "destination", "recommend"]):
        prefs = {"budget": budget, "goal": goal, "location": location}
        picks = build_recommendation(sanitize_plan_input(prefs))
        if picks and picks.get("selected_destination"):
            dest = picks["selected_destination"]
            return f"Based on your preferences, I recommend **{dest['name']}** in {dest['location']}.\n\n{dest.get('summary', '')}\n\nEstimated cost: £{dest.get('average_cost', 'N/A')}\nDuration: {dest.get('average_duration_days', 'N/A')} days\n\nWant a detailed itinerary? Just ask!"
    return (
        "Hello! I'm WanderAI, your personal travel assistant. ✈️\n\n"
        "I can help you with:\n"
        "• Best places to visit in any country or city\n"
        "• Day-by-day travel itineraries\n"
        "• Budget travel tips\n"
        "• Daily schedules for any destination\n\n"
        "Try asking me:\n"
        "- 'Best places in Japan'\n"
        "- '5 day plan under 2000'\n"
        "- 'Daily schedule for Bali'"
    )
@app.route("/api/itinerary/<place_id>", methods=["GET"])
def get_itinerary(place_id):
    """Get detailed itinerary for a specific destination."""
    destination = get_destination(place_id)
    if not destination:
        return jsonify({"error": "Destination not found"}), 404
    days = destination.get("average_duration_days", 4)
    budget = destination.get("average_cost", 2000)
    category = destination.get("category", "Sightseeing")
    location = destination.get("location", "")
    name = destination.get("name", place_id)
    itinerary = generate_itinerary_for_destination(name, location, category, days, budget)
    return jsonify({
        "destination": destination,
        "itinerary": itinerary,
        "trip_summary": {
            "total_days": days,
            "total_budget": budget,
            "daily_budget": int(budget / days) if days > 0 else budget,
            "location": location,
            "category": category
        }
    })
def generate_itinerary_for_destination(name, location, category, days, budget):
    """Generate a detailed day-by-day itinerary for a destination."""
    itinerary = []
    activities_by_category = {
        "Nature": ["Hiking trails", "Nature photography", "Wildlife spotting", "Sunrise viewpoint", "Botanical gardens", "Lake kayaking"],
        "Adventure": [" adrenaline activities", "Rock climbing", "Zip-lining", "White water rafting", "Mountain biking", "Paragliding"],
        "Relaxation": ["Spa treatment", "Beach time", "Yoga session", "Sunset cruise", "Wine tasting", "Meditation"],
        "Sightseeing": ["Guided city tour", "Museum visit", "Historical landmarks", "Architecture walk", "Local markets", "Cultural show"],
        "Food": ["Food tour", "Cooking class", "Local restaurant", "Street food tasting", "Winery visit", "Coffee tasting"],
        "Culture": ["Temple visit", "Art gallery", "Traditional performance", "Local craft workshop", "Heritage walk", "Cultural museum"]
    }
    default_activities = ["Explore local area", "Visit main attractions", "Try local cuisine", "Photography walk", "Relax at accommodation", "Shopping"]
    activities = activities_by_category.get(category, default_activities)
    for day_num in range(1, days + 1):
        day_activities = []
        day_activities.append({
            "time": "09:00",
            "title": f"Morning: {activities[(day_num - 1) % len(activities)]}",
            "details": f"Start your day with {activities[(day_num - 1) % len(activities)].lower()} in {location}",
            "cost": int(budget / days * 0.3),
            "energy_level": 3,
            "risk_level": "Low",
            "duration": "2-3 hours"
        })
        day_activities.append({
            "time": "12:30",
            "title": "Lunch Break",
            "details": f"Enjoy local cuisine at a recommended restaurant in {location}",
            "cost": int(budget / days * 0.15),
            "energy_level": 1,
            "risk_level": "Low",
            "duration": "1 hour"
        })
        afternoon_activity = activities[(day_num) % len(activities)]
        day_activities.append({
            "time": "14:00",
            "title": f"Afternoon: {afternoon_activity}",
            "details": f"Continue exploring with {afternoon_activity.lower()}",
            "cost": int(budget / days * 0.25),
            "energy_level": 2,
            "risk_level": "Low",
            "duration": "2-3 hours"
        })
        evening_options = ["Sunset viewing", "Local entertainment", "Night market", "Relaxation time"]
        day_activities.append({
            "time": "18:00",
            "title": f"Evening: {evening_options[(day_num - 1) % len(evening_options)]}",
            "details": f"Wind down with {evening_options[(day_num - 1) % len(evening_options)].lower()} in {location}",
            "cost": int(budget / days * 0.2),
            "energy_level": 1,
            "risk_level": "Low",
            "duration": "2 hours"
        })
        day_activities.append({
            "time": "20:00",
            "title": "Dinner",
            "details": f"Dinner at a local restaurant featuring {location}'s specialties",
            "cost": int(budget / days * 0.1),
            "energy_level": 1,
            "risk_level": "Low",
            "duration": "1.5 hours"
        })
        itinerary.append({
            "day": day_num,
            "theme": f"Day {day_num}: Explore {name}",
            "items": day_activities
        })
    return itinerary

# ─── NEW API ENDPOINTS ───────────────────────────────────────────────────────

@app.route("/api/user/profile", methods=["GET", "PUT"])
def user_profile_api():
    """GET: Get user profile. PUT: Update user profile."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    if request.method == "GET":
        row = fetch_user_by_email(user["email"])
        if not row:
            return jsonify({"error": "User not found"}), 404
        # Convert sqlite3.Row to dict for easier access
        user_data = dict(row)
        return jsonify({
            "name": user_data["name"],
            "email": user_data["email"],
            "place": user_data["place"],
            "goal": user_data["goal"],
            "bio": user_data.get("bio", ""),
            "phone": user_data.get("phone", ""),
            "avatar_url": user_data.get("avatar_url", ""),
            "interests": json.loads(user_data["interests"]) if user_data.get("interests") else [],
            "preferred_locations": json.loads(user_data["preferred_locations"]) if user_data.get("preferred_locations") else [],
            "onboarding_complete": bool(user_data.get("onboarding_complete", 0))
        })
    
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        allowed_updates = {
            'name': data.get('name'),
            'place': data.get('place'),
            'goal': data.get('goal'),
            'bio': data.get('bio'),
            'phone': data.get('phone'),
            'avatar_url': data.get('avatar_url')
        }
        # Remove None values
        allowed_updates = {k: v for k, v in allowed_updates.items() if v is not None}
        
        if not allowed_updates:
            return jsonify({"error": "No valid fields to update"}), 400
        
        success = update_user_profile(user["email"], allowed_updates)
        if success:
            log_user_activity(user["email"], "profile_updated", allowed_updates)
            return jsonify({"msg": "Profile updated successfully"})
        return jsonify({"error": "Failed to update profile"}), 500

@app.route("/api/user/saved", methods=["GET", "POST", "DELETE"])
def saved_destinations_api():
    """Manage saved destinations."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    if request.method == "GET":
        saved = get_saved_destinations(user["email"])
        return jsonify({"saved_destinations": saved})
    
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        destination_slug = data.get("destination_slug")
        destination_name = data.get("destination_name")
        notes = data.get("notes")
        
        if not destination_slug or not destination_name:
            return jsonify({"error": "destination_slug and destination_name are required"}), 400
        
        success = save_destination(user["email"], destination_slug, destination_name, notes)
        if success:
            log_user_activity(user["email"], "destination_saved", {"slug": destination_slug})
            return jsonify({"msg": "Destination saved successfully"})
        return jsonify({"error": "Failed to save destination"}), 500
    
    if request.method == "DELETE":
        data = request.get_json(silent=True) or {}
        destination_slug = data.get("destination_slug")
        
        if not destination_slug:
            return jsonify({"error": "destination_slug is required"}), 400
        
        unsave_destination(user["email"], destination_slug)
        log_user_activity(user["email"], "destination_unsaved", {"slug": destination_slug})
        return jsonify({"msg": "Destination removed from saved"})

@app.route("/api/user/trips/<int:trip_id>", methods=["PUT", "DELETE"])
def manage_trip_api(trip_id):
    """Update or delete a specific trip."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        updates = {}
        
        # Update status if provided
        if "status" in data:
            success = update_trip_status(trip_id, user["email"], data["status"])
            if not success:
                return jsonify({"error": "Invalid status or trip not found"}), 400
            updates["status"] = data["status"]
        
        # Update notes if provided
        if "notes" in data:
            update_trip_notes(trip_id, user["email"], data["notes"])
            updates["notes"] = data["notes"]
        
        if updates:
            log_user_activity(user["email"], "trip_updated", {"trip_id": trip_id, "updates": updates})
            return jsonify({"msg": "Trip updated successfully"})
        return jsonify({"error": "No valid updates provided"}), 400
    
    if request.method == "DELETE":
        with get_db_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM user_trips WHERE id = ? AND user_email = ?",
                (trip_id, user["email"])
            )
            conn.commit()
            if cursor.rowcount > 0:
                recalculate_user_stats(user["email"])
                log_user_activity(user["email"], "trip_deleted", {"trip_id": trip_id})
                return jsonify({"msg": "Trip deleted successfully"})
            return jsonify({"error": "Trip not found"}), 404

@app.route("/api/user/activity", methods=["GET"])
def user_activity_api():
    """Get user activity history."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    limit = request.args.get("limit", 50, type=int)
    activity_type = request.args.get("type", "")
    
    with get_db_connection() as conn:
        query = "SELECT * FROM user_activity WHERE user_email = ?"
        params = [user["email"]]
        if activity_type:
            query += " AND activity_type = ?"
            params.append(activity_type)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        rows = conn.execute(query, params).fetchall()
        activities = []
        for row in rows:
            activities.append({
                "id": row["id"],
                "type": row["activity_type"],
                "details": json.loads(row["details"]) if row["details"] else None,
                "created_at": row["created_at"]
            })
        return jsonify({"activities": activities})

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat()
    })

# ─── SCHEDULE API ENDPOINTS ───────────────────────────────────────────────────

@app.route("/api/user/schedules", methods=["GET", "POST"])
def user_schedules_api():
    """GET: Get user schedules. POST: Add new schedule."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    if request.method == "GET":
        date = request.args.get("date")
        schedules = get_user_schedules(user["email"], date)
        return jsonify({
            "schedules": schedules,
            "count": len(schedules)
        })
    
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = data.get("title", "").strip()
        location = data.get("location", "").strip()
        schedule_time = data.get("time", "").strip()
        schedule_date = data.get("date", "").strip()
        notes = data.get("notes", "").strip()
        
        # Validation
        if not title:
            return jsonify({"error": "Title is required"}), 400
        if not schedule_time:
            return jsonify({"error": "Time is required"}), 400
        
        # Validate time format (HH:MM)
        if not re.match(r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$", schedule_time):
            return jsonify({"error": "Invalid time format. Use HH:MM (24-hour)"}), 400
        
        try:
            schedule_id = add_user_schedule(
                user["email"], title, location, schedule_time, schedule_date, notes
            )
            log_user_activity(user["email"], "schedule_added", {
                "schedule_id": schedule_id, "title": title
            })
            return jsonify({
                "msg": "Schedule added successfully",
                "schedule_id": schedule_id
            }), 201
        except Exception as e:
            return jsonify({"error": f"Failed to add schedule: {str(e)}"}), 500
        



@app.route("/api/user/schedules/<int:schedule_id>", methods=["PUT", "DELETE"])
def manage_schedule_api(schedule_id):
    """PUT: Update schedule. DELETE: Delete schedule."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        updates = {}
        
        # Validate and prepare updates
        if "title" in data:
            title = data["title"].strip()
            if not title:
                return jsonify({"error": "Title cannot be empty"}), 400
            updates["title"] = title
        
        if "location" in data:
            updates["location"] = data["location"].strip()
        
        if "time" in data:
            time = data["time"].strip()
            if not re.match(r"^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$", time):
                return jsonify({"error": "Invalid time format. Use HH:MM"}), 400
            updates["schedule_time"] = time
        
        if "date" in data:
            updates["schedule_date"] = data["date"].strip()
        
        if "notes" in data:
            updates["notes"] = data["notes"].strip()
        
        if "is_completed" in data:
            updates["is_completed"] = 1 if data["is_completed"] else 0
        
        if not updates:
            return jsonify({"error": "No valid fields to update"}), 400
        
        success = update_user_schedule(schedule_id, user["email"], updates)
        if success:
            log_user_activity(user["email"], "schedule_updated", {
                "schedule_id": schedule_id, "updates": list(updates.keys())
            })
            return jsonify({"msg": "Schedule updated successfully"})
        return jsonify({"error": "Schedule not found"}), 404
    
    if request.method == "DELETE":
        success = delete_user_schedule(schedule_id, user["email"])
        if success:
            log_user_activity(user["email"], "schedule_deleted", {
                "schedule_id": schedule_id
            })
            return jsonify({"msg": "Schedule deleted successfully"})
        return jsonify({"error": "Schedule not found"}), 404

@app.route("/api/user/schedules/<int:schedule_id>/toggle", methods=["POST"])
def toggle_schedule_api(schedule_id):
    """Toggle completion status of a schedule item."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"error": "Not authenticated"}), 401
    
    success = toggle_schedule_complete(schedule_id, user["email"])
    if success:
        return jsonify({"msg": "Schedule status toggled"})
    return jsonify({"error": "Schedule not found"}), 404

@app.errorhandler(404)
def not_found(_error):
    return render_page("dashboard.html", "dashboard"), 404





@app.route("/chatbot.html")
def chatbot():
    return render_template("chatbot.html")


@app.route("/api/ai-chat", methods=["POST"])
def ai_chat():

    data = request.get_json()

    message = data.get("message", "")

    reply = generate_chat_response(message)

    return jsonify({
        "reply": reply
    })




if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5001)





