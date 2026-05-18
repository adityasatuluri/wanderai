const express = require("express");
const session = require("express-session");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const DB = require("./db");
const run = DB.run;
const all = DB.all;
const { initializeDatabase } = require("./databaseSetup");
const { getRecommendations } = require("./recommendationEngine");

// Ollama configuration
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-secret",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.use(cors({
  origin: "http://localhost:5001",
  credentials: true
}));

app.use("/api/auth", require("./routes/auth"));

const systemPrompt = `You are WanderAI, a smart, conversational travel assistant.
You remember previous messages, avoid repeating yourself, and respond naturally like a human travel expert.
Always build on previous context.
Do not repeat identical answers.
If a similar question is asked, refine or expand the answer instead of repeating it.

Your job:
- Understand user intent (destination, days, budget, type)
- Generate customized travel plans (NOT generic answers)
- Respond differently for each question — NEVER give the same answer twice
- Remember user preferences (budget, travel goal, destination) mentioned earlier in the conversation
- Build on what was discussed previously — if the user asks a follow-up, acknowledge the earlier context

Rules:
1. If user asks for itinerary → generate a detailed day-wise plan with specific places, times, and costs
2. If user mentions location (e.g., Japan) → ONLY suggest places in that country
3. If user mentions budget → adjust recommendations accordingly
4. If user asks for "schedule" → generate time-based plan
5. NEVER repeat the same answer — always add new detail or a different angle
6. Be dynamic, specific, and realistic
7. If user mentions budget or travel goal, remember it for the rest of the conversation
8. Use a natural, friendly tone — like a knowledgeable friend, not a robot
9. Vary your response structure — don't always use the same format

Response Style:
- Use bullet points for lists
- Use day-wise format for itineraries
- Include specific place names, activities, and approximate costs
- Add personal touches ("I'd recommend...", "You'll love...", "A hidden gem is...")
- Suggest alternatives and off-the-beaten-path options when appropriate

Example:
Day 1: Tokyo – Start in Shibuya for the iconic crossing, then explore Shinjuku's golden gai for tiny bars. Budget: ~¥8,000
Day 2: Kyoto – Fushimi Inari at sunrise (free!), then Arashiyama bamboo grove. Budget: ~¥5,000

Always adapt based on user query and previous conversation context.`;

function getUserId(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  } catch {
    return null;
  }
}

function enhanceMessage(message, prefs) {
  let msg = message.toLowerCase();
  let enhanced = message;

  if (msg.includes("itinerary") || msg.includes("plan")) {
    enhanced += " (Generate a detailed day-wise itinerary)";
  }
  if (msg.includes("schedule")) {
    enhanced += " (Generate a time-based daily schedule)";
  }

  const budgetMatch = msg.match(/(\d[\d,]*)/g);
  if (budgetMatch) prefs.budget = budgetMatch[0];
  if (msg.includes("nature") || msg.includes("adventure") || msg.includes("relaxation") || msg.includes("sightseeing")) {
    prefs.goal = msg.match(/nature|adventure|relaxation|sightseeing/)[0];
  }

  const prefContext = [];
  if (prefs.budget) prefContext.push(`User's budget: ${prefs.budget}`);
  if (prefs.goal) prefContext.push(`User's travel goal: ${prefs.goal}`);
  if (prefContext.length) enhanced = `[${prefContext.join(", ")}] ` + enhanced;

  return enhanced;
}

function extractRecommendationInput(message, prefs = {}) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const budgetMatch = lower.match(/(\d[\d,]*)/);
  const daysMatch = lower.match(/(\d+)\s*[- ]?day/);
  const goalMatch = lower.match(/nature|adventure|relaxation|sightseeing|cultural|family|luxury|budget/);

  return {
    budget: budgetMatch ? parseInt(budgetMatch[1].replace(/,/g, ""), 10) : parseInt(prefs.budget || "3000", 10) || 3000,
    days: daysMatch ? parseInt(daysMatch[1], 10) : null,
    goal: goalMatch ? goalMatch[0] : prefs.goal || "nature",
    location: prefs.location || "",
    energy: 3,
    risk: "Moderate"
  };
}

function buildFallbackReply(message, prefs = {}) {
  const lower = message.toLowerCase();
  const location = prefs.location || "";
  const days = prefs.days || "";
  const budget = prefs.budget || "";
  const goal = prefs.goal || "";

  // Context-aware responses for specific destinations
  if (lower.includes("japan") || location.toLowerCase().includes("japan") || lower.includes("tokyo") || lower.includes("kyoto") || lower.includes("osaka")) {
    return `**Japan Travel Guide** 🇯🇵

**Top Destinations:**
• Tokyo - Shibuya Crossing, Shinjuku, Akihabara (electronics & anime)
• Kyoto - Fushimi Inari Shrine, Kinkaku-ji (Golden Pavilion), Arashiyama Bamboo Grove
• Osaka - Dotonbori street food, Osaka Castle, Universal Studios
• Hiroshima - Peace Memorial Park, Miyajima Island

**Best Time to Visit:** March-April (cherry blossoms) or October-November (autumn colors)

**Budget:** $100-200/day for mid-range travel

**Sample 7-Day Itinerary:**
Day 1: Tokyo - Shibuya & Harajuku
Day 2: Tokyo - Asakusa & Ueno Park
Day 3: Kyoto - Temples & Gion district
Day 4: Kyoto - Arashiyama & Nara day trip
Day 5: Osaka - Food tour & Dotonbori
Day 6: Hiroshima & Miyajima
Day 7: Return to Tokyo for shopping

Would you like more details on any specific city or activity?`;
  }

  if (lower.includes("bali") || location.toLowerCase().includes("bali") || lower.includes("indonesia")) {
    return `**Bali Travel Guide** 🏝️

**Must-Visit Areas:**
• Ubud - Rice terraces (Tegallalang), Monkey Forest, yoga retreats
• Seminyak - Beaches, luxury resorts, nightlife, beach clubs
• Uluwatu - Cliff temples, Kecak dance at sunset, surfing
• Nusa Penida - Kelingking Beach, Angel's Billabong, snorkeling
• Canggu - Digital nomad hub, surf beaches, cafes

**Food to Try:**
• Nasi Goreng (fried rice) - try at Warung Babi Guling Ibu Oka
• Mie Goreng (fried noodles) - street food staple
• Babi Guling (suckling pig) - Balinese specialty
• Sate Lilit (minced seafood satay)
• Bebek Betutu (slow-cooked duck)

**Budget:** $50-100/day for mid-range travel

**Sample 5-Day Itinerary:**
Day 1: Ubud - Monkey Forest & rice terraces
Day 2: Ubud - Tegenungan Waterfall & yoga
Day 3: Seminyak - beach day & sunset
Day 4: Nusa Penida day trip
Day 5: Uluwatu - temple & Kecak dance

Want recommendations for specific activities or accommodation?`;
  }

  if (lower.includes("italy") || location.toLowerCase().includes("italy") || lower.includes("rome") || lower.includes("venice") || lower.includes("florence")) {
    return `**Italy Travel Guide** 🇮🇹

**Classic Route (10-14 days):**
• Rome (3-4 days) - Colosseum, Vatican City, Trevi Fountain, Pantheon
• Florence (2-3 days) - Uffizi Gallery, Duomo, Ponte Vecchio, Tuscany wine tasting
• Venice (2 days) - St. Mark's Square, Doge's Palace, gondola ride, Burano
• Amalfi Coast (2-3 days) - Positano, Pompeii, Capri boat tour
• Milan (1-2 days) - Duomo, Last Supper, shopping

**Must-Try Foods:**
• Pizza Margherita in Naples (birthplace of pizza)
• Carbonara in Rome (authentic with guanciale, not bacon)
• Gelato - try multiple flavors daily!
• Aperol Spritz - Italy's signature cocktail
• Fresh pasta (tagliatelle, pappardelle, orecchiette)

**Budget:** €100-150/day ($110-160) for mid-range travel

**Tips:**
• Book museum tickets in advance (skip-the-line saves hours)
• Eat where locals eat (avoid tourist traps near major sights)
• Trains connect cities efficiently (Trenitalia)
• September-October is ideal weather-wise

Would you like a detailed day-by-day itinerary?`;
  }

  if (lower.includes("france") || location.toLowerCase().includes("france") || lower.includes("paris")) {
    return `**France Travel Guide** 🇫🇷

**Paris Essentials (3-4 days):**
• Eiffel Tower - book ahead, go at sunset
• Louvre Museum - Mona Lisa, Venus de Milo (get tickets online)
• Montmartre & Sacré-Cœur - artistic quarter with city views
• Notre-Dame - exterior (under restoration)
• Champs-Élysées & Arc de Triomphe
• Seine River cruise - evening departure for lights

**Beyond Paris:**
• Nice & French Riviera - beaches, promenade des Anglais
• Lyon - gastronomy capital, bouchons (traditional restaurants)
• Provence - lavender fields (July), hilltop villages
• Loire Valley - châteaux (Chambord, Chenonceau)
• Bordeaux - wine country tours

**Food to Try:**
• Croissants & café au lait (breakfast ritual)
• Crêpes (street food)
• Escargots (if adventurous)
• Coq au vin, boeuf bourguignon (classic dishes)
• Macarons from Pierre Hermé or Ladurée

**Budget:** €100-180/day ($110-195) depending on city

**Best Time:** April-June or September-October (avoid August when locals are on holiday)

Interested in wine tours or specific regions?`;
  }

  if (lower.includes("budget") || lower.includes("cheap") || lower.includes("save money")) {
    return `**Budget Travel Tips** 💰

**Save Money On Flights:**
• Use incognito mode when searching
• Be flexible with dates (Tuesday/Wednesday cheapest)
• Book 6-8 weeks in advance for domestic, 2-3 months for international
• Consider budget airlines (Ryanair, EasyJet, Southwest)
• Set price alerts on Google Flights or Skyscanner

**Accommodation Hacks:**
• Hostels - $20-40/night, meet other travelers
• Airbnb - often cheaper than hotels for groups
• House sitting - free accommodation in exchange for pet/plant care
• Couchsurfing - stay with locals for free
• Camping - $10-25/night in Europe/North America

**Food Savings:**
• Eat street food and local markets
• Picnic lunches from grocery stores
• Cook some meals (hostels have kitchens)
• Lunch specials at restaurants (cheaper than dinner)
• Avoid restaurants near major tourist attractions

**Transport:**
• Public transit over taxis/Uber
• Walk when possible (free exercise + sightseeing)
• City tourist cards (include transport + attractions)
• Overnight trains/buses (save on accommodation)

**Free Activities:**
• Walking tours (tip-based, not free)
• Museum free days (check schedules)
• Parks and beaches
• Free city walking tours (many cities offer them)
• Window shopping in unique neighborhoods

**Money-Saving Apps:**
• Hostelworld, Booking.com (accommodation)
• Skyscanner, Google Flights (flights)
• Rome2Rio (route planning)
• Maps.me (offline maps)

What's your destination and budget range? I can give specific tips!`;
  }

  if (lower.includes("itinerary") || lower.includes("plan") || lower.includes("schedule")) {
    const dest = location || "your destination";
    const d = days || "your trip duration";
    const b = budget ? `$${budget}` : "your budget";
    return `**Creating Your Travel Itinerary** 📅

Here's how I can help plan your trip to **${dest}**:

**Information I Need:**
• Exact destination(s) you want to visit
• Number of days you have (${d} - good!)
• Your budget (${b} - noted!)
• Your interests (food, culture, adventure, relaxation, nightlife, nature)
• Travel style (fast-paced vs. relaxed)

**Sample Itinerary Structure:**
• Day 1: Arrival & orientation
• Days 2-3: Main attractions
• Day 4: Day trip to nearby location
• Day 5: Local experiences & hidden gems
• Final day: Shopping, last-minute sights, departure

**Planning Tips:**
• Don't over-schedule (2-3 major activities per day max)
• Leave buffer time for discoveries
• Book must-do attractions in advance
• Group nearby activities to minimize travel time
• Include rest days (especially for longer trips)

**Tell me:**
1. Which specific cities/attractions interest you most?
2. What type of experiences do you want? (cultural sites, food tours, outdoor adventures, nightlife, relaxation)
3. Any specific must-see items on your list?

I'll create a detailed day-by-day plan tailored to your preferences!`;
  }

  // Generic but helpful response with context
  const locationText = location ? `I see you're interested in **${location}**. ` : "";
  const budgetText = budget ? `With a budget of **$${budget}**, ` : "";
  const daysText = days ? `for **${days} days**, ` : "";
  const goalText = goal ? `focusing on **${goal} experiences**. ` : "";

  return `I'd love to help you plan your trip! ${locationText}${budgetText}${daysText}${goalText}

**To give you the best recommendations, tell me:**
• Which specific destination(s) you want to visit?
• What type of experiences interest you? (food, culture, adventure, relaxation, nightlife, nature)
• Any must-see attractions on your list?

**I can help with:**
• 🗺️ Detailed day-by-day itineraries
• 🍜 Food and restaurant recommendations
• 🏨 Accommodation suggestions
• 💰 Budget breakdown and money-saving tips
• 🚗 Transportation options between cities

**Popular destinations I can help with:**
• Japan (Tokyo, Kyoto, Osaka)
• Italy (Rome, Florence, Venice, Amalfi)
• France (Paris, Nice, Provence)
• Bali (Ubud, Seminyak, Uluwatu)
• Thailand (Bangkok, Chiang Mai, Phuket)
• And many more!

Just ask about any destination or type of trip!`;
}

// PART 4: SAVE CHAT HISTORY
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, context, history } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message required" });

    const userId = getUserId(req); // optional — null for guests

    if (!req.session.chatHistory) req.session.chatHistory = [];
    if (!req.session.userPrefs) req.session.userPrefs = {};

    // Update user preferences from context
    if (context) {
      if (context.country) req.session.userPrefs.location = context.country;
      if (context.budget) req.session.userPrefs.budget = String(context.budget);
      if (context.days) req.session.userPrefs.days = String(context.days);
      if (context.intent) req.session.userPrefs.intent = context.intent;
    }

    const enhancedMessage = enhanceMessage(message, req.session.userPrefs);

    // Build messages array: prefer frontend history (authoritative) over session history
    let chatHistory = [];
    if (history && Array.isArray(history) && history.length > 0) {
      // Use frontend-provided history (deduplicated, last 20)
      chatHistory = history.slice(-20).filter(m =>
        m.role && m.content && typeof m.content === "string"
      );
    } else {
      // Fallback to session history
      chatHistory = req.session.chatHistory.slice(-20);
    }

    // Build context summary for the system prompt
    const contextLines = [];
    if (req.session.userPrefs.location) contextLines.push(`- Destination: ${req.session.userPrefs.location}`);
    if (req.session.userPrefs.days) contextLines.push(`- Duration: ${req.session.userPrefs.days} days`);
    if (req.session.userPrefs.budget) contextLines.push(`- Budget: $${req.session.userPrefs.budget}`);
    if (req.session.userPrefs.intent) contextLines.push(`- Focus: ${req.session.userPrefs.intent}`);
    if (req.session.userPrefs.goal) contextLines.push(`- Travel goal: ${req.session.userPrefs.goal}`);

    const contextBlock = contextLines.length > 0
      ? `\n\nCurrent conversation context:\n${contextLines.join("\n")}`
      : "";

    const messages = [
      { role: "system", content: systemPrompt + contextBlock },
      ...chatHistory,
      { role: "system", content: "IMPORTANT: Do not repeat previous answers. Always generate a NEW, unique response. If the user asks something similar, expand or refine your previous answer with new details, different places, or a fresh perspective." },
      { role: "user", content: enhancedMessage }
    ];

    console.log(`[Chat] Session: ${sessionId || "none"}, Messages: ${messages.length}, User: ${userId || "guest"}`);

    // Use Ollama API instead of OpenAI
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: 0.85,
          num_predict: 1000
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.status}`);
    }

    const ollamaData = await ollamaResponse.json();
    const reply = ollamaData.message?.content || "I couldn't generate a response. Please try again.";

    // Update session history
    req.session.chatHistory.push({ role: "user", content: message });
    req.session.chatHistory.push({ role: "assistant", content: reply });
    if (req.session.chatHistory.length > 20) {
      req.session.chatHistory = req.session.chatHistory.slice(-20);
    }

    // Save chat history only for logged-in users
    if (userId) {
      await run(
        `INSERT INTO chat_history (user_id, message, reply) VALUES (?, ?, ?)`,
        [userId, message, reply]
      );
      await run(
        `INSERT INTO recommendations (user_id, location, suggestion) VALUES (?, ?, ?)`,
        [userId, req.session.userPrefs?.location || "General", reply]
      );
    }

    // Build updated context to return
    const updatedContext = {
      country: req.session.userPrefs.location || null,
      days: req.session.userPrefs.days ? parseInt(req.session.userPrefs.days) : null,
      budget: req.session.userPrefs.budget ? parseInt(req.session.userPrefs.budget) : null,
      intent: req.session.userPrefs.intent || null
    };

    console.log(`[Chat] Response sent, reply length: ${reply.length}`);

    res.json({
      reply,
      preferences: req.session.userPrefs,
      updatedContext,
      sessionId: sessionId || req.sessionID
    });
  } catch (error) {
    console.error("[Chat] Error:", error.message);
    const fallbackReply = buildFallbackReply(req.body?.message, req.session?.userPrefs || {});

    if (req.session?.chatHistory) {
      req.session.chatHistory.push({ role: "user", content: req.body?.message || "" });
      req.session.chatHistory.push({ role: "assistant", content: fallbackReply });
      if (req.session.chatHistory.length > 20) {
        req.session.chatHistory = req.session.chatHistory.slice(-20);
      }
    }

    const uid = getUserId(req);
    if (req.body?.message && uid) {
      try {
        await run(
          `INSERT INTO chat_history (user_id, message, reply) VALUES (?, ?, ?)`,
          [uid, req.body.message, fallbackReply]
        );
      } catch (dbError) {
        console.error("Fallback chat save error:", dbError);
      }
    }

    res.json({
      reply: fallbackReply,
      preferences: req.session?.userPrefs || {},
      updatedContext: {
        country: req.session?.userPrefs?.location || null,
        budget: req.session?.userPrefs?.budget ? parseInt(req.session.userPrefs.budget) : null,
        intent: req.session?.userPrefs?.intent || null
      },
      fallback: true
    });
  }
});

app.post("/api/chat/reset", (req, res) => {
  req.session.chatHistory = [];
  req.session.userPrefs = {};
  res.json({ message: "Session chat cleared (history in DB)" });
});

// PART 5: LOAD CHAT HISTORY
app.get("/api/chat/history", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const rows = await all(
      `SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// PART 6: SAVE TRIP DATA
app.post("/api/trip", async (req, res) => {
  try {
    const { location, destination_slug, budget, days } = req.body;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const result = await run(
      `INSERT INTO trips (user_id, location, destination_slug, budget, days) VALUES (?, ?, ?, ?, ?)`,
      [userId, location, destination_slug || null, budget, days]
    );
    res.json({ tripId: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// PART 7: SAVE ITINERARY
app.post("/api/itinerary", async (req, res) => {
  try {
    const { trip_id, day, activity } = req.body;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    await run(
      `INSERT INTO itinerary (trip_id, day, activity) VALUES (?, ?, ?)`,
      [trip_id, day, activity]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// PART 8: GET ITINERARY BY TRIP ID OR DESTINATION
app.get("/api/itinerary/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    // Check if identifier is a trip_id (number) or destination_slug (string)
    const tripId = parseInt(identifier);
    let rows;
    
    if (!isNaN(tripId)) {
      // Fetch by trip_id
      rows = await all(
        `SELECT * FROM itinerary WHERE trip_id = ? ORDER BY day ASC`,
        [tripId]
      );
    } else {
      // Fetch by destination_slug through trips table
      rows = await all(
        `SELECT i.* FROM itinerary i
         JOIN trips t ON i.trip_id = t.id
         WHERE t.location LIKE ? AND t.user_id = ?
         ORDER BY i.day ASC`,
        [`%${identifier}%`, userId]
      );
    }
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// PART 9: GET USER TRIPS
app.get("/api/trips", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const rows = await all(
      `SELECT * FROM trips WHERE user_id = ?`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// GET /api/recommend              → all destinations
// POST /api/recommend              → scored recommendations
// GET /api/recommend/goals         → all goal → activity mappings
// GET /api/recommend/goal/:goal    → activities for a specific goal
// GET /api/recommend/budget/:amt   → destinations filtered by budget tier
app.use("/api/recommend", (req, res) => {
  const {
    getRecommendations,
    getActivitiesForGoal,
    filterByBudgetTier,
    getBudgetTier,
    GOAL_MAPPING,
    DESTINATIONS
  } = require("./recommendationEngine");

  const url = req.url.replace(/^\//, ""); // strip leading slash

  // GET /api/recommend/goals
  if (req.method === "GET" && url === "goals") {
    return res.json({ goalMapping: GOAL_MAPPING });
  }

  // GET /api/recommend/goal/:goal
  if (req.method === "GET" && url.startsWith("goal/")) {
    const goal = url.split("/")[1];
    return res.json({ goal, activities: getActivitiesForGoal(goal) });
  }

  // GET /api/recommend/budget/:amount
  if (req.method === "GET" && url.startsWith("budget/")) {
    const budget = parseInt(url.split("/")[1], 10);
    return res.json({
      budget,
      tier: getBudgetTier(budget),
      destinations: filterByBudgetTier(budget)
    });
  }

  // POST /api/recommend  → scored recommendations
  if (req.method === "POST") {
    return res.json({ success: true, data: getRecommendations(req.body) });
  }

  // GET /api/recommend  → all destinations
  res.json({ destinations: DESTINATIONS });
});

const PORT = process.env.PORT || 4000;
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log("  POST /api/chat          - Persistent chat");
      console.log("  GET  /api/chat/history  - Load chat history");
      console.log("  POST /api/trip          - Save trip");
      console.log("  GET  /api/trips         - Get trips");
      console.log("  POST /api/itinerary     - Save itinerary");
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
