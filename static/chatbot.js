const chatFeed = document.getElementById("chat-feed");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");

const STORAGE_KEY = "wanderai_chat_history";

// ---------- STORAGE ----------

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, chatFeed.innerHTML);
}

function loadHistory() {
  const history = localStorage.getItem(STORAGE_KEY);

  if (history) {
    chatFeed.innerHTML = history;

    scrollBottom();
  }
}

// ---------- SCROLL ----------

function scrollBottom() {
  chatFeed.scrollTo({
    top: chatFeed.scrollHeight,
    behavior: "smooth",
  });
}

// ---------- USER MESSAGE ----------

function addUserMessage(text) {
  const row = document.createElement("div");

  row.className = "chat-row user-row";

  row.innerHTML = `

    <div class="user-bubble">
      ${text}
    </div>

  `;

  chatFeed.appendChild(row);

  saveHistory();

  scrollBottom();
}

// ---------- LOADER ----------

function createLoader() {
  const row = document.createElement("div");

  row.className = "chat-row bot-row";

  row.innerHTML = `

    <div class="loader-shell">

      <div class="loader-line"></div>
      <div class="loader-line"></div>
      <div class="loader-line"></div>

    </div>

  `;

  chatFeed.appendChild(row);

  scrollBottom();

  return row;
}

// ---------- BOT RESPONSE ----------

function addBotResponse(loader, html) {
  loader.innerHTML = `

    <div class="bot-response-wrapper">
      ${html}
    </div>

  `;

  saveHistory();

  scrollBottom();
}

// ---------- ERROR ----------

function addError(loader) {
  loader.innerHTML = `

    <div class="empty-state">

      <div class="empty-title">
        Failed to generate itinerary
      </div>

      <div class="empty-subtitle">
        Please try again with another destination or budget.
      </div>

    </div>

  `;

  saveHistory();

  scrollBottom();
}

// ---------- API CALL ----------

async function sendMessage() {
  const text = chatInput.value.trim();

  if (!text) return;

  addUserMessage(text);

  chatInput.value = "";

  chatInput.style.height = "60px";

  const loader = createLoader();

  try {
    const response = await fetch("/api/ai-chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        message: text,
      }),
    });

    const data = await response.json();

    console.log(data);

    if (data.reply) {
      addBotResponse(loader, data.reply);
    } else {
      addError(loader);
    }
  } catch (error) {
    console.error(error);

    addError(loader);
  }
}

// ---------- EVENTS ----------

sendBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    sendMessage();
  }
});

// ---------- SUGGESTIONS ----------

const suggestionButtons = document.querySelectorAll(".suggestion-btn");

suggestionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    chatInput.value = btn.innerText.trim();

    chatInput.focus();
  });
});

// ---------- AUTO RESIZE ----------

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";

  chatInput.style.height = chatInput.scrollHeight + "px";
});

// ---------- CLEAR HISTORY ----------

function clearChatHistory() {
  localStorage.removeItem(STORAGE_KEY);

  chatFeed.innerHTML = "";
}

// ---------- OPTIONAL CLEAR BUTTON ----------

window.clearChatHistory = clearChatHistory;

// ---------- INITIALIZE ----------

loadHistory();

scrollBottom();
