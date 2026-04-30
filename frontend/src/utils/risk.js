// Adapters for the ml-engine scan payload. The scanner returns rich nested
// data; these helpers normalize it for the UI components.

const RATING_COLORS = {
  SAFE: '#00ff88',
  WARNING: '#ffaa00',
  DANGER: '#ff4444',
};

export function ratingColor(rating) {
  return RATING_COLORS[rating] || '#ffaa00';
}

export function scoreColor(score) {
  if (score >= 80) return RATING_COLORS.SAFE;
  if (score >= 50) return RATING_COLORS.WARNING;
  return RATING_COLORS.DANGER;
}

export function verdictFromScore(score) {
  if (score >= 80) return 'SAFE';
  if (score >= 50) return 'WARNING';
  return 'DANGER';
}

// FAIL/WARN/PASS check status → severity buckets the UI already understands.
function severityFromCheck(check) {
  if (check.status === 'FAIL') return check.deduction >= 40 ? 'CRITICAL' : 'HIGH';
  if (check.status === 'WARN') return check.deduction >= 12 ? 'MEDIUM' : 'LOW';
  return 'INFO';
}

// Convert a single check entry into the signal shape used by Analyze/PreCheck.
export function checkToSignal(check) {
  return {
    severity: severityFromCheck(check),
    flag: check.label,
    title: check.label,
    explanation: check.detail,
    detail: check.detail,
    category: check.category,
    status: check.status,
    deduction: check.deduction,
  };
}

export function severityCounts(signals) {
  return signals.reduce(
    (acc, s) => {
      const key = (s.severity || 'INFO').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );
}

// Categories returned by the engine. Order matters — used for display.
export const CATEGORY_ORDER = [
  'authority',
  'supply',
  'honeypot',
  'liquidity',
  'holders',
  'activity',
  'age',
  'reputation',
  'data_quality',
];

export const CATEGORY_LABELS = {
  authority: 'Issuer authority',
  supply: 'Supply & mint',
  honeypot: 'Sell path',
  liquidity: 'Liquidity',
  holders: 'Holder distribution',
  activity: 'Trading activity',
  age: 'Asset age',
  reputation: 'Reputation',
  data_quality: 'Data quality',
};

export const MODEL_CATEGORY_LABELS = {
  authority: 'Issuer authority',
  supply: 'Supply & mint',
  exit_route: 'Exit route',
  liquidity: 'Liquidity',
  holders: 'Holder distribution',
  activity: 'Trading activity',
  age: 'Asset age',
  new_launch_cluster: 'New-launch cluster',
  reputation: 'Reputation',
  data_quality: 'Data quality',
};

// Build a normalized risk view from the raw `risk` block of the scan.
export function buildRiskView(payload) {
  if (!payload || !payload.risk) return null;
  const risk = payload.risk;
  const score = risk.score ?? 0;
  const rating = risk.rating || verdictFromScore(score);
  const color = ratingColor(rating);

  const checks = (risk.checks || []).map((c) => ({ ...c, signal: checkToSignal(c) }));
  const signals = checks
    .filter((c) => c.status !== 'PASS')
    .map((c) => c.signal)
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
      return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
    });

  const checkScores = risk.check_scores || {};
  const categoryScores = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    score: checkScores[key] ?? null,
    checks: checks.filter((c) => c.category === key),
  }));

  const model = risk.model || {};
  return {
    score,
    rating,
    verdict: rating,
    verdictColor: color,
    color,
    deductions: risk.deductions ?? 0,
    baseScore: risk.base_score ?? 0,
    flags: risk.flags || [],
    checks,
    signals,
    counts: severityCounts(signals),
    categoryScores,
    model: {
      score: model.score ?? null,
      blendedScore: model.blended_score ?? null,
      weightedRisk: model.weighted_risk ?? null,
      riskProbabilityPct: model.risk_probability_pct ?? null,
      confidencePct: model.confidence_pct ?? null,
      engine: model.engine ?? null,
      note: model.note ?? null,
      signals: model.signals || {},
      weights: model.category_weights || {},
      newToken: model.new_token || null,
    },
  };
}

// Convenience: treats null/undefined/N/A consistently as a placeholder.
export function fmtPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function fmtNum(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

export function statusColor(status) {
  if (status === 'PASS') return '#00ff88';
  if (status === 'WARN') return '#ffaa00';
  if (status === 'FAIL') return '#ff4444';
  return '#7eb89c';
}
