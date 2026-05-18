// Recommendation Engine + Goal Mapping System

// ── BUDGET TIERS ─────────────────────────────────────────────────────────────
const BUDGET_TIERS = {
  low:    { max: 1500,  label: "Budget-Friendly" },
  mid:    { max: 3000,  label: "Mid-Range"        },
  high:   { max: Infinity, label: "Luxury"        }
};

function getBudgetTier(budget) {
  if (budget <= BUDGET_TIERS.low.max)  return "low";
  if (budget <= BUDGET_TIERS.mid.max)  return "mid";
  return "high";
}

// ── GOAL → ACTIVITIES MAPPING ─────────────────────────────────────────────────
const GOAL_MAPPING = {
  adventure:   ["hiking", "trekking", "cliffs", "mountain", "rafting", "skydiving", "zip-line"],
  relaxation:  ["beach", "spa", "leisure", "sunset", "picnic", "parks", "yoga", "resort"],
  nature:      ["park", "lakes", "mountains", "scenic", "walking", "wildlife", "forest"],
  sightseeing: ["culture", "temples", "history", "city", "shows", "museums", "monuments"],
  cultural:    ["temples", "history", "festivals", "art", "cuisine", "heritage", "museums"],
  family:      ["theme-park", "zoo", "beach", "parks", "museums", "leisure", "walking"],
  luxury:      ["resort", "spa", "cruise", "fine-dining", "yacht", "sunset", "wine"],
  budget:      ["walking", "parks", "street-food", "hostels", "hiking", "picnic", "markets"]
};

// Returns activities list for a given goal
function getActivitiesForGoal(goal) {
  return GOAL_MAPPING[goal] || GOAL_MAPPING["sightseeing"];
}

// ── DESTINATIONS ──────────────────────────────────────────────────────────────
const DESTINATIONS = [
  // LOW BUDGET (≤ 1500)
  {
    slug: "hyde-park", name: "Hyde Park", location: "London, UK",
    budget: 900, budgetTier: "low", category: "nature", energy: 2, risk: "Low", days: [1, 3],
    tags: ["park", "walking", "picnic", "leisure"],
    activities: ["Walking Trails", "Boating", "Picnics", "Speaker's Corner"],
    image: "/static/images/hyde-park.jpg"
  },
  {
    slug: "chiang-mai", name: "Chiang Mai", location: "Thailand",
    budget: 1100, budgetTier: "low", category: "cultural", energy: 2, risk: "Low", days: [3, 7],
    tags: ["temples", "cuisine", "markets", "heritage"],
    activities: ["Temple Hopping", "Night Bazaar", "Thai Cooking Class", "Elephant Sanctuary"],
    image: "/static/images/chiang-mai.jpg"
  },
  {
    slug: "lisbon", name: "Lisbon", location: "Portugal",
    budget: 1400, budgetTier: "low", category: "sightseeing", energy: 3, risk: "Low", days: [2, 5],
    tags: ["culture", "history", "city", "street-food", "walking"],
    activities: ["Tram Rides", "Alfama District", "Pastéis de Belém", "Fado Music"],
    image: "/static/images/lisbon.jpg"
  },
  {
    slug: "kathmandu", name: "Kathmandu", location: "Nepal",
    budget: 1200, budgetTier: "low", category: "adventure", energy: 4, risk: "Moderate", days: [4, 10],
    tags: ["trekking", "mountain", "temples", "heritage"],
    activities: ["Everest Base Camp Trek", "Pashupatinath Temple", "Boudhanath Stupa"],
    image: "/static/images/kathmandu.jpg"
  },
  {
    slug: "tbilisi", name: "Tbilisi", location: "Georgia",
    budget: 1000, budgetTier: "low", category: "cultural", energy: 2, risk: "Low", days: [2, 5],
    tags: ["history", "cuisine", "art", "walking", "markets"],
    activities: ["Old Town Walk", "Wine Tasting", "Narikala Fortress", "Sulfur Baths"],
    image: "/static/images/tbilisi.jpg"
  },

  // MID BUDGET (1501–3000)
  {
    slug: "bali", name: "Bali", location: "Indonesia",
    budget: 1900, budgetTier: "mid", category: "relaxation", energy: 2, risk: "Low", days: [5, 14],
    tags: ["beach", "spa", "temples", "yoga", "resort"],
    activities: ["Beach Days", "Spa Retreat", "Rice Terrace Walk", "Uluwatu Temple"],
    image: "/static/images/bali.jpg"
  },
  {
    slug: "cliffs-of-moher", name: "Cliffs of Moher", location: "Ireland",
    budget: 2100, budgetTier: "mid", category: "adventure", energy: 3, risk: "Moderate", days: [1, 3],
    tags: ["hiking", "cliffs", "scenic", "walking"],
    activities: ["Cliff Walks", "Photography", "Birdwatching", "Coastal Hike"],
    image: "/static/images/cliffs-of-moher.jpg"
  },
  {
    slug: "kyoto", name: "Kyoto", location: "Japan",
    budget: 2600, budgetTier: "mid", category: "cultural", energy: 3, risk: "Low", days: [3, 7],
    tags: ["culture", "temples", "history", "heritage", "art"],
    activities: ["Fushimi Inari Shrine", "Arashiyama Bamboo", "Tea Ceremony", "Geisha District"],
    image: "/static/images/kyoto.jpg"
  },
  {
    slug: "banff", name: "Banff", location: "Canada",
    budget: 3000, budgetTier: "mid", category: "nature", energy: 4, risk: "Moderate", days: [4, 10],
    tags: ["hiking", "lakes", "mountains", "wildlife", "scenic"],
    activities: ["Lake Louise", "Johnston Canyon", "Wildlife Safari", "Gondola Ride"],
    image: "/static/images/banff.jpg"
  },
  {
    slug: "new-york-city", name: "New York City", location: "USA",
    budget: 3100, budgetTier: "mid", category: "sightseeing", energy: 4, risk: "Moderate", days: [3, 7],
    tags: ["city", "culture", "shows", "museums", "monuments"],
    activities: ["Broadway Shows", "Central Park", "MoMA", "Statue of Liberty"],
    image: "/static/images/new-york-city.jpg"
  },
  {
    slug: "patagonia", name: "Patagonia", location: "Argentina",
    budget: 2800, budgetTier: "mid", category: "adventure", energy: 5, risk: "High", days: [7, 21],
    tags: ["trekking", "mountain", "hiking", "scenic", "wildlife"],
    activities: ["Torres del Paine Trek", "Glacier Perito Moreno", "Condor Watching"],
    image: "/static/images/patagonia.jpg"
  },
  {
    slug: "amsterdam", name: "Amsterdam", location: "Netherlands",
    budget: 2500, budgetTier: "mid", category: "sightseeing", energy: 2, risk: "Low", days: [2, 5],
    tags: ["culture", "museums", "city", "history", "walking"],
    activities: ["Rijksmuseum", "Canal Cruise", "Anne Frank House", "Vondelpark"],
    image: "/static/images/amsterdam.jpg"
  },

  // HIGH BUDGET (3001+)
  {
    slug: "santorini", name: "Santorini", location: "Greece",
    budget: 3200, budgetTier: "high", category: "luxury", energy: 1, risk: "Low", days: [4, 10],
    tags: ["beach", "sunset", "wine", "cruise", "resort", "fine-dining"],
    activities: ["Sunset at Oia", "Wine Tasting", "Catamaran Cruise", "Caldera Views"],
    image: "/static/images/santorini.jpg"
  },
  {
    slug: "machu-picchu", name: "Machu Picchu", location: "Peru",
    budget: 3600, budgetTier: "high", category: "adventure", energy: 5, risk: "Moderate", days: [5, 10],
    tags: ["trekking", "history", "mountain", "heritage"],
    activities: ["Inca Trail Trek", "Sun Gate", "Guided History Tour", "Aguas Calientes"],
    image: "/static/images/machu-picchu.jpg"
  },
  {
    slug: "reykjavik", name: "Reykjavik", location: "Iceland",
    budget: 3400, budgetTier: "high", category: "adventure", energy: 4, risk: "Low", days: [4, 8],
    tags: ["geothermal", "scenic", "hiking", "wildlife", "walking"],
    activities: ["Northern Lights", "Golden Circle", "Blue Lagoon", "Whale Watching"],
    image: "/static/images/reykjavik.jpg"
  },
  {
    slug: "maldives", name: "Maldives", location: "Maldives",
    budget: 5000, budgetTier: "high", category: "luxury", energy: 1, risk: "Low", days: [5, 14],
    tags: ["beach", "resort", "spa", "yacht", "fine-dining", "sunset"],
    activities: ["Overwater Bungalow", "Snorkeling", "Sunset Cruise", "Spa Day"],
    image: "/static/images/maldives.jpg"
  },
  {
    slug: "dubai", name: "Dubai", location: "UAE",
    budget: 4200, budgetTier: "high", category: "luxury", energy: 3, risk: "Low", days: [3, 7],
    tags: ["resort", "fine-dining", "city", "monuments", "leisure"],
    activities: ["Burj Khalifa", "Desert Safari", "Dubai Mall", "Yacht Dinner"],
    image: "/static/images/dubai.jpg"
  }
];

// ── SCORING ───────────────────────────────────────────────────────────────────
const RISK_SCORE = { Low: 1, Moderate: 2, High: 3 };

function scoreDestination(dest, input) {
  let score = 0;
  const reasons = [];

  // Budget: exact tier match (+3), within budget (+2)
  if (dest.budgetTier === getBudgetTier(input.budget)) {
    score += 3;
    reasons.push("budget tier match");
  }
  if (dest.budget <= input.budget) {
    score += 2;
    reasons.push("within budget");
  }

  // Goal / category match (+3)
  if (dest.category === input.goal) {
    score += 3;
    reasons.push("goal match");
  }

  // Goal tag matches (+2 per tag, max 6)
  const goalTags = GOAL_MAPPING[input.goal] || [];
  const tagMatches = dest.tags.filter(tag => goalTags.includes(tag));
  score += Math.min(tagMatches.length * 2, 6);
  if (tagMatches.length) reasons.push(`${tagMatches.length} activity tag matches`);

  // Location preference (+3)
  if (input.location && dest.location.toLowerCase().includes(input.location.toLowerCase())) {
    score += 3;
    reasons.push("location match");
  }

  // Energy fit (+2)
  const userEnergy = input.energy || 3;
  if (dest.energy <= userEnergy) {
    score += 2;
    reasons.push("energy suitable");
  }

  // Risk fit (+2)
  const userRisk = input.risk || "Moderate";
  if ((RISK_SCORE[dest.risk] || 2) <= (RISK_SCORE[userRisk] || 2)) {
    score += 2;
    reasons.push("risk within comfort zone");
  }

  // Days fit (+2): destination day range overlaps user's days
  if (input.days) {
    const [minDays, maxDays] = dest.days;
    if (input.days >= minDays && input.days <= maxDays) {
      score += 2;
      reasons.push("days fit");
    }
  }

  return {
    ...dest,
    score,
    reasons,
    matchTags: tagMatches,
    budgetFit:  dest.budget <= input.budget,
    energyFit:  dest.energy <= userEnergy,
    riskFit:    (RISK_SCORE[dest.risk] || 2) <= (RISK_SCORE[userRisk] || 2)
  };
}

// ── BUDGET TIER FILTER ────────────────────────────────────────────────────────
function filterByBudgetTier(budget) {
  const tier = getBudgetTier(budget);
  return DESTINATIONS.filter(d => d.budgetTier === tier || d.budget <= budget);
}

// ── MAIN RECOMMENDATION FUNCTION ─────────────────────────────────────────────
function getRecommendations(input) {
  const plan = {
    budget: 3000,
    goal: "nature",
    location: "",
    energy: 3,
    risk: "Moderate",
    days: null,
    ...input
  };

  const budgetTier = getBudgetTier(plan.budget);
  const goalActivities = getActivitiesForGoal(plan.goal);

  const scored = DESTINATIONS.map(dest => scoreDestination(dest, plan));
  const sorted = scored.sort((a, b) => b.score - a.score).slice(0, 5);

  const top = sorted[0];
  const goalTags = GOAL_MAPPING[plan.goal] || [];
  const goalMatchScore = top
    ? Math.round((top.matchTags.length / Math.max(goalTags.length, 1)) * 100)
    : 0;

  const energyStatus = top
    ? top.energy > plan.energy   ? "Above preference"
    : top.energy < plan.energy - 1 ? "Very easy"
    : "Balanced"
    : "Unknown";

  return {
    plan,
    budgetTier: { tier: budgetTier, label: BUDGET_TIERS[budgetTier].label },
    goalActivities,
    recommendations: sorted,
    goalMapping: goalTags,
    goalEvaluation: {
      score: goalMatchScore,
      matchedTags: top ? top.matchTags : []
    },
    energyAnalysis: {
      destinationEnergy: top ? top.energy : null,
      userEnergy: plan.energy,
      status: energyStatus
    },
    riskEvaluation: {
      destinationRisk: top ? top.risk : null,
      userRisk: plan.risk
    },
    multiConstraintSummary: {
      budgetOk:     top ? top.budgetFit  : false,
      energyOk:     top ? top.energyFit  : false,
      riskOk:       top ? top.riskFit    : false,
      goalFitScore: goalMatchScore
    },
    summary: {
      totalMatches:     sorted.length,
      avgScore:         sorted.reduce((s, r) => s + r.score, 0) / (sorted.length || 1),
      budgetCompliant:  sorted.filter(r => r.budgetFit).length
    }
  };
}

module.exports = { getRecommendations, getActivitiesForGoal, filterByBudgetTier, getBudgetTier, GOAL_MAPPING, DESTINATIONS };
