const Database = require('better-sqlite3');
const path = require('path');

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(path.join(__dirname, 'trustproof.db'));

  // Reviews are stored on the Soroban contract — not in SQLite.
  // Drop the legacy table if it exists from a previous install.
  _db.exec(`DROP TABLE IF EXISTS reviews;`);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_trust_cache (
      public_key TEXT PRIMARY KEY,
      account_age_days INTEGER,
      total_tx_count INTEGER,
      trust_score REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS risk_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer_address TEXT NOT NULL,
      asset_code     TEXT NOT NULL,
      score          INTEGER NOT NULL,
      verdict        TEXT NOT NULL,
      verdict_color  TEXT NOT NULL,
      checked_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_history_issuer
      ON risk_history(issuer_address, checked_at DESC);
  `);
  return _db;
}

module.exports = { getDb };
