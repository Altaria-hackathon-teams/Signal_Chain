import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchAiSummary } from '../utils/api';

const REC_STYLE = {
  AVOID:  { color: '#ff5577', label: 'Avoid' },
  RISKY:  { color: '#ff8855', label: 'Risky' },
  WATCH:  { color: '#ffaa00', label: 'Watch' },
  OK:     { color: '#00ff88', label: 'OK to engage' },
};

const SEV_COLOR = {
  CRITICAL: '#ff3355',
  HIGH:     '#ff5577',
  MEDIUM:   '#ffaa00',
  LOW:      '#7eb89c',
};

function ShimmerBar({ delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0.4 }}
      animate={{ opacity: [0.4, 0.9, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, delay }}
      className="h-3 rounded bg-emerald-300/8"
    />
  );
}

export default function AiSummary({ address, scan, riskScore }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!address || !scan) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    fetchAiSummary({ address, scan, riskScore })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.response?.data?.error || err.message || 'Failed to load AI summary';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, scan, riskScore]);

  const rec = data ? REC_STYLE[data.recommendation] || REC_STYLE.WATCH : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-300/14 bg-gradient-to-br from-[#08160f] via-[#06110d] to-[#040a07] p-6 shadow-[0_0_55px_rgba(0,255,136,0.06)] backdrop-blur">
      {/* Animated top edge */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green to-transparent"
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border border-tp-green/30 border-t-tp-green border-r-tp-green flex items-center justify-center"
            />
            <div className="absolute inset-0 flex items-center justify-center text-tp-green text-sm">✦</div>
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green">AI verdict</p>
            <p className="text-tp-muted text-xs">
              {loading ? 'Reasoning over chain evidence…' : data?.model ? `Powered by ${data.model}` : 'Gemini analysis'}
            </p>
          </div>
        </div>
        {data?.cached && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-tp-muted/60 px-2 py-1 rounded-md border border-emerald-300/8">
            cached
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <ShimmerBar />
            <ShimmerBar delay={0.15} />
            <ShimmerBar delay={0.3} />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <ShimmerBar delay={0.45} />
              <ShimmerBar delay={0.6} />
            </div>
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-tp-red/30 bg-tp-red/5 p-4"
          >
            <p className="text-tp-red text-sm font-mono">{error}</p>
            {error.includes('GEMINI_API_KEY') && (
              <p className="text-tp-muted text-xs mt-2">
                Get a free key at{' '}
                <a href="https://aistudio.google.com/apikey" className="text-tp-green underline" target="_blank" rel="noreferrer">
                  aistudio.google.com/apikey
                </a>{' '}
                and set it in <code className="text-tp-text">backend/.env</code>.
              </p>
            )}
          </motion.div>
        )}

        {data && !loading && !error && (
          <motion.div
            key="data"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-5"
          >
            <div className="flex items-start gap-3">
              {rec && (
                <span
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest font-mono shrink-0"
                  style={{
                    color: rec.color,
                    background: `${rec.color}18`,
                    border: `1px solid ${rec.color}55`,
                  }}
                >
                  {rec.label}
                </span>
              )}
              <p className="text-white text-base font-semibold leading-relaxed">{data.headline}</p>
            </div>

            <p className="text-tp-text/90 text-sm leading-relaxed">{data.summary}</p>

            {data.rationale && (
              <p className="rounded-xl border border-emerald-300/8 bg-black/30 p-3 text-tp-muted text-xs italic leading-relaxed">
                {data.rationale}
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {data.strengths?.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-green mb-2">
                    Strengths
                  </p>
                  <ul className="space-y-2">
                    {data.strengths.map((s, i) => (
                      <li key={i} className="rounded-lg border border-tp-green/15 bg-tp-green/5 p-2.5">
                        <p className="text-white text-sm font-semibold">{s.title}</p>
                        {s.detail && <p className="text-tp-muted text-xs mt-0.5">{s.detail}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.concerns?.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-red mb-2">
                    Concerns
                  </p>
                  <ul className="space-y-2">
                    {data.concerns.map((c, i) => {
                      const color = SEV_COLOR[c.severity] || SEV_COLOR.MEDIUM;
                      return (
                        <li
                          key={i}
                          className="rounded-lg p-2.5"
                          style={{
                            border: `1px solid ${color}33`,
                            background: `${color}0e`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
                              style={{ color, background: `${color}22` }}
                            >
                              {c.severity || 'INFO'}
                            </span>
                            <p className="text-white text-sm font-semibold">{c.title}</p>
                          </div>
                          {c.detail && <p className="text-tp-muted text-xs mt-1">{c.detail}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
