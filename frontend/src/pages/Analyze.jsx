import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '../components/NavBar';
import RiskGauge from '../components/RiskGauge';
import RiskBreakdown from '../components/RiskBreakdown';
import CopyButton from '../components/CopyButton';
import SkeletonCard from '../components/SkeletonCard';
import HolderBar from '../components/HolderBar';
import ShareReport from '../components/ShareReport';
import RiskTimeline from '../components/RiskTimeline';
import { useWallet } from '../context/useWallet';
import { checkWalletTxHistory } from '../utils/horizon';
import {
  fetchReviews, fetchSignals, scanIssuer,
  recordRiskSnapshot, fetchRiskHistory,
} from '../utils/api';
import {
  buildRiskView, MODEL_CATEGORY_LABELS,
} from '../utils/risk';
import { truncateAddress, formatDate, formatAmount, formatNumber } from '../utils/format';

const TABS = [
  { id: 'risk',      label: 'Risk Overview' },
  { id: 'authority', label: 'Authority' },
  { id: 'liquidity', label: 'Liquidity & Market' },
  { id: 'holders',   label: 'Holders & Activity' },
  { id: 'reviews',   label: 'Reviews' },
];

const STATUS_TONE = {
  PASS: { color: '#00ff88', bg: 'bg-tp-green/12', border: 'border-tp-green/25', text: 'text-tp-green' },
  WARN: { color: '#ffaa00', bg: 'bg-tp-amber/12', border: 'border-tp-amber/25', text: 'text-tp-amber' },
  FAIL: { color: '#ff4444', bg: 'bg-red-500/12',  border: 'border-red-500/30',  text: 'text-tp-red'   },
};

function StarRow({ rating }) {
  return (
    <span className="text-tp-amber">
      {[1,2,3,4,5].map(n => n <= rating ? '★' : '☆').join('')}
    </span>
  );
}

function Stat({ label, value, sub, mono = false, color }) {
  return (
    <div className="rounded-xl border border-emerald-300/10 bg-black/20 px-3 py-2.5 min-w-[110px]">
      <p className="text-emerald-100/45 text-xs mb-0.5">{label}</p>
      <p
        className={`text-tp-text text-sm font-semibold ${mono ? 'font-mono' : ''}`}
        style={color ? { color } : undefined}
      >
        {value}
        {sub && <span className="text-tp-muted font-normal text-xs ml-1">{sub}</span>}
      </p>
    </div>
  );
}

function Panel({ children, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-emerald-300/12 bg-[#07110d]/90 p-6 shadow-[0_0_45px_rgba(0,255,136,0.05)] backdrop-blur transition-all hover:border-tp-green/25 hover:shadow-[0_0_55px_rgba(0,255,136,0.08)] ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/35 to-transparent" />
      {children}
    </div>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <p className="text-tp-green text-xs uppercase tracking-[0.22em] font-mono">{children}</p>
      {hint && <p className="text-tp-muted text-xs">{hint}</p>}
    </div>
  );
}

function StatusPill({ status }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.WARN;
  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${tone.bg} ${tone.border} ${tone.text}`}>
      {status}
    </span>
  );
}

function FlagPill({ active, label, dangerous = true }) {
  if (active && dangerous) {
    return (
      <span className="text-xs px-2 py-1 rounded-lg bg-red-500/15 text-tp-red border border-red-500/25 font-mono">
        {label}
      </span>
    );
  }
  if (active && !dangerous) {
    return (
      <span className="text-xs px-2 py-1 rounded-lg bg-tp-amber/15 text-tp-amber border border-tp-amber/25 font-mono">
        {label}
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-1 rounded-lg bg-tp-green/12 text-tp-green border border-tp-green/25 font-mono">
      {label}: off
    </span>
  );
}

function CategoryBars({ categoryScores }) {
  return (
    <div className="space-y-3">
      {categoryScores.map(({ key, label, score, checks }) => {
        const value = score == null ? 100 : score;
        const status = value >= 80 ? 'PASS' : value >= 50 ? 'WARN' : 'FAIL';
        const tone = STATUS_TONE[status];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-tp-text text-sm">{label}</span>
                {checks.length > 0 && (
                  <span className="text-tp-muted text-[10px] font-mono">
                    {checks.length} check{checks.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="font-mono font-bold text-sm" style={{ color: tone.color }}>
                {score == null ? 'n/a' : score}<span className="text-tp-muted text-xs font-normal">/100</span>
              </span>
            </div>
            <div className="h-2 bg-tp-border rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: tone.color, boxShadow: `0 0 6px ${tone.color}60` }}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChecklistRow({ check }) {
  const tone = STATUS_TONE[check.status] || STATUS_TONE.WARN;
  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} px-3 py-2.5`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-[10px] font-mono font-bold ${tone.text}`}>
          {check.status}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-tp-text text-sm font-semibold">{check.label}</span>
            <span className="text-tp-muted text-[10px] font-mono uppercase tracking-wider">
              {check.category}
              {check.deduction > 0 && <span className="ml-1 text-tp-muted">−{check.deduction}</span>}
            </span>
          </div>
          <p className="text-tp-muted text-xs leading-relaxed mt-1">{check.detail}</p>
        </div>
      </div>
    </div>
  );
}

function ModelSignalGrid({ model }) {
  const entries = Object.entries(model.signals || {});
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
      {entries.map(([key, value]) => {
        const safety = Math.max(0, 100 - (value || 0));
        const color = safety >= 80 ? '#00ff88' : safety >= 50 ? '#ffaa00' : '#ff4444';
        return (
          <div key={key} className="rounded-lg border border-emerald-300/10 bg-black/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-tp-muted text-[10px] uppercase tracking-wider">
                {MODEL_CATEGORY_LABELS[key] || key}
              </span>
              <span className="font-mono font-bold text-xs" style={{ color }}>
                {Math.round(value)}
              </span>
            </div>
            <div className="h-1 mt-1 bg-tp-border rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, value || 0)}%` }}
                transition={{ duration: 0.8 }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Analyze() {
  const { issuerAddress } = useParams();
  const { address: walletAddress, connect, freighterInstalled } = useWallet();
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    try { await connect(); } catch { /* ignore */ } finally { setConnecting(false); }
  }

  const [scan, setScan]               = useState(null);
  const [risk, setRisk]               = useState(null);
  const [reviews, setReviews]         = useState(null);
  const [signals, setSignals]         = useState(null);
  const [walletTxCheck, setWalletTxCheck] = useState(null);

  const [loadingScan, setLoadingScan] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [error, setError]             = useState(null);

  const [activeTab, setActiveTab]     = useState('risk');
  const [riskHistory, setRiskHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingScan(true); setLoadingReviews(true); setLoadingSignals(true);
    setError(null);
    setScan(null); setRisk(null); setReviews(null); setSignals(null);
    setRiskHistory(null); setLoadingHistory(false);

    try {
      const payload = await scanIssuer(issuerAddress);
      const view = buildRiskView(payload);
      setScan(payload);
      setRisk(view);
      setLoadingScan(false);

      const code = payload.asset?.asset_code || '';

      // Reviews + signals in parallel — both depend only on the issuer/code.
      const [reviewsRes, signalsRes] = await Promise.all([
        fetchReviews(issuerAddress).catch(() => ({ reviews: [], avgRating: 0, total: 0 })),
        code
          ? fetchSignals(issuerAddress, code).catch(() => null)
          : Promise.resolve(null),
      ]);
      setReviews(reviewsRes);
      setLoadingReviews(false);
      setSignals(signalsRes);
      setLoadingSignals(false);

      // Snapshot + history (best-effort — never blocks the page).
      setLoadingHistory(true);
      try {
        await recordRiskSnapshot({
          issuerAddress,
          assetCode: code,
          score: view.score,
          verdict: view.rating,
          verdictColor: view.verdictColor,
        }).catch(() => {});
        const histRes = await fetchRiskHistory(issuerAddress);
        setRiskHistory(histRes.history || []);
      } catch { /* non-critical */ } finally {
        setLoadingHistory(false);
      }
    } catch (err) {
      const msg = err?.message || 'Failed to load asset data';
      setError(msg);
      setLoadingScan(false); setLoadingReviews(false); setLoadingSignals(false);
    }
  }, [issuerAddress]);

  useEffect(() => {
    let active = true;
    (async () => { if (active) await loadData(); })();
    return () => { active = false; };
  }, [loadData]);

  const assetCode = scan?.asset?.asset_code || '';

  useEffect(() => {
    let active = true;
    async function runWalletCheck() {
      if (walletAddress && assetCode) {
        const result = await checkWalletTxHistory(walletAddress, assetCode, issuerAddress);
        if (active) setWalletTxCheck(result);
      } else if (active) {
        setWalletTxCheck(null);
      }
    }
    runWalletCheck();
    return () => { active = false; };
  }, [walletAddress, assetCode, issuerAddress]);

  // ── Derived helpers from `scan` ────────────────────────────────────────────
  const assetInfo = scan?.scan?.asset_info || {};
  const authority = scan?.scan?.authority || {};
  const liquidity = scan?.scan?.liquidity || {};
  const honeypot  = scan?.scan?.honeypot || {};
  const holders   = scan?.scan?.holders || {};
  const trades    = scan?.scan?.trades || {};
  const age       = scan?.scan?.age || {};
  const expert    = scan?.scan?.expert || {};
  const issuerAcc = scan?.scan?.issuer_account || {};
  const dataQ     = scan?.scan?.data_quality || {};
  const dataSrc   = scan?.scan?.data_sources || {};

  const flagsObj  = authority.flags || {};
  const dangerousFlagCount = [
    flagsObj.auth_clawback_enabled,
    flagsObj.auth_revocable,
    flagsObj.auth_required,
  ].filter(Boolean).length;

  const totalSupply = parseFloat(assetInfo.total_supply || '0');
  const xlmBalance =
    (issuerAcc.balances || []).find((b) => b.asset_type === 'native')?.balance || '0';
  const ageDays = age.age_days != null ? Number(age.age_days) : null;
  const ageLabel = ageDays == null
    ? '—'
    : ageDays < 1 ? '< 1 day'
    : ageDays < 7 ? `${ageDays.toFixed(1)} days`
    : `${Math.floor(ageDays)} days`;

  const sellPath = honeypot.sell_path_exists
    ? { label: 'Sell path open', tone: 'PASS' }
    : honeypot.honeypot
      ? { label: 'No sell path', tone: 'FAIL' }
      : { label: 'Unverified', tone: 'WARN' };

  const orderbook = liquidity.order_book || {};
  const bids = orderbook.bids || [];
  const asks = orderbook.asks || [];
  const bestBid = bids[0] ? parseFloat(bids[0].price) : 0;
  const bestAsk = asks[0] ? parseFloat(asks[0].price) : 0;
  const spread = (() => {
    if (liquidity.spread_pct != null) return liquidity.spread_pct;
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      return mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : null;
    }
    return null;
  })();

  const topHolders = (holders.top_holders || []).map((h) => ({
    address: h.address,
    balance: parseFloat(h.balance || 0),
  }));

  const sentimentColor =
    signals?.summary?.sentiment === 'BEARISH' ? 'text-tp-red' :
    signals?.summary?.sentiment === 'BULLISH' ? 'text-tp-green' : 'text-tp-amber';

  return (
    <div className="min-h-screen bg-tp-bg">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(0,255,136,0.11),transparent_32%),radial-gradient(circle_at_82%_20%,rgba(112,255,190,0.07),transparent_30%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,8,6,0.55),transparent_28%,transparent_72%,rgba(3,8,6,0.55))]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="max-w-6xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-tp-muted text-xs mb-5 font-mono">
            <Link to="/" className="hover:text-tp-green transition-colors flex items-center gap-1">
              <span>←</span> <span>Home</span>
            </Link>
            <span className="text-tp-border">/</span>
            <span className="text-emerald-100/40 truncate max-w-xs">{issuerAddress}</span>
          </div>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-red-500/8 border border-red-500/25 rounded-2xl p-5 mb-5"
            >
              <p className="text-tp-red font-semibold mb-1">Could not analyze this issuer</p>
              <p className="text-emerald-50/60 text-sm leading-relaxed">{error}</p>
              <p className="text-tp-muted text-xs mt-2">
                Issuers must be on the Stellar testnet asset list and verifiable by Horizon.
              </p>
            </motion.div>
          )}

          {/* Asset header banner */}
          {!loadingScan && scan && risk && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-2xl border border-emerald-300/14
                         bg-[#07110d]/90 px-6 py-5 mb-4 backdrop-blur
                         shadow-[0_0_40px_rgba(0,255,136,0.04)]"
              style={{ borderColor: `${risk.verdictColor}22` }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/30 to-transparent" />
              <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-5 items-center">
                {/* Gauge */}
                <div className="flex flex-col items-center">
                  <p className="text-tp-muted text-[10px] uppercase tracking-[0.22em] font-mono mb-1">
                    Trust score
                    <span className="ml-1 text-emerald-100/30 normal-case tracking-normal">(higher = safer)</span>
                  </p>
                  <RiskGauge score={risk.score} color={risk.verdictColor} />
                  <p
                    className="mt-2 font-mono text-sm font-bold tracking-wider"
                    style={{ color: risk.verdictColor }}
                  >
                    {risk.rating}
                  </p>
                </div>

                {/* Title block */}
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-3xl font-bold font-mono text-white">{assetCode || '—'}</span>
                    <span className="text-emerald-100/40 text-sm capitalize">on Stellar {scan.network}</span>
                    {dangerousFlagCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-red-500/15 text-tp-red border border-red-500/25 font-mono animate-pulse">
                        {dangerousFlagCount} auth flag{dangerousFlagCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {scan.cache?.hit && (
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-300/8 text-tp-muted border border-emerald-300/14 font-mono">
                        cache · {scan.cache.ttl_seconds}s
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="font-mono text-emerald-100/35 text-xs">{truncateAddress(issuerAddress)}</span>
                    <CopyButton text={issuerAddress} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-tp-muted">Risk probability</span>
                      <span
                        className="font-mono text-base font-bold"
                        style={{ color: risk.verdictColor }}
                      >
                        {risk.model.riskProbabilityPct ?? '—'}%
                      </span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-tp-muted">Confidence</span>
                      <span className="font-mono text-tp-text font-semibold">
                        {risk.model.confidencePct ?? '—'}%
                      </span>
                    </span>
                    <span className="text-emerald-100/30 font-mono text-[10px]">
                      {risk.model.engine}
                    </span>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="flex flex-wrap gap-3">
                  <Stat label="Age" value={ageLabel} mono />
                  <Stat label="Holders" value={formatNumber(holders.holder_count || 0)} mono />
                  <Stat label="Supply" value={formatAmount(totalSupply)} mono />
                  <Stat
                    label="Sell path"
                    value={sellPath.label}
                    color={STATUS_TONE[sellPath.tone].color}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <ShareReport
                  assetCode={assetCode}
                  score={risk.score}
                  verdict={risk.rating}
                  verdictColor={risk.verdictColor}
                  signals={risk.signals}
                  issuerAddress={issuerAddress}
                />
                <span className="text-tp-muted text-xs ml-auto">
                  {risk.deductions} deduction points · base {risk.baseScore}/100
                </span>
              </div>
            </motion.div>
          )}

          {/* Wallet connect banner */}
          {!walletAddress && !error && scan && !loadingScan && freighterInstalled !== false && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4 flex flex-wrap items-center justify-between gap-3
                         rounded-xl border border-emerald-300/10 bg-emerald-300/[0.03]
                         px-4 py-3 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-tp-green/18 bg-tp-green/8 text-base">
                  🔗
                </div>
                <div>
                  <p className="text-sm font-semibold text-tp-text">Connect your wallet</p>
                  <p className="text-xs text-tp-muted">Unlock review eligibility and wallet-specific features</p>
                </div>
              </div>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="shrink-0 rounded-xl bg-tp-green px-4 py-2 text-xs font-bold text-black
                           transition-all hover:bg-emerald-300 hover:shadow-[0_0_14px_rgba(0,255,136,0.3)]
                           disabled:opacity-50"
              >
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            </motion.div>
          )}

          {/* Tabs */}
          <div className="relative z-[1] flex gap-1 mb-4 rounded-xl border border-emerald-300/10 bg-[#07110d]/80 p-1 backdrop-blur overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 whitespace-nowrap py-2 px-3 rounded-lg text-sm font-medium transition-all
                  ${activeTab === tab.id
                    ? 'bg-tp-green text-black shadow-[0_0_14px_rgba(0,255,136,0.28)]'
                    : 'text-emerald-100/45 hover:text-tp-text hover:bg-white/5'
                  }`}
              >
                {tab.label}
                {tab.id === 'reviews' && reviews?.total > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? 'bg-black/20' : 'bg-emerald-300/10'
                  }`}>
                    {reviews.total}
                  </span>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── RISK OVERVIEW ────────────────────────────────────────────── */}
            {activeTab === 'risk' && (
              <motion.div key="risk"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
              >
                {loadingScan ? (
                  <SkeletonCard lines={6} />
                ) : risk ? (
                  <Panel>
                    <SectionTitle hint={`weighted risk ${risk.model.weightedRisk ?? '—'}`}>
                      Category scores
                    </SectionTitle>
                    <CategoryBars categoryScores={risk.categoryScores} />
                    <RiskBreakdown
                      counts={risk.counts}
                      confidence={risk.model.confidencePct}
                      probability={risk.model.riskProbabilityPct}
                    />
                  </Panel>
                ) : null}

                {loadingScan ? (
                  <SkeletonCard lines={6} />
                ) : risk ? (
                  <Panel>
                    <SectionTitle hint={`${risk.model.engine || ''}`}>
                      Model signal map
                    </SectionTitle>
                    <ModelSignalGrid model={risk.model} />
                    {risk.model.note && (
                      <p className="mt-3 text-tp-muted text-[11px] leading-relaxed">{risk.model.note}</p>
                    )}
                    {risk.model.newToken && (
                      <div className="mt-4 rounded-xl border border-emerald-300/12 bg-black/30 p-3">
                        <p className="text-tp-green text-[10px] uppercase tracking-[0.22em] font-mono mb-2">
                          New-token signal
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-tp-muted">Band</p>
                            <p className="text-tp-text font-mono">{risk.model.newToken.band}</p>
                          </div>
                          <div>
                            <p className="text-tp-muted">Age (days)</p>
                            <p className="text-tp-text font-mono">
                              {risk.model.newToken.age_days != null
                                ? Number(risk.model.newToken.age_days).toFixed(2)
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-tp-muted">Risk points</p>
                            <p className="text-tp-text font-mono">{risk.model.newToken.risk_points ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-tp-muted">Cluster risk</p>
                            <p className="text-tp-text font-mono">{risk.model.newToken.cluster_risk ?? '—'}</p>
                          </div>
                        </div>
                        {risk.model.newToken.evidence && (
                          <p className="mt-2 text-tp-muted text-[11px]">{risk.model.newToken.evidence}</p>
                        )}
                      </div>
                    )}
                  </Panel>
                ) : null}

                {/* All checks */}
                {loadingScan ? (
                  <div className="lg:col-span-2"><SkeletonCard lines={8} /></div>
                ) : risk ? (
                  <div className="lg:col-span-2">
                    <Panel>
                      <SectionTitle hint={`${risk.checks.length} run · ${risk.signals.length} flagged`}>
                        Checklist
                      </SectionTitle>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {risk.checks.map((c, i) => (
                          <motion.div key={i}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02 }}
                          >
                            <ChecklistRow check={c} />
                          </motion.div>
                        ))}
                      </div>
                    </Panel>
                  </div>
                ) : null}

                {/* Risk history timeline */}
                {(risk || loadingHistory) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                    className="lg:col-span-2"
                  >
                    <Panel>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-tp-green text-xs uppercase tracking-[0.22em] font-mono">Risk History</p>
                          <p className="text-tp-muted text-xs mt-0.5">Score changes across every analysis</p>
                        </div>
                        {riskHistory && riskHistory.length > 0 && (
                          <span className="font-mono text-[10px] px-2 py-1 rounded-lg bg-emerald-300/8 border border-emerald-300/14 text-emerald-100/40">
                            {riskHistory.length} {riskHistory.length === 1 ? 'check' : 'checks'}
                          </span>
                        )}
                      </div>
                      <RiskTimeline history={riskHistory} loading={loadingHistory} />
                    </Panel>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ── AUTHORITY ───────────────────────────────────────────────── */}
            {activeTab === 'authority' && (
              <motion.div key="authority"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <Panel>
                  <SectionTitle>Issuer flags</SectionTitle>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <FlagPill active={!!flagsObj.auth_clawback_enabled} label="Clawback" />
                    <FlagPill active={!!flagsObj.auth_revocable}        label="Revocable" />
                    <FlagPill active={!!flagsObj.auth_required}         label="Auth required" dangerous={false} />
                    <FlagPill active={!!flagsObj.auth_immutable}        label="Immutable" dangerous={false} />
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Authority verified</span>
                      <span className="text-tp-text font-mono">
                        {authority.authority_verified ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Issuer locked</span>
                      <span className="text-tp-text font-mono">
                        {authority.issuer_locked ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Can sign high threshold</span>
                      <span className="text-tp-text font-mono">
                        {authority.issuer_can_sign_high ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Master key weight</span>
                      <span className="text-tp-text font-mono">{authority.master_key_weight ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Home domain</span>
                      <span className="text-tp-text font-mono">
                        {authority.home_domain || <span className="text-tp-muted">none</span>}
                      </span>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <SectionTitle>Signers & thresholds</SectionTitle>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Stat label="Low" value={authority.thresholds?.low_threshold ?? '—'} mono />
                    <Stat label="Med" value={authority.thresholds?.med_threshold ?? '—'} mono />
                    <Stat label="High" value={authority.thresholds?.high_threshold ?? '—'} mono />
                  </div>
                  <p className="text-tp-muted text-xs mb-2">
                    {authority.signer_count} signer{authority.signer_count === 1 ? '' : 's'}
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {(authority.signers || []).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-tp-text flex-1 truncate">
                          {truncateAddress(s.key)}
                        </span>
                        <CopyButton text={s.key} />
                        <span className="font-mono text-tp-muted w-12 text-right">w{s.weight}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel>
                  <SectionTitle>Asset details</SectionTitle>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Code</span>
                      <span className="text-tp-text font-mono">{assetCode || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Type</span>
                      <span className="text-tp-text font-mono">{scan?.asset?.asset_type || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Decimals</span>
                      <span className="text-tp-text font-mono">{scan?.asset?.decimals ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Total supply</span>
                      <span className="text-tp-text font-mono">{formatAmount(totalSupply)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Issuer XLM</span>
                      <span className="text-tp-text font-mono">{formatAmount(xlmBalance)} XLM</span>
                    </div>
                    {scan?.asset?.contract_id && (
                      <div className="flex justify-between">
                        <span className="text-tp-muted">Contract id</span>
                        <span className="text-tp-text font-mono text-xs">
                          {truncateAddress(scan.asset.contract_id)}
                          <CopyButton text={scan.asset.contract_id} />
                        </span>
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel>
                  <SectionTitle>Supply & age</SectionTitle>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Mint risk</span>
                      <span className="text-tp-text font-mono">
                        {scan?.scan?.supply?.mint_risk == null
                          ? 'unknown'
                          : scan.scan.supply.mint_risk ? 'yes' : 'no'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Hard cap verifiable</span>
                      <span className="text-tp-text font-mono">
                        {scan?.scan?.supply?.hard_cap_verifiable ? 'yes' : 'no'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Supply source</span>
                      <span className="text-tp-text font-mono">{scan?.scan?.supply?.supply_source || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Age band</span>
                      <span className="text-tp-text font-mono">{age.newness_band || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Created</span>
                      <span className="text-tp-text font-mono text-xs">
                        {age.created_at ? formatDate(age.created_at) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-tp-muted">Timestamp confidence</span>
                      <span className="text-tp-text font-mono">
                        {age.timestamp_confidence != null
                          ? `${(age.timestamp_confidence * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    {age.airdrop_pattern && (
                      <div className="rounded-lg bg-tp-amber/10 border border-tp-amber/25 px-3 py-2 text-xs text-tp-amber">
                        Airdrop-style transfer burst detected from issuer.
                      </div>
                    )}
                    {age.summary && (
                      <p className="text-tp-muted text-xs leading-relaxed">{age.summary}</p>
                    )}
                  </div>
                </Panel>
              </motion.div>
            )}

            {/* ── LIQUIDITY & MARKET ──────────────────────────────────────── */}
            {activeTab === 'liquidity' && (
              <motion.div key="liquidity"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <Panel>
                  <SectionTitle>Liquidity</SectionTitle>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat
                      label="USD liquidity"
                      value={`$${formatNumber(liquidity.total_liquidity_usd || 0)}`}
                      mono
                    />
                    <Stat
                      label="XLM liquidity"
                      value={`${formatAmount(liquidity.total_liquidity_xlm || 0)} XLM`}
                      mono
                    />
                    <Stat
                      label="SDEX bid depth"
                      value={`${formatAmount(liquidity.sdex_bid_depth_xlm || 0)} XLM`}
                      mono
                    />
                    <Stat
                      label="AMM pools"
                      value={`${liquidity.pool_count || 0}`}
                      sub={`${formatAmount(liquidity.amm_liquidity_xlm || 0)} XLM`}
                      mono
                    />
                  </div>
                  <p className="text-tp-muted text-xs mt-3">
                    {liquidity.summary || 'No liquidity summary'}
                  </p>
                  {liquidity.price_source && (
                    <p className="text-tp-muted text-[11px] mt-1">
                      Price source: <span className="font-mono">{liquidity.price_source}</span>
                    </p>
                  )}
                </Panel>

                <Panel>
                  <SectionTitle>Sell path</SectionTitle>
                  <div className="flex items-center gap-2 mb-3">
                    <StatusPill status={sellPath.tone} />
                    <span className="text-tp-text text-sm">{sellPath.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Best bid (XLM)" value={(honeypot.best_bid_xlm || 0).toFixed(7)} mono />
                    <Stat label="Best path (XLM)" value={(honeypot.best_path_xlm || 0).toFixed(7)} mono />
                    <Stat
                      label="Slippage"
                      value={honeypot.slippage_pct != null ? `${honeypot.slippage_pct}%` : '—'}
                      mono
                    />
                    <Stat
                      label="Soft honeypot"
                      value={honeypot.soft_honeypot ? 'yes' : 'no'}
                      color={honeypot.soft_honeypot ? '#ffaa00' : '#00ff88'}
                    />
                  </div>
                  {honeypot.summary && (
                    <p className="text-tp-muted text-xs mt-3">{honeypot.summary}</p>
                  )}
                </Panel>

                <Panel>
                  <SectionTitle hint={`${bids.length}B / ${asks.length}A`}>
                    Order book
                  </SectionTitle>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-tp-muted text-xs mb-1">Best bid</p>
                      <p className="font-mono text-tp-green font-bold text-sm">
                        {bestBid > 0 ? `${bestBid.toFixed(7)} XLM` : <span className="text-tp-red">No bids</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-tp-muted text-xs mb-1">Best ask</p>
                      <p className="font-mono text-tp-red font-bold text-sm">
                        {bestAsk > 0 ? `${bestAsk.toFixed(7)} XLM` : <span className="text-tp-muted">No asks</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-tp-muted text-xs mb-1">Spread</p>
                      <p className={`font-mono font-bold text-sm ${
                        spread == null ? 'text-tp-muted' :
                        spread > 50 ? 'text-tp-red' :
                        spread > 15 ? 'text-tp-amber' : 'text-tp-green'
                      }`}>
                        {spread == null ? '—' : `${spread.toFixed(1)}%`}
                      </p>
                    </div>
                    <div>
                      <p className="text-tp-muted text-xs mb-1">Open orders</p>
                      <p className="font-mono text-tp-text text-sm">
                        {bids.length}B / {asks.length}A
                      </p>
                    </div>
                  </div>
                  <p className="text-tp-muted text-xs mb-2">Top levels</p>
                  <div className="space-y-1.5">
                    {asks.slice(0, 3).reverse().map((ask, i) => {
                      const max = Math.max(...asks.slice(0,3).map(a => parseFloat(a.amount) || 0)) || 1;
                      const w = Math.min((parseFloat(ask.amount) / max) * 100, 100);
                      return (
                        <div key={`a${i}`} className="flex items-center gap-2 text-xs">
                          <div className="h-1.5 rounded-full bg-tp-red/50" style={{ width: `${w}%`, minWidth: '4px' }} />
                          <span className="font-mono text-tp-red">{parseFloat(ask.price).toFixed(7)}</span>
                          <span className="text-tp-muted">{formatAmount(ask.amount)}</span>
                        </div>
                      );
                    })}
                    {(asks.length > 0 || bids.length > 0) && (
                      <div className="border-t border-emerald-300/10 my-1" />
                    )}
                    {bids.slice(0, 3).map((bid, i) => {
                      const max = Math.max(...bids.slice(0,3).map(b => parseFloat(b.amount) || 0)) || 1;
                      const w = Math.min((parseFloat(bid.amount) / max) * 100, 100);
                      return (
                        <div key={`b${i}`} className="flex items-center gap-2 text-xs">
                          <div className="h-1.5 rounded-full bg-tp-green/50" style={{ width: `${w}%`, minWidth: '4px' }} />
                          <span className="font-mono text-tp-green">{parseFloat(bid.price).toFixed(7)}</span>
                          <span className="text-tp-muted">{formatAmount(bid.amount)}</span>
                        </div>
                      );
                    })}
                    {asks.length === 0 && bids.length === 0 && (
                      <p className="text-tp-muted text-xs">No open orders on the SDEX.</p>
                    )}
                  </div>
                </Panel>

                <Panel>
                  <SectionTitle>Reputation</SectionTitle>
                  {expert.rating ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-tp-muted">StellarExpert score</span>
                        <span className="font-mono text-tp-text">
                          {expert.rating.average ?? '—'}<span className="text-tp-muted text-xs">/10</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {Object.entries(expert.rating)
                          .filter(([k]) => k !== 'average')
                          .map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                              <span className="text-tp-muted capitalize">{k}</span>
                              <span className="font-mono text-tp-text">{v}/10</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-tp-muted text-sm">No StellarExpert rating available.</p>
                  )}
                </Panel>
              </motion.div>
            )}

            {/* ── HOLDERS & ACTIVITY ──────────────────────────────────────── */}
            {activeTab === 'holders' && (
              <motion.div key="holders"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <Panel>
                  <SectionTitle hint={holders.source}>Holder distribution</SectionTitle>
                  {topHolders.length > 0 && totalSupply > 0 ? (
                    <HolderBar holders={topHolders} totalSupply={totalSupply} />
                  ) : (
                    <p className="text-tp-muted text-sm">{holders.summary || 'Concentration unavailable.'}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    <Stat label="Total holders" value={formatNumber(holders.holder_count || 0)} mono />
                    <Stat label="Whales (≥5%)" value={holders.whale_count_5pct ?? '—'} mono />
                    <Stat
                      label="Top 1 %"
                      value={holders.top1_pct != null ? `${holders.top1_pct.toFixed(2)}%` : '—'}
                      mono
                    />
                    <Stat
                      label="Top 10 %"
                      value={holders.top10_pct != null ? `${holders.top10_pct.toFixed(2)}%` : '—'}
                      mono
                    />
                    <Stat
                      label="HHI"
                      value={holders.hhi != null ? holders.hhi.toFixed(0) : '—'}
                      mono
                    />
                    <Stat
                      label="Gini"
                      value={holders.gini != null ? holders.gini.toFixed(3) : '—'}
                      mono
                    />
                  </div>

                  {topHolders.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-emerald-300/10">
                      <p className="text-tp-muted text-xs mb-2">Top {topHolders.length} holders</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {topHolders.map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-tp-muted font-mono w-4">#{i+1}</span>
                            <span className="font-mono text-tp-text flex-1 truncate">
                              {truncateAddress(h.address)}
                            </span>
                            <CopyButton text={h.address} />
                            <span className="font-mono text-tp-muted">{formatAmount(h.balance)}</span>
                            <span className="font-mono text-tp-text w-12 text-right">
                              {totalSupply > 0 ? ((h.balance / totalSupply) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>

                <Panel>
                  <SectionTitle>Activity</SectionTitle>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Trades" value={formatNumber(trades.trade_count || 0)} mono />
                    <Stat label="Payments" value={formatNumber(trades.payment_count || 0)} mono />
                    <Stat
                      label="Counterparties"
                      value={formatNumber(trades.unique_counterparties || 0)}
                      mono
                    />
                    <Stat
                      label="Wash trading"
                      value={trades.wash_trading ? 'detected' : 'no'}
                      color={trades.wash_trading ? '#ff4444' : '#00ff88'}
                    />
                  </div>
                  {trades.summary && (
                    <p className="text-tp-muted text-xs mt-3">{trades.summary}</p>
                  )}

                  {(trades.recent_trades || []).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-emerald-300/10">
                      <p className="text-tp-muted text-xs mb-2">Recent trades</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {(trades.recent_trades || []).slice(0, 10).map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-tp-muted w-20 truncate">
                              {t.ledger_close_time ? formatDate(t.ledger_close_time) : '—'}
                            </span>
                            <span className="text-tp-text flex-1">
                              {t.base_amount ? formatAmount(t.base_amount) : '—'}
                              <span className="text-tp-muted mx-1">→</span>
                              {t.counter_amount ? formatAmount(t.counter_amount) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>

                {/* Smart money signals from backend */}
                <div className="md:col-span-2">
                  {loadingSignals ? (
                    <SkeletonCard lines={4} />
                  ) : signals && signals.signals?.length > 0 ? (
                    <Panel>
                      <SectionTitle>Smart money signals</SectionTitle>
                      <p className={`text-base font-semibold mb-3 ${sentimentColor}`}>
                        {signals.summary?.headline}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-tp-muted text-xs border-b border-emerald-300/10">
                              <th className="text-left pb-2">Wallet</th>
                              <th className="text-right pb-2">Balance</th>
                              <th className="text-right pb-2">48h action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {signals.signals.map((s, i) => (
                              <tr key={i} className="border-b border-emerald-300/8">
                                <td className="py-2 font-mono text-tp-text text-xs">
                                  {truncateAddress(s.address)}<CopyButton text={s.address} />
                                </td>
                                <td className="py-2 text-right font-mono text-tp-muted text-xs">
                                  {formatAmount(s.balance)}
                                </td>
                                <td className="py-2 text-right">
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                    s.action === 'EXIT' ? 'bg-red-500/12 text-tp-red border-red-500/25' :
                                    s.action === 'ACCUMULATE' ? 'bg-tp-green/12 text-tp-green border-tp-green/25' :
                                    'bg-emerald-300/8 text-tp-muted border-emerald-300/14'
                                  }`}>
                                    {s.action}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  ) : null}
                </div>

                {/* Data quality */}
                <div className="md:col-span-2">
                  <Panel>
                    <SectionTitle>Data quality</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <Stat
                        label="Horizon"
                        value={dataQ.horizon_verified ? 'verified' : 'missing'}
                        color={dataQ.horizon_verified ? '#00ff88' : '#ffaa00'}
                      />
                      <Stat
                        label="StellarExpert"
                        value={dataQ.stellar_expert_verified ? 'verified' : 'missing'}
                        color={dataQ.stellar_expert_verified ? '#00ff88' : '#ffaa00'}
                      />
                      <Stat label="Network" value={scan?.network || '—'} />
                    </div>
                    {(dataQ.warnings || []).length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-tp-muted list-disc list-inside">
                        {dataQ.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                    {Object.keys(dataSrc).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-emerald-300/10">
                        <p className="text-tp-muted text-xs mb-2">Sources</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                          {Object.entries(dataSrc).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-tp-muted capitalize">{k.replace(/_/g, ' ')}</span>
                              <span className="font-mono text-tp-text">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Panel>
                </div>
              </motion.div>
            )}

            {/* ── REVIEWS ─────────────────────────────────────────────────── */}
            {activeTab === 'reviews' && (
              <motion.div key="reviews"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              >
                {loadingReviews ? (
                  <SkeletonCard lines={5} />
                ) : reviews ? (
                  <Panel>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                      <div>
                        <p className="text-tp-green text-xs uppercase tracking-[0.22em] mb-2 font-mono">Community reviews</p>
                        {reviews.total > 0 ? (
                          <div className="flex items-center gap-3">
                            <StarRow rating={Math.round(reviews.avgRating)} />
                            <span className="text-white font-bold text-2xl">{reviews.avgRating}</span>
                            <span className="text-tp-muted">({reviews.total} verified review{reviews.total !== 1 ? 's' : ''})</span>
                          </div>
                        ) : (
                          <p className="text-tp-muted">No reviews yet — be the first.</p>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <Link to={`/reviews/${issuerAddress}`}
                          className="bg-tp-green text-black font-bold text-sm px-4 py-2 rounded-xl
                                     hover:bg-emerald-300 transition-all hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
                        >
                          Write Your Review
                        </Link>
                        {!walletAddress ? (
                          <span className="text-tp-muted text-xs">Wallet required on the review page</span>
                        ) : walletTxCheck === null ? (
                          <span className="text-tp-muted text-xs animate-pulse">Checking eligibility...</span>
                        ) : walletTxCheck.hasTxHistory ? (
                          <span className="text-tp-green text-xs">You are eligible to review</span>
                        ) : (
                          <span className="text-tp-muted text-xs text-left sm:text-right">
                            Reviews are submitted only by wallets with asset activity.
                          </span>
                        )}
                      </div>
                    </div>

                    {reviews.reviews.length === 0 ? (
                      <div className="text-center py-12 border-t border-emerald-300/10">
                        <div className="text-4xl mb-3">📝</div>
                        <p className="text-tp-text font-semibold mb-1">No reviews yet</p>
                        <p className="text-tp-muted text-sm">
                          Only wallets that have transacted with this asset can leave a review.
                          <br />This prevents fake reviews.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reviews.reviews.map(r => (
                          <div key={r.id}
                            className="bg-black/20 rounded-2xl p-4 border border-emerald-300/8"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-300/10 border border-emerald-300/15 flex items-center justify-center font-mono text-xs text-tp-muted">
                                  {r.wallet_public_key.slice(0, 2)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-tp-text text-xs">
                                      {truncateAddress(r.wallet_public_key)}
                                    </span>
                                    {r.tx_amount_xlm > 0 && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-lg bg-emerald-300/8 text-tp-muted font-mono">
                                        {formatAmount(r.tx_amount_xlm)} transacted
                                      </span>
                                    )}
                                    {r.trust_weight > 2 && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-lg bg-tp-green/12 text-tp-green border border-tp-green/20 font-mono">
                                        high trust
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-tp-muted text-xs">{formatDate(r.created_at)}</p>
                                </div>
                              </div>
                              <StarRow rating={r.rating} />
                            </div>
                            {r.review_text && (
                              <p className="text-tp-text text-sm leading-relaxed pl-11">{r.review_text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
