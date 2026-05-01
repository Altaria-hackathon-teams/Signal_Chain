import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAiWebSearch } from '../utils/api';

const VERDICT_STYLE = {
  TRUSTED:    { color: '#00ff88', glow: 'rgba(0,255,136,0.45)',  label: 'Trusted',    icon: '✓' },
  MIXED:      { color: '#ffaa00', glow: 'rgba(255,170,0,0.45)',  label: 'Mixed',      icon: '◐' },
  SUSPICIOUS: { color: '#ff8855', glow: 'rgba(255,136,85,0.45)', label: 'Suspicious', icon: '!' },
  DANGEROUS:  { color: '#ff3355', glow: 'rgba(255,51,85,0.55)',  label: 'Dangerous',  icon: '✕' },
};

const STANCE_COLOR = {
  POSITIVE: '#00ff88',
  NEGATIVE: '#ff5577',
  NEUTRAL:  '#cfd1d6',
};

const SENTIMENT_GRADIENT = {
  POSITIVE: 'from-emerald-400/20 via-emerald-300/10 to-transparent',
  MIXED:    'from-amber-400/20 via-amber-300/10 to-transparent',
  NEGATIVE: 'from-rose-500/20 via-rose-400/10 to-transparent',
  NONE:     'from-slate-500/15 via-slate-400/8 to-transparent',
};

// Walking dots while we wait for the model.
const PROGRESS_STEPS = [
  'Reading on-chain scan…',
  'Bundling user reviews…',
  'Searching Stellar.expert…',
  'Searching public web…',
  'Cross-referencing identifiers…',
  'Scoring sentiment…',
  'Synthesizing verdict…',
];

function CircularScore({ score, color }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score || 0) / 100);
  return (
    <div className="relative w-[140px] h-[140px]">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <motion.circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-bold" style={{ color }}>{score ?? '—'}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-tp-muted mt-1">/ 100</span>
      </div>
    </div>
  );
}

function SentimentBar({ label, score, color }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color }}>
          {label}
        </span>
        <span className="font-mono text-xs text-tp-text">{score ?? 0}%</span>
      </div>
      <div className="h-2 rounded-full bg-black/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score ?? 0}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}, ${color}aa)` }}
        />
      </div>
    </div>
  );
}

function ProgressTicker({ active }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, PROGRESS_STEPS.length - 1));
    }, 1200);
    return () => clearInterval(id);
  }, [active]);

  return (
    <ul className="space-y-2 font-mono text-xs">
      {PROGRESS_STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        const pending = i > step;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 transition-all ${
              pending ? 'text-tp-muted/40' : current ? 'text-tp-green' : 'text-tp-text/70'
            }`}
          >
            <span className="w-4 inline-flex items-center justify-center">
              {done && '✓'}
              {current && (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="inline-block"
                >
                  ◌
                </motion.span>
              )}
              {pending && '·'}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ScrollingHostnames({ urls }) {
  if (!urls?.length) return null;
  const hosts = [...new Set(urls.map((u) => {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; }
  }).filter(Boolean))];
  return (
    <div className="overflow-hidden border border-emerald-300/8 bg-black/30 rounded-xl py-2">
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: hosts.length * 4, repeat: Infinity, ease: 'linear' }}
        className="flex gap-6 whitespace-nowrap"
      >
        {[...hosts, ...hosts].map((h, i) => (
          <span key={i} className="font-mono text-xs text-tp-muted">
            <span className="text-tp-green/70">●</span> {h}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export default function WebSearchPanel({ address, assetCode, scan, reviews }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const startedAt = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 100) / 10);
    }, 100);
    return () => clearInterval(id);
  }, [loading]);

  async function trigger() {
    if (loading) return;
    setLoading(true);
    setError('');
    setData(null);
    startedAt.current = Date.now();
    setElapsed(0);
    try {
      const res = await fetchAiWebSearch({ address, assetCode, scan, reviews });
      setData(res);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Web search failed');
    } finally {
      setLoading(false);
    }
  }

  const verdict = data ? VERDICT_STYLE[data.verdict] || VERDICT_STYLE.MIXED : null;
  const sentLabel = data?.review_sentiment?.label || 'NONE';
  const sentScore = data?.review_sentiment?.score ?? 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-300/14 bg-[#06110d]/92 backdrop-blur shadow-[0_0_55px_rgba(0,255,136,0.05)]">
      {/* Animated borders */}
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green to-transparent"
      />
      <motion.div
        animate={{ x: ['100%', '-100%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear', delay: 1 }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-tp-green to-transparent"
      />

      <div className="p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
              className="w-10 h-10 rounded-xl border border-tp-green/30 flex items-center justify-center text-tp-green text-xl"
              style={{ boxShadow: '0 0 16px rgba(0,255,136,0.15)' }}
            >
              ⌖
            </motion.div>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green">
                Open-Source Intelligence
              </p>
              <h3 className="text-white text-lg font-semibold mt-0.5">Cross-Web Investigation</h3>
              <p className="text-tp-muted text-xs mt-0.5 max-w-md">
                Run a live Google-grounded search across the public web + sentiment analysis on every
                review submitted to TrustProof. Returns an independent verdict.
              </p>
            </div>
          </div>

          {!loading && !data && !error && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={trigger}
              className="relative bg-tp-green text-black font-bold px-5 py-3 rounded-xl
                         hover:shadow-[0_0_22px_rgba(0,255,136,0.45)] transition-all"
            >
              <span className="flex items-center gap-2">
                Run Web Investigation
                <span className="font-mono">→</span>
              </span>
            </motion.button>
          )}

          {loading && (
            <div className="text-right">
              <p className="font-mono text-tp-green text-xs uppercase tracking-widest animate-pulse">
                ⏳ Investigating…
              </p>
              <p className="font-mono text-[10px] text-tp-muted mt-1">{elapsed.toFixed(1)}s elapsed</p>
            </div>
          )}

          {(data || error) && !loading && (
            <button
              onClick={trigger}
              className="text-xs font-mono text-tp-muted hover:text-tp-green border border-emerald-300/12 hover:border-tp-green/35 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↻ Re-run
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* Loading */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-5 md:grid-cols-[1fr_1.4fr]"
            >
              <div className="rounded-xl border border-emerald-300/10 bg-black/30 p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green mb-3">
                  Investigation log
                </p>
                <ProgressTicker active={loading} />
              </div>
              <div className="rounded-xl border border-emerald-300/10 bg-black/30 p-4 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="text-5xl"
                  >
                    🛰
                  </motion.div>
                  <p className="font-mono text-xs text-tp-muted">
                    Live web search via Gemini grounding…
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {error && !loading && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-tp-red/30 bg-tp-red/5 p-4"
            >
              <p className="text-tp-red text-sm font-mono">{error}</p>
              {error.includes('GEMINI_API_KEY') && (
                <p className="text-tp-muted text-xs mt-2">
                  Get a free key at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-tp-green underline">
                    aistudio.google.com/apikey
                  </a>{' '}
                  and add it to <code className="text-tp-text">backend/.env</code> as <code className="text-tp-text">GEMINI_API_KEY</code>.
                </p>
              )}
            </motion.div>
          )}

          {/* Result */}
          {data && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Headline + Score */}
              <div className="grid gap-5 md:grid-cols-[auto_1fr] items-center">
                <div className="flex justify-center">
                  <CircularScore score={data.score} color={verdict?.color || '#00ff88'} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {verdict && (
                      <span
                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest font-mono"
                        style={{
                          color: verdict.color,
                          background: `${verdict.color}1e`,
                          border: `1px solid ${verdict.color}55`,
                          boxShadow: `0 0 14px ${verdict.glow}`,
                        }}
                      >
                        {verdict.icon} {verdict.label}
                      </span>
                    )}
                    {data.score_label && (
                      <span className="text-xs font-mono text-tp-muted px-2 py-1 rounded border border-emerald-300/10">
                        {data.score_label}
                      </span>
                    )}
                    {typeof data.confidence === 'number' && (
                      <span className="text-xs font-mono text-tp-muted">
                        confidence: <span className="text-tp-green">{data.confidence}%</span>
                      </span>
                    )}
                  </div>
                  <p className="text-white text-base leading-relaxed">{data.executive_summary}</p>
                  {data.recommendation && (
                    <p className="mt-3 rounded-xl border border-emerald-300/10 bg-black/30 p-3 text-tp-text/85 text-sm italic">
                      → {data.recommendation}
                    </p>
                  )}
                </div>
              </div>

              {/* Review sentiment */}
              <div
                className={`rounded-2xl p-4 border border-emerald-300/10 bg-gradient-to-r ${
                  SENTIMENT_GRADIENT[sentLabel] || SENTIMENT_GRADIENT.NONE
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green">
                    Review sentiment
                  </p>
                  <span
                    className="font-mono text-xs px-2 py-1 rounded"
                    style={{
                      color:
                        sentLabel === 'POSITIVE' ? '#00ff88'
                        : sentLabel === 'NEGATIVE' ? '#ff5577'
                        : sentLabel === 'MIXED' ? '#ffaa00'
                        : '#7a8a82',
                    }}
                  >
                    {sentLabel}
                  </span>
                </div>
                <SentimentBar
                  label="positive sentiment"
                  score={sentScore}
                  color={
                    sentLabel === 'POSITIVE' ? '#00ff88'
                    : sentLabel === 'NEGATIVE' ? '#ff5577'
                    : sentLabel === 'MIXED' ? '#ffaa00'
                    : '#7a8a82'
                  }
                />
                {data.review_sentiment?.summary && (
                  <p className="mt-3 text-tp-text/85 text-sm leading-relaxed">
                    {data.review_sentiment.summary}
                  </p>
                )}
              </div>

              {/* Flags */}
              <div className="grid gap-4 md:grid-cols-2">
                {data.green_flags?.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green mb-2">
                      Green flags
                    </p>
                    <ul className="space-y-2">
                      {data.green_flags.map((f, i) => (
                        <li key={i} className="rounded-lg border border-tp-green/20 bg-tp-green/5 p-3">
                          <p className="text-white text-sm font-semibold">✓ {f.title}</p>
                          {f.detail && <p className="text-tp-muted text-xs mt-1">{f.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.red_flags?.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-red mb-2">
                      Red flags
                    </p>
                    <ul className="space-y-2">
                      {data.red_flags.map((f, i) => (
                        <li key={i} className="rounded-lg border border-tp-red/20 bg-tp-red/5 p-3">
                          <p className="text-white text-sm font-semibold">⚠ {f.title}</p>
                          {f.detail && <p className="text-tp-muted text-xs mt-1">{f.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Web findings */}
              {data.web_findings?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green">
                      Web findings · {data.web_findings.length}
                    </p>
                    <span className="text-tp-muted text-xs font-mono">
                      ranked by weight
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.web_findings.map((f, i) => {
                      const stanceColor = STANCE_COLOR[f.stance] || '#cfd1d6';
                      let host = '';
                      try { host = new URL(f.url).hostname.replace(/^www\./, ''); } catch {}
                      return (
                        <motion.a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * i }}
                          className="block rounded-xl border border-emerald-300/10 bg-black/30 p-3 hover:border-tp-green/35 transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                              style={{
                                color: stanceColor,
                                background: `${stanceColor}22`,
                              }}
                            >
                              {f.stance || 'NEUTRAL'}
                            </span>
                            {f.weight && (
                              <span className="font-mono text-[9px] uppercase text-tp-muted">{f.weight}</span>
                            )}
                            <span className="ml-auto font-mono text-[10px] text-tp-muted truncate max-w-[140px]">
                              {host || f.source}
                            </span>
                          </div>
                          <p className="text-white text-sm font-semibold mb-1 group-hover:text-tp-green transition-colors line-clamp-2">
                            {f.title}
                          </p>
                          {f.snippet && (
                            <p className="text-tp-muted text-xs leading-relaxed line-clamp-3">{f.snippet}</p>
                          )}
                        </motion.a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sources / queries */}
              {(data.sources?.length > 0 || data.search_queries?.length > 0) && (
                <div className="rounded-2xl border border-emerald-300/10 bg-black/30 p-4 space-y-3">
                  {data.search_queries?.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green mb-2">
                        Search queries used
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {data.search_queries.map((q, i) => (
                          <span
                            key={i}
                            className="font-mono text-[11px] px-2 py-1 rounded-md border border-emerald-300/12 bg-tp-green/5 text-tp-green"
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.sources?.length > 0 && (
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green mb-2">
                        Grounded on these sources ({data.sources.length})
                      </p>
                      <ScrollingHostnames urls={data.sources.map((s) => s.url)} />
                      <ul className="mt-2 grid gap-1 md:grid-cols-2">
                        {data.sources.slice(0, 12).map((s, i) => {
                          let host = '';
                          try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
                          return (
                            <li key={i} className="font-mono text-[11px] truncate">
                              <a href={s.url} target="_blank" rel="noreferrer" className="text-tp-muted hover:text-tp-green transition-colors">
                                {host} ↗
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {data.model && (
                <p className="text-tp-muted text-[10px] font-mono text-right">
                  generated by {data.model}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
