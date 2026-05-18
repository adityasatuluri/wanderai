# WanderAI - AI-Powered Travel Assistant

A full-stack travel planning application with an intelligent chatbot powered by **local AI** (Ollama). No OpenAI API key or external AI services required!

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18+): [Download here](https://nodejs.org/)
- **Python** (v3.10+): [Download here](https://www.python.org/)
- **Git**: [Download here](https://git-scm.com/)

---

## 📥 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/wanderai.git
cd wanderai
```

---

## 🤖 Install Ollama (Local AI)

Ollama runs AI models locally on your machine. **No API costs, no internet required after setup!**

### macOS

```bash
# Using Homebrew (recommended)
brew install ollama

# Start Ollama service
brew services start ollama

# Download the AI model (~4.7GB)
ollama pull llama3
```

### Windows

```powershell
# 1. Download Ollama from https://ollama.com/download/windows
# 2. Run the installer (ollama-setup.exe)
# 3. Open Command Prompt or PowerShell and run:

# Download the AI model (~4.7GB)
ollama pull llama3
```

**Note:** The first download takes 10-15 minutes depending on your internet speed.

---

## 🖥️ Backend Setup (Node.js)

```bash
# Navigate to backend folder
cd wanderai-backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# (Optional) Edit .env to customize settings
# Default Ollama URL: http://localhost:11434
# Default model: llama3

# Start the backend server
node server.js
```

**Backend will run on:** http://localhost:4000

---

## 🌐 Frontend Setup (Python Flask)

Open a **new terminal window/tab**:

```bash
# Navigate to frontend folder
cd wanderai

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# macOS/Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Start the Flask server
python app.py
```

**Frontend will run on:** http://localhost:5001

---

## ▶️ Run the Application

Once both servers are running:

1. Open your browser: http://localhost:5001
2. Click the **airplane icon** (bottom right) to open chat
3. Start chatting with WanderAI!

---

## 🛑 Stop the Application

### macOS

```bash
# Stop Ollama
brew services stop ollama

# Or kill the process
lsof -ti:4000 | xargs kill -9
lsof -ti:5001 | xargs kill -9
```

### Windows

```powershell
# Stop servers (in their respective terminals, press Ctrl+C)

# Or kill processes
Get-Process -Name node | Stop-Process
Get-Process -Name python | Stop-Process
```

---

## 🔄 Restart After Changes

```bash
# Kill existing processes
lsof -ti:4000 | xargs kill -9  # macOS
lsof -ti:5001 | xargs kill -9  # macOS

# Windows: Task Manager → End Task for node.exe and python.exe

# Restart backend
cd wanderai-backend && node server.js

# Restart frontend (new terminal)
cd wanderai && python app.py
```

---

## 🏗️ Project Structure

```
wanderai/
├── wanderai/                  # Frontend (Flask)
│   ├── app.py                 # Main Flask application
│   ├── static/                # CSS, JS, images
│   │   ├── script.js           # Frontend JavaScript
│   │   └── styles.css         # Styles
│   ├── templates/             # HTML templates
│   ├── data/                  # Destinations data (JSON)
│   └── requirements.txt       # Python dependencies
│
├── wanderai-backend/          # Backend (Node.js + AI)
│   ├── server.js              # Express server + Chat API
│   ├── databaseSetup.js       # Database initialization
│   ├── recommendationEngine.js  # Travel recommendations
│   ├── db.js                  # SQLite database
│   ├── routes/                # API routes
│   └── package.json           # Node dependencies
│
└── README.md                  # This file
```

---

## ⚙️ Environment Variables

Create `.env` file in `wanderai-backend/` folder:

```env
# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# JWT Secret (change in production)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Session Secret
SESSION_SECRET=your-session-secret

# Optional: Email notifications
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password
```

---

## 🔧 Troubleshooting

### Issue: "Ollama connection refused"

**Fix:** Ollama is not running

```bash
# macOS
brew services start ollama

# Windows
# Start Ollama from Start Menu, or:
ollama serve
```

### Issue: "Model not found"

**Fix:** Download the model

```bash
ollama pull llama3
```

### Issue: Port already in use

**Fix:** Kill existing processes

```bash
# macOS
lsof -ti:4000 | xargs kill -9
lsof -ti:5001 | xargs kill -9

# Windows
Get-Process -Name node | Stop-Process
Get-Process -Name python | Stop-Process
```

### Issue: Slow AI responses

**Fix:** Use a smaller model

```bash
# Download smaller model (~2GB instead of 4.7GB)
ollama pull llama3.2

# Update .env
OLLAMA_MODEL=llama3.2
```

### Issue: Chat not responding

**Check logs:**

```bash
# Backend logs
cd wanderai-backend && node server.js

# Browser console (F12 → Console tab)
```

---

## 🎨 Features

- **🤖 AI Chatbot:** Local AI powered by Ollama (Llama 3)
- **🗺️ Travel Planning:** Destination recommendations, itineraries, budgets
- **📅 Schedule Manager:** Plan daily activities
- **🔐 User Authentication:** JWT-based secure login
- **💾 Persistent Chat:** Chat history saved to database
- **🌐 Responsive Design:** Works on desktop and mobile

---

## 📝 API Endpoints

### Backend (Port 4000)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | AI chat endpoint |
| `/api/chat/reset` | POST | Clear chat history |
| `/api/auth/*` | POST | Authentication routes |
| `/api/trip` | POST | Save trip plans |
| `/api/trips` | GET | Get user's trips |

### Frontend (Port 5001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Homepage/Dashboard |
| `/api/chat` | POST | Proxy to backend |
| `/api/destinations` | GET | List destinations |

---

## 🛠️ Development Commands

```bash
# Install backend dependencies
cd wanderai-backend && npm install

# Install frontend dependencies
cd wanderai && pip install -r requirements.txt

# Run backend
cd wanderai-backend && node server.js

# Run frontend (new terminal)
cd wanderai && python app.py

# View database (SQLite)
cd wanderai-backend/data && sqlite3 wanderai-backend.db

# Check Ollama models
ollama list

# Remove Ollama model
ollama rm llama3
```

---

## 📦 Available Ollama Models

| Model | Size | Use Case |
|-------|------|----------|
| `llama3` | 4.7GB | General purpose, best quality |
| `llama3.2` | 2GB | Faster, lighter |
| `mistral` | 4.1GB | Good coding/technical tasks |
| `gemma2` | 2.6GB | Google's model |
| `phi4` | 2.8GB | Microsoft's model |

**Switch models:**

```bash
# Download new model
ollama pull mistral

# Update .env
OLLAMA_MODEL=mistral

# Restart backend
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- [Ollama](https://ollama.com/) - Local AI models
- [Meta Llama 3](https://llama.meta.com/) - Open-source LLM
- [Flask](https://flask.palletsprojects.com/) - Python web framework
- [Express.js](https://expressjs.com/) - Node.js web framework

---

## 📧 Support

For issues or questions, please open a GitHub issue or contact the maintainer.

**Happy travels! ✈️🌍**
