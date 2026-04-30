import axios from 'axios';

const backend = axios.create({ baseURL: '/api' });
const mlEngine = axios.create({ baseURL: '/ml' });

export async function fetchReviews(issuerAddress) {
  const { data } = await backend.get(`/reviews/${issuerAddress}`);
  return data;
}

export async function submitReview({ issuerAddress, assetCode, walletPublicKey, rating, reviewText }) {
  const { data } = await backend.post('/reviews', {
    issuerAddress,
    assetCode,
    walletPublicKey,
    rating,
    reviewText,
  });
  return data;
}

export function stellarExpertTxUrl(hash) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export async function fetchLeaderboard(kind, limit = 10) {
  const { data } = await backend.get(`/leaderboard/${kind}`, { params: { limit } });
  return data;
}

export async function fetchSignals(issuerAddress, assetCode) {
  const { data } = await backend.get(`/signals/${issuerAddress}`, {
    params: { assetCode },
  });
  return data;
}

// Stellar token-safety scanner (Flask, ml-engine). One call returns the full
// scan + risk model for an issuer. Throws with the engine's error message on
// non-2xx responses or `ok: false` payloads.
export async function scanIssuer(issuerAddress) {
  try {
    const { data } = await mlEngine.get(`/scan/${issuerAddress}`);
    if (data && data.ok === false) {
      throw new Error(data.error || 'Scan failed');
    }
    return data;
  } catch (err) {
    const apiMsg = err?.response?.data?.error;
    if (apiMsg) throw new Error(apiMsg, { cause: err });
    throw new Error(err?.message || 'Scan request failed', { cause: err });
  }
}

export async function recordRiskSnapshot({ issuerAddress, assetCode, score, verdict, verdictColor }) {
  const { data } = await backend.post('/risk-history', { issuerAddress, assetCode, score, verdict, verdictColor });
  return data;
}

export async function fetchRiskHistory(issuerAddress) {
  const { data } = await backend.get(`/risk-history/${issuerAddress}`);
  return data;
}
