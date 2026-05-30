# utils/scoring.py

energy_map = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "extreme": 4
}

risk_map = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "extreme": 4
}


# ---------- VALIDATION ----------

def validate_itinerary(itinerary, budget, days):

    total_cost = sum(
        act.cost
        for day in itinerary.plan
        for act in day.activities
    )

    if total_cost > budget:
        return False, total_cost

    if len(itinerary.plan) != days:
        return False, "Days mismatch"

    return True, total_cost


# ---------- GOAL SCORE ----------

# ---------- GOAL SCORE ----------

def goal_score(itinerary, travel_type):

    travel_type = travel_type.lower()

    semantic_map = {

        "adventure": [
            "adventure",
            "trekking",
            "hiking",
            "camping",
            "sports",
            "water",
            "explore",
            "exploration",
            "nature",
            "rafting",
            "climbing"
        ],

        "leisure": [
            "leisure",
            "sightseeing",
            "relax",
            "relaxation",
            "beach",
            "museum",
            "culture",
            "food",
            "cafe",
            "nature",
            "park",
            "explore",
            "cruise"
        ],

        "romantic": [
            "romantic",
            "beach",
            "sunset",
            "cruise",
            "cafe",
            "nature",
            "relax"
        ],

        "family": [
            "family",
            "museum",
            "park",
            "sightseeing",
            "culture",
            "food",
            "nature"
        ]
    }

    target_keywords = semantic_map.get(
        travel_type,
        ["sightseeing", "explore"]
    )

    total = 0
    matched = 0

    for day in itinerary.plan:

        for act in day.activities:

            if act.type in [
                "food",
                "travel",
                "stay"
            ]:
                continue

            total += 1

            activity_text = (
                f"{act.type} "
                f"{act.name}"
            ).lower()

            similarity_found = False

            for keyword in target_keywords:

                if keyword in activity_text:

                    similarity_found = True
                    break

            if similarity_found:
                matched += 1

    if total == 0:
        return 0

    return round(
        matched / total,
        2
    )
# ---------- ENERGY SCORE ----------

def energy_score(itinerary):

    total = 0
    count = 0

    for day in itinerary.plan:

        for act in day.activities:

            if act.type in [
                "food",
                "stay"
            ]:
                continue

            total += energy_map.get(
                act.energy.lower(),
                1
            )

            count += 1

    return round(total / count, 2) if count else 0


# ---------- RISK SCORE ----------

def risk_score(itinerary):

    total = 0
    count = 0

    for day in itinerary.plan:

        for act in day.activities:

            if act.type in [
                "food",
                "stay"
            ]:
                continue

            total += risk_map.get(
                act.risk.lower(),
                1
            )

            count += 1

    return round(total / count, 2) if count else 0


# ---------- INTERPRETATIONS ----------

def interpret_goal(score):

    if score >= 0.85:
        return "Excellent", "🟢"

    elif score >= 0.65:
        return "Good", "🟡"

    elif score >= 0.45:
        return "Average", "🟠"

    else:
        return "Poor", "🔴"


def interpret_energy(score):

    if score <= 1.5:
        return "Relaxed", "🟢"

    elif score <= 2.5:
        return "Balanced", "🟡"

    elif score <= 3.2:
        return "Active", "🟠"

    else:
        return "Extreme", "🔴"


def interpret_risk(score):

    if score <= 1.5:
        return "Safe", "🟢"

    elif score <= 2.5:
        return "Moderate", "🟡"

    elif score <= 3.2:
        return "Risky", "🟠"

    else:
        return "Extreme", "🔴"