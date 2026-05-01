const HORIZON_MAINNET = 'https://horizon.stellar.org';
const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

function getBase(isTestnet) {
  return isTestnet ? HORIZON_TESTNET : HORIZON_MAINNET;
}

async function horizonGet(path, params, isTestnet) {
  const url = new URL(getBase(isTestnet) + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Horizon ${path} → ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOperations(pubkey, maxOps = 1000, isTestnet = false) {
  const ops = [];
  let url = `${getBase(isTestnet)}/accounts/${pubkey}/operations?limit=200&order=asc`;
  while (url && ops.length < maxOps) {
    const res = await fetch(url);
    if (!res.ok) return ops;
    const data = await res.json();
    const records = data?._embedded?.records ?? [];
    ops.push(...records);
    const next = data?._links?.next?.href;
    url = next && records.length === 200 ? next : null;
    if (url) await sleep(120);
  }
  return ops;
}

async function fetchAccount(pubkey, isTestnet = false) {
  try {
    return await horizonGet(`/accounts/${pubkey}`, {}, isTestnet);
  } catch {
    return null;
  }
}

async function fetchOffers(pubkey, isTestnet = false) {
  try {
    const data = await horizonGet(`/offers`, { seller: pubkey, limit: 200, order: 'asc' }, isTestnet);
    return data?._embedded?.records ?? [];
  } catch {
    return [];
  }
}

async function fetchTrades(assetCode, issuerPubkey, isTestnet = false) {
  if (!assetCode) return [];
  try {
    const data = await horizonGet(
      `/trades`,
      {
        base_asset_type: 'credit_alphanum4',
        base_asset_code: assetCode,
        base_asset_issuer: issuerPubkey,
        counter_asset_type: 'native',
        limit: 200,
        order: 'asc',
      },
      isTestnet,
    );
    return data?._embedded?.records ?? [];
  } catch {
    return [];
  }
}

async function fetchAssetsByIssuer(issuer, isTestnet = false) {
  try {
    const data = await horizonGet(`/assets`, { asset_issuer: issuer, limit: 10, order: 'desc' }, isTestnet);
    return data?._embedded?.records ?? [];
  } catch {
    return [];
  }
}

module.exports = {
  fetchOperations,
  fetchAccount,
  fetchOffers,
  fetchTrades,
  fetchAssetsByIssuer,
};
