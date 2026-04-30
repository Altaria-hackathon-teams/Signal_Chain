require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const contractClient = require('./contractClient');

const app = express();
app.disable('x-powered-by');

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '64kb' }));

// Lazy-load DB so it initializes on first use.
// NOTE: reviews are NOT stored in SQLite — they live on the Soroban contract.
let _db = null;
function getDb() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  _db = new Database(path.join(__dirname, '../database/trustproof.db'));
  _db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_trust_cache (
      public_key TEXT PRIMARY KEY,
      account_age_days INTEGER,
      total_tx_count INTEGER,
      trust_score REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
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
  // Drop the legacy review tables if they linger from a previous install.
  _db.exec(`DROP TABLE IF EXISTS reviews;`);
  return _db;
}

const HORIZON = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';

async function horizonGet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Horizon ${res.status}: ${url}`);
  return res.json();
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    contractConfigured: contractClient.isConfigured(),
    contractId: contractClient.CONTRACT_ID || null,
  });
});

// GET /api/reviews/:issuerAddress — read all reviews from the contract.
app.get('/api/reviews/:issuerAddress', async (req, res) => {
  try {
    const reviews = await contractClient.getReviews(req.params.issuerAddress);

    // Sort: highest trust weight first, then newest first.
    reviews.sort((a, b) => {
      if (b.trust_weight !== a.trust_weight) return b.trust_weight - a.trust_weight;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    res.json({
      reviews,
      avgRating: Math.round(avgRating * 10) / 10,
      total: reviews.length,
      onChain: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reviews — verify eligibility, then publish to the Soroban contract.
// Eligible wallets may post any number of reviews per asset.
app.post('/api/reviews', async (req, res) => {
  const { issuerAddress, assetCode, walletPublicKey, rating, reviewText } = req.body;

  if (!issuerAddress || !walletPublicKey || !rating) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    // Verify tx history with this asset via Horizon.
    const paymentsUrl = `${HORIZON}/accounts/${walletPublicKey}/payments?limit=200&order=desc`;
    let txAmount = 0;
    let hasTxHistory = false;

    try {
      const paymentsData = await horizonGet(paymentsUrl);
      const relevant = (paymentsData._embedded?.records || []).filter(
        (p) => p.asset_issuer === issuerAddress
      );
      hasTxHistory = relevant.length > 0;
      txAmount = relevant.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    } catch {}

    // Fall back to trustline check.
    if (!hasTxHistory) {
      try {
        const accountData = await horizonGet(`${HORIZON}/accounts/${walletPublicKey}`);
        hasTxHistory = (accountData.balances || []).some(
          (b) => b.asset_issuer === issuerAddress
        );
      } catch {}
    }

    if (!hasTxHistory) {
      return res.status(403).json({ error: 'No transaction history with this asset found' });
    }

    // Calculate wallet age for trust multiplier.
    let accountAgeDays = 30;
    try {
      const opsData = await horizonGet(
        `${HORIZON}/accounts/${walletPublicKey}/operations?order=asc&limit=1`
      );
      const firstOp = opsData._embedded?.records?.[0];
      if (firstOp?.created_at) {
        const created = new Date(firstOp.created_at);
        accountAgeDays = Math.floor((Date.now() - created.getTime()) / 86400000);
      }
    } catch {}

    const walletAgeMultiplier = Math.min(accountAgeDays / 365, 2.0);
    const trustWeight = Math.max((txAmount || 1) * walletAgeMultiplier, 0.1);

    const result = await contractClient.postReview({
      issuer: issuerAddress,
      assetCode: assetCode || '',
      reviewer: walletPublicKey,
      rating,
      text: reviewText || '',
      trustWeight,
      txAmount,
    });

    res.json({
      success: true,
      trustWeight: Math.round(trustWeight * 100) / 100,
      txHash: result.hash,
      reviewId: result.reviewId,
      onChain: true,
    });
  } catch (err) {
    console.error('postReview failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signals/:issuerAddress?assetCode=XYZ
app.get('/api/signals/:issuerAddress', async (req, res) => {
  const { issuerAddress } = req.params;
  const { assetCode } = req.query;

  if (!assetCode) {
    return res.status(400).json({ error: 'assetCode query param required' });
  }

  try {
    const holdersUrl = `${HORIZON}/accounts?asset=${assetCode}:${issuerAddress}&limit=10&order=desc`;
    const holdersData = await horizonGet(holdersUrl);
    const holderRecords = holdersData._embedded?.records || [];

    const holders = holderRecords
      .map((acc) => {
        const bal = (acc.balances || []).find(
          (b) => b.asset_issuer === issuerAddress && b.asset_code === assetCode
        );
        return { address: acc.id, balance: parseFloat(bal?.balance || 0) };
      })
      .filter((h) => h.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    const tradesUrl = `${HORIZON}/trades?base_asset_type=credit_alphanum4&base_asset_code=${assetCode}&base_asset_issuer=${issuerAddress}&counter_asset_type=native&limit=50&order=desc`;
    let trades = [];
    try {
      const tradesData = await horizonGet(tradesUrl);
      trades = tradesData._embedded?.records || [];
    } catch {}

    if (trades.length === 0) {
      try {
        const tradesUrl2 = `${HORIZON}/trades?counter_asset_type=credit_alphanum4&counter_asset_code=${assetCode}&counter_asset_issuer=${issuerAddress}&base_asset_type=native&limit=50&order=desc`;
        const tradesData2 = await horizonGet(tradesUrl2);
        trades = tradesData2._embedded?.records || [];
      } catch {}
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recentActivity = new Map();

    for (const trade of trades) {
      const tradeTime = new Date(trade.ledger_close_time);
      if (tradeTime < cutoff) continue;

      if (trade.base_asset_issuer === issuerAddress) {
        if (trade.base_account) recentActivity.set(trade.base_account, 'EXIT');
        if (trade.counter_account) recentActivity.set(trade.counter_account, 'ACCUMULATE');
      } else if (trade.counter_asset_issuer === issuerAddress) {
        if (trade.counter_account) recentActivity.set(trade.counter_account, 'EXIT');
        if (trade.base_account) recentActivity.set(trade.base_account, 'ACCUMULATE');
      }
    }

    const signals = holders.slice(0, 10).map((h) => ({
      address: h.address,
      balance: h.balance,
      action: recentActivity.get(h.address) || 'HOLD',
    }));

    const exits = signals.filter((s) => s.action === 'EXIT').length;
    const accumulates = signals.filter((s) => s.action === 'ACCUMULATE').length;
    const total = signals.length;

    let sentiment = 'NEUTRAL';
    if (exits > total * 0.5) sentiment = 'BEARISH';
    else if (exits > total * 0.3) sentiment = 'CAUTIOUS';
    else if (accumulates > total * 0.4) sentiment = 'BULLISH';

    let headline;
    if (total === 0) {
      headline = 'No holders found for this asset';
    } else if (exits > 0) {
      headline = `${exits} of ${total} tracked wallets EXITED in 48hrs`;
    } else if (accumulates > 0) {
      headline = `${accumulates} of ${total} tracked wallets ACCUMULATING`;
    } else {
      headline = `${total} tracked wallets — no significant activity in 48hrs`;
    }

    res.json({ signals, summary: { exits, accumulates, holds: total - exits - accumulates, total, sentiment, headline } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/risk-history — record a score snapshot (deduplicated)
app.post('/api/risk-history', (req, res) => {
  const { issuerAddress, assetCode, score, verdict, verdictColor } = req.body;
  if (!issuerAddress || score == null || !verdict) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const db = getDb();

    const last = db
      .prepare('SELECT * FROM risk_history WHERE issuer_address = ? ORDER BY checked_at DESC LIMIT 1')
      .get(issuerAddress);

    if (last) {
      const hoursSince = (Date.now() - new Date(last.checked_at).getTime()) / 3600000;
      const scoreDiff = Math.abs(last.score - score);
      if (last.verdict === verdict && hoursSince < 4 && scoreDiff < 5) {
        return res.json({ recorded: false, reason: 'duplicate_recent' });
      }
    }

    db.prepare(
      `INSERT INTO risk_history (issuer_address, asset_code, score, verdict, verdict_color, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(issuerAddress, assetCode || '', score, verdict, verdictColor || '#ffaa00', new Date().toISOString());

    db.prepare(
      `DELETE FROM risk_history WHERE issuer_address = ? AND id NOT IN (
         SELECT id FROM risk_history WHERE issuer_address = ? ORDER BY checked_at DESC LIMIT 50
       )`
    ).run(issuerAddress, issuerAddress);

    res.json({ recorded: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────
// Leaderboard endpoints
// ────────────────────────────────────────────────────────────────────

// 60s in-memory cache for the contract-aggregating endpoints.
const _lbCache = new Map();
function cached(key, ttlMs, loader) {
  const hit = _lbCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = loader();
  _lbCache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

function distinctTrackedIssuers(db, limit = 200) {
  return db
    .prepare(
      `SELECT issuer_address, asset_code, MAX(checked_at) AS last_seen
       FROM risk_history
       GROUP BY issuer_address
       ORDER BY last_seen DESC
       LIMIT ?`
    )
    .all(limit);
}

// GET /api/leaderboard/safest — top 10 by latest risk score
app.get('/api/leaderboard/safest', (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Latest snapshot per issuer, sorted by score desc.
    const rows = db
      .prepare(
        `SELECT r.issuer_address, r.asset_code, r.score, r.verdict, r.verdict_color, r.checked_at
         FROM risk_history r
         JOIN (
           SELECT issuer_address, MAX(checked_at) AS latest
           FROM risk_history
           GROUP BY issuer_address
         ) m
         ON m.issuer_address = r.issuer_address AND m.latest = r.checked_at
         ORDER BY r.score DESC, r.checked_at DESC
         LIMIT ?`
      )
      .all(limit);

    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard/reviewed — top 10 most-reviewed issuers (from contract)
app.get('/api/leaderboard/reviewed', async (req, res) => {
  try {
    if (!contractClient.isConfigured()) {
      return res.json({ entries: [], note: 'Contract not configured' });
    }
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const data = await cached('reviewed:' + limit, 60_000, async () => {
      const issuers = distinctTrackedIssuers(db);

      const enriched = await Promise.all(
        issuers.map(async (row) => {
          try {
            const reviews = await contractClient.getReviews(row.issuer_address);
            const avg =
              reviews.length > 0
                ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
                : 0;
            return {
              issuer_address: row.issuer_address,
              asset_code: row.asset_code,
              total_reviews: reviews.length,
              avg_rating: Math.round(avg * 10) / 10,
            };
          } catch {
            return null;
          }
        }),
      );

      return enriched
        .filter((e) => e && e.total_reviews > 0)
        .sort((a, b) => b.total_reviews - a.total_reviews)
        .slice(0, limit);
    });

    // cached() may return a Promise — await it.
    res.json({ entries: await data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard/reviewers — top reviewers by aggregated trust weight
app.get('/api/leaderboard/reviewers', async (req, res) => {
  try {
    if (!contractClient.isConfigured()) {
      return res.json({ entries: [], note: 'Contract not configured' });
    }
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const data = await cached('reviewers:' + limit, 60_000, async () => {
      const issuers = distinctTrackedIssuers(db);
      const tally = new Map(); // wallet -> { count, totalTrust, ratingSum }

      for (const row of issuers) {
        try {
          const reviews = await contractClient.getReviews(row.issuer_address);
          for (const r of reviews) {
            const cur = tally.get(r.wallet_public_key) || {
              wallet: r.wallet_public_key,
              count: 0,
              totalTrust: 0,
              ratingSum: 0,
            };
            cur.count += 1;
            cur.totalTrust += r.trust_weight || 0;
            cur.ratingSum += r.rating;
            tally.set(r.wallet_public_key, cur);
          }
        } catch {
          /* skip issuers we can't read */
        }
      }

      return [...tally.values()]
        .map((t) => ({
          wallet: t.wallet,
          review_count: t.count,
          total_trust: Math.round(t.totalTrust * 100) / 100,
          avg_rating: Math.round((t.ratingSum / t.count) * 10) / 10,
        }))
        .sort((a, b) => b.total_trust - a.total_trust)
        .slice(0, limit);
    });

    res.json({ entries: await data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/risk-history/:issuerAddress
app.get('/api/risk-history/:issuerAddress', (req, res) => {
  try {
    const db = getDb();
    const history = db
      .prepare('SELECT * FROM risk_history WHERE issuer_address = ? ORDER BY checked_at DESC LIMIT 30')
      .all(req.params.issuerAddress);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (!contractClient.isConfigured()) {
    console.warn('⚠  REVIEW_CONTRACT_ID not set — review endpoints will fail until the Soroban contract is deployed (see contracts/README.md).');
  } else {
    console.log(`✓ Soroban review contract: ${contractClient.CONTRACT_ID}`);
  }
});
