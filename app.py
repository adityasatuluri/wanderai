import uuid
import os
import pickle
from flask import Flask, jsonify, render_template, request, redirect, url_for
from ai_chatbot import generate_chat_response
from dotenv import set_key
from datetime import datetime, timedelta

app = Flask(__name__)

DB_FILE = "chats_db.pkl"
ENV_FILE = ".env"

def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "rb") as f:
                return pickle.load(f)
        except:
            pass
    return {}

def save_db(db):
    with open(DB_FILE, "wb") as f:
        pickle.dump(db, f)

# --- DATABASE ---
chats_db = load_db()

@app.route("/")
def new_chat():
    today = datetime.now()
    d1 = (today + timedelta(days=1)).strftime("%b %d")
    d2 = (today + timedelta(days=3)).strftime("%b %d")
    dyn_prompt = f"Plan a trip to Coorg from {d1} to {d2} under ₹40000"
    
    # Load a blank slate
    return render_template(
        "chatbot.html", 
        current_page="chatbot", 
        chats=chats_db, 
        chat_id=None, 
        current_chat=None,
        dynamic_prompt=dyn_prompt
    )

@app.route("/c/<chat_id>")
def load_chat(chat_id):
    # Load an existing chat
    chat = chats_db.get(chat_id)
    if not chat:
        return redirect(url_for('new_chat'))
        
    chat_places = []
    chat_start_date = ""
    chat_days = 0
    chat_overrides = []
    
    if chat.get("state"):
        chat_places = chat["state"].get("places", [])
        chat_start_date = chat["state"].get("start_date", "")
        chat_overrides = chat.get("overrides", [])
        
        # Get number of days from itinerary
        draft = chat["state"].get("draft_itinerary")
        if draft:
            chat_days = draft.days
        
    return render_template(
        "chatbot.html", 
        current_page="chatbot", 
        chats=chats_db, 
        chat_id=chat_id, 
        current_chat=chat,
        chat_places=chat_places,
        chat_start_date=chat_start_date,
        chat_days=chat_days,
        chat_overrides=chat_overrides
    )

@app.route("/api/ai-chat", methods=["POST"])
def ai_chat():
    data = request.get_json(silent=True) or {}
    message = data.get("message", "").strip()
    chat_id = data.get("chat_id")
    
    if not message:
        return jsonify({"reply": "Please provide a message."}), 400

    # 1. If this is a new chat, generate an ID and save it
    is_new_chat = False
    if not chat_id or chat_id not in chats_db:
        chat_id = str(uuid.uuid4())
        # Generate a short title from the first message
        title = message[:25] + "..." if len(message) > 25 else message
        chats_db[chat_id] = {
            "title": title,
            "messages": []
        }
        is_new_chat = True

    # 2. Save user message
    chats_db[chat_id]["messages"].append({
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": message
    })

    # 3. Generate and save AI reply
    response_data = generate_chat_response(message)
    reply_html = response_data["html"]
    
    msg_id = str(uuid.uuid4())
    chats_db[chat_id]["messages"].append({
        "id": msg_id,
        "role": "bot",
        "content": reply_html
    })
    
    # Store the state if an itinerary was generated
    chat_start_date = ""
    chat_days = 0
    if response_data.get("state"):
        chats_db[chat_id]["state"] = response_data["state"]
        chat_start_date = response_data["state"].get("start_date", "")
        draft = response_data["state"].get("draft_itinerary")
        if draft:
            chat_days = draft.days

    save_db(chats_db)

    return jsonify({
        "reply": reply_html,
        "msg_id": msg_id,
        "chat_id": chat_id,
        "title": chats_db[chat_id]["title"],
        "is_new_chat": is_new_chat,
        "has_weather_mismatch": chats_db[chat_id].get("has_weather_mismatch", False),
        "chat_start_date": chat_start_date,
        "chat_days": chat_days
    })

@app.route("/api/simulate-weather", methods=["POST"])
def simulate_weather():
    data = request.get_json(silent=True) or {}
    chat_id = data.get("chat_id")
    day = int(data.get("day", 1))
    time = data.get("time", "")
    weather_condition = data.get("weather_condition", "")
    
    if not time or not weather_condition or not chat_id:
        return jsonify({"error": "Missing parameters"}), 400
        
    c_data = chats_db.get(chat_id)
    if not c_data:
        return jsonify({"error": "Chat not found"}), 404
        
    state = c_data.get("state")
    if not state: 
        return jsonify({"error": "No state"}), 400
    
    draft = state.get("draft_itinerary")
    if not draft: 
        return jsonify({"error": "No draft itinerary"}), 400
        
    mismatch_found = False
    bad_weathers = ["Sudden Storm", "Heavy Rain", "Heatwave"]
    
    if weather_condition in bad_weathers:
        for p_day in draft.plan:
            if p_day.day == day:
                mismatch_found = True
                
                if "overrides" not in c_data:
                    c_data["overrides"] = []
                c_data["overrides"].append({
                    "day": day,
                    "time": time,
                    "condition": weather_condition
                })
                break
                    
    if mismatch_found:
        c_data["has_weather_mismatch"] = True
        save_db(chats_db)
        return jsonify({"updated_chats": [chat_id]})
            
    return jsonify({"updated_chats": []})

@app.route("/api/replan-itinerary", methods=["POST"])
def replan_itinerary():
    data = request.get_json(silent=True) or {}
    chat_id = data.get("chat_id")
    msg_id = data.get("msg_id") # The specific bot message to replace
    
    if not chat_id or chat_id not in chats_db:
        return jsonify({"error": "Invalid chat_id"}), 400
        
    c_data = chats_db[chat_id]
    
    # Get initial user prompt
    user_prompt = ""
    for msg in c_data.get("messages", []):
        if msg["role"] == "user":
            user_prompt = msg["content"]
            break
            
    overrides = c_data.get("overrides", [])
    override_str = ", ".join([f"Day {o['day']} at {o['time']}: {o['condition']}" for o in overrides])
    
    # Send a new prompt to LangGraph indicating the overrides
    message_payload = {
        "message": user_prompt,
        "overridden_weather": override_str
    }
    
    response_data = generate_chat_response(message_payload)
    reply_html = response_data["html"]
    
    # Find the specific message to replace, or append if not found/no msg_id
    replaced = False
    new_content = "<div style='color: #d97706; padding: 10px; background: #fef3c7; border-radius: 8px; margin-bottom: 16px;'>⚠️ Itinerary updated due to weather conditions.</div>" + reply_html
    
    if msg_id:
        for msg in c_data["messages"]:
            if msg.get("id") == msg_id:
                msg["content"] = new_content
                replaced = True
                break
                
    if not replaced:
        new_msg_id = str(uuid.uuid4())
        c_data["messages"].append({
            "id": new_msg_id,
            "role": "bot",
            "content": new_content
        })
        msg_id = new_msg_id
    
    # Clear the mismatch
    c_data["has_weather_mismatch"] = False
    c_data["overrides"] = []
    
    if response_data.get("state"):
        c_data["state"] = response_data["state"]
        
    save_db(chats_db)
        
    return jsonify({
        "reply": reply_html,
        "chat_id": chat_id,
        "msg_id": msg_id
    })

@app.route("/api/clear-chats", methods=["POST"])
def clear_chats():
    global chats_db
    chats_db = {}
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
    return jsonify({"status": "success"})

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    keys_to_manage = [
        "GROQ_API_KEY", 
        "GEOAPIFY_KEY", 
        "ORS_KEY", 
        "OPEN_WEATHER_MAP", 
        "UNSPLASH_ACCESS_KEY"
    ]
    
    if request.method == "GET":
        current_settings = {}
        for k in keys_to_manage:
            current_settings[k] = os.getenv(k, "")
        return jsonify(current_settings)
        
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        
        # Create .env if it doesn't exist
        if not os.path.exists(ENV_FILE):
            open(ENV_FILE, 'w').close()
            
        for k in keys_to_manage:
            val = data.get(k, "")
            # Update env variables so current process catches them
            os.environ[k] = val
            # Write to .env file
            set_key(ENV_FILE, k, val)
            
        return jsonify({"status": "success"})

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)