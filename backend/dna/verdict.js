// Rule-based verdict generator. Produces a plain-English summary from the
// similarity result + raw 40-feature vector. No external API calls — fully
// deterministic so the same scan always returns the same verdict.

function buildVerdict(dnaResult, assetCode, vector = []) {
  const { status = 'clean', matchCount = 0, topSimilarity = 0, aiVerdict, aiConfidence = 0 } = dnaResult;

  // 40-dim vector positions (1-indexed in extractor; 0-indexed here):
  //  9: f10_initial_xlm_amount
  // 12: f13_has_micro_test_tx
  // 19: f20_flag_auth_revocable
  // 20: f21_flag_auth_clawback
  // 34: f35_total_ops_ever
  // 35: f36_early_unique_buyers
  const initialXLM = vector[9] || 0;
  const hasMicroTx = vector[12] === 1;
  const isAuthRevocable = vector[19] === 1;
  const isClawbackEnabled = vector[20] === 1;
  const totalOps = vector[34] || 0;
  const uniqueBuyers = vector[35] || 0;

  const redFlags = [];
  if (isClawbackEnabled) redFlags.push('Clawback enabled — issuer can seize tokens from holders.');
  if (isAuthRevocable) redFlags.push('Authorization is revocable — issuer can freeze trustlines.');
  if (initialXLM > 0 && initialXLM < 10)
    redFlags.push(`Low funding (${initialXLM.toFixed(2)} XLM) — burner-account pattern.`);
  if (hasMicroTx) redFlags.push('Micro-transaction priming detected in early operations.');
  if (totalOps > 0 && totalOps < 5) redFlags.push('Thin transaction history — insufficient organic activity.');
  if (uniqueBuyers > 0 && uniqueBuyers < 3 && totalOps > 0)
    redFlags.push(`Only ${uniqueBuyers} unique early buyer${uniqueBuyers === 1 ? '' : 's'}.`);
  if (status === 'flagged' && topSimilarity > 0.9)
    redFlags.push(`DNA matches a known rug pattern at ${(topSimilarity * 100).toFixed(1)}% similarity.`);
  else if (status === 'flagged' && matchCount > 0)
    redFlags.push(`${matchCount} fingerprint match${matchCount === 1 ? '' : 'es'} against known rugs.`);
  if (aiVerdict === 'rug' && aiConfidence > 0.8)
    redFlags.push(`Behavioral forest classifies as rug (${(aiConfidence * 100).toFixed(0)}% confidence).`);

  let risk = 'low';
  if (status === 'flagged' && topSimilarity > 0.85) risk = 'critical';
  else if (aiVerdict === 'rug' && aiConfidence > 0.85) risk = 'critical';
  else if (redFlags.length >= 3) risk = 'high';
  else if (redFlags.length >= 1 || status === 'flagged') risk = 'medium';

  const labelMap = {
    critical: 'Known Rug Pattern',
    high: 'High Risk',
    medium: 'Caution',
    low: 'Standard',
    unknown: 'Unknown',
  };
  const colorMap = {
    critical: 'red',
    high: 'red',
    medium: 'orange',
    low: 'green',
    unknown: 'gray',
  };

  let body;
  if (risk === 'critical' && status === 'flagged') {
    body = `Behavioral fingerprint matches a known rug at ${(topSimilarity * 100).toFixed(1)}% similarity. The pattern of timing, funding, asset configuration and operational style is consistent with previously confirmed malicious issuers.`;
  } else if (risk === 'critical') {
    body = `The behavioral forest classified this issuer as a rug with ${(aiConfidence * 100).toFixed(0)}% confidence. Multiple high-risk traits are present in the operator profile.`;
  } else if (risk === 'high') {
    body = `${redFlags.length} significant behavioral anomalies are present. The pattern is consistent with pre-rug operations even if no direct fingerprint match was found.`;
  } else if (risk === 'medium') {
    body = `${redFlags.length} minor anomal${redFlags.length === 1 ? 'y' : 'ies'} detected. No direct match against known rugs, but treat with care.`;
  } else {
    body = 'No fingerprint match against the known-rug database and no behavioral anomalies detected. Standard issuance pattern.';
  }

  return {
    risk,
    label: labelMap[risk],
    color: colorMap[risk],
    headline: `${assetCode || 'Issuer'} — ${labelMap[risk]}`,
    body,
    redFlags,
    confidence: Math.max(topSimilarity, aiConfidence) || (status === 'clean' ? 0.75 : 0.5),
    matchCount,
    topSimilarity,
    totalLossUsd: dnaResult.totalLossUsd || 0,
  };
}

module.exports = { buildVerdict };
