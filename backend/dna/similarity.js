const fs = require('fs');
const path = require('path');
const { BehavioralForest } = require('./classifier');

function magnitude(vec) {
  return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
}

function normalize(vec) {
  const mag = magnitude(vec);
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

function cosine(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  const len = Math.min(na.length, nb.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += na[i] * nb[i];
  return s;
}

// Per-feature weights — timing and operational style are the strongest signals.
const WEIGHTS = [
  // Timing (8) — high signal
  1.4, 1.4, 1.2, 1.4, 1.4, 1.2, 1.3, 1.3,
  // Funding (6) — medium signal
  1.0, 0.8, 0.8, 1.0, 1.3, 0.9,
  // Asset config (8) — low-medium signal
  0.9, 0.7, 0.7, 1.0, 1.1, 1.1, 1.2, 0.8,
  // Liquidity behavior (8) — high signal
  1.3, 1.0, 1.0, 1.2, 1.0, 1.4, 1.1, 0.9,
  // Operational style (10) — high signal
  1.2, 1.2, 1.0, 1.0, 1.1, 1.2, 1.0, 1.1, 1.0, 1.0,
];

function weightedCosine(a, b) {
  const wa = a.map((v, i) => v * (WEIGHTS[i] ?? 1));
  const wb = b.map((v, i) => v * (WEIGHTS[i] ?? 1));
  return cosine(wa, wb);
}

function findRugMatches(queryVector, rugVectors, threshold = 0.82) {
  return rugVectors
    .map((r) => ({ ...r, similarity: weightedCosine(queryVector, r.vector) }))
    .filter((r) => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

let cachedForest = null;
let forestLoadAttempted = false;

function loadForest() {
  if (forestLoadAttempted) return cachedForest;
  forestLoadAttempted = true;
  const modelPath = path.join(__dirname, 'model.json');
  try {
    const json = fs.readFileSync(modelPath, 'utf8');
    const f = new BehavioralForest();
    f.fromJSON(json);
    cachedForest = f;
  } catch {
    cachedForest = null;
  }
  return cachedForest;
}

function computeDNAResult(queryPubkey, queryVector, allIssuers) {
  const forest = loadForest();
  const rugIssuers = (allIssuers || []).filter((i) => i.is_confirmed_rug === 1 && i.pubkey !== queryPubkey);

  const individualMatches = findRugMatches(queryVector, rugIssuers);

  let aiVerdict = 'unknown';
  let aiConfidence = 0;
  if (forest) {
    const { prediction, confidence } = forest.predict(queryVector);
    aiVerdict = prediction;
    aiConfidence = confidence;
  }

  const isFlagged = individualMatches.length > 0 || (aiVerdict === 'rug' && aiConfidence > 0.8);

  return {
    status: isFlagged ? 'flagged' : 'clean',
    matchCount: individualMatches.length,
    topSimilarity: individualMatches[0]?.similarity || aiConfidence,
    aiVerdict,
    aiConfidence,
    totalLossUsd: individualMatches.reduce((s, m) => s + (m.rug_loss_usd || 0), 0),
    matches: individualMatches.map((m) => ({
      pubkey: m.pubkey,
      asset_code: m.asset_code,
      similarity: m.similarity,
      rug_loss_usd: m.rug_loss_usd || 0,
    })),
    vector: queryVector,
    modelLoaded: !!forest,
  };
}

module.exports = { computeDNAResult, findRugMatches, weightedCosine, loadForest };
