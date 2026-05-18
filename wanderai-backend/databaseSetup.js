const fs = require("fs");
const path = require("path");
const DB = require("./db");
const { DESTINATIONS, GOAL_MAPPING } = require("./recommendationEngine");

const SCHEMA_PATH = path.resolve(__dirname, "..", "data", "wanderai-backend-schema.sql");

async function createTables() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
  await DB.exec(schemaSql);
}

async function seedGoalMappings() {
  for (const [goalName, categories] of Object.entries(GOAL_MAPPING)) {
    for (const category of categories) {
      await DB.run(
        `INSERT OR IGNORE INTO goal_mappings (goal_name, activity_category) VALUES (?, ?)`,
        [goalName, category]
      );
    }
  }
}

async function seedDestinationsAndActivities() {
  for (const destination of DESTINATIONS) {
    const destinationResult = await DB.run(
      `INSERT INTO destinations (
        slug, name, location, category, average_cost, budget_tier,
        energy_level, risk_level, min_days, max_days, image, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        location = excluded.location,
        category = excluded.category,
        average_cost = excluded.average_cost,
        budget_tier = excluded.budget_tier,
        energy_level = excluded.energy_level,
        risk_level = excluded.risk_level,
        min_days = excluded.min_days,
        max_days = excluded.max_days,
        image = excluded.image,
        updated_at = CURRENT_TIMESTAMP`,
      [
        destination.slug,
        destination.name,
        destination.location,
        destination.category,
        destination.budget,
        destination.budgetTier,
        destination.energy,
        destination.risk,
        destination.days[0],
        destination.days[1],
        destination.image || null
      ]
    );

    const savedDestination =
      destinationResult.lastID
        ? await DB.get(`SELECT id FROM destinations WHERE id = ?`, [destinationResult.lastID])
        : await DB.get(`SELECT id FROM destinations WHERE slug = ?`, [destination.slug]);

    if (!savedDestination) {
      continue;
    }

    for (const activityName of destination.activities || []) {
      const activityResult = await DB.run(
        `INSERT OR IGNORE INTO activities (destination_id, activity_name, category, cost, duration)
         VALUES (?, ?, ?, ?, ?)`,
        [savedDestination.id, activityName, destination.category, null, null]
      );

      const savedActivity =
        activityResult.lastID
          ? await DB.get(`SELECT id FROM activities WHERE id = ?`, [activityResult.lastID])
          : await DB.get(
              `SELECT id FROM activities WHERE destination_id = ? AND activity_name = ?`,
              [savedDestination.id, activityName]
            );

      if (!savedActivity) {
        continue;
      }

      await DB.run(
        `INSERT INTO energy_data (activity_id, energy_level) VALUES (?, ?)
         ON CONFLICT(activity_id) DO UPDATE SET energy_level = excluded.energy_level`,
        [savedActivity.id, destination.energy]
      );

      await DB.run(
        `INSERT INTO risk_data (activity_id, risk_level) VALUES (?, ?)
         ON CONFLICT(activity_id) DO UPDATE SET risk_level = excluded.risk_level`,
        [savedActivity.id, destination.risk]
      );
    }
  }
}

async function initializeDatabase() {
  await createTables();
  await seedGoalMappings();
  await seedDestinationsAndActivities();
}

module.exports = {
  initializeDatabase
};
