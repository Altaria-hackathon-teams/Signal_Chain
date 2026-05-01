// DNA persistence — shares the main `database/trustproof.db` with the rest of
// the backend. Tables/indexes are created lazily on first use.
const path = require('path');
const Database = require('better-sqlite3');

let _db = null;
function getDb() {
  if (_db) return _db;
  _db = new Database(path.join(__dirname, '..', '..', 'database', 'trustproof.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS dna_issuers (
      pubkey            TEXT PRIMARY KEY,
      asset_code        TEXT,
      asset_issuer      TEXT,
      scanned_at        INTEGER,
      is_confirmed_rug  INTEGER DEFAULT 0,
      rug_loss_usd      REAL    DEFAULT 0,
      rug_confirmed_at  INTEGER,
      vector            TEXT NOT NULL,
      raw_features      TEXT
    );
    CREATE TABLE IF NOT EXISTS dna_matches (
      query_pubkey   TEXT,
      match_pubkey   TEXT,
      similarity     REAL,
      matched_at     INTEGER,
      PRIMARY KEY (query_pubkey, match_pubkey)
    );
    CREATE INDEX IF NOT EXISTS idx_rug
      ON dna_issuers(is_confirmed_rug);
    CREATE INDEX IF NOT EXISTS idx_scanned
      ON dna_issuers(scanned_at);
  `);
  return _db;
}

const DNA_DB = {
  upsertIssuer(pubkey, assetCode, vector, rawFeatures, isRug = 0, lossUsd = 0) {
    getDb()
      .prepare(
        `INSERT INTO dna_issuers
           (pubkey, asset_code, scanned_at, is_confirmed_rug,
            rug_loss_usd, vector, raw_features)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(pubkey) DO UPDATE SET
           asset_code       = excluded.asset_code,
           scanned_at       = excluded.scanned_at,
           is_confirmed_rug = MAX(is_confirmed_rug, excluded.is_confirmed_rug),
           rug_loss_usd     = excluded.rug_loss_usd,
           vector           = excluded.vector,
           raw_features     = excluded.raw_features`,
      )
      .run(
        pubkey,
        assetCode,
        Date.now(),
        isRug,
        lossUsd,
        JSON.stringify(vector),
        JSON.stringify(rawFeatures),
      );
  },

  confirmRug(pubkey, lossUsd = 0) {
    getDb()
      .prepare(
        `UPDATE dna_issuers
         SET is_confirmed_rug = 1,
             rug_loss_usd = ?,
             rug_confirmed_at = ?
         WHERE pubkey = ?`,
      )
      .run(lossUsd, Date.now(), pubkey);
  },

  getAllIssuers() {
    return getDb()
      .prepare('SELECT pubkey, asset_code, is_confirmed_rug, rug_loss_usd, vector FROM dna_issuers')
      .all()
      .map((r) => ({ ...r, vector: JSON.parse(r.vector) }));
  },

  getRugVectors() {
    return getDb()
      .prepare(
        'SELECT pubkey, asset_code, rug_loss_usd, vector FROM dna_issuers WHERE is_confirmed_rug = 1',
      )
      .all()
      .map((r) => ({ ...r, vector: JSON.parse(r.vector) }));
  },

  getStats() {
    const row = getDb()
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN is_confirmed_rug = 1 THEN 1 ELSE 0 END) AS rugs
         FROM dna_issuers`,
      )
      .get();
    return { total: row.total || 0, rugs: row.rugs || 0 };
  },

  storeMatch(queryPubkey, matchPubkey, similarity) {
    getDb()
      .prepare('INSERT OR REPLACE INTO dna_matches VALUES (?, ?, ?, ?)')
      .run(queryPubkey, matchPubkey, similarity, Date.now());
  },
};

module.exports = { DNA_DB, getDb };
