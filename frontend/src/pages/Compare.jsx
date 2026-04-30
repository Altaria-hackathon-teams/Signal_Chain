import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '../components/NavBar';
import RiskGauge from '../components/RiskGauge';
import { isValidIssuerAddress, normalizeIssuerAddress } from '../utils/stellar';
import { runAnalysis } from '../utils/analyze';
import { fetchReviews } from '../utils/api';
import { truncateAddress, formatNumber, formatDate, formatAmount } from '../utils/format';

const SLOTS = [0, 1];

function emptySlot() {
  return { input: '', loading: false, error: '', data: null };
}

function StarRow({ rating }) {
  return (
    <span className="text-tp-amber text-sm">
      {[1, 2, 3, 4, 5].map((n) => (n <= rating ? '★' : '☆')).join('')}
    </span>
  );
}

// Single source of truth for the column grid — used by both the heads and
// every metric row, so values line up exactly under their gauges.
const COMPARE_GRID = 'grid grid-cols-[180px_repeat(2,minmax(0,1fr))] gap-4';

function MetricRow({ label, values, format = (v) => v ?? '—', highlight = 'higher', render }) {
  let bestIndex = -1;
  if (highlight !== 'none' && values.every((v) => typeof v === 'number')) {
    const target = highlight === 'higher' ? Math.max(...values) : Math.min(...values);
    if (values.filter((v) => v === target).length === 1) {
      bestIndex = values.findIndex((v) => v === target);
    }
  }
  return (
    <div className={`${COMPARE_GRID} items-center border-t border-emerald-300/8 py-3`}>
      <div className="text-tp-muted text-xs uppercase tracking-widest font-mono">{label}</div>
      {values.map((v, i) => {
        const isBest = i === bestIndex;
        return (
          <div
            key={i}
            className={`text-center font-mono text-sm ${
              isBest ? 'text-tp-green font-bold' : 'text-tp-text'
            }`}
          >
            {render ? render(v, i, isBest) : format(v)}
          </div>
        );
      })}
    </div>
  );
}

export default function Compare() {
  const [slots, setSlots] = useState(SLOTS.map(emptySlot));
  const [reviewsBySlot, setReviewsBySlot] = useState({});

  function setSlot(i, patch) {
    setSlots((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function loadSlot(i) {
    const cur = slots[i];
    const normalized = normalizeIssuerAddress(cur.input);
    if (!isValidIssuerAddress(normalized)) {
      setSlot(i, { error: 'Invalid Stellar address', data: null });
      return;
    }
    setSlot(i, { loading: true, error: '', data: null });
    try {
      const res = await runAnalysis(normalized);
      setSlot(i, { loading: false, data: { ...res, issuerAddress: normalized } });
    } catch (err) {
      setSlot(i, { loading: false, error: err.message || 'Failed to load', data: null });
    }
  }

  function clearSlot(i) {
    setSlots((arr) => arr.map((s, idx) => (idx === i ? emptySlot() : s)));
    setReviewsBySlot((m) => {
      const next = { ...m };
      delete next[i];
      return next;
    });
  }

  async function compareAll() {
    await Promise.all(slots.map((s, i) => (s.input && !s.data ? loadSlot(i) : Promise.resolve())));
  }

  // Pull reviews once each slot's data is loaded.
  useEffect(() => {
    let active = true;
    slots.forEach((slot, i) => {
      if (!slot.data || reviewsBySlot[i]) return;
      const issuer = slot.data.issuerAddress;
      fetchReviews(issuer)
        .then((res) => {
          if (!active) return;
          setReviewsBySlot((m) => ({ ...m, [i]: res }));
        })
        .catch(() => {
          if (!active) return;
          setReviewsBySlot((m) => ({ ...m, [i]: { reviews: [], avgRating: 0, total: 0 } }));
        });
    });
    return () => { active = false; };
  }, [slots, reviewsBySlot]);

  const datas = slots.map((s) => s.data);
  const allLoaded = datas.every((d) => d);

  return (
    <div className="min-h-screen bg-tp-bg text-tp-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.09),transparent_40%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green mb-3">Compare</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Two assets, side&nbsp;by&nbsp;side.
            </h1>
            <p className="mt-3 max-w-xl text-emerald-50/64 text-base leading-7">
              Drop in two issuer addresses to see verdicts, signals, and key metrics next to each other.
            </p>
          </motion.div>

          {/* Inputs */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {slots.map((s, i) => (
              <div
                key={i}
                className="rounded-2xl border border-emerald-300/12 bg-[#06110d]/86 p-4 backdrop-blur"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-muted mb-2">
                  Slot {i + 1}
                </p>
                <input
                  type="text"
                  value={s.input}
                  onChange={(e) => setSlot(i, { input: e.target.value.toUpperCase(), error: '' })}
                  placeholder="G..."
                  className={`w-full rounded-xl bg-black/40 border px-3 py-2.5 font-mono text-sm
                    text-white placeholder-emerald-100/20 focus:outline-none focus:ring-2
                    ${s.error ? 'border-tp-red/60 focus:ring-tp-red/30' : 'border-emerald-300/14 focus:border-tp-green/40 focus:ring-tp-green/20'}`}
                />
                {s.error && <p className="mt-2 text-xs text-tp-red">{s.error}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => loadSlot(i)}
                    disabled={s.loading || !s.input}
                    className="flex-1 bg-tp-green/15 border border-tp-green/35 text-tp-green text-sm font-semibold py-2 rounded-lg
                               hover:bg-tp-green/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {s.loading ? 'Loading…' : s.data ? 'Reload' : 'Load'}
                  </button>
                  {(s.data || s.input) && (
                    <button
                      onClick={() => clearSlot(i)}
                      className="px-3 py-2 rounded-lg border border-emerald-300/12 text-tp-muted hover:text-tp-red hover:border-tp-red/35 text-sm transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={compareAll}
              disabled={!slots.every((s) => s.input)}
              className="bg-tp-green text-black font-bold px-5 py-2.5 rounded-xl
                         hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
            >
              Compare both
            </button>
          </div>

          {/* Comparison */}
          <AnimatePresence>
            {allLoaded && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-8 rounded-3xl border border-emerald-300/12 bg-[#07110d]/90 p-5 sm:p-6 backdrop-blur"
              >
                {/* Heads — sit on the same grid columns as every metric row */}
                <div className={COMPARE_GRID}>
                  <div />
                  {datas.map((d, i) => (
                    <div key={i} className="flex flex-col items-center text-center">
                      <p className="font-mono text-xs text-tp-muted mb-1">{truncateAddress(d.issuerAddress)}</p>
                      <Link
                        to={`/analyze/${d.issuerAddress}`}
                        className="text-white font-bold text-lg hover:text-tp-green transition-colors"
                      >
                        {d.assetCode}
                      </Link>
                      <div className="mt-2">
                        <RiskGauge score={d.score.score} color={d.score.verdictColor} />
                      </div>
                      <p
                        className="mt-2 font-mono text-xs uppercase tracking-widest"
                        style={{ color: d.score.verdictColor }}
                      >
                        {d.score.verdict}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Metrics */}
                <div className="mt-6">
                  <MetricRow
                    label="Trust score"
                    values={datas.map((d) => d.score.score)}
                    format={(v) => v}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Account age (days)"
                    values={datas.map((d) => d.issuer.accountAgeDays ?? 0)}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Holders"
                    values={datas.map((d) => d.holderCount)}
                    format={(v) => formatNumber(v)}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Top-1 holder %"
                    values={datas.map((d) => {
                      if (d.holderStats?.top1Pct != null) return Math.round(d.holderStats.top1Pct * 10) / 10;
                      const total = parseFloat(d.assetRecord.amount || 0);
                      const balance = d.holders[0]?.balance || 0;
                      return total > 0 ? Math.round((balance / total) * 1000) / 10 : 0;
                    })}
                    format={(v) => `${v}%`}
                    highlight="lower"
                  />
                  <MetricRow
                    label="Wash trading"
                    values={datas.map((d) => (d.trades?.washTrading ? 1 : 0))}
                    render={(v) => (
                      <span className={v ? 'text-tp-red' : 'text-tp-green'}>
                        {v ? 'detected' : 'no'}
                      </span>
                    )}
                    highlight="lower"
                  />
                  <MetricRow
                    label="Order book bids"
                    values={datas.map((d) => d.orderBook.bidCount)}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Order book asks"
                    values={datas.map((d) => d.orderBook.askCount)}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Spread %"
                    values={datas.map((d) => Math.round((d.orderBook.spreadPercent || 0) * 100) / 100)}
                    format={(v) => `${v}%`}
                    highlight="lower"
                  />
                  <MetricRow
                    label="Liquidity (USD)"
                    values={datas.map((d) => d.liquidity?.totalLiquidityUsd || 0)}
                    format={(v) => `$${formatNumber(v)}`}
                    highlight="higher"
                  />
                  <MetricRow
                    label="Sell path"
                    values={datas.map((d) =>
                      d.honeypot?.sell_path_exists ? 1 : d.honeypot?.honeypot ? -1 : 0,
                    )}
                    render={(v) => (
                      <span
                        className={
                          v === 1 ? 'text-tp-green' : v === -1 ? 'text-tp-red' : 'text-tp-amber'
                        }
                      >
                        {v === 1 ? 'open' : v === -1 ? 'blocked' : 'unverified'}
                      </span>
                    )}
                    highlight="higher"
                  />

                  {/* Auth flags */}
                  <div className={`${COMPARE_GRID} items-start border-t border-emerald-300/8 py-3`}>
                    <div className="text-tp-muted text-xs uppercase tracking-widest font-mono pt-1">
                      Auth flags
                    </div>
                    {datas.map((d, i) => {
                      const flags = d.issuer.flags || {};
                      const set = [];
                      if (flags.auth_clawback_enabled) set.push('clawback');
                      if (flags.auth_revocable) set.push('revocable');
                      if (flags.auth_required) set.push('required');
                      return (
                        <div key={i} className="text-center">
                          {set.length === 0 ? (
                            <span className="text-tp-green font-mono text-sm">none</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 justify-center">
                              {set.map((f) => (
                                <span
                                  key={f}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-tp-red border border-red-500/25 font-mono"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Top signals */}
                  <div className={`${COMPARE_GRID} items-start border-t border-emerald-300/8 py-3`}>
                    <div className="text-tp-muted text-xs uppercase tracking-widest font-mono pt-1">
                      Top signals
                    </div>
                    {datas.map((d, i) => (
                      <div key={i} className="text-center text-xs text-tp-text">
                        {(d.score.signals || []).length === 0 ? (
                          <span className="text-tp-muted">no flags</span>
                        ) : (
                          <ul className="space-y-1 inline-block text-left">
                            {d.score.signals.slice(0, 3).map((s, j) => (
                              <li key={j}>
                                <span
                                  className="font-mono text-[10px] uppercase tracking-widest"
                                  style={{
                                    color:
                                      s.severity === 'CRITICAL' ? '#ff4444' :
                                      s.severity === 'HIGH' ? '#ff5577' :
                                      s.severity === 'MEDIUM' ? '#ffaa00' : '#7eb89c',
                                  }}
                                >
                                  {s.severity}
                                </span>{' '}
                                {s.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-5 text-xs text-tp-muted font-mono text-center">
                  Green cells = winner on that metric.
                </p>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Reviews — side-by-side once both slots are loaded */}
          <AnimatePresence>
            {allLoaded && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="mt-8 rounded-3xl border border-emerald-300/12 bg-[#07110d]/90 p-5 sm:p-6 backdrop-blur"
              >
                <div className="flex items-center justify-between mb-5">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green">
                    Community reviews
                  </p>
                  <p className="text-tp-muted text-xs">
                    Verified on-chain reviews from wallets with asset activity.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {datas.map((d, i) => {
                    const r = reviewsBySlot[i];
                    return (
                      <div
                        key={i}
                        className="rounded-2xl border border-emerald-300/10 bg-black/30 p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <Link
                              to={`/analyze/${d.issuerAddress}`}
                              className="font-bold text-tp-text text-base hover:text-tp-green transition-colors"
                            >
                              {d.assetCode}
                            </Link>
                            <p className="font-mono text-[10px] text-tp-muted">
                              {truncateAddress(d.issuerAddress)}
                            </p>
                          </div>
                          {r && r.total > 0 ? (
                            <div className="text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <StarRow rating={Math.round(r.avgRating)} />
                                <span className="text-white font-bold">{r.avgRating}</span>
                              </div>
                              <p className="text-tp-muted text-[10px]">
                                {r.total} review{r.total !== 1 ? 's' : ''}
                              </p>
                            </div>
                          ) : r ? (
                            <span className="text-tp-muted text-xs">No reviews</span>
                          ) : (
                            <span className="text-tp-muted text-xs animate-pulse">loading…</span>
                          )}
                        </div>

                        {r && r.reviews.length === 0 ? (
                          <div className="rounded-xl border border-emerald-300/8 bg-black/20 px-4 py-6 text-center">
                            <p className="text-tp-muted text-xs">
                              No verified reviews yet for this asset.
                            </p>
                            <Link
                              to={`/reviews/${d.issuerAddress}`}
                              className="mt-2 inline-block text-tp-green text-xs hover:underline"
                            >
                              Be the first →
                            </Link>
                          </div>
                        ) : r ? (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {r.reviews.slice(0, 5).map((rev) => (
                              <div
                                key={rev.id}
                                className="rounded-xl border border-emerald-300/8 bg-black/20 p-3"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-tp-muted">
                                      {truncateAddress(rev.wallet_public_key)}
                                    </span>
                                    {rev.tx_amount_xlm > 0 && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-300/8 text-tp-muted font-mono">
                                        {formatAmount(rev.tx_amount_xlm)} txn
                                      </span>
                                    )}
                                  </div>
                                  <StarRow rating={rev.rating} />
                                </div>
                                {rev.review_text && (
                                  <p className="text-tp-text text-xs leading-relaxed">
                                    {rev.review_text}
                                  </p>
                                )}
                                <p className="text-tp-muted text-[9px] mt-1 font-mono">
                                  {formatDate(rev.created_at)}
                                </p>
                              </div>
                            ))}
                            {r.reviews.length > 5 && (
                              <Link
                                to={`/analyze/${d.issuerAddress}`}
                                className="block text-center text-tp-green text-xs hover:underline pt-1"
                              >
                                View all {r.reviews.length} reviews →
                              </Link>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[1, 2, 3].map((n) => (
                              <div key={n} className="h-12 rounded-xl bg-emerald-300/5 animate-pulse" />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
