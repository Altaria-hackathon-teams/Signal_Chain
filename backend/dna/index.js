// Operator-DNA orchestrator. One call: harvest → fingerprint → match → verdict.
const {
  fetchOperations,
  fetchAccount,
  fetchOffers,
  fetchTrades,
  fetchAssetsByIssuer,
} = require('./harvester');
const { extractVector } = require('./extractor');
const { computeDNAResult } = require('./similarity');
const { buildVerdict } = require('./verdict');
const { DNA_DB } = require('./db');

async function runDNA(issuerPubkey, isTestnet = false) {
  if (!issuerPubkey) throw new Error('issuerPubkey is required');

  // 1. Discover the primary asset for this issuer (best-effort).
  const assets = await fetchAssetsByIssuer(issuerPubkey, isTestnet);
  const primaryAsset = assets[0]?.asset_code || 'TOKEN';

  // 2. Harvest raw on-chain data in parallel.
  const [ops, account, offers, trades] = await Promise.all([
    fetchOperations(issuerPubkey, 1000, isTestnet),
    fetchAccount(issuerPubkey, isTestnet),
    fetchOffers(issuerPubkey, isTestnet),
    fetchTrades(primaryAsset, issuerPubkey, isTestnet),
  ]);

  if (!ops.length) {
    return buildEmptyResponse(issuerPubkey, primaryAsset, isTestnet);
  }

  // 3. Extract the 40-feature behavioral fingerprint.
  const extracted = extractVector(issuerPubkey, ops, account, offers, trades);
  if (!extracted) return buildEmptyResponse(issuerPubkey, primaryAsset, isTestnet);
  const { vector, raw } = extracted;

  // 4. Persist for future cross-referencing.
  try {
    DNA_DB.upsertIssuer(issuerPubkey, primaryAsset, vector, raw);
  } catch (err) {
    console.warn('DNA db upsert failed:', err.message);
  }

  // 5. Run cosine similarity against known rugs + behavioral-forest prediction.
  const dnaResult = computeDNAResult(issuerPubkey, vector, DNA_DB.getAllIssuers());

  // 6. Plain-English verdict.
  const verdict = buildVerdict(dnaResult, primaryAsset, vector);

  return {
    ok: true,
    issuer: issuerPubkey,
    asset: primaryAsset,
    network: isTestnet ? 'testnet' : 'mainnet',
    verdict,
    dna: {
      status: dnaResult.status,
      matchCount: dnaResult.matchCount,
      topSimilarity: dnaResult.topSimilarity,
      aiVerdict: dnaResult.aiVerdict,
      aiConfidence: dnaResult.aiConfidence,
      modelLoaded: dnaResult.modelLoaded,
      matches: dnaResult.matches,
    },
    features: raw,
    vector,
    stats: {
      operations_harvested: ops.length,
      offers_harvested: offers.length,
      trades_harvested: trades.length,
    },
  };
}

function buildEmptyResponse(issuer, asset, isTestnet) {
  return {
    ok: true,
    issuer,
    asset,
    network: isTestnet ? 'testnet' : 'mainnet',
    verdict: {
      risk: 'unknown',
      label: 'No Data',
      color: 'gray',
      headline: 'Account has no transaction history',
      body:
        'This account has no operations on the selected network. It may be brand new, un-funded, or you may be querying the wrong network (e.g., mainnet vs. testnet).',
      redFlags: [],
      confidence: 0,
      matchCount: 0,
      topSimilarity: 0,
      totalLossUsd: 0,
    },
    dna: { status: 'empty', matchCount: 0, topSimilarity: 0, matches: [], modelLoaded: false },
    features: null,
    vector: [],
    stats: { operations_harvested: 0, offers_harvested: 0, trades_harvested: 0 },
  };
}

module.exports = { runDNA };
