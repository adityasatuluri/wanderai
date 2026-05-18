const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5001'
}));

const API_KEY = process.env.OPENAI_API_KEY;

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are WanderAI, travel assistant. Recommend destinations, itineraries based on budget/goal (nature/adventure/relax). Friendly bullet points. Concise." },
          { role: "user", content: message }
        ],
        max_tokens: 600
      })
    });

    const data = await response.json();
    res.json({ reply: data.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "AI service error - check API key" });
  }
});

app.listen(4000, () => console.log("✅ WanderAI Backend running on http://localhost:4000"));

