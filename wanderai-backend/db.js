const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const util = require('util');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'wanderai-backend.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.log(err);
  else console.log(`SQLite Connected: ${DB_PATH}`);
});

const getAsync = util.promisify(db.get).bind(db);
const allAsync = util.promisify(db.all).bind(db);
const execAsync = util.promisify(db.exec).bind(db);

// run needs `this` context for lastID, so we wrap manually
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.lastID, this.changes
    });
  });
}

module.exports = {
  get: getAsync,
  all: allAsync,
  exec: execAsync,
  run: runAsync,
  raw: db,
  DB_PATH
};
