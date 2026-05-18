const IMAGE_VERSION = "20260403";
const API_BASE_URL = window.location.origin;

function withImageVersion(path) {
    return `${path}?v=${IMAGE_VERSION}`;
}

function apiUrl(path) {
    return new URL(path, API_BASE_URL).toString();
}

// ─── AUTH HELPERS ───────────────────────────────────────────────────────────
function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem("token");
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    const errors = [];
    if (password.length < 8) {
        errors.push("at least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("1 uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("1 lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("1 number");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push("1 special character");
    }
    return errors;
}

async function fetchWithAuth(url, options = {}) {
    const headers = getAuthHeaders();
    if (options.headers) {
        Object.assign(headers, options.headers);
    }
    return fetch(url, { ...options, headers });
}

function setLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = "Loading...";
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENDA/SCHEDULE SYSTEM - PRODUCTION-READY REFACTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Centralized state for the agenda/schedule system.
 * NEVER access this directly from outside - use the exported functions.
 */
const agendaState = {
    selectedDate: null,      // YYYY-MM-DD format
    schedules: [],           // Array of schedule objects
    loading: false,          // Loading state
    editingId: null,         // ID of schedule being edited (null = create mode)
    initialized: false       // Whether initAgendaSystem() has run
};

/**
 * Debug helper - logs current state
 */
function logAgendaState(action) {
    console.log(`[Agenda] ${action}:`, {
        selectedDate: agendaState.selectedDate,
        schedulesCount: agendaState.schedules.length,
        loading: agendaState.loading,
        editingId: agendaState.editingId
    });
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayISO() {
    return new Date().toISOString().split("T")[0];
}

/**
 * Convert day name (Su, Mo, Tu...) to ISO date for current week
 */
function dayNameToISO(dayName) {
    const dayMap = { "Su": 0, "Mo": 1, "Tu": 2, "We": 3, "Th": 4, "Fr": 5, "Sa": 6 };
    const targetDay = dayMap[dayName];
    if (targetDay === undefined) return getTodayISO();

    const today = new Date();
    const currentDay = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDay);

    const targetDate = new Date(startOfWeek);
    targetDate.setDate(startOfWeek.getDate() + targetDay);
    return targetDate.toISOString().split("T")[0];
}

/**
 * Format ISO date to display (e.g., "Apr 27")
 */
function formatDisplayDate(isoDate) {
    const date = new Date(isoDate + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ────────────────────────────────────────────────────────────────────────────

// ─── GOAL MAPPING SYSTEM ────────────────────────────────────────────────────
// Maps user goal choice → related activity/tag keywords
const GOAL_MAPPING = {
    adventure:   ["hiking", "trekking", "mountains", "sports", "outdoor", "wildlife"],
    relaxation:  ["beach", "park", "spa", "resort", "wellness", "leisure"],
    nature:      ["forest", "lake", "wildlife", "park", "outdoor", "scenic"],
    sightseeing: ["museum", "landmark", "city", "history", "culture", "food"],
};

function selectGoal(goalValue) {
    localStorage.setItem("goal", goalValue.toLowerCase());
}

function getUserGoal() {
    return localStorage.getItem("goal") || localStorage.getItem("wanderai-goal") || "";
}

function getGoalActivities(goalValue) {
    return GOAL_MAPPING[goalValue.toLowerCase()] || GOAL_MAPPING.nature;
}
// ────────────────────────────────────────────────────────────────────────────

// ─── USER HISTORY ───────────────────────────────────────────────────────────
function recordView(destinationId) {
    const history = readJson("wanderai-history", []);
    if (!history.includes(destinationId)) {
        history.unshift(destinationId);
        writeJson("wanderai-history", history.slice(0, 20));
    }
}

function getViewHistory() {
    return readJson("wanderai-history", []);
}
// ────────────────────────────────────────────────────────────────────────────

let destinations = [
    // 🌍 LONDON (10)
    { id: "hyde-park", name: "Hyde Park", location: "London, United Kingdom", best: "Best: Apr-Sep", risk: "Low", status: "green", category: "Nature", energy: 2, price: 900, tags: ["park", "relaxation", "nature", "scenic", "outdoor"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/hyde-park" },
    { id: "london-eye", name: "London Eye", location: "London, United Kingdom", best: "Best: Mar-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 1, price: 700, tags: ["sightseeing", "landmark", "city", "scenic"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/london-eye" },
    { id: "tower-bridge", name: "Tower Bridge", location: "London, United Kingdom", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 600, tags: ["sightseeing", "landmark", "history", "city"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/tower-bridge" },
    { id: "buckingham-palace", name: "Buckingham Palace", location: "London, United Kingdom", best: "Best: Jun-Sep", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 800, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/buckingham-palace" },
    { id: "british-museum", name: "British Museum", location: "London, United Kingdom", best: "Best: Year-round", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 400, tags: ["museum", "culture", "history", "sightseeing"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/british-museum" },
    { id: "camden-market", name: "Camden Market", location: "London, United Kingdom", best: "Best: Year-round", risk: "Low", status: "green", category: "Adventure", energy: 3, price: 300, tags: ["city", "food", "culture", "outdoor"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/camden-market" },
    { id: "thames-cruise", name: "Thames River Cruise", location: "London, United Kingdom", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 1, price: 900, tags: ["relaxation", "scenic", "leisure", "sightseeing"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/thames-cruise" },
    { id: "big-ben", name: "Big Ben", location: "London, United Kingdom", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 1, price: 500, tags: ["landmark", "sightseeing", "history", "city"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/big-ben" },
    { id: "soho-streets", name: "Soho Streets", location: "London, United Kingdom", best: "Best: Year-round", risk: "Low", status: "green", category: "Sightseeing", energy: 3, price: 700, tags: ["city", "food", "culture", "sightseeing"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/soho-streets" },
    { id: "greenwich-park", name: "Greenwich Park", location: "London, United Kingdom", best: "Best: Apr-Sep", risk: "Low", status: "green", category: "Nature", energy: 2, price: 400, tags: ["park", "nature", "scenic", "outdoor"], image: withImageVersion("/static/images/hyde-park.jpg"), href: "/destination/greenwich-park" },

    // 🌴 BALI (10)
    { id: "kuta-beach", name: "Kuta Beach", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 1, price: 1200, tags: ["beach", "relaxation", "resort", "leisure"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/kuta-beach" },
    { id: "ubud-forest", name: "Ubud Forest", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Nature", energy: 3, price: 1100, tags: ["nature", "forest", "wildlife", "outdoor"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/ubud-forest" },
    { id: "tanah-lot", name: "Tanah Lot Temple", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1300, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/tanah-lot" },
    { id: "seminyak-beach", name: "Seminyak Beach", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 1, price: 1400, tags: ["beach", "relaxation", "resort", "spa"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/seminyak-beach" },
    { id: "mount-batur", name: "Mount Batur Trek", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Moderate", status: "orange", category: "Adventure", energy: 5, price: 1500, tags: ["adventure", "hiking", "trekking", "mountains"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/mount-batur" },
    { id: "tegallalang", name: "Tegallalang Rice Terrace", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Nature", energy: 2, price: 1000, tags: ["nature", "scenic", "outdoor", "park"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/tegallalang" },
    { id: "nusa-penida", name: "Nusa Penida", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Moderate", status: "orange", category: "Adventure", energy: 4, price: 1600, tags: ["adventure", "outdoor", "scenic", "hiking"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/nusa-penida" },
    { id: "uluwatu", name: "Uluwatu Temple", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1200, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/uluwatu" },
    { id: "bali-swing", name: "Bali Swing", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Adventure", energy: 3, price: 1300, tags: ["adventure", "outdoor", "scenic", "nature"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/bali-swing" },
    { id: "bali", name: "Bali", location: "Bali, Indonesia", best: "Best: Apr-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 2, price: 1900, tags: ["beach", "relaxation", "spa", "wellness", "resort", "nature"], image: withImageVersion("/static/images/bali.jpg"), href: "/destination/bali" },

    // 🇬🇷 SANTORINI (5)
    { id: "oia-sunset", name: "Oia Sunset", location: "Santorini, Greece", best: "Best: May-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 1, price: 1500, tags: ["relaxation", "scenic", "leisure", "beach"], image: withImageVersion("/static/images/santorini.jpg"), href: "/destination/oia-sunset" },
    { id: "fira-town", name: "Fira Town", location: "Santorini, Greece", best: "Best: May-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1400, tags: ["sightseeing", "city", "culture", "landmark"], image: withImageVersion("/static/images/santorini.jpg"), href: "/destination/fira-town" },
    { id: "red-beach", name: "Red Beach", location: "Santorini, Greece", best: "Best: May-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 2, price: 1300, tags: ["beach", "relaxation", "scenic", "outdoor"], image: withImageVersion("/static/images/santorini.jpg"), href: "/destination/red-beach" },
    { id: "akrotiri", name: "Akrotiri Ruins", location: "Santorini, Greece", best: "Best: May-Oct", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1200, tags: ["history", "culture", "landmark", "sightseeing"], image: withImageVersion("/static/images/santorini.jpg"), href: "/destination/akrotiri" },
    { id: "santorini", name: "Santorini", location: "Santorini, Greece", best: "Best: May-Oct", risk: "Low", status: "green", category: "Relaxation", energy: 1, price: 3200, tags: ["beach", "relaxation", "resort", "scenic", "leisure"], image: withImageVersion("/static/images/santorini.jpg"), href: "/destination/santorini" },

    // 🇯🇵 KYOTO (5)
    { id: "fushimi-inari", name: "Fushimi Inari Shrine", location: "Kyoto, Japan", best: "Best: Mar-May", risk: "Low", status: "green", category: "Sightseeing", energy: 3, price: 1300, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/kyoto.jpg"), href: "/destination/fushimi-inari" },
    { id: "arashiyama", name: "Arashiyama Bamboo Grove", location: "Kyoto, Japan", best: "Best: Mar-May", risk: "Low", status: "green", category: "Nature", energy: 2, price: 1200, tags: ["nature", "forest", "scenic", "outdoor"], image: withImageVersion("/static/images/kyoto.jpg"), href: "/destination/arashiyama" },
    { id: "kinkakuji", name: "Kinkaku-ji Temple", location: "Kyoto, Japan", best: "Best: Mar-May", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1100, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/kyoto.jpg"), href: "/destination/kinkakuji" },
    { id: "gion-district", name: "Gion District", location: "Kyoto, Japan", best: "Best: Mar-May", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 1000, tags: ["culture", "history", "city", "food"], image: withImageVersion("/static/images/kyoto.jpg"), href: "/destination/gion-district" },
    { id: "kyoto", name: "Kyoto", location: "Kyoto, Japan", best: "Best: Mar-May", risk: "Low", status: "green", category: "Sightseeing", energy: 3, price: 2600, tags: ["culture", "sightseeing", "history", "landmark", "food"], image: withImageVersion("/static/images/kyoto.jpg"), href: "/destination/kyoto" },

    // 🌲 BANFF (5)
    { id: "banff", name: "Banff", location: "Banff, Canada", best: "Best: Jun-Sep", risk: "Moderate", status: "orange", category: "Nature", energy: 4, price: 3000, tags: ["nature", "outdoor", "hiking", "wildlife", "scenic", "mountains"], image: withImageVersion("/static/images/banff.jpg"), href: "/destination/banff" },
    { id: "lake-louise", name: "Lake Louise", location: "Banff, Canada", best: "Best: Jun-Sep", risk: "Low", status: "green", category: "Nature", energy: 2, price: 2800, tags: ["nature", "scenic", "lake", "outdoor", "mountains"], image: withImageVersion("/static/images/banff.jpg"), href: "/destination/lake-louise" },
    { id: "banff-gondola", name: "Banff Gondola", location: "Banff, Canada", best: "Best: May-Oct", risk: "Low", status: "green", category: "Adventure", energy: 2, price: 2600, tags: ["adventure", "scenic", "mountains", "outdoor"], image: withImageVersion("/static/images/banff.jpg"), href: "/destination/banff-gondola" },
    { id: "johnston-canyon", name: "Johnston Canyon", location: "Banff, Canada", best: "Best: Jun-Sep", risk: "Moderate", status: "orange", category: "Nature", energy: 3, price: 2400, tags: ["hiking", "nature", "outdoor", "scenic", "wildlife"], image: withImageVersion("/static/images/banff.jpg"), href: "/destination/johnston-canyon" },
    { id: "moraine-lake", name: "Moraine Lake", location: "Banff, Canada", best: "Best: Jun-Sep", risk: "Low", status: "green", category: "Nature", energy: 3, price: 2700, tags: ["nature", "scenic", "lake", "hiking", "mountains"], image: withImageVersion("/static/images/banff.jpg"), href: "/destination/moraine-lake" },

    // 🇮🇹 ROME (5)
    { id: "rome", name: "Rome", location: "Rome, Italy", best: "Best: Apr-Jun", risk: "Low", status: "green", category: "Sightseeing", energy: 3, price: 2400, tags: ["history", "culture", "sightseeing", "landmark", "food", "city"], image: withImageVersion("/static/images/rome.jpg"), href: "/destination/rome" },
    { id: "colosseum", name: "Colosseum", location: "Rome, Italy", best: "Best: Apr-Jun", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 2200, tags: ["history", "landmark", "culture", "sightseeing"], image: withImageVersion("/static/images/rome.jpg"), href: "/destination/colosseum" },
    { id: "vatican-city", name: "Vatican City", location: "Rome, Italy", best: "Best: Apr-Jun", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 2300, tags: ["culture", "history", "landmark", "sightseeing"], image: withImageVersion("/static/images/rome.jpg"), href: "/destination/vatican-city" },
    { id: "trevi-fountain", name: "Trevi Fountain", location: "Rome, Italy", best: "Best: Apr-Jun", risk: "Low", status: "green", category: "Sightseeing", energy: 1, price: 2000, tags: ["landmark", "sightseeing", "city", "scenic"], image: withImageVersion("/static/images/rome.jpg"), href: "/destination/trevi-fountain" },
    { id: "borghese-gallery", name: "Borghese Gallery", location: "Rome, Italy", best: "Best: Apr-Jun", risk: "Low", status: "green", category: "Sightseeing", energy: 2, price: 2100, tags: ["culture", "museum", "history", "sightseeing"], image: withImageVersion("/static/images/rome.jpg"), href: "/destination/borghese-gallery" },

    // 🌎 OTHER DESTINATIONS
    { id: "cliffs-of-moher", name: "Cliffs of Moher", location: "County Clare, Ireland", best: "Best: May-Sep", risk: "Moderate", status: "orange", category: "Adventure", energy: 3, price: 2100, tags: ["nature", "adventure", "hiking", "scenic", "outdoor"], image: withImageVersion("/static/images/cliffs-of-moher.jpg"), href: "/destination/cliffs-of-moher" },
    { id: "machu-picchu", name: "Machu Picchu", location: "Cusco Region, Peru", best: "Best: Apr-Oct", risk: "Moderate", status: "orange", category: "Adventure", energy: 5, price: 3600, tags: ["adventure", "hiking", "trekking", "mountains", "history"], image: withImageVersion("/static/images/machu-picchu.jpg"), href: "/destination/machu-picchu" },
    { id: "new-york-city", name: "New York City", location: "New York, USA", best: "Best: Apr-Jun", risk: "Moderate", status: "orange", category: "Sightseeing", energy: 4, price: 3100, tags: ["city", "sightseeing", "culture", "museum", "landmark", "food"], image: withImageVersion("/static/images/new-york-city.jpg"), href: "/destination/new-york-city" },
    { id: "cape-town", name: "Cape Town", location: "Cape Town, South Africa", best: "Best: Nov-Mar", risk: "Moderate", status: "orange", category: "Sightseeing", energy: 3, price: 2800, tags: ["city", "sightseeing", "scenic", "outdoor", "food"], image: withImageVersion("/static/images/cape-town.jpg"), href: "/destination/cape-town" },
    { id: "reykjavik", name: "Reykjavik", location: "Reykjavik, Iceland", best: "Best: Jun-Aug", risk: "Low", status: "green", category: "Adventure", energy: 4, price: 3400, tags: ["adventure", "nature", "outdoor", "scenic", "wildlife", "mountains"], image: withImageVersion("/static/images/reykjavik.jpg"), href: "/destination/reykjavik" },
];

// ─── RECOMMENDATION ENGINE ───────────────────────────────────────────────────
// Basic filter: budget + goal match
function getRecommendations() {
    const budget = parseInt(localStorage.getItem("budget")) || 5000;
    const userGoal = getUserGoal();
    const relatedActivities = getGoalActivities(userGoal);

    const results = destinations.filter((place) => {
        const matchBudget = (place.price || 0) <= budget;
        const matchGoal = place.tags.some(
            (tag) => relatedActivities.includes(tag) || tag === userGoal
        );
        return matchBudget && matchGoal;
    });

    return results.length ? results : destinations;
}

// Smart scored recommendations (top 5)
function getSmartRecommendations() {
    const budget = parseInt(localStorage.getItem("budget")) || 5000;
    const userGoal = getUserGoal();
    const relatedActivities = getGoalActivities(userGoal);
    const history = getViewHistory();

    return destinations
        .map((place) => {
            let score = 0;

            // Budget match
            if ((place.price || 0) <= budget) score += 2;

            // Direct goal category match
            if (place.category.toLowerCase() === userGoal) score += 3;

            // Tag matches goal keyword
            if (place.tags.includes(userGoal)) score += 3;

            // Activity/tag overlap with goal mapping
            if (place.tags.some((tag) => relatedActivities.includes(tag))) score += 2;

            // Boost previously viewed (user history learning)
            if (history.includes(place.id)) score += 1;

            // Prefer low risk
            if (place.risk === "Low") score += 1;

            return { ...place, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}
// ────────────────────────────────────────────────────────────────────────────

let savedIds = [];
let goal = "";
let authMode = "login";

function readJson(key, fallback) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (_error) {
        return fallback;
    }
}

function getCurrentUser() {
    return readJson("user", null);
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getLocalImageForSlug(slug) {
    const images = {
        "hyde-park": withImageVersion("/static/images/hyde-park.jpg"),
        "london-eye": withImageVersion("/static/images/hyde-park.jpg"),
        "tower-bridge": withImageVersion("/static/images/hyde-park.jpg"),
        "buckingham-palace": withImageVersion("/static/images/hyde-park.jpg"),
        "british-museum": withImageVersion("/static/images/hyde-park.jpg"),
        "camden-market": withImageVersion("/static/images/hyde-park.jpg"),
        "thames-cruise": withImageVersion("/static/images/hyde-park.jpg"),
        "big-ben": withImageVersion("/static/images/hyde-park.jpg"),
        "soho-streets": withImageVersion("/static/images/hyde-park.jpg"),
        "greenwich-park": withImageVersion("/static/images/hyde-park.jpg"),
        "kuta-beach": withImageVersion("/static/images/bali.jpg"),
        "ubud-forest": withImageVersion("/static/images/bali.jpg"),
        "tanah-lot": withImageVersion("/static/images/bali.jpg"),
        "seminyak-beach": withImageVersion("/static/images/bali.jpg"),
        "mount-batur": withImageVersion("/static/images/bali.jpg"),
        "tegallalang": withImageVersion("/static/images/bali.jpg"),
        "nusa-penida": withImageVersion("/static/images/bali.jpg"),
        "uluwatu": withImageVersion("/static/images/bali.jpg"),
        "bali-swing": withImageVersion("/static/images/bali.jpg"),
        "bali": withImageVersion("/static/images/bali.jpg"),
        "oia-sunset": withImageVersion("/static/images/santorini.jpg"),
        "fira-town": withImageVersion("/static/images/santorini.jpg"),
        "red-beach": withImageVersion("/static/images/santorini.jpg"),
        "akrotiri": withImageVersion("/static/images/santorini.jpg"),
        "santorini": withImageVersion("/static/images/santorini.jpg"),
        "fushimi-inari": withImageVersion("/static/images/kyoto.jpg"),
        "arashiyama": withImageVersion("/static/images/kyoto.jpg"),
        "kinkakuji": withImageVersion("/static/images/kyoto.jpg"),
        "gion-district": withImageVersion("/static/images/kyoto.jpg"),
        "kyoto": withImageVersion("/static/images/kyoto.jpg"),
        "lake-louise": withImageVersion("/static/images/banff.jpg"),
        "banff-gondola": withImageVersion("/static/images/banff.jpg"),
        "johnston-canyon": withImageVersion("/static/images/banff.jpg"),
        "moraine-lake": withImageVersion("/static/images/banff.jpg"),
        "banff": withImageVersion("/static/images/banff.jpg"),
        "colosseum": withImageVersion("/static/images/rome.jpg"),
        "vatican-city": withImageVersion("/static/images/rome.jpg"),
        "trevi-fountain": withImageVersion("/static/images/rome.jpg"),
        "borghese-gallery": withImageVersion("/static/images/rome.jpg"),
        "santorini": withImageVersion("/static/images/santorini.jpg"),
        "cliffs-of-moher": withImageVersion("/static/images/cliffs-of-moher.jpg"),
        "machu-picchu": withImageVersion("/static/images/machu-picchu.jpg"),
        "banff": withImageVersion("/static/images/banff.jpg"),
        "new-york-city": withImageVersion("/static/images/new-york-city.jpg"),
        "cape-town": withImageVersion("/static/images/cape-town.jpg"),
        "reykjavik": withImageVersion("/static/images/reykjavik.jpg"),
        "rome": withImageVersion("/static/images/rome.jpg"),
    };
    return images[slug] || withImageVersion("/static/images/empty.svg");
}

function mapServerDestination(d) {
    const serverImage = getLocalImageForSlug(d.slug) || withImageVersion("/static/images/empty.svg");
    const bestLabel = d.best ? (d.best.startsWith("Best:") ? d.best : `Best: ${d.best}`) : "-";
    // Build tags from category + activities if not provided
    const categoryTag = (d.category || "").toLowerCase();
    const tags = d.tags || [categoryTag];
    return {
        id: d.slug,
        name: d.name,
        location: d.location,
        best: bestLabel,
        risk: d.risk,
        status: d.risk && d.risk.toLowerCase() === "low" ? "green" : "orange",
        category: d.category,
        energy: d.energy,
        price: d.average_cost || 0,
        tags,
        image: serverImage,
        href: `/destination/${d.slug}`,
        summary: d.summary || "",
        highlights: d.highlights || "",
        duration: d.duration || "",
        averageCost: d.average_cost || 0,
        averageDurationDays: d.average_duration_days || 0,
    };
}

async function fetchDestinations() {
    try {
        const response = await fetch("/api/destinations");
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        return Array.isArray(data.destinations) ? data.destinations.map(mapServerDestination) : null;
    } catch (_error) {
        return null;
    }
}

function setCurrentSavedIds(ids) {
    savedIds = ids;
    writeJson("wanderai-saved", savedIds);
}

function showDestinationInPanel(item) {
    if (!item) {
        return;
    }
    const detail = document.getElementById("destination-detail");
    if (!detail) {
        return;
    }
    detail.classList.remove("hidden");
    document.getElementById("detail-name").textContent = item.name;
    document.getElementById("detail-location").textContent = item.location;
    document.getElementById("detail-description").textContent = item.summary || item.description || "Description not available.";
    document.getElementById("detail-highlights").textContent = item.highlights || "-";
    document.getElementById("detail-best").textContent = item.best || "-";
    document.getElementById("detail-energy").textContent = item.energy ? `${item.energy} / 5` : "-";
    document.getElementById("detail-duration").textContent = item.duration || "-";
}

function createCard(item) {
    const card = document.createElement("article");
    card.className = "destination-card";
    const imageUrl = item.image || withImageVersion("/static/images/empty.svg");
    card.innerHTML = `
        <div class="destination-image" style="background-image:url('${imageUrl}')">
            <span class="risk-pill ${item.risk.toLowerCase()}">${item.risk.toUpperCase()} RISK</span>
            <button class="bookmark-mini" type="button" data-bookmark="${item.id}" aria-label="Save destination"></button>
        </div>
        <div class="destination-body">
            <div class="destination-header">
                <h3>${item.name}</h3>
                <span class="status-dot ${item.status === "orange" ? "orange" : ""}"></span>
            </div>
            <small>${item.location}</small>
            <span class="best-time">${item.best}</span>
            <div class="energy-copy">ENERGY REQUIRED</div>
            <div class="energy-bars">
                ${Array.from({ length: 5 }, (_, index) => `<span class="${index < item.energy ? "filled" : ""}"></span>`).join("")}
            </div>
            <div class="destination-footer">
                <a class="arrow-button" href="${item.href}" data-navigate>→</a>
            </div>
        </div>
    `;

    card.addEventListener("click", (event) => {
        // Don't interfere with bookmark clicks or arrow navigation
        if (event.target.closest(".bookmark-mini") || event.target.closest("[data-navigate]")) {
            return;
        }
        recordView(item.id);
        showDestinationInPanel(item);
    });

    // Add explicit click handler for arrow button to ensure navigation works
    const arrowBtn = card.querySelector("[data-navigate]");
    if (arrowBtn) {
        arrowBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            window.location.href = item.href;
        });
    }

    return card;
}

let renderExploreFn = null;
let renderSavedFn = null;

function attachBookmarkHandlers(scope = document) {
    scope.querySelectorAll("[data-bookmark]").forEach((button) => {
        const id = button.dataset.bookmark;
        if (savedIds.includes(id)) {
            button.classList.add("is-saved");
        }
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            savedIds = savedIds.includes(id)
                ? savedIds.filter((savedId) => savedId !== id)
                : [...savedIds, id];
            setCurrentSavedIds(savedIds);
            button.classList.toggle("is-saved", savedIds.includes(id));
            if (document.body.dataset.page === "saved") {
                if (renderSavedFn) renderSavedFn();
            } else if (document.body.dataset.page === "explore") {
                if (renderExploreFn) renderExploreFn();
            } else if (document.body.dataset.page === "dashboard") {
                initDashboard();
            }
        });
    });
}

function getStoredRecommendation() {
    return readJson("wanderai-recommendation", null);
}

function renderRecommendationMetrics(recommendation) {
    const container = document.getElementById("recommendation-metrics");
    if (!container || !recommendation) return;

    const goalScore = recommendation.goal_evaluation?.score ?? 0;
    const energy = recommendation.energy_analysis?.average_energy ?? 0;
    const risk = recommendation.risk_evaluation?.overall_risk ?? "Low";
    const budgetOk = recommendation.multi_constraint_summary?.budget_ok ? "Yes" : "No";

    container.innerHTML = `
        <article class="trip-metric-card">
            <span>Goal Fit</span>
            <strong>${goalScore}%</strong>
        </article>
        <article class="trip-metric-card">
            <span>Average Energy</span>
            <strong>${energy}/5</strong>
        </article>
        <article class="trip-metric-card">
            <span>Overall Risk</span>
            <strong>${risk}</strong>
        </article>
        <article class="trip-metric-card">
            <span>Budget Compliant</span>
            <strong>${budgetOk}</strong>
        </article>
    `;
}

function renderConstraintSummary(recommendation) {
    const container = document.getElementById("constraint-summary");
    if (!container || !recommendation) return;

    const summary = recommendation.multi_constraint_summary || {};
    const checks = [
        { key: "budget_ok", label: "Budget ✓", icon: summary.budget_ok ? "✓" : "✗" },
        { key: "duration_ok", label: "Duration ✓", icon: summary.duration_ok ? "✓" : "✗" },
        { key: "goal_fit_score", label: `Goal Fit ${summary.goal_fit_score || 0}%`, icon: (summary.goal_fit_score || 0) >= 70 ? "✓" : "⚠" },
    ];

    container.innerHTML = `
        <h4>Multi-Constraint Compliance</h4>
        <div class="constraint-grid">
            ${checks.map(check => `
                <div class="constraint-item">
                    <span>${check.icon}</span>
                    <span>${check.label}</span>
                </div>
            `).join("")}
            <div class="constraint-item">
                <span>${summary.risk_level || "Low"}</span>
                <span>Risk Level</span>
            </div>
            <div class="constraint-item">
                <span>${summary.energy_status || "Balanced"}</span>
                <span>Energy Balance</span>
            </div>
        </div>
    `;
}

function renderGoalMapping(recommendation) {
    const container = document.getElementById("goal-mapping-summary");
    if (!container || !recommendation) return;

    const mappings = recommendation.goal_mapping?.activity_categories || {};
    const cards = Object.entries(mappings).map(([goalName, categories]) => `
        <article class="goal-map-card">
            <strong>${goalName}</strong>
            <p>${categories.join(", ")}</p>
        </article>
    `).join("");

    container.innerHTML = `
        <h3>Goal Selection Mapping</h3>
        <p>User preference processing converted the selected goals into activity categories for recommendation and itinerary generation.</p>
        <div class="goal-mapping-grid">${cards}</div>
    `;
}

function renderReasoning(recommendation) {
    const container = document.getElementById("recommendation-reasoning");
    if (!container || !recommendation) return;
    const items = recommendation.recommendation_reasoning || [];
    container.innerHTML = `
        <h3>Recommendation Engine</h3>
        <p>The system applied rule-based reasoning across budget, duration, travel goals, energy, and risk.</p>
        <ul class="reason-list">
            ${items.map((item) => `<li>${item}</li>`).join("")}
        </ul>
    `;
}

function renderGrid(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    container.innerHTML = "";
    items.forEach((item) => container.appendChild(createCard(item)));
    attachBookmarkHandlers(container);
}

function renderPagination(containerId, totalPages, currentPage, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    container.innerHTML = "";
    if (totalPages <= 1) {
        return;
    }

    const prev = document.createElement("button");
    prev.textContent = "‹ Previous";
    prev.disabled = currentPage === 1;
    prev.addEventListener("click", () => onSelect(currentPage - 1));
    container.appendChild(prev);

    for (let page = 1; page <= totalPages; page += 1) {
        const button = document.createElement("button");
        button.textContent = page;
        if (page === currentPage) {
            button.classList.add("active");
        }
        button.addEventListener("click", () => onSelect(page));
        container.appendChild(button);
    }

    const next = document.createElement("button");
    next.textContent = "Next ›";
    next.disabled = currentPage === totalPages;
    next.addEventListener("click", () => onSelect(currentPage + 1));
    container.appendChild(next);
}

function updateGoalLabels() {
    const user = getCurrentUser();
    const storedGoal = user?.goal || localStorage.getItem("wanderai-goal") || localStorage.getItem("goal") || "";
    goal = storedGoal ? storedGoal.charAt(0).toUpperCase() + storedGoal.slice(1).toLowerCase() : "";

    const goalEl = document.getElementById("dashboard-goal-label");
    if (goalEl) {
        goalEl.textContent = goal;
    }
    const interestEl = document.getElementById("interest-pill-value");
    if (interestEl) {
        interestEl.textContent = goal || "Not set";
    }
    const profileGoal = document.getElementById("profile-goal");
    if (profileGoal) {
        profileGoal.value = goal;
    }
}

function getLocationRecommendations() {
    const location = (localStorage.getItem("userLocation") || "London").toLowerCase();
    const budget = parseInt(localStorage.getItem("budget")) || 5000;
    const userGoal = getUserGoal();
    const relatedActivities = getGoalActivities(userGoal);
    const history = getViewHistory();

    // Match by first word of location (e.g. "Banff" matches "Banff, Canada")
    let filtered = destinations.filter(d => {
        const destCity = d.location.toLowerCase().split(",")[0].trim();
        return destCity === location || d.location.toLowerCase().includes(location);
    });
    if (filtered.length < 5) filtered = destinations;

    return filtered
        .map(place => {
            let score = 0;
            if ((place.price || 0) <= budget) score += 2;
            if (place.category.toLowerCase() === userGoal) score += 3;
            if (place.tags.includes(userGoal)) score += 3;
            if (place.tags.some(tag => relatedActivities.includes(tag))) score += 2;
            if (history.includes(place.id)) score += 1;
            if (place.risk === "Low") score += 1;
            return { ...place, score };
        })
        .sort((a, b) => b.score - a.score);
}

function loadRecommendations() {
    const recs = getLocationRecommendations();
    renderGrid("top-destinations", recs.slice(0, 5));
    renderGrid("seasonal-destinations", recs.slice(5, 10));
}

function animateNumber(id, end) {
    const el = document.getElementById(id);
    if (!el) return;
    let start = 0;
    const interval = setInterval(() => {
        start += Math.ceil(end / 50);
        if (start >= end) { start = end; clearInterval(interval); }
        el.textContent = start;
    }, 20);
}

const AGENDA_DATA = {
  "Mo": [
    ["Morning Hike", "Hyde Park", "08:00 AM"],
    ["Breakfast", "The Ivy Cafe", "09:30 AM"],
    ["Museum Visit", "British Museum", "11:00 AM"],
  ],
  "Tu": [
    ["Villa Check-out", "Richmond Park Retreat", "10:30 AM"],
    ["Venue", "Richmond Park", "11:00 AM"],
    ["Lunch Break", "The Nomad London", "12:30 PM"],
  ],
  "We": [
    ["City Walk", "Soho Streets", "09:00 AM"],
    ["Thames Cruise", "Embankment Pier", "11:30 AM"],
    ["Dinner", "Borough Market", "07:00 PM"],
  ],
  "Th": [
    ["Gallery Tour", "Tate Modern", "10:00 AM"],
    ["Lunch", "Southbank", "01:00 PM"],
    ["Evening Walk", "Tower Bridge", "05:30 PM"],
  ],
  "Fr": [
    ["Shopping", "Oxford Street", "10:00 AM"],
    ["Lunch", "Covent Garden", "12:30 PM"],
    ["Show", "West End Theatre", "07:30 PM"],
  ],
  "Sa": [
    ["Farmers Market", "Portobello Road", "09:00 AM"],
    ["Brunch", "Notting Hill Cafe", "11:00 AM"],
    ["Park Picnic", "Kensington Gardens", "02:00 PM"],
  ],
  "Su": [
    ["Lazy Morning", "Hotel", "10:00 AM"],
    ["Brunch", "Sketch London", "12:00 PM"],
    ["Departure Prep", "Home", "05:00 PM"],
  ],
};

function highlightCurrentTask() {
  const now = new Date();
  const currentHour = now.getHours();
  document.querySelectorAll(".schedule-item").forEach(card => {
    const timeEl = card.querySelector("time");
    if (!timeEl) return;
    const timeText = timeEl.innerText;
    const [time, period] = timeText.split(" ");
    let [hour] = time.split(":").map(Number);
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    card.classList.toggle("active-task", hour === currentHour);
  });
}

/**
 * Legacy wrapper for old initDashboard that used renderAgendaSchedule(dayKey)
 * Now uses agendaState.selectedDate
 */
async function initDashboard() {
  const user = getCurrentUser();
  const isNewUser = !user || !localStorage.getItem("wanderai-user");

  // Get user's trip data
  const recommendation = getStoredRecommendation();
  const tripPlan = readJson("trip-plan", {});
  const savedTrips = readJson("wanderai-saved", []);

  // Calculate total expense from actual trip plans
  let totalExpense = 0;
  if (recommendation?.selected_destination?.average_cost) {
    totalExpense = recommendation.selected_destination.average_cost;
  } else if (tripPlan?.budget) {
    totalExpense = 0; // No trip taken yet, just planned
  }

  // Update expense value - show 0 for new users
  const expenseEl = document.getElementById("expense-value");
  if (expenseEl) {
    expenseEl.textContent = isNewUser ? "0" : totalExpense.toLocaleString();
  }

  // Calculate goals achieved - based on saved trips and completed trips
  const goalsAchieved = isNewUser ? 0 : savedTrips.length;
  const goalCountEl = document.getElementById("goalCount");
  if (goalCountEl) {
    goalCountEl.textContent = goalsAchieved;
  }

  // Update goal achievement progress
  const goalLabelEl = document.getElementById("dashboard-goal-label");
  const userGoal = localStorage.getItem("wanderai-goal") || "Nature";
  if (goalLabelEl) {
    goalLabelEl.textContent = userGoal;
  }

  // Update progress bar - 0% for new users, calculated for existing
  const progressFill = document.querySelector(".metric-lilac .progress-fill");
  if (progressFill) {
    const progressPercent = isNewUser ? 0 : Math.min(goalsAchieved * 10, 100);
    progressFill.style.width = `${progressPercent}%`;
  }

  // Update percentage text
  const progressStrong = document.querySelector(".metric-lilac .metric-progress-copy strong");
  if (progressStrong) {
    progressStrong.textContent = isNewUser ? "0%" : `${Math.min(goalsAchieved * 10, 100)}%`;
  }

  // Load saved location
  const savedLocation = user?.place || localStorage.getItem("userLocation") || "London";
  const currentLocationEl = document.getElementById("currentLocation");
  const locationSelect = document.getElementById("locationSelect");
  if (currentLocationEl) currentLocationEl.textContent = savedLocation;
  if (locationSelect) locationSelect.value = savedLocation;

  // Location change handler — attach only once
  if (!window.dashboardLocationListenerAttached) {
    locationSelect?.addEventListener("change", (e) => {
      const location = e.target.value;
      localStorage.setItem("userLocation", location);
      if (currentLocationEl) currentLocationEl.textContent = location;
      loadRecommendations();
    });
    window.dashboardLocationListenerAttached = true;
  }

  loadRecommendations();

  // The schedule will be loaded by initScheduleManager which is called after initDashboard
}

function filterAndSort(list, term, category, sortMode) {
    let result = [...list];
    if (term) {
        const query = term.toLowerCase();
        result = result.filter(
            (item) =>
                item.name.toLowerCase().includes(query) ||
                item.location.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query)
        );
    }
    if (category && category !== "All") {
        result = result.filter((item) => item.category === category);
    }
    if (sortMode === "name-asc") {
        result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "name-desc") {
        result.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === "risk-low") {
        const riskMap = { low: 1, moderate: 2, high: 3 };
        result.sort((a, b) => (riskMap[a.risk.toLowerCase()] || 2) - (riskMap[b.risk.toLowerCase()] || 2));
    } else if (sortMode === "risk-high") {
        const riskMap = { low: 1, moderate: 2, high: 3 };
        result.sort((a, b) => (riskMap[b.risk.toLowerCase()] || 2) - (riskMap[a.risk.toLowerCase()] || 2));
    }
    return result;
}

function initExplore() {
    const search = document.getElementById("explore-search");
    const sort = document.getElementById("explore-sort");
    const tabs = [...document.querySelectorAll("#explore-filters .filter-tab")];
    let page = 1;

    const run = () => {
        const activeTab = tabs.find((tab) => tab.classList.contains("active"));
        const filtered = filterAndSort(destinations, search.value, activeTab?.dataset.category || "All", sort.value);
        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        if (page > totalPages) {
            page = totalPages;
        }
        renderGrid("explore-grid", filtered.slice((page - 1) * pageSize, page * pageSize));
        renderPagination("explore-pagination", totalPages, page, (nextPage) => {
            page = nextPage;
            run();
        });
    };
    renderExploreFn = run;

    if (!window.exploreListenersAttached) {
        search?.addEventListener("input", () => {
            page = 1;
            run();
        });
        document.getElementById("explore-search-btn")?.addEventListener("click", run);
        sort?.addEventListener("change", () => {
            page = 1;
            run();
        });
        tabs.forEach((tab) =>
            tab.addEventListener("click", () => {
                tabs.forEach((item) => item.classList.remove("active"));
                tab.classList.add("active");
                page = 1;
                run();
            })
        );
        window.exploreListenersAttached = true;
    }

    run();
}

function initSaved() {
    const search = document.getElementById("saved-search");
    const sort = document.getElementById("saved-sort");
    let page = 1;

    const run = () => {
        const savedItems = destinations.filter((item) => savedIds.includes(item.id));
        const filtered = filterAndSort(savedItems, search.value, "All", sort.value === "newest" ? "name-asc" : sort.value);
        const pageSize = 8;
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        renderGrid("saved-grid", filtered.slice((page - 1) * pageSize, page * pageSize));
        renderPagination("saved-pagination", totalPages, page, (nextPage) => {
            page = nextPage;
            run();
        });
        const emptyState = document.getElementById("saved-empty");
        if (emptyState) {
            emptyState.classList.toggle("hidden", filtered.length > 0);
        }
    };
    renderSavedFn = run;

    if (!window.savedListenersAttached) {
        search?.addEventListener("input", () => {
            page = 1;
            run();
        });
        document.getElementById("saved-search-btn")?.addEventListener("click", run);
        sort?.addEventListener("change", () => {
            page = 1;
            run();
        });
        window.savedListenersAttached = true;
    }
    run();
}

function initGoal() {
    const cards = [...document.querySelectorAll("[data-goal-card]")];
    const continueButton = document.getElementById("goal-continue");
    let selectedGoal = localStorage.getItem("wanderai-goal") || "";
    let isSaving = false;

    // Get current user from localStorage
    const getCurrentUser = () => {
        try {
            return JSON.parse(localStorage.getItem("wanderai-user")) || null;
        } catch {
            return null;
        }
    };

    // Update UI based on selection
    const updateSelectionUI = (selectedCard) => {
        cards.forEach((card) => {
            card.classList.remove("active");
            // Remove any inline selection styles
            card.style.border = "";
            card.style.boxShadow = "";
            // Hide all selected badges
            const badge = card.querySelector(".selected-badge");
            if (badge) badge.style.display = "none";
            // Reset button text
            const btn = card.querySelector(".select-goal-btn");
            if (btn) {
                const goalName = card.dataset.goal;
                btn.textContent = `Select ${goalName}`;
                btn.classList.remove("blue-chip");
            }
        });
        if (selectedCard) {
            selectedCard.classList.add("active");
            // Add visual highlight
            selectedCard.style.border = "2px solid #11258f";
            selectedCard.style.boxShadow = "0 4px 20px rgba(17, 37, 143, 0.2)";
            // Show selected badge
            const badge = selectedCard.querySelector(".selected-badge");
            if (badge) badge.style.display = "inline";
            // Update button to show selected
            const btn = selectedCard.querySelector(".select-goal-btn");
            if (btn) {
                btn.textContent = "Selected ✓";
                btn.classList.add("blue-chip");
            }
        }
    };

    // Enable/disable continue button
    const updateContinueButton = (enabled) => {
        if (!continueButton) return;
        if (enabled) {
            continueButton.classList.remove("muted");
            continueButton.disabled = false;
            continueButton.textContent = "Save & Continue";
        } else {
            continueButton.classList.add("muted");
            continueButton.disabled = true;
            continueButton.textContent = "Select a Goal";
        }
    };

    // Sync initial state
    const syncInitialState = () => {
        const storedGoal = localStorage.getItem("wanderai-goal") || "";
        if (storedGoal) {
            const matchingCard = cards.find(
                (card) => card.dataset.goal.toLowerCase() === storedGoal.toLowerCase()
            );
            if (matchingCard) {
                selectedGoal = storedGoal;
                updateSelectionUI(matchingCard);
                updateContinueButton(true);
                return true;
            }
        }
        updateContinueButton(false);
        return false;
    };

    // Handle selection (card click or button click)
    const handleSelection = (card) => {
        selectedGoal = card.dataset.goal;
        updateSelectionUI(card);
        updateContinueButton(true);
        // Update localStorage immediately for responsiveness
        selectGoal(selectedGoal);
        localStorage.setItem("wanderai-goal", selectedGoal);
        updateGoalLabels();
    };

    // Handle card click
    cards.forEach((card) => {
        // Click on the whole card
        card.addEventListener("click", (e) => {
            // Don't trigger if clicking the button (button has its own handler)
            if (e.target.classList.contains("select-goal-btn")) return;
            handleSelection(card);
        });

        // Click on the select button
        const btn = card.querySelector(".select-goal-btn");
        if (btn) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent double triggering
                handleSelection(card);
            });
        }
    });

    // Save goal to backend
    const saveGoalToBackend = async () => {
        if (!selectedGoal) {
            alert("Please select a goal first.");
            return false;
        }

        const user = getCurrentUser();
        if (!user) {
            // Not logged in - just save to localStorage and redirect
            return true;
        }

        if (isSaving) return false;
        isSaving = true;
        setLoading(continueButton, true);

        try {
            const res = await fetchWithAuth("/api/user/update-goal", {
                method: "POST",
                body: JSON.stringify({ goal: selectedGoal })
            });

            const data = await res.json();

            if (res.ok) {
                // Update user object in localStorage with new goal
                user.goal = selectedGoal;
                localStorage.setItem("wanderai-user", JSON.stringify(user));
                localStorage.setItem("user", JSON.stringify(user));
                alert("Goal updated successfully!");
                return true;
            } else {
                alert(data.error || "Failed to update goal. Please try again.");
                return false;
            }
        } catch (err) {
            console.error("Error saving goal:", err);
            alert("Connection error. Goal saved locally but may not be synced.");
            return true; // Allow redirect even if backend fails
        } finally {
            isSaving = false;
            setLoading(continueButton, false);
            updateContinueButton(true);
        }
    };

    // Handle continue button click
    continueButton?.addEventListener("click", async () => {
        if (continueButton?.disabled || isSaving) return;

        const saved = await saveGoalToBackend();
        if (saved) {
            window.location.href = "/explore";
        }
    });

    // Initialize
    syncInitialState();
}

function initTrip() {
    const tripCards = [...document.querySelectorAll("[data-trip-step]")];
    const stepIndicator = document.getElementById("trip-step-indicator");
    const bars = [...document.querySelectorAll(".step-bars span")];
    const nextButtons = [...document.querySelectorAll(".trip-next")];
    const backButtons = [...document.querySelectorAll(".trip-back")];
    const days = document.getElementById("trip-days");
    let currentStep = 1;
    let dayCount = Number(days?.textContent || 4);

    // Store validation errors for each step
    const stepErrors = {
        1: null,
        2: null,
        3: null,
        4: null
    };

    const validateStep = (step) => {
        stepErrors[step] = null;
        
        if (step === 1) {
            const location = document.getElementById("trip-location")?.value;
            const budget = document.getElementById("trip-budget")?.value;
            if (!location) {
                stepErrors[step] = "Please select your departure location.";
                return false;
            }
            if (!budget || parseInt(budget) < 100) {
                stepErrors[step] = "Please enter a valid budget (minimum £100).";
                return false;
            }
        }
        
        if (step === 2) {
            const startDate = document.getElementById("trip-start-date")?.value;
            const endDate = document.getElementById("trip-end-date")?.value;
            if (!startDate || !endDate) {
                stepErrors[step] = "Please select both start and end dates.";
                return false;
            }
            // Validate no past dates
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (start < today) {
                stepErrors[step] = "You cannot select a past date for the start date.";
                return false;
            }
            if (end < today) {
                stepErrors[step] = "You cannot select a past date for the end date.";
                return false;
            }
            if (start > end) {
                stepErrors[step] = "End date must be after start date.";
                return false;
            }
            const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
            if (Math.abs(daysDiff - dayCount) > 1) {
                stepErrors[step] = `Date range is ${daysDiff} days but trip duration is ${dayCount} days. Please adjust.`;
                return false;
            }
        }
        
        if (step === 3) {
            const selectedGoals = [...document.querySelectorAll("#preference-pills .choice-pill.active")];
            if (selectedGoals.length === 0) {
                stepErrors[step] = "Please select at least one travel goal.";
                return false;
            }
        }
        
        return true;
    };

    const showStep = (step) => {
        // Save current step state before navigating
        if (currentStep !== step) {
            saveCurrentTripStep(currentStep);
        }

        currentStep = step;
        tripCards.forEach((card) => card.classList.toggle("active", Number(card.dataset.tripStep) === step));
        bars.forEach((bar, index) => bar.classList.toggle("active", index < step));
        if (stepIndicator) {
            stepIndicator.textContent = `${step}/4`;
        }

        // Clear any previous errors when navigating
        const errorEl = document.getElementById("trip-error-message");
        if (errorEl) errorEl.remove();

        // Validate the step we're navigating to (for going back)
        if (step < 4) {
            validateStep(step);
        }
    };

    const showError = (message) => {
        // Remove any existing error
        const existingError = document.getElementById("trip-error-message");
        if (existingError) existingError.remove();
        
        // Add new error message
        const errorDiv = document.createElement("div");
        errorDiv.id = "trip-error-message";
        errorDiv.style.cssText = "background: #fee2e2; color: #dc2626; padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-size: 14px;";
        errorDiv.textContent = message;
        
        const activeCard = document.querySelector(".trip-card.active");
        if (activeCard) {
            activeCard.insertBefore(errorDiv, activeCard.querySelector(".trip-nav-buttons"));
        }
    };

    nextButtons.forEach((button) =>
        button.addEventListener("click", () => {
            // Validate current step before proceeding
            if (!validateStep(currentStep)) {
                showError(stepErrors[currentStep]);
                return;
            }
            
            if (currentStep < 4) {
                showStep(currentStep + 1);
            }
        })
    );

    backButtons.forEach((button) =>
        button.addEventListener("click", () => {
            if (currentStep > 1) {
                showStep(currentStep - 1);
            }
        })
    );

    document.querySelector('[data-counter="minus"]')?.addEventListener("click", () => {
        dayCount = Math.max(1, dayCount - 1);
        days.textContent = dayCount;
    });
    document.querySelector('[data-counter="plus"]')?.addEventListener("click", () => {
        dayCount += 1;
        days.textContent = dayCount;
    });



    document.querySelectorAll("#preference-pills .choice-pill").forEach((pill) =>
        pill.addEventListener("click", () => pill.classList.toggle("active"))
    );
    document.querySelectorAll("#energy-grid .energy-option").forEach((option) =>
        option.addEventListener("click", () => {
            document.querySelectorAll("#energy-grid .energy-option").forEach((item) => item.classList.remove("active"));
            option.classList.add("active");
        })
    );
    document.querySelectorAll("#risk-grid .energy-option").forEach((option) =>
        option.addEventListener("click", () => {
            document.querySelectorAll("#risk-grid .energy-option").forEach((item) => item.classList.remove("active"));
            option.classList.add("active");
        })
    );

document.getElementById("trip-make")?.addEventListener("click", async () => {
        const budget = document.getElementById("trip-budget")?.value;
        const currency = document.getElementById("trip-currency")?.value;
        // Get formatted date range
        const startDateEl = document.getElementById("trip-start-date");
        const endDateEl = document.getElementById("trip-end-date");
        const startDate = startDateEl?.value || "";
        const endDate = endDateEl?.value || "";
        
        if (!startDate || !endDate) {
            alert("Please select both start and end dates.");
            return;
        }
        
        if (new Date(startDate) > new Date(endDate)) {
            alert("End date must be after start date.");
            return;
        }
        
        const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
        if (Math.abs(daysDiff - dayCount) > 1) {
            alert(`Date range is ${daysDiff} days. Adjust dates or trip duration.`);
            return;
        }
        
        const dates = `${startDate} – ${endDate}`;
        const travel_goals = [...document.querySelectorAll("#preference-pills .choice-pill.active")].map((el) => el.textContent.trim());
        const energy = document.querySelector("#energy-grid .energy-option.active strong")?.textContent.trim();
        const risk = document.querySelector("#risk-grid .energy-option.active strong")?.textContent.trim().replace(" Risk", "");

        // Read location — use "Other" free-text if selected
        const locationSelect = document.getElementById("trip-location")?.value || "";
        const locationOther = document.getElementById("trip-location-other")?.value.trim() || "";
        const location = locationSelect === "Other" ? locationOther : locationSelect;

        const parsedBudget = parseInt((budget || "").replace(/[£$€,]/g, "")) || 5000;

        const plan = {
            budget: parsedBudget,
            currency,
            days: dayCount,
            dates,
            travel_goals,
            energy,
            risk,
            location,
        };

        // Save budget, location and goal so recommendation engine uses them
        localStorage.setItem("budget", String(parsedBudget));
        localStorage.setItem("userLocation", location);
        localStorage.setItem("trip-plan", JSON.stringify(plan));
        if (travel_goals.length > 0) {
            selectGoal(travel_goals[0]);
            localStorage.setItem("wanderai-goal", travel_goals[0]);
        }

        const btn = document.getElementById("trip-make");
        btn.textContent = "Generating...";
        btn.disabled = true;

        try {
            const res = await fetch("/api/plan-trip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(plan),
            });
            const data = await res.json();
            if (data.recommendation) {
                localStorage.setItem("wanderai-recommendation", JSON.stringify(data.recommendation));
            }
        } catch (e) {
            console.error("Trip plan error:", e);
        } finally {
            window.location.href = "/trip-results";
        }
    });

    // Date range display and validation
    function updateDateDisplay() {
        const startDateEl = document.getElementById("trip-start-date");
        const endDateEl = document.getElementById("trip-end-date");
        const displayEl = document.getElementById("trip-date-display");
        
        const start = startDateEl?.value;
        const end = endDateEl?.value;
        
        if (start && end) {
            displayEl.textContent = `${start} – ${end}`;
            displayEl.classList.add("selected");
        } else {
            displayEl.textContent = "Select your travel dates";
            displayEl.classList.remove("selected");
        }
    }
    
    document.getElementById("trip-start-date")?.addEventListener("change", updateDateDisplay);
    document.getElementById("trip-end-date")?.addEventListener("change", updateDateDisplay);
    
    // Auto-set end date min to start date
    document.getElementById("trip-start-date")?.addEventListener("change", (e) => {
        const endDateEl = document.getElementById("trip-end-date");
        if (e.target.value) {
            endDateEl.min = e.target.value;
        }
    });
    
    // Pre-fill reasonable defaults (today + trip days)
    const today = new Date().toISOString().split("T")[0];
    const daysEl = document.getElementById("trip-days");
    const defaultDays = Number(daysEl?.textContent || 4);
    const endDefault = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    
    // Set min attribute to prevent past date selection
    const startDateEl = document.getElementById("trip-start-date");
    const endDateEl = document.getElementById("trip-end-date");
    if (startDateEl) {
        startDateEl.min = today;
        startDateEl.value = today;
    }
    if (endDateEl) {
        endDateEl.min = today;
        endDateEl.value = endDefault;
    }
    updateDateDisplay();
    
    // Sync dates when days counter changes
    document.querySelector('[data-counter="plus"]')?.addEventListener("click", () => {
        updateDateDisplay();
    });
    document.querySelector('[data-counter="minus"]')?.addEventListener("click", () => {
        updateDateDisplay();
    });
    
    // Show/hide "Other" location text input
    document.getElementById("trip-location")?.addEventListener("change", (e) => {
        const otherRow = document.getElementById("trip-location-other-row");
        if (otherRow) otherRow.style.display = e.target.value === "Other" ? "flex" : "none";
    });

    // Pre-fill location from localStorage if available
    const savedLocation = localStorage.getItem("userLocation") || "";
    const locationSelect = document.getElementById("trip-location");
    if (locationSelect && savedLocation) {
        const match = [...locationSelect.options].find((o) => o.value === savedLocation);
        if (match) {
            locationSelect.value = savedLocation;
        } else if (savedLocation) {
            locationSelect.value = "Other";
            const otherInput = document.getElementById("trip-location-other");
            const otherRow = document.getElementById("trip-location-other-row");
            if (otherInput) otherInput.value = savedLocation;
            if (otherRow) otherRow.style.display = "flex";
        }
    }

    showStep(1);
}

function renderRecommendationSummary(recommendation) {
    const container = document.getElementById("recommendation-summary");
    if (!container || !recommendation) return;
    const dest = recommendation.selected_destination;
    if (!dest) return;
    const image = getLocalImageForSlug(dest.slug);
    const reasons = (dest.why_selected || []).map((r) => `<li>${r}</li>`).join("");
    const userLocation = localStorage.getItem("userLocation") || "";
    const locationLine = userLocation ? `<span>From: <strong>${userLocation}</strong></span>` : "";
    container.innerHTML = `
        <div class="rec-summary-card">
            <div class="rec-summary-image" style="background-image:url('${image}')"></div>
            <div class="rec-summary-body">
                <h2>${dest.name}</h2>
                <small>${dest.location}</small>
                <p>${dest.summary || ""}</p>
                <ul class="reason-list">${reasons}</ul>
                <div class="rec-summary-meta">
                    ${locationLine}
                    <span>Est. Cost: <strong>£${dest.average_cost}</strong></span>
                    <span>Duration: <strong>${dest.average_duration_days} days</strong></span>
                    <span>Risk: <strong>${dest.risk}</strong></span>
                </div>
            </div>
        </div>
    `;
}

function initTripResults() {
    const recommendation = getStoredRecommendation();

    if (recommendation) {
        renderRecommendationSummary(recommendation);
        renderRecommendationMetrics(recommendation);
        renderConstraintSummary(recommendation);
        renderGoalMapping(recommendation);
        renderReasoning(recommendation);

        // recommended_destinations come from server with slug field
        const recDests = (recommendation.recommended_destinations || []).map((d) => ({
            id: d.slug,
            name: d.name,
            location: d.location,
            best: d.best ? (d.best.startsWith("Best:") ? d.best : `Best: ${d.best}`) : "-",
            risk: d.risk || "Low",
            status: (d.risk || "").toLowerCase() === "low" ? "green" : "orange",
            category: d.category,
            energy: d.energy || 2,
            price: d.average_cost || 0,
            tags: d.tags || [(d.category || "").toLowerCase()],
            image: getLocalImageForSlug(d.slug),
            href: `/destination/${d.slug}`,
            summary: d.summary || "",
            highlights: d.highlights || "",
            duration: d.duration || "",
            averageCost: d.average_cost || 0,
            averageDurationDays: d.average_duration_days || 0,
            reasons: d.reasons || [],
            match_score: d.match_score || 0,
        }));

        if (recDests.length > 0) {
            renderGrid("handpicked-grid", recDests);
            return;
        }
    }

    // Fallback: use smart recommendations based on stored goal + budget
    const smart = getSmartRecommendations();
    renderGrid("handpicked-grid", smart.slice(0, 4));
}

async function initItinerary() {
    const timeline = document.getElementById("itinerary-timeline");
    const emptyState = document.getElementById("itinerary-empty-state");
    const contentArea = document.getElementById("itinerary-content");

    // Get place from URL path /itinerary/:slug
    const pathMatch = window.location.pathname.match(/\/itinerary\/([^/]+)/);
    const placeIdFromUrl = pathMatch ? pathMatch[1] : null;

    if (!placeIdFromUrl) {
        showItineraryEmptyState("No destination selected");
        return;
    }

    // Show loading state
    if (timeline) {
        timeline.innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">✈️</div>
                <p style="color: #70707a;">Loading your itinerary...</p>
            </div>
        `;
    }

    try {
        // Load from API
        const res = await fetch(`/api/itinerary/${placeIdFromUrl}`);
        if (!res.ok) throw new Error("Failed to load itinerary");

        const data = await res.json();
        const dest = data.destination;
        const itinerary = data.itinerary || [];
        const summary = data.trip_summary;

        if (!dest) {
            showItineraryEmptyState("Destination not found");
            return;
        }

        // Store for later use
        localStorage.setItem("currentDestination", JSON.stringify(dest));
        localStorage.setItem("currentItinerary", JSON.stringify(itinerary));

        // Hide empty state, show content
        if (emptyState) emptyState.style.display = "none";
        if (contentArea) contentArea.style.display = "block";

        // Update page title
        document.title = `${dest.name} - Itinerary | WanderAI`;

        // Populate hero section
        const img = document.getElementById("itinerary-image");
        const titleEl = document.getElementById("itinerary-title");
        const destEl = document.getElementById("itinerary-destination");
        const locEl = document.getElementById("itinerary-location");
        const tagEl = document.getElementById("itinerary-tag");

        if (img) {
            img.src = getLocalImageForSlug(dest.slug || placeIdFromUrl);
            img.alt = dest.name;
        }
        if (titleEl) titleEl.textContent = `${dest.name} Itinerary`;
        if (destEl) destEl.textContent = dest.name;
        if (locEl) locEl.textContent = dest.location;
        if (tagEl) tagEl.textContent = dest.category || "Plan";

        // Update summary cards
        const daysEl = document.getElementById("summary-days");
        const budgetEl = document.getElementById("summary-budget");
        const riskEl = document.getElementById("summary-risk");
        const bestEl = document.getElementById("summary-best");
        const descEl = document.getElementById("destination-description");

        if (daysEl) daysEl.textContent = `${dest.average_duration_days || summary?.total_days || '-'} days`;
        if (budgetEl) budgetEl.textContent = `£${dest.average_cost || summary?.total_budget || '-'}`;
        if (riskEl) riskEl.textContent = dest.risk || 'Low';
        if (bestEl) bestEl.textContent = dest.best || 'Year-round';
        if (descEl) descEl.textContent = dest.description || `Explore ${dest.name} with our AI-generated itinerary.`;

        // Render timeline
        if (!timeline) return;

        if (itinerary.length > 0) {
            timeline.innerHTML = itinerary.map((day) => `
                <div class="timeline-day fade-in">
                    <div class="timeline-day-header">
                        <strong>Day ${day.day}</strong>
                        <span style="color: #11258f; font-weight: 500;">${day.theme}</span>
                    </div>
                    ${(day.items || []).map((item) => `
                        <div class="timeline-row">
                            <div style="flex: 1;">
                                <h4>${item.title}</h4>
                                <p>${item.details}</p>
                                <small>
                                    ⏱️ ${item.duration} &nbsp;•&nbsp; 
                                    💰 £${item.cost} &nbsp;•&nbsp; 
                                    ⚡ ${item.energy_level}/5
                                </small>
                            </div>
                            <time>${item.time}</time>
                        </div>
                    `).join("")}
                </div>
            `).join("");
        } else {
            timeline.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #666;">
                    <p>No detailed itinerary available for ${dest.name} yet.</p>
                    <a href="/trip" style="color: #11258f; text-decoration: underline;">Create Custom Trip</a>
                </div>
            `;
        }

    } catch (error) {
        console.error("Error loading itinerary:", error);
        showItineraryEmptyState("Failed to load itinerary. Please try again.");
    }
}

function showItineraryEmptyState(message) {
    const timeline = document.getElementById("itinerary-timeline");
    const emptyState = document.getElementById("itinerary-empty-state");
    const contentArea = document.getElementById("itinerary-content");

    if (timeline) timeline.innerHTML = "";
    if (contentArea) contentArea.style.display = "none";
    if (emptyState) {
        emptyState.style.display = "flex";
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; max-width: 500px; margin: 0 auto;">
                <div style="font-size: 64px; margin-bottom: 20px;">🗺️</div>
                <h2 style="font-size: 24px; margin-bottom: 12px; color: #1a1a2e;">${message || 'No Itinerary'}</h2>
                <p style="color: #666; margin-bottom: 24px; line-height: 1.6;">
                    Select a destination from the dashboard to view its itinerary, or create a new trip plan!
                </p>
                <a href="/dashboard" class="solid-chip" style="display: inline-block; text-decoration: none; padding: 12px 24px; margin-right: 12px;">
                    Explore Destinations
                </a>
                <a href="/trip" class="solid-chip blue-chip" style="display: inline-block; text-decoration: none; padding: 12px 24px;">
                    Plan Your Trip
                </a>
            </div>
        `;
    }
}

// Save to My Trips function
function saveToMyTrips() {
    const dest = localStorage.getItem("currentDestination");
    if (!dest) {
        alert("No destination to save!");
        return;
    }
    
    const destination = JSON.parse(dest);
    const saved = readJson("wanderai-saved", []);
    
    if (!saved.includes(destination.id || destination.slug)) {
        saved.push(destination.id || destination.slug);
        writeJson("wanderai-saved", saved);
        alert(`✅ ${destination.name} saved to your trips!`);
    } else {
        alert(`${destination.name} is already in your saved trips!`);
    }
}

// Share itinerary function
function shareItinerary() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: document.title,
            url: url
        });
    } else {
        // Copy to clipboard
        navigator.clipboard.writeText(url).then(() => {
            alert("🔗 Link copied to clipboard!");
        }).catch(() => {
            prompt("Copy this link:", url);
        });
    }
}

function initProfile() {
    const user = readJson("wanderai-user", null);
    const fullNameEl = document.getElementById("profile-full-name");
    const emailEl = document.getElementById("profile-email");
    const placeEl = document.getElementById("profile-place");
    if (user) {
        if (fullNameEl) fullNameEl.value = user.name || "";
        if (emailEl) emailEl.value = user.email || "";
        if (placeEl) placeEl.value = user.place || "";
    }

    const toggle = document.getElementById("profile-edit-toggle");
    const primary = document.getElementById("profile-primary-action");
    const fields = [
        document.getElementById("profile-full-name"),
        document.getElementById("profile-email"),
        document.getElementById("profile-place"),
    ];

    const toggleEdit = () => {
        const editable = fields[0]?.hasAttribute("readonly");
        fields.forEach((field) => {
            if (!field) {
                return;
            }
            if (editable) {
                field.removeAttribute("readonly");
                field.style.border = "1px solid #dedee2";
                field.style.background = "#fff";
                field.style.paddingLeft = "14px";
            } else {
                field.setAttribute("readonly", "readonly");
                field.style.border = "0";
                field.style.background = "transparent";
                field.style.paddingLeft = "0";
                // Save to localStorage on save
                if (user && fullNameEl && emailEl && placeEl) {
                    user.name = fullNameEl.value;
                    user.email = emailEl.value;
                    user.place = placeEl.value;
                    writeJson("wanderai-user", user);
                    updateUserElements(user);
                }
            }
        });
        if (toggle) {
            toggle.textContent = editable ? "Save" : "Edit";
        }
        if (primary) {
            primary.textContent = editable ? "Save Profile" : "Edit Profile";
        }
    };

    toggle?.addEventListener("click", toggleEdit);
    primary?.addEventListener("click", toggleEdit);
}

function initGlobalSearch() {
    const search = document.getElementById("global-search");
    if (!search) return;

    // Search filtering on current page
    search.addEventListener("input", (event) => {
        const query = event.target.value.toLowerCase().trim();
        const currentPage = document.body.dataset.page;

        // On dashboard, filter the displayed destinations
        if (currentPage === "dashboard") {
            if (!query) {
                // Reset to show all recommendations
                loadRecommendations();
                return;
            }

            // Filter destinations based on search query
            const filtered = destinations.filter(place => {
                return place.name.toLowerCase().includes(query) ||
                       place.location.toLowerCase().includes(query) ||
                       place.category.toLowerCase().includes(query) ||
                       place.tags.some(tag => tag.toLowerCase().includes(query));
            });

            // Render filtered results
            renderGrid("top-destinations", filtered.slice(0, 5));
            renderGrid("seasonal-destinations", filtered.slice(5, 10));

            // Show "no results" message if empty
            const topContainer = document.getElementById("top-destinations");
            if (filtered.length === 0 && topContainer) {
                topContainer.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #666;">
                        <p>No destinations found for "${escapeHtml(query)}"</p>
                        <a href="/explore" style="color: #11258f; text-decoration: underline;">Explore all destinations</a>
                    </div>
                `;
                const seasonalContainer = document.getElementById("seasonal-destinations");
                if (seasonalContainer) seasonalContainer.innerHTML = "";
            }
        }
    });

    // On Enter, go to explore page with search term
    search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const query = search.value.trim();
            if (query) {
                // Store search term for explore page to use
                sessionStorage.setItem("explore-search", query);
            }
            window.location.href = "/explore";
        }
    });
}

function setAuthState(user) {
    const profileName = document.getElementById("profile-name");
    const authBtn = document.getElementById("auth-btn");
    const logoutBtn = document.getElementById("logout-btn");

    const userName = user?.name || user?.username || user?.email?.split('@')[0];

    if (user && userName) {
        if (profileName) profileName.textContent = userName;
        if (authBtn) authBtn.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.remove("hidden");
    } else {
        if (profileName) profileName.textContent = "Guest";
        if (authBtn) authBtn.classList.remove("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
    }
    updateUserElements(user);
}

function updateAuthFormVisibility() {
    // Simplified - no OTP functionality
    const passwordRow = document.getElementById("auth-password-row");
    if (passwordRow) {
        passwordRow.classList.remove("hidden");
    }
}

function openAuthModal(mode = "login") {
    authMode = mode;
    const overlay = document.getElementById("auth-modal");
    const title = document.getElementById("auth-modal-title");
    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const registerExtraFields = document.getElementById("register-extra-fields");

    overlay.classList.remove("hidden");

    if (mode === "register") {
        title.textContent = "Register";
        loginTab.classList.remove("active");
        registerTab.classList.add("active");
        if (registerExtraFields) registerExtraFields.classList.remove("hidden");
    } else {
        title.textContent = "Login";
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        if (registerExtraFields) registerExtraFields.classList.add("hidden");
    }
    updateAuthFormVisibility();
}

function closeAuthModal() {
    document.getElementById("auth-modal").classList.add("hidden");
}

// ─── FORGOT PASSWORD MODAL ──────────────────────────────────────────────────
function openResetPasswordModal() {
    const modal = document.getElementById("reset-password-modal");
    if (modal) {
        modal.classList.remove("hidden");
        // Clear previous values
        document.getElementById("reset-email").value = "";
        document.getElementById("reset-new-password").value = "";
        document.getElementById("reset-confirm-password").value = "";
    }
}

function closeResetPasswordModal() {
    const modal = document.getElementById("reset-password-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById("reset-submit");
    const email = document.getElementById("reset-email").value.trim().toLowerCase();
    const newPassword = document.getElementById("reset-new-password").value;
    const confirmPassword = document.getElementById("reset-confirm-password").value;
    
    // Validation
    if (!email) {
        alert("Please enter your email.");
        return;
    }
    if (!validateEmail(email)) {
        alert("Please enter a valid email address.");
        return;
    }
    if (!newPassword || !confirmPassword) {
        alert("Please fill in both password fields.");
        return;
    }
    if (newPassword !== confirmPassword) {
        alert("Passwords do not match.");
        return;
    }
    
    // Password strength validation
    if (newPassword.length < 8) {
        alert("Password must be at least 8 characters.");
        return;
    }
    if (!/[A-Z]/.test(newPassword)) {
        alert("Password must contain at least 1 uppercase letter.");
        return;
    }
    if (!/[a-z]/.test(newPassword)) {
        alert("Password must contain at least 1 lowercase letter.");
        return;
    }
    if (!/[0-9]/.test(newPassword)) {
        alert("Password must contain at least 1 number.");
        return;
    }
    
    setLoading(submitBtn, true);
    
    try {
        const res = await fetch(apiUrl("/api/auth/reset-password"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert("Password updated successfully. Please login with your new password.");
            closeResetPasswordModal();
            openAuthModal("login");
        } else {
            alert(data.msg || "Failed to reset password. Please try again.");
        }
    } catch (err) {
        console.error("Reset password error:", err);
        alert("Connection error. Please check your internet connection.");
    } finally {
        setLoading(submitBtn, false);
    }
}

function initAuth() {
    const authBtn = document.getElementById("auth-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const closeAuth = document.getElementById("close-auth");
    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");
    const authForm = document.getElementById("auth-form");

    authBtn?.addEventListener("click", () => openAuthModal("login"));
    logoutBtn?.addEventListener("click", () => {
        localStorage.removeItem("wanderai-user");
        setAuthState(null);
    });

    closeAuth?.addEventListener("click", closeAuthModal);

    loginTab?.addEventListener("click", () => openAuthModal("login"));
    registerTab?.addEventListener("click", () => openAuthModal("register"));

    // Forgot password - opens reset password modal
    document.getElementById("forgot-password")?.addEventListener("click", () => {
        closeAuthModal();
        openResetPasswordModal();
    });

    // Reset password form
    document.getElementById("reset-password-form")?.addEventListener("submit", handleResetPasswordSubmit);
    
    // Close reset password modal
    document.getElementById("close-reset-password")?.addEventListener("click", closeResetPasswordModal);

    document.querySelector(".logout-button")?.addEventListener("click", () => {
        localStorage.removeItem("wanderai-user");
        setAuthState(null);
        window.location.href = "/";
    });

    authForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById("auth-submit");
        
        const name = document.getElementById("auth-username").value.trim();
        const email = document.getElementById("auth-email").value.trim().toLowerCase();
        const password = document.getElementById("auth-password")?.value || "";
        const place = document.getElementById("auth-place")?.value || "";
        const goal = document.getElementById("auth-goal")?.value || "";

        // Email validation
        if (!email) {
            alert("Please enter your email.");
            return;
        }
        if (!validateEmail(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        // Name validation (only required for registration)
        if (authMode === "register" && !name) {
            alert("Please enter your name.");
            return;
        }

        // For registration, require place and goal selection
        if (authMode === "register") {
            if (!place) {
                alert("Please select your location.");
                return;
            }
            if (!goal) {
                alert("Please select your travel interest.");
                return;
            }
        }

        // Password validation
        if (!password) {
            alert("Please enter your password.");
            return;
        }
        if (authMode === "register") {
            const passwordErrors = validatePassword(password);
            if (passwordErrors.length > 0) {
                alert("Password must contain:\n• " + passwordErrors.join("\n• "));
                return;
            }
        }

        // Show loading state
        setLoading(submitBtn, true);

        const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
        const body = authMode === "register" ? { name, email, password, place, goal } : { email, password };

        try {
            const res = await fetch(apiUrl(endpoint), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                // Normalize user data - backend may return 'username' or 'name'
                const userData = data.user || {};
                const user = {
                    name: userData.name || userData.username || name,
                    email: userData.email || email,
                    place: userData.place || place || "",
                    goal: userData.goal || goal || ""
                };
                
                // Store auth data
                writeJson("wanderai-user", user);
                writeJson("user", user);
                if (data.token) localStorage.setItem("token", data.token);
                
                // Sync place and goal to localStorage for dashboard
                localStorage.setItem("userLocation", user.place || "");
                localStorage.setItem("goal", (user.goal || "").toLowerCase());
                localStorage.setItem("wanderai-goal", user.goal || "");
                
                setAuthState(user);
                closeAuthModal();
                
                // For new registrations, clear onboarding flag and show onboarding modal
                if (authMode === "register") {
                    localStorage.removeItem("onboardingComplete");
                    localStorage.removeItem("onboardingInterests");
                    localStorage.removeItem("onboardingLocations");
                }
                
                window.location.href = "/dashboard";
            } else {
                // Show specific error from server
                alert(data.msg || data.error || `Authentication failed (${res.status}). Please try again.`);
            }
        } catch (err) {
            console.error("Auth error:", err);
            alert("Connection error. Please check your internet connection and try again.");
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

/**
 * Legacy compatibility wrapper - calls new initAgendaSystem
 */
function initRightPanel() {
    initAgendaSystem();
}

/**
 * Legacy compatibility wrapper - day buttons now handled in initAgendaSystem
 */
function populateAgendaDays() {
    // Now handled by initDayButtons() inside initAgendaSystem()
    console.log("[Agenda] populateAgendaDays() is deprecated, use initAgendaSystem()");
}

function updateUserElements(user) {
    document.querySelectorAll(".userName").forEach(el => {
        el.textContent = user?.name || "Guest";
    });
    document.querySelectorAll(".userPlace").forEach(el => {
        el.textContent = user?.place || "London";
    });
}

async function init() {
    const user = getCurrentUser();
    if (user) {
        updateUserElements(user);
        setAuthState(user);
    }

    updateGoalLabels();

    initGlobalSearch();
    initAuth();
    initAgendaSystem();  // Initialize the refactored agenda system

    savedIds = readJson("wanderai-saved", []);
    // Keep goal in sync: prefer lowercase "goal" key, fall back to "wanderai-goal"
    const storedGoal = localStorage.getItem("goal") || localStorage.getItem("wanderai-goal") || "Nature";
    goal = storedGoal.charAt(0).toUpperCase() + storedGoal.slice(1).toLowerCase();
    localStorage.setItem("goal", goal.toLowerCase());
    localStorage.setItem("wanderai-goal", goal);
    // Sync budget from trip-plan if not set separately
    if (!localStorage.getItem("budget")) {
        const plan = readJson("trip-plan", {});
        if (plan.budget) localStorage.setItem("budget", String(plan.budget));
    }
    setCurrentSavedIds(savedIds);
    updateGoalLabels();

    const loaded = await fetchDestinations();
    if (loaded && loaded.length > 0) {
        // Merge server destinations — add only slugs not already in local list
        const localIds = new Set(destinations.map(d => d.id));
        const newOnes = loaded.filter(d => !localIds.has(d.id));
        destinations = [...destinations, ...newOnes];
    }

    const page = document.body.dataset.page;
    if (page === "dashboard") initDashboard();
    if (page === "explore") initExplore();
    if (page === "saved") initSaved();
    if (page === "goal") initGoal();
    if (page === "trip") initTrip();
    if (page === "trip-results") initTripResults();
    if (page === "itinerary") initItinerary();
    if (page === "profile") initProfile();
}

window.addEventListener("DOMContentLoaded", init);


// ═══════════════════════════════════════════════════════════════════════════════
// BEST-IN-CLASS CHAT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Chat State Management ────────────────────────────────────────────────────
const ChatSystem = {
  sessionId: localStorage.getItem("chatSessionId") || Date.now().toString(),
  isTyping: false,
  isSending: false,        // Debounce guard
  maxHistory: 100,
  contextWindow: 20,       // Keep last 20 messages for context
  lastAssistantMsgs: [],   // Last 3 assistant replies for anti-repetition
  metadata: {              // Persistent context across conversation
    country: localStorage.getItem("chat-lastCountry") || null,
    days: localStorage.getItem("chat-lastDays") || null,
    budget: localStorage.getItem("chat-lastBudget") || null,
    intent: null
  },

  init() {
    localStorage.setItem("chatSessionId", this.sessionId);
    this.loadChatHistory();
    this.setupEventListeners();
    this.setupQuickActions();
  },

  setupEventListeners() {
    const input = document.getElementById("input");
    if (!input) return;

    // Send on Enter (not Shift+Enter)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize with limits
    input.addEventListener("input", () => {
      input.style.height = "auto";
      const newHeight = Math.min(Math.max(input.scrollHeight, 44), 120);
      input.style.height = `${newHeight}px`;
    });

    // Focus input when chat opens
    const chatBox = document.getElementById("chatBox");
    if (chatBox) {
      const observer = new MutationObserver(() => {
        if (chatBox.style.display === "flex") {
          setTimeout(() => input.focus(), 100);
        }
      });
      observer.observe(chatBox, { attributes: true, attributeFilter: ["style"] });
    }
  },

  setupQuickActions() {
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv) return;
    setTimeout(() => {
      if (messagesDiv.children.length === 1) {
        this.appendQuickActions();
      }
    }, 500);
  },

  scrollToBottom() {
    const el = document.getElementById("messages");
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  },

  formatTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  formatMessage(text) {
    if (!text) return "";
    let formatted = this.escapeHtml(text);
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/__(.+?)__/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/_(.+?)_/g, "<em>$1</em>");
    formatted = formatted.replace(/^\s*[-•]\s+(.+)$/gm, "<li style='margin-left:16px;margin-bottom:4px;'>$1</li>");
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" style="color:#11258f;text-decoration:underline;">$1</a>'
    );
    return formatted;
  },

  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  // ─── Anti-Repetition Logic ────────────────────────────────────────────────
  isSimilarToRecent(reply) {
    if (!reply || this.lastAssistantMsgs.length === 0) return false;
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const normalizedReply = normalize(reply);
    for (const prev of this.lastAssistantMsgs) {
      const normalizedPrev = normalize(prev);
      if (normalizedReply.length < 10 || normalizedPrev.length < 10) continue;
      // Simple Jaccard similarity on words
      const wordsA = new Set(normalizedReply.split(" "));
      const wordsB = new Set(normalizedPrev.split(" "));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      const similarity = union > 0 ? intersection / union : 0;
      if (similarity > 0.8) return true;
    }
    return false;
  },

  addRepetitionPrefix(reply) {
    const prefixes = [
      "Let me give you a different perspective...\n\n",
      "Here's another angle to consider:\n\n",
      "Building on what I mentioned earlier, here's more detail:\n\n",
      "Let me expand on that with some fresh ideas:\n\n",
      "Here's a more tailored take:\n\n"
    ];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + reply;
  },

  // ─── Context Extraction ────────────────────────────────────────────────────
  extractContext(message) {
    const lower = message.toLowerCase();
    const ctx = { country: null, days: null, budget: null, intent: null };

    const countries = {
      japan: ["tokyo", "kyoto", "osaka", "hiroshima", "japan"],
      france: ["paris", "france", "nice", "lyon", "marseille"],
      italy: ["rome", "italy", "venice", "florence", "milan", "naples", "amalfi"],
      bali: ["bali", "indonesia", "ubud", "seminyak", "kuta"],
      greece: ["greece", "athens", "santorini", "mykonos"],
      thailand: ["thailand", "bangkok", "phuket", "chiang mai"],
      uk: ["uk", "london", "edinburgh", "britain", "manchester"],
      iceland: ["iceland", "reykjavik"],
      peru: ["peru", "machu picchu", "cusco", "lima"],
      "new zealand": ["new zealand", "auckland", "queenstown"],
      canada: ["canada", "toronto", "vancouver", "banff", "montreal"],
      morocco: ["morocco", "marrakech", "fes"],
      spain: ["spain", "barcelona", "madrid", "seville"],
      australia: ["australia", "sydney", "melbourne", "brisbane"],
      usa: ["usa", "new york", "los angeles", "california", "hawaii"],
      india: ["india", "delhi", "mumbai", "goa", "jaipur", "kerala"],
      portugal: ["portugal", "lisbon", "porto"],
      turkey: ["turkey", "istanbul", "cappadocia"],
      egypt: ["egypt", "cairo", "luxor"],
      mexico: ["mexico", "cancun", "mexico city"]
    };

    for (const [country, keywords] of Object.entries(countries)) {
      if (keywords.some(k => lower.includes(k))) {
        ctx.country = country;
        break;
      }
    }

    const daysMatch = lower.match(/(\d+)\s*(?:day|days|night|nights)/);
    if (daysMatch) ctx.days = parseInt(daysMatch[1]);

    const budgetMatch = lower.match(/(?:under|budget|around|£|\$|€)\s*(\d[\d,]*)/i);
    if (budgetMatch) ctx.budget = parseInt(budgetMatch[1].replace(/,/g, ""));

    const intents = {
      itinerary: ["itinerary", "plan", "schedule", "day by day", "day-by-day", "trip plan"],
      food: ["food", "eat", "restaurant", "cuisine", "dish", "try", "dining"],
      budget: ["budget", "cost", "price", "cheap", "expensive", "money", "afford"],
      accommodation: ["hotel", "stay", "accommodation", "airbnb", "hostel", "resort"],
      activities: ["things to do", "activities", "attractions", "visit", "see", "explore"],
      transport: ["transport", "train", "flight", "bus", "getting around", "travel between"]
    };

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(k => lower.includes(k))) {
        ctx.intent = intent;
        break;
      }
    }

    return ctx;
  },

  // Merge new context into persistent metadata
  updateMetadata(newCtx) {
    if (newCtx.country) {
      this.metadata.country = newCtx.country;
      localStorage.setItem("chat-lastCountry", newCtx.country);
    }
    if (newCtx.days) {
      this.metadata.days = newCtx.days;
      localStorage.setItem("chat-lastDays", String(newCtx.days));
    }
    if (newCtx.budget) {
      this.metadata.budget = newCtx.budget;
      localStorage.setItem("chat-lastBudget", String(newCtx.budget));
    }
    if (newCtx.intent) {
      this.metadata.intent = newCtx.intent;
    }
  },

  // Build context summary for the backend
  buildContextPayload() {
    return {
      country: this.metadata.country,
      days: this.metadata.days ? parseInt(this.metadata.days) : null,
      budget: this.metadata.budget ? parseInt(this.metadata.budget) : null,
      intent: this.metadata.intent
    };
  },

  // ─── Message Rendering ────────────────────────────────────────────────────
  appendMessage(role, text, options = {}) {
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv) return;

    const isUser = role === "user";
    const messageId = options.id || `msg-${Date.now()}`;

    const container = document.createElement("div");
    container.id = messageId;
    container.className = `chat-message ${role}`;
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: ${isUser ? "flex-end" : "flex-start"};
      gap: 4px;
      margin-bottom: 12px;
      animation: fadeIn 0.3s ease;
    `;

    const bubble = document.createElement("div");
    bubble.style.cssText = `
      max-width: 85%;
      padding: ${isUser ? "10px 14px" : "12px 16px"};
      border-radius: ${isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px"};
      background: ${isUser ? "linear-gradient(135deg,#11258f,#1a3bbf)" : "#fff"};
      color: ${isUser ? "#fff" : "#1a1a2e"};
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border: ${isUser ? "none" : "1px solid #e5e7eb"};
      word-wrap: break-word;
    `;
    bubble.innerHTML = this.formatMessage(text);

    const time = document.createElement("span");
    time.style.cssText = "font-size:11px;color:#9ca3af;padding:0 4px;";
    time.textContent = options.time || this.formatTime();

    container.appendChild(bubble);
    container.appendChild(time);
    messagesDiv.appendChild(container);

    this.scrollToBottom();
    return messageId;
  },

  appendQuickActions() {
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv) return;

    const actions = [
      { text: "🏝️ Best beaches in Bali", query: "Best beaches in Bali" },
      { text: "🗾 5-day Japan itinerary", query: "5 day itinerary in Japan" },
      { text: "💰 Budget tips", query: "Travel budget tips" },
      { text: "🍜 Food in Italy", query: "Best food to try in Italy" },
    ];

    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0 16px 0;
      max-width: 90%;
    `;

    actions.forEach(action => {
      const btn = document.createElement("button");
      btn.textContent = action.text;
      btn.style.cssText = `
        padding: 8px 14px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        color: #374151;
      `;
      btn.onmouseover = () => {
        btn.style.background = "#f3f4f6";
        btn.style.borderColor = "#11258f";
      };
      btn.onmouseout = () => {
        btn.style.background = "#fff";
        btn.style.borderColor = "#e5e7eb";
      };
      btn.onclick = () => {
        document.getElementById("input").value = action.query;
        this.sendMessage();
      };
      container.appendChild(btn);
    });

    messagesDiv.appendChild(container);
  },

  showTypingIndicator() {
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv || this.isTyping) return;

    this.isTyping = true;
    const id = `typing-${Date.now()}`;

    const container = document.createElement("div");
    container.id = id;
    container.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-bottom: 12px;
    `;

    const bubble = document.createElement("div");
    bubble.style.cssText = `
      padding: 14px 16px;
      border-radius: 18px 18px 18px 4px;
      background: #fff;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    `;

    bubble.innerHTML = `
      <span style="display:inline-flex;gap:4px;align-items:center;">
        <span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bounce 1.2s infinite 0s;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bounce 1.2s infinite 0.2s;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bounce 1.2s infinite 0.4s;"></span>
      </span>
    `;

    container.appendChild(bubble);
    messagesDiv.appendChild(container);
    this.scrollToBottom();

    return id;
  },

  hideTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 200);
    }
    this.isTyping = false;
  },

  // ─── Chat History ─────────────────────────────────────────────────────────
  loadChatHistory() {
    const history = readJson("chatHistory", []);
    const messagesDiv = document.getElementById("messages");
    if (!messagesDiv) return;

    messagesDiv.innerHTML = "";

    if (history.length === 0) {
      this.showWelcomeMessage();
      return;
    }

    // Restore lastAssistantMsgs from history for anti-repetition
    const assistantMsgs = history.filter(m => m.role === "assistant").slice(-3);
    this.lastAssistantMsgs = assistantMsgs.map(m => m.content);

    // Show last N messages
    const recent = history.slice(-this.contextWindow);
    recent.forEach(msg => {
      this.appendMessage(msg.role === "user" ? "user" : "ai", msg.content, { time: msg.time });
    });

    this.scrollToBottom();
  },

  showWelcomeMessage() {
    const welcome = `Hi! I'm WanderAI ✈️ Your personal travel assistant.

I can help you with:
• 🌍 Destination recommendations
• 🗓️ Day-by-day itineraries  
• 💰 Budget planning
• 🍜 Local food & culture
• 🏨 Accommodation tips

**Try asking:**
• "Best places in Japan for 5 days"
• "Budget itinerary for Bali under $1000"
• "What to eat in Rome?"
• "Family-friendly activities in London"`;

    this.appendMessage("ai", welcome);
    this.appendQuickActions();
  },

  saveChatHistory(userMsg, aiReply) {
    let history = readJson("chatHistory", []);
    const time = this.formatTime();

    history.push({ role: "user", content: userMsg, time, timestamp: Date.now() });
    history.push({ role: "assistant", content: aiReply, time, timestamp: Date.now() });

    // Keep only recent messages
    if (history.length > this.maxHistory) {
      history = history.slice(-this.maxHistory);
    }

    writeJson("chatHistory", history);

    // Update anti-repetition buffer
    this.lastAssistantMsgs.push(aiReply);
    if (this.lastAssistantMsgs.length > 3) {
      this.lastAssistantMsgs = this.lastAssistantMsgs.slice(-3);
    }
  },

  // ─── Send Message (Core) ──────────────────────────────────────────────────
  async sendMessage() {
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send-btn");
    const message = (input?.value || "").trim();

    // Debounce: prevent double send
    if (!message || this.isSending || this.isTyping) return;

    this.isSending = true;

    // Disable send button while loading
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.5";
      sendBtn.style.cursor = "not-allowed";
    }

    // Clear input AFTER validation (before was clearing too early)
    input.value = "";
    input.style.height = "44px";

    // Add user message to UI
    this.appendMessage("user", message);

    // Extract and merge context
    const newCtx = this.extractContext(message);
    this.updateMetadata(newCtx);
    const contextPayload = this.buildContextPayload();

    // Build message history for backend (last 20 unique messages)
    const history = readJson("chatHistory", []);
    const recentHistory = history.slice(-this.contextWindow).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Show typing indicator
    const typingId = this.showTypingIndicator();

    try {
      const user = getCurrentUser();

      const payload = {
        message,
        sessionId: this.sessionId,
        context: contextPayload,
        history: recentHistory,
        userGoal: getUserGoal(),
        userLocation: user?.place || localStorage.getItem("userLocation"),
        budget: localStorage.getItem("budget")
      };

      console.log("[Chat] Request payload:", {
        sessionId: payload.sessionId,
        messageCount: payload.history.length,
        message: payload.message.substring(0, 50) + "...",
        context: payload.context
      });

      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      this.hideTypingIndicator(typingId);

      if (!res.ok) throw new Error("Service unavailable");

      const data = await res.json();
      let reply = data.reply || data.message || "I'm sorry, I couldn't process that.";

      // Update metadata from backend if provided
      if (data.updatedContext) {
        if (data.updatedContext.country) this.updateMetadata({ country: data.updatedContext.country });
        if (data.updatedContext.days) this.updateMetadata({ days: data.updatedContext.days });
        if (data.updatedContext.budget) this.updateMetadata({ budget: data.updatedContext.budget });
      }

      // Anti-repetition: check if reply is too similar to recent ones
      if (this.isSimilarToRecent(reply)) {
        console.log("[Chat] Detected repetitive response, adding variation prefix");
        reply = this.addRepetitionPrefix(reply);
      }

      this.appendMessage("ai", reply);
      this.saveChatHistory(message, reply);

      console.log("[Chat] Response received:", {
        replyLength: reply.length,
        fallback: data.fallback || false,
        historyCount: readJson("chatHistory", []).length
      });

    } catch (error) {
      this.hideTypingIndicator(typingId);
      console.error("[Chat] Error:", error.message);

      // Fallback response
      const fallback = this.generateFallbackResponse(message, contextPayload);
      this.appendMessage("ai", fallback);
      this.saveChatHistory(message, fallback);
    } finally {
      this.isSending = false;
      // Re-enable send button
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.style.cursor = "pointer";
      }
    }
  },

  generateFallbackResponse(message, context) {
    const lower = message.toLowerCase();

    if (lower.includes("japan") || lower.includes("tokyo") || lower.includes("kyoto")) {
      return `**Japan Travel Tips** 🇯🇵

**Top Destinations:**
• Tokyo - Modern culture, shopping, food
• Kyoto - Temples, traditional culture
• Osaka - Street food, nightlife
• Hiroshima - History, peace memorial

**Best Time to Visit:** Spring (cherry blossoms) or Fall (autumn colors)

**Budget:** $100-200/day for comfortable travel

Would you like a specific itinerary for your trip?`;
    }

    if (lower.includes("bali") || lower.includes("indonesia")) {
      return `**Bali Travel Guide** 🏝️

**Must-Visit Areas:**
• Ubud - Rice terraces, yoga, culture
• Seminyak - Beaches, restaurants, nightlife
• Uluwatu - Cliff temples, surfing
• Nusa Penida - Stunning viewpoints

**Food to Try:**
• Nasi Goreng (fried rice)
• Mie Goreng (fried noodles)
• Satay skewers
• Babi Guling (suckling pig)

**Budget:** $50-100/day for mid-range travel`;
    }

    if (lower.includes("italy") || lower.includes("rome") || lower.includes("venice")) {
      return `**Italy Highlights** 🇮🇹

**Classic Route (10-14 days):**
• Rome (3-4 days) - Colosseum, Vatican, history
• Florence (2-3 days) - Art, Tuscany wine
• Venice (2 days) - Canals, St. Mark's
• Amalfi Coast (2-3 days) - Coastal beauty

**Must-Try Foods:**
• Pizza in Naples
• Pasta Carbonara in Rome
• Gelato everywhere!
• Aperol Spritz

**Tips:** Book museum tickets in advance. Eat where locals eat!`;
    }

    if (lower.includes("budget") || lower.includes("cheap")) {
      return `**Budget Travel Tips** 💰

**Save Money On:**
• Flights - Use incognito mode, be flexible with dates
• Accommodation - Hostels, Airbnb, house sitting
• Food - Street food, local markets, cooking some meals
• Transport - Public transit over taxis, walk when possible

**Free Activities:**
• Walking tours (tip-based)
• Museums on free days
• Parks and beaches
• Window shopping in unique neighborhoods

**Apps to Download:**
• Hostelworld, Booking.com, Skyscanner, Google Maps offline`;
    }

    return `Thanks for your question! 🌍

I'd love to help you plan your trip. To give you the best recommendations, could you tell me:

• Which destination(s) you're interested in?
• How many days will you be traveling?
• What's your approximate budget?
• Any specific interests? (food, adventure, culture, relaxation)

Or try asking about:
• "5-day itinerary for [destination]"
• "Best things to do in [city]"
• "Budget tips for [country]"
• "Where to eat in [city]"`;
  },

  newChat() {
    const messagesDiv = document.getElementById("messages");
    if (messagesDiv) messagesDiv.innerHTML = "";

    localStorage.removeItem("chatHistory");
    localStorage.removeItem("chat-lastCountry");
    localStorage.removeItem("chat-lastDays");
    localStorage.removeItem("chat-lastBudget");

    this.sessionId = Date.now().toString();
    localStorage.setItem("chatSessionId", this.sessionId);

    // Reset all state
    this.isSending = false;
    this.isTyping = false;
    this.lastAssistantMsgs = [];
    this.metadata = { country: null, days: null, budget: null, intent: null };

    this.showWelcomeMessage();

    // Notify backend to clear session
    fetchWithAuth("/api/chat/reset", { method: "POST" }).catch(() => {});
  }
};

// ─── Global Chat Functions (for HTML onclick handlers) ────────────────────────
function toggleChat() {
  const box = document.getElementById("chatBox");
  const isHidden = box.style.display === "none" || !box.style.display;
  box.style.display = isHidden ? "flex" : "none";
  if (isHidden) {
    ChatSystem.scrollToBottom();
    setTimeout(() => document.getElementById("input")?.focus(), 100);
  }
}

function sendMessage() {
  ChatSystem.sendMessage();
}

function newChat() {
  ChatSystem.newChat();
}

// ─── Initialize Chat on Load ──────────────────────────────────────────────────
window.addEventListener("load", () => {
  ChatSystem.init();
});

// Inject animations
if (!document.getElementById("chat-animations")) {
  const style = document.createElement("style");
  style.id = "chat-animations";
  style.textContent = `
    @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .chat-message { animation: fadeIn 0.3s ease; }
  `;
  document.head.appendChild(style);
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL FIXES: ONBOARDING, STATS, SEARCH, TRIP PLANNING STATE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ONBOARDING FLOW ──────────────────────────────────────────────────────────
let onboardingInterests = [];
let onboardingLocations = [];

function initOnboarding() {
    const modal = document.getElementById("onboarding-modal");
    if (!modal) return;

    // Interest selection
    document.querySelectorAll(".interest-option").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("selected");
            const interest = btn.dataset.interest;
            if (btn.classList.contains("selected")) {
                if (!onboardingInterests.includes(interest)) {
                    onboardingInterests.push(interest);
                }
            } else {
                onboardingInterests = onboardingInterests.filter(i => i !== interest);
            }
            // Enable/disable continue button
            const nextBtn = document.getElementById("onboarding-next-1");
            if (nextBtn) nextBtn.disabled = onboardingInterests.length === 0;
        });
    });

    // Location selection
    document.querySelectorAll(".location-option").forEach(btn => {
        btn.addEventListener("click", () => {
            btn.classList.toggle("selected");
            const location = btn.dataset.location;
            if (btn.classList.contains("selected")) {
                if (!onboardingLocations.includes(location)) {
                    onboardingLocations.push(location);
                }
            } else {
                onboardingLocations = onboardingLocations.filter(l => l !== location);
            }
            // Enable/disable finish button
            const finishBtn = document.getElementById("onboarding-finish");
            if (finishBtn) finishBtn.disabled = onboardingLocations.length === 0;
        });
    });

    // Navigation buttons
    document.getElementById("onboarding-next-1")?.addEventListener("click", () => {
        document.getElementById("onboarding-step-1").classList.add("hidden");
        document.getElementById("onboarding-step-2").classList.remove("hidden");
    });

    document.getElementById("onboarding-back-2")?.addEventListener("click", () => {
        document.getElementById("onboarding-step-2").classList.add("hidden");
        document.getElementById("onboarding-step-1").classList.remove("hidden");
    });

    document.getElementById("onboarding-finish")?.addEventListener("click", completeOnboarding);
}

async function completeOnboarding() {
    const user = getCurrentUser();
    if (!user) {
        // Save locally if no user
        localStorage.setItem("onboardingInterests", JSON.stringify(onboardingInterests));
        localStorage.setItem("onboardingLocations", JSON.stringify(onboardingLocations));
        localStorage.setItem("onboardingComplete", "true");
        closeOnboardingModal();
        return;
    }

    // Show loading state
    document.getElementById("onboarding-step-2").classList.add("hidden");
    document.getElementById("onboarding-loading").classList.remove("hidden");

    try {
        const res = await fetchWithAuth("/api/user/onboarding", {
            method: "POST",
            body: JSON.stringify({
                interests: onboardingInterests,
                preferred_locations: onboardingLocations
            })
        });
        if (res.ok) {
            localStorage.setItem("onboardingComplete", "true");
            // Save to user object
            user.interests = onboardingInterests;
            user.preferred_locations = onboardingLocations;
            writeJson("wanderai-user", user);
        }
    } catch (e) {
        console.error("Onboarding save failed:", e);
    }

    closeOnboardingModal();
}

function closeOnboardingModal() {
    document.getElementById("onboarding-modal")?.classList.add("hidden");
}

async function checkAndShowOnboarding() {
    const user = getCurrentUser();
    const isComplete = localStorage.getItem("onboardingComplete") === "true";

    if (!user) return; // Don't show for guests
    if (isComplete) return; // Already completed

    // Show onboarding modal immediately
    const modal = document.getElementById("onboarding-modal");
    if (modal) {
        modal.classList.remove("hidden");
        // Reset onboarding data
        onboardingInterests = [];
        onboardingLocations = [];
        // Reset UI
        document.querySelectorAll(".interest-option").forEach(btn => btn.classList.remove("selected"));
        document.querySelectorAll(".location-option").forEach(btn => btn.classList.remove("selected"));
        document.getElementById("onboarding-step-1")?.classList.remove("hidden");
        document.getElementById("onboarding-step-2")?.classList.add("hidden");
        document.getElementById("onboarding-loading")?.classList.add("hidden");
        document.getElementById("onboarding-next-1").disabled = true;
        document.getElementById("onboarding-finish").disabled = true;
    }

    // Also check server status in background
    try {
        const res = await fetchWithAuth("/api/user/onboarding");
        if (res.ok) {
            const data = await res.json();
            if (data.onboarding_complete) {
                localStorage.setItem("onboardingComplete", "true");
                modal?.classList.add("hidden");
            }
        }
    } catch (e) {
        // Server unavailable - localStorage fallback already handled above
    }
}


// ─── USER STATS API INTEGRATION ───────────────────────────────────────────────
async function fetchUserStats() {
    const user = getCurrentUser();
    if (!user) return { total_expense: 0, goals_achieved: 0, trips_completed: 0, progress_percent: 0 };

    try {
        const res = await fetchWithAuth("/api/user/stats");
        if (res.ok) {
            const stats = await res.json();
            // Update localStorage cache
            localStorage.setItem("userStats", JSON.stringify(stats));
            return stats;
        }
    } catch (e) {
        console.error("Failed to fetch stats:", e);
    }

    // Fallback to localStorage
    const cached = localStorage.getItem("userStats");
    return cached ? JSON.parse(cached) : { total_expense: 0, goals_achieved: 0, trips_completed: 0, progress_percent: 0 };
}

async function updateDashboardStats() {
    const stats = await fetchUserStats();
    const user = getCurrentUser();

    // Update expense
    const expenseEl = document.getElementById("expense-value");
    if (expenseEl) {
        expenseEl.textContent = stats.total_expense.toLocaleString();
    }

    // Update goals count
    const goalCountEl = document.getElementById("goalCount");
    if (goalCountEl) {
        goalCountEl.textContent = stats.goals_achieved;
    }

    // Update goal label from user data or show "Not set"
    const goalLabelEl = document.getElementById("dashboard-goal-label");
    if (goalLabelEl) {
        const userGoal = user?.goal || localStorage.getItem("wanderai-goal") || localStorage.getItem("goal");
        goalLabelEl.textContent = userGoal ? userGoal.charAt(0).toUpperCase() + userGoal.slice(1).toLowerCase() : "Not set";
    }

    // Update progress bar
    const progressFill = document.querySelector(".metric-lilac .progress-fill");
    if (progressFill) {
        progressFill.style.width = `${stats.progress_percent}%`;
    }

    // Update progress text
    const progressStrong = document.querySelector(".metric-lilac .metric-progress-copy strong");
    if (progressStrong) {
        progressStrong.textContent = `${stats.progress_percent}%`;
    }
}


// ─── USER TRIPS API ───────────────────────────────────────────────────────────
async function fetchUserTrips(status = null) {
    const user = getCurrentUser();
    if (!user) return [];

    try {
        const url = status
            ? `/api/user/trips?status=${status}`
            : "/api/user/trips";
        const res = await fetchWithAuth(url);
        if (res.ok) {
            const data = await res.json();
            return data.trips || [];
        }
    } catch (e) {
        console.error("Failed to fetch trips:", e);
    }
    return [];
}

async function renderUserAgenda() {
    const container = document.getElementById("agenda-schedule");
    if (!container) return;

    const trips = await fetchUserTrips();

    if (trips.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 20px; color: #70707a;">
                <div style="font-size: 32px; margin-bottom: 12px;">🗺️</div>
                <p>No trips planned yet</p>
                <a href="/trip" style="color: #11258f; text-decoration: underline; font-size: 13px;">Plan your first trip</a>
            </div>
        `;
        return;
    }

    // Show actual trip schedule
    const activeTrip = trips[0]; // Show the most recent trip
    container.innerHTML = trips.slice(0, 3).map(trip => `
        <div class="schedule-item fade-in">
            <div>
                <strong>${trip.destination_name}</strong>
                <span>${trip.location || trip.destination_slug}</span>
            </div>
            <time>${trip.days} days</time>
        </div>
    `).join("");
}


// ─── SEARCH WITH DEBOUNCING ───────────────────────────────────────────────────
let searchTimeout = null;
const SEARCH_DEBOUNCE_MS = 300;

async function performSearch(query) {
    if (!query || query.length < 2) return { results: [], count: 0 };

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Search failed:", e);
    }

    // Fallback: search locally
    const results = destinations.filter(dest => {
        return dest.name.toLowerCase().includes(query.toLowerCase()) ||
               dest.location.toLowerCase().includes(query.toLowerCase()) ||
               dest.category.toLowerCase().includes(query.toLowerCase()) ||
               dest.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()));
    });
    return { results, count: results.length };
}

function initDashboardSearch() {
    const searchInput = document.getElementById("global-search");
    if (!searchInput) return;

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();

        clearTimeout(searchTimeout);

        if (!query) {
            loadRecommendations();
            return;
        }

        searchTimeout = setTimeout(async () => {
            const data = await performSearch(query);

            // Update top destinations with search results
            const topContainer = document.getElementById("top-destinations");
            const seasonalContainer = document.getElementById("seasonal-destinations");

            if (data.results.length > 0) {
                const mapped = data.results.map(d => ({
                    id: d.slug || d.id,
                    name: d.name,
                    location: d.location,
                    best: d.best || "Best: Year-round",
                    risk: d.risk || "Low",
                    status: (d.risk || "").toLowerCase() === "low" ? "green" : "orange",
                    category: d.category,
                    energy: d.energy || 2,
                    price: d.average_cost || d.price || 0,
                    tags: d.tags || [d.category?.toLowerCase()],
                    image: getLocalImageForSlug(d.slug || d.id),
                    href: `/destination/${d.slug || d.id}`
                }));

                renderGrid("top-destinations", mapped.slice(0, 5));
                if (seasonalContainer) {
                    renderGrid("seasonal-destinations", mapped.slice(5, 10));
                }
            } else {
                if (topContainer) {
                    topContainer.innerHTML = `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #666;">
                            <p>No destinations found for "${escapeHtml(query)}"</p>
                        </div>
                    `;
                }
                if (seasonalContainer) seasonalContainer.innerHTML = "";
            }
        }, SEARCH_DEBOUNCE_MS);
    });
}


// ─── TRIP PLANNING STATE MANAGEMENT ───────────────────────────────────────────
const TRIP_STATE_KEY = "trip-planning-state";

function getTripPlanningState() {
    return readJson(TRIP_STATE_KEY, {
        step: 1,
        location: "",
        budget: 5000,
        currency: "GBP (£)",
        days: 4,
        startDate: "",
        endDate: "",
        goals: ["Nature"],
        energy: "Moderate",
        risk: "Low Risk"
    });
}

function saveTripPlanningState(state) {
    writeJson(TRIP_STATE_KEY, state);
}

function initTripPlanningState() {
    const state = getTripPlanningState();

    // Restore form values
    const locationSelect = document.getElementById("trip-location");
    const budgetInput = document.getElementById("trip-budget");
    const currencySelect = document.getElementById("trip-currency");
    const daysEl = document.getElementById("trip-days");
    const startDateEl = document.getElementById("trip-start-date");
    const endDateEl = document.getElementById("trip-end-date");

    if (locationSelect && state.location) locationSelect.value = state.location;
    if (budgetInput && state.budget) budgetInput.value = state.budget;
    if (currencySelect && state.currency) currencySelect.value = state.currency;
    if (daysEl && state.days) daysEl.textContent = state.days;
    if (startDateEl && state.startDate) startDateEl.value = state.startDate;
    if (endDateEl && state.endDate) endDateEl.value = state.endDate;

    // Restore goal pills
    if (state.goals && state.goals.length > 0) {
        document.querySelectorAll("#preference-pills .choice-pill").forEach(pill => {
            pill.classList.toggle("active", state.goals.includes(pill.textContent.trim()));
        });
    }

    // Restore energy selection
    if (state.energy) {
        document.querySelectorAll("#energy-grid .energy-option").forEach(opt => {
            const isActive = opt.querySelector("strong")?.textContent.trim() === state.energy;
            opt.classList.toggle("active", isActive);
        });
    }

    // Restore risk selection
    if (state.risk) {
        document.querySelectorAll("#risk-grid .energy-option").forEach(opt => {
            const isActive = opt.querySelector("strong")?.textContent.trim() === state.risk;
            opt.classList.toggle("active", isActive);
        });
    }
}

function saveCurrentTripStep(step) {
    const state = getTripPlanningState();
    state.step = step;

    // Save form values
    const locationSelect = document.getElementById("trip-location");
    const budgetInput = document.getElementById("trip-budget");
    const currencySelect = document.getElementById("trip-currency");
    const daysEl = document.getElementById("trip-days");
    const startDateEl = document.getElementById("trip-start-date");
    const endDateEl = document.getElementById("trip-end-date");

    if (locationSelect) state.location = locationSelect.value;
    if (budgetInput) state.budget = parseInt(budgetInput.value) || 5000;
    if (currencySelect) state.currency = currencySelect.value;
    if (daysEl) state.days = parseInt(daysEl.textContent) || 4;
    if (startDateEl) state.startDate = startDateEl.value;
    if (endDateEl) state.endDate = endDateEl.value;

    // Save goals
    const selectedGoals = [...document.querySelectorAll("#preference-pills .choice-pill.active")]
        .map(el => el.textContent.trim());
    if (selectedGoals.length > 0) state.goals = selectedGoals;

    // Save energy
    const energyEl = document.querySelector("#energy-grid .energy-option.active strong");
    if (energyEl) state.energy = energyEl.textContent.trim();

    // Save risk
    const riskEl = document.querySelector("#risk-grid .energy-option.active strong");
    if (riskEl) state.risk = riskEl.textContent.trim();

    saveTripPlanningState(state);
}


// ─── FIXED CARD NAVIGATION ────────────────────────────────────────────────────
// Override createCard to ensure arrow navigation works
function createCardFixed(item) {
    const card = document.createElement("article");
    card.className = "destination-card";
    const imageUrl = item.image || withImageVersion("/static/images/empty.svg");
    // Navigate to itinerary page instead of destination page
    const itineraryHref = `/itinerary/${item.id}`;
    card.innerHTML = `
        <div class="destination-image" style="background-image:url('${imageUrl}')">
            <span class="risk-pill ${item.risk.toLowerCase()}">${item.risk.toUpperCase()} RISK</span>
            <button class="bookmark-mini" type="button" data-bookmark="${item.id}" aria-label="Save destination"></button>
        </div>
        <div class="destination-body">
            <div class="destination-header">
                <h3>${item.name}</h3>
                <span class="status-dot ${item.status === "orange" ? "orange" : ""}"></span>
            </div>
            <small>${item.location}</small>
            <span class="best-time">${item.best}</span>
            <div class="energy-copy">ENERGY REQUIRED</div>
            <div class="energy-bars">
                ${Array.from({ length: 5 }, (_, index) => `<span class="${index < item.energy ? "filled" : ""}"></span>`).join("")}
            </div>
            <div class="destination-footer">
                <a class="arrow-button" href="${itineraryHref}" data-navigate aria-label="View itinerary for ${item.name}">→</a>
            </div>
        </div>
    `;

    // Card click opens detail panel (but not for bookmark or arrow)
    card.addEventListener("click", (event) => {
        if (event.target.closest(".bookmark-mini") || event.target.closest("[data-navigate]")) {
            return;
        }
        recordView(item.id);
        showDestinationInPanel(item);
    });

    // Explicit arrow button handler - CRITICAL FIX for navigation to itinerary
    const arrowBtn = card.querySelector("[data-navigate]");
    if (arrowBtn) {
        arrowBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Store destination data for itinerary page
            localStorage.setItem("currentDestination", JSON.stringify(item));
            // Navigate to itinerary page for this place
            window.location.href = itineraryHref;
        });
    }

    return card;
}

// Override the original createCard function
createCard = createCardFixed;


// ─── OVERRIDE INIT FUNCTION WITH NEW FEATURES ─────────────────────────────────
const originalInit = init;
init = async function() {
    // Call original init
    const user = getCurrentUser();
    if (user) {
        updateUserElements(user);
        setAuthState(user);
    }

    updateGoalLabels();

    // Initialize new features
    initOnboarding();
    initDashboardSearch();

    initAuth();
    initRightPanel();

    savedIds = readJson("wanderai-saved", []);
    const storedGoal = localStorage.getItem("goal") || localStorage.getItem("wanderai-goal") || "";
    goal = storedGoal ? storedGoal.charAt(0).toUpperCase() + storedGoal.slice(1).toLowerCase() : "";
    if (goal) {
        localStorage.setItem("goal", goal.toLowerCase());
        localStorage.setItem("wanderai-goal", goal);
    }

    if (!localStorage.getItem("budget")) {
        const plan = readJson("trip-plan", {});
        if (plan.budget) localStorage.setItem("budget", String(plan.budget));
    }
    setCurrentSavedIds(savedIds);
    updateGoalLabels();

    const loaded = await fetchDestinations();
    if (loaded && loaded.length > 0) {
        const localIds = new Set(destinations.map(d => d.id));
        const newOnes = loaded.filter(d => !localIds.has(d.id));
        destinations = [...destinations, ...newOnes];
    }

    const page = document.body.dataset.page;
    if (page === "dashboard") {
        await initDashboard();
        // Show onboarding for new users
        checkAndShowOnboarding();
        // Load user stats
        updateDashboardStats();
    }
    if (page === "explore") initExplore();
    if (page === "saved") initSaved();
    if (page === "goal") initGoal();
    if (page === "trip") {
        initTrip();
        initTripPlanningState();
    }
    if (page === "trip-results") initTripResults();
    if (page === "itinerary") initItinerary();
    if (page === "profile") initProfile();

    // Render user agenda if on dashboard
    if (page === "dashboard") {
        renderUserAgenda();
    }
    
    // Initialize schedule manager
    initScheduleManager();
};

// ─── ENHANCED API FUNCTIONS ─────────────────────────────────────────────────

/**
 * Fetch user profile from API
 */
async function fetchUserProfile() {
    try {
        const res = await fetchWithAuth("/api/user/profile");
        if (res.ok) {
            const profile = await res.json();
            // Update localStorage with latest profile data
            const user = JSON.parse(localStorage.getItem("wanderai-user") || "{}");
            Object.assign(user, profile);
            localStorage.setItem("wanderai-user", JSON.stringify(user));
            return profile;
        }
        return null;
    } catch (err) {
        console.error("Error fetching profile:", err);
        return null;
    }
}

/**
 * Update user profile via API
 */
async function updateUserProfile(updates) {
    try {
        const res = await fetchWithAuth("/api/user/profile", {
            method: "PUT",
            body: JSON.stringify(updates)
        });
        if (res.ok) {
            const result = await res.json();
            // Update localStorage
            const user = JSON.parse(localStorage.getItem("wanderai-user") || "{}");
            Object.assign(user, updates);
            localStorage.setItem("wanderai-user", JSON.stringify(user));
            return { success: true, data: result };
        }
        const error = await res.json();
        return { success: false, error: error.error || "Failed to update profile" };
    } catch (err) {
        console.error("Error updating profile:", err);
        return { success: false, error: "Network error" };
    }
}

/**
 * Fetch saved destinations from API
 */
async function fetchSavedDestinations() {
    try {
        const res = await fetchWithAuth("/api/user/saved");
        if (res.ok) {
            const data = await res.json();
            return data.saved_destinations || [];
        }
        return [];
    } catch (err) {
        console.error("Error fetching saved destinations:", err);
        return [];
    }
}

/**
 * Save a destination via API
 */
async function saveDestinationToAPI(destination_slug, destination_name, notes = "") {
    try {
        const res = await fetchWithAuth("/api/user/saved", {
            method: "POST",
            body: JSON.stringify({ destination_slug, destination_name, notes })
        });
        if (res.ok) {
            return { success: true };
        }
        const error = await res.json();
        return { success: false, error: error.error };
    } catch (err) {
        console.error("Error saving destination:", err);
        return { success: false, error: "Network error" };
    }
}

/**
 * Remove a saved destination via API
 */
async function unsaveDestinationFromAPI(destination_slug) {
    try {
        const res = await fetchWithAuth("/api/user/saved", {
            method: "DELETE",
            body: JSON.stringify({ destination_slug })
        });
        if (res.ok) {
            return { success: true };
        }
        const error = await res.json();
        return { success: false, error: error.error };
    } catch (err) {
        console.error("Error removing saved destination:", err);
        return { success: false, error: "Network error" };
    }
}

/**
 * Update trip status via API
 */
async function updateTripStatusAPI(tripId, status) {
    try {
        const res = await fetchWithAuth(`/api/user/trips/${tripId}`, {
            method: "PUT",
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            return { success: true };
        }
        const error = await res.json();
        return { success: false, error: error.error };
    } catch (err) {
        console.error("Error updating trip status:", err);
        return { success: false, error: "Network error" };
    }
}

/**
 * Delete trip via API
 */
async function deleteTripAPI(tripId) {
    try {
        const res = await fetchWithAuth(`/api/user/trips/${tripId}`, {
            method: "DELETE"
        });
        if (res.ok) {
            return { success: true };
        }
        const error = await res.json();
        return { success: false, error: error.error };
    } catch (err) {
        console.error("Error deleting trip:", err);
        return { success: false, error: "Network error" };
    }
}

/**
 * Fetch user activity history
 */
async function fetchUserActivity(limit = 50, type = "") {
    try {
        let url = `/api/user/activity?limit=${limit}`;
        if (type) url += `&type=${type}`;
        const res = await fetchWithAuth(url);
        if (res.ok) {
            const data = await res.json();
            return data.activities || [];
        }
        return [];
    } catch (err) {
        console.error("Error fetching activity:", err);
        return [];
    }
}

/**
 * Enhanced save/unsave destination that syncs with backend
 */
async function toggleSaveDestination(destinationId, destinationName) {
    const savedIds = readJson("wanderai-saved", []);
    const isCurrentlySaved = savedIds.includes(destinationId);
    
    if (isCurrentlySaved) {
        // Remove from local
        const newSaved = savedIds.filter(id => id !== destinationId);
        writeJson("wanderai-saved", newSaved);
        setCurrentSavedIds(newSaved);
        
        // Sync with backend if logged in
        const user = getCurrentUser();
        if (user) {
            await unsaveDestinationFromAPI(destinationId);
        }
        
        return { saved: false, id: destinationId };
    } else {
        // Add to local
        savedIds.push(destinationId);
        writeJson("wanderai-saved", savedIds);
        setCurrentSavedIds(savedIds);
        
        // Sync with backend if logged in
        const user = getCurrentUser();
        if (user) {
            await saveDestinationToAPI(destinationId, destinationName);
        }
        
        return { saved: true, id: destinationId };
    }
}

/**
 * Sync local saved destinations with backend
 */
async function syncSavedDestinations() {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
        // Fetch from backend
        const backendSaved = await fetchSavedDestinations();
        const backendSlugs = backendSaved.map(s => s.destination_slug);
        
        // Get local saved
        const localSaved = readJson("wanderai-saved", []);
        
        // Merge: add any missing backend items to local
        const merged = [...new Set([...localSaved, ...backendSlugs])];
        writeJson("wanderai-saved", merged);
        setCurrentSavedIds(merged);
        
        return merged;
    } catch (err) {
        console.error("Error syncing saved destinations:", err);
        return readJson("wanderai-saved", []);
    }
}

// Make functions globally available
window.fetchUserProfile = fetchUserProfile;
window.updateUserProfile = updateUserProfile;
window.fetchSavedDestinations = fetchSavedDestinations;
window.saveDestinationToAPI = saveDestinationToAPI;
window.unsaveDestinationFromAPI = unsaveDestinationFromAPI;
window.updateTripStatusAPI = updateTripStatusAPI;
window.deleteTripAPI = deleteTripAPI;
window.fetchUserActivity = fetchUserActivity;
window.toggleSaveDestination = toggleSaveDestination;
window.syncSavedDestinations = syncSavedDestinations;

// ═══════════════════════════════════════════════════════════════════════════════
// REFACTORED AGENDA/SCHEDULE SYSTEM - PRODUCTION READY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the complete agenda system (replaces initRightPanel + initScheduleManager)
 * Called once on page load.
 */
function initAgendaSystem() {
    if (agendaState.initialized) {
        console.log("[Agenda] Already initialized, skipping");
        return;
    }
    
    console.log("[Agenda] Initializing system...");
    
    // 1. Initialize day buttons
    initDayButtons();
    
    // 2. Initialize modal handlers
    initScheduleModal();
    
    // 3. Load initial schedules for today
    const today = getTodayISO();
    const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    agendaState.selectedDate = today;
    
    // Highlight today's button
    document.querySelectorAll("#agenda-days button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.day === todayDayName);
    });
    
    // Load schedules
    renderAgendaSchedule();
    
    agendaState.initialized = true;
    logAgendaState("Initialized");
}

/**
 * Initialize day buttons with proper date handling
 */
function initDayButtons() {
    const container = document.getElementById("agenda-days");
    if (!container) return;
    
    const today = new Date();
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const currentDay = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDay);
    
    // Generate buttons with ISO dates
    let html = "";
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dayKey = dayNames[i];
        const isoDate = date.toISOString().split("T")[0];
        const dayNumber = date.getDate();
        const isActive = i === currentDay;
        
        html += `<button type="button" data-day="${dayKey}" data-date="${isoDate}" ${isActive ? 'class="active"' : ''}>
            ${dayKey}<span>${dayNumber}</span>
        </button>`;
    }
    
    container.innerHTML = html;
    
    // Add click handlers
    container.addEventListener("click", (e) => {
        const button = e.target.closest("button");
        if (!button) return;
        
        // Update UI
        document.querySelectorAll("#agenda-days button").forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
        
        // Update state with ISO date
        agendaState.selectedDate = button.dataset.date;
        logAgendaState("Day selected");
        
        // Load schedules
        renderAgendaSchedule();
    });
}

/**
 * Initialize schedule modal handlers
 */
function initScheduleModal() {
    const addBtn = document.getElementById("add-schedule-btn");
    const modal = document.getElementById("schedule-modal");
    const closeBtn = document.getElementById("close-schedule-modal");
    const cancelBtn = document.getElementById("cancel-schedule");
    const form = document.getElementById("schedule-form");
    
    if (!modal) return;
    
    // Open modal handler
    const openModal = (mode = "create", scheduleData = null) => {
        agendaState.editingId = mode === "edit" ? scheduleData.id : null;
        
        document.getElementById("schedule-modal-title").textContent = 
            mode === "edit" ? "Edit Activity" : "Add Activity";
        
        form.reset();
        
        if (mode === "edit" && scheduleData) {
            // Populate form for edit
            document.getElementById("schedule-title").value = scheduleData.title || "";
            document.getElementById("schedule-location").value = scheduleData.location || "";
            document.getElementById("schedule-time").value = scheduleData.schedule_time || "";
            document.getElementById("schedule-date").value = scheduleData.schedule_date || agendaState.selectedDate;
            document.getElementById("schedule-notes").value = scheduleData.notes || "";
        } else {
            // Set default date for create
            document.getElementById("schedule-date").value = agendaState.selectedDate || getTodayISO();
        }
        
        modal.classList.remove("hidden");
    };
    
    // Close modal handler
    const closeModal = () => {
        modal.classList.add("hidden");
        form.reset();
        agendaState.editingId = null;
    };
    
    // Attach event listeners
    addBtn?.addEventListener("click", () => openModal("create"));
    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    
    // Close on outside click
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Form submission
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const title = document.getElementById("schedule-title").value.trim();
        const location = document.getElementById("schedule-location").value.trim();
        const time = document.getElementById("schedule-time").value;
        const date = document.getElementById("schedule-date").value;
        const notes = document.getElementById("schedule-notes").value.trim();
        
        // Validation
        if (!title) {
            showToast("Please enter an activity title", "error");
            return;
        }
        if (!time) {
            showToast("Please select a time", "error");
            return;
        }
        if (!date) {
            showToast("Please select a date", "error");
            return;
        }
        
        const scheduleData = { title, location, time, date, notes };
        
        try {
            setLoading(document.getElementById("save-schedule-btn"), true);
            
            let res;
            if (agendaState.editingId) {
                // Update existing
                res = await fetchWithAuth(`/api/user/schedules/${agendaState.editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(scheduleData)
                });
            } else {
                // Create new
                res = await fetchWithAuth("/api/user/schedules", {
                    method: "POST",
                    body: JSON.stringify(scheduleData)
                });
            }
            
            if (res.ok) {
                closeModal();
                showToast(agendaState.editingId ? "Activity updated!" : "Activity added!", "success");
                
                // Refresh schedules
                await renderAgendaSchedule();
                
                // If we added to a different day, switch to that day
                if (date !== agendaState.selectedDate) {
                    agendaState.selectedDate = date;
                    // Update active button
                    document.querySelectorAll("#agenda-days button").forEach(btn => {
                        btn.classList.toggle("active", btn.dataset.date === date);
                    });
                    await renderAgendaSchedule();
                }
            } else {
                const error = await res.json();
                showToast(error.error || "Failed to save activity", "error");
            }
        } catch (err) {
            console.error("[Agenda] Error saving schedule:", err);
            showToast("Connection error. Please try again.", "error");
        } finally {
            setLoading(document.getElementById("save-schedule-btn"), false);
        }
    });
}

/**
 * Render schedules for the currently selected date
 * Always fetches fresh data from backend
 */
async function renderAgendaSchedule() {
    const container = document.getElementById("agenda-schedule");
    const emptyMsg = document.getElementById("empty-schedule-msg");
    const addBtn = document.getElementById("add-schedule-btn");
    
    if (!container) return;
    
    // Check auth
    const user = getCurrentUser();
    if (!user) {
        container.innerHTML = "";
        if (emptyMsg) {
            emptyMsg.style.display = "block";
            emptyMsg.innerHTML = 'Please log in to manage your schedule.<br><a href="#" onclick="document.getElementById(\'auth-btn\').click();return false;" style="color:#11258f;text-decoration:underline;">Login now</a>';
        }
        if (addBtn) addBtn.disabled = true;
        return;
    }
    
    if (addBtn) addBtn.disabled = false;
    
    // Set loading state
    agendaState.loading = true;
    container.innerHTML = '<div class="schedule-loading"><span class="spinner"></span> Loading...</div>';
    if (emptyMsg) emptyMsg.style.display = "none";
    
    logAgendaState("Loading schedules");
    
    try {
        const res = await fetchWithAuth(`/api/user/schedules?date=${agendaState.selectedDate}`);
        
        if (res.status === 401) {
            container.innerHTML = "";
            if (emptyMsg) {
                emptyMsg.style.display = "block";
                emptyMsg.innerHTML = 'Session expired. Please <a href="#" onclick="document.getElementById(\'auth-btn\').click();return false;" style="color:#11258f;text-decoration:underline;">login again</a>.';
            }
            return;
        }
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();
        agendaState.schedules = data.schedules || [];
        
        logAgendaState("Schedules loaded");
        renderSchedulesUI();
        
    } catch (err) {
        console.error("[Agenda] Error loading schedules:", err);
        container.innerHTML = "";
        if (emptyMsg) {
            emptyMsg.style.display = "block";
            emptyMsg.innerHTML = "Failed to load schedules. <button onclick='renderAgendaSchedule()' style='color:#11258f;text-decoration:underline;background:none;border:none;cursor:pointer;'>Retry</button>";
        }
    } finally {
        agendaState.loading = false;
    }
}

/**
 * Pure function to render schedules UI based on agendaState
 */
function renderSchedulesUI() {
    const container = document.getElementById("agenda-schedule");
    const emptyMsg = document.getElementById("empty-schedule-msg");
    
    if (!container) return;
    
    container.innerHTML = "";
    
    if (!agendaState.schedules || agendaState.schedules.length === 0) {
        if (emptyMsg) {
            emptyMsg.style.display = "block";
            emptyMsg.innerHTML = 'No activities scheduled.<br>Click "Add Activity" to plan your day!';
        }
        return;
    }
    
    if (emptyMsg) emptyMsg.style.display = "none";
    
    // Sort by time
    const sorted = [...agendaState.schedules].sort((a, b) => {
        return (a.schedule_time || "").localeCompare(b.schedule_time || "");
    });
    
    container.innerHTML = sorted.map(schedule => `
        <div class="schedule-item fade-in ${schedule.is_completed ? 'completed' : ''}" data-schedule-id="${schedule.id}">
            <div class="schedule-content">
                <strong>${escapeHtml(schedule.title)}</strong>
                ${schedule.location ? `<span>${escapeHtml(schedule.location)}</span>` : ''}
                ${schedule.notes ? `<small style="color:#666;display:block;margin-top:2px;">${escapeHtml(schedule.notes)}</small>` : ''}
            </div>
            <div class="schedule-actions">
                <time>${schedule.schedule_time}</time>
                <button class="edit-btn" onclick="openEditSchedule(${schedule.id})" title="Edit">✏️</button>
                <button class="delete-btn" onclick="deleteScheduleHandler(${schedule.id})" title="Delete">🗑️</button>
            </div>
        </div>
    `).join("");
}

/**
 * Open schedule modal in edit mode
 */
async function openEditSchedule(scheduleId) {
    const schedule = agendaState.schedules.find(s => s.id === scheduleId);
    if (!schedule) {
        showToast("Schedule not found", "error");
        return;
    }
    
    agendaState.editingId = scheduleId;
    
    const modal = document.getElementById("schedule-modal");
    document.getElementById("schedule-modal-title").textContent = "Edit Activity";
    document.getElementById("schedule-title").value = schedule.title || "";
    document.getElementById("schedule-location").value = schedule.location || "";
    document.getElementById("schedule-time").value = schedule.schedule_time || "";
    document.getElementById("schedule-date").value = schedule.schedule_date || agendaState.selectedDate;
    document.getElementById("schedule-notes").value = schedule.notes || "";
    
    modal?.classList.remove("hidden");
}

/**
 * Delete schedule handler
 */
async function deleteScheduleHandler(scheduleId) {
    if (!confirm("Are you sure you want to delete this activity?")) return;
    
    try {
        const res = await fetchWithAuth(`/api/user/schedules/${scheduleId}`, {
            method: "DELETE"
        });
        
        if (res.ok) {
            showToast("Activity deleted", "success");
            await renderAgendaSchedule();
        } else {
            const error = await res.json();
            showToast(error.error || "Failed to delete", "error");
        }
    } catch (err) {
        console.error("[Agenda] Error deleting:", err);
        showToast("Connection error", "error");
    }
}

/**
 * Simple toast notification
 */
function showToast(message, type = "info") {
    // Remove existing toasts
    document.querySelectorAll('.agenda-toast').forEach(t => t.remove());
    
    const toast = document.createElement("div");
    toast.className = `agenda-toast ${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${type === "error" ? "#ef4444" : type === "success" ? "#10b981" : "#3b82f6"};
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY FUNCTION WRAPPERS (for backward compatibility with HTML onclick handlers)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Legacy wrapper for HTML onclick="openScheduleModal()"
 */
function openScheduleModal() {
    const modal = document.getElementById("schedule-modal");
    const form = document.getElementById("schedule-form");
    
    if (!modal) {
        console.error("[Agenda] Modal not found");
        return;
    }
    
    agendaState.editingId = null;
    document.getElementById("schedule-modal-title").textContent = "Add Activity";
    form?.reset();
    document.getElementById("schedule-date").value = agendaState.selectedDate || getTodayISO();
    
    modal.classList.remove("hidden");
}

/**
 * Legacy wrapper for HTML onclick="editSchedule(id)"
 */
function editSchedule(scheduleId) {
    openEditSchedule(scheduleId);
}

/**
 * Legacy wrapper for HTML onclick="deleteSchedule(id)"
 */
function deleteSchedule(scheduleId) {
    deleteScheduleHandler(scheduleId);
}

// Make functions globally available for HTML onclick handlers
window.openScheduleModal = openScheduleModal;
window.editSchedule = editSchedule;
window.deleteSchedule = deleteSchedule;
window.openEditSchedule = openEditSchedule;
window.deleteScheduleHandler = deleteScheduleHandler;
window.renderAgendaSchedule = renderAgendaSchedule;
window.initAgendaSystem = initAgendaSystem;

/**
 * Legacy compatibility wrapper - use renderAgendaSchedule() instead
 */
async function loadSchedules() {
    console.log("[Agenda] loadSchedules() is deprecated, use renderAgendaSchedule()");
    await renderAgendaSchedule();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

