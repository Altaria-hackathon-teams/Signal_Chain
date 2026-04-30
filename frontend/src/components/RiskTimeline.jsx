import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const VERDICT = {
  'HIGH RISK':  { color: '#ff4444', bg: 'rgba(255,68,68,0.09)',   border: 'rgba(255,68,68,0.22)'  },
  'CAUTION':    { color: '#ffaa00', bg: 'rgba(255,170,0,0.09)',   border: 'rgba(255,170,0,0.22)'  },
  'LOOKS SAFE': { color: '#00ff88', bg: 'rgba(0,255,136,0.09)',   border: 'rgba(0,255,136,0.22)' },
};
function cfg(verdict) { return VERDICT[verdict] ?? VERDICT['CAUTION']; }

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 2)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d} days ago`;
  if (d < 14) return '1 week ago';
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} mo. ago`;
}

function ScoreSpark({ entries }) {
  if (entries.length < 2) return null;
  const max = Math.max(...entries.map(e => e.score));
  const min = Math.min(...entries.map(e => e.score));
  const range = max - min || 1;
  const W = 64, H = 22;
  const pts = entries.map((e, i) => {
    const x = (i / (entries.length - 1)) * W;
    const y = H - ((e.score - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = entries[entries.length - 1];
  const c = cfg(last.verdict).color;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${c}70)` }}
      />
      {entries.map((e, i) => {
        const x = (i / (entries.length - 1)) * W;
        const y = H - ((e.score - min) / range) * (H - 4) - 2;
        return i === entries.length - 1 ? (
          <circle key={i} cx={x} cy={y} r="2.5" fill={cfg(e.verdict).color} />
        ) : null;
      })}
    </svg>
  );
}

export default function RiskTimeline({ history, loading }) {
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded-xl bg-emerald-300/[0.05] border border-emerald-300/8" />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full border border-emerald-300/14 bg-emerald-300/5 flex items-center justify-center mb-3 text-lg">
          📈
        </div>
        <p className="text-tp-text text-sm font-semibold">No history yet</p>
        <p className="text-tp-muted text-xs mt-1 max-w-[220px]">
          This is the first time this asset has been analyzed. Check back later to see score changes.
        </p>
      </div>
    );
  }

  // Newest first
  const sorted = [...history].sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));
  // Oldest first for sparkline
  const chronological = [...sorted].reverse();

  const LIMIT = 8;
  const visible = showAll ? sorted : sorted.slice(0, LIMIT);
  const hasMore = sorted.length > LIMIT;

  const newest = sorted[0];
  const oldest = sorted[sorted.length - 1];
  const totalDelta = newest.score - oldest.score;

  // Find verdict changes (newest→older traversal)
  const verdictChanges = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].verdict !== sorted[i + 1].verdict) {
      verdictChanges.push({ from: sorted[i + 1].verdict, to: sorted[i].verdict, at: sorted[i].checked_at });
    }
  }

  const hasEscalated =
    (oldest.verdict === 'LOOKS SAFE' && newest.verdict !== 'LOOKS SAFE') ||
    (oldest.verdict === 'CAUTION' && newest.verdict === 'HIGH RISK');
  const hasImproved =
    (oldest.verdict === 'HIGH RISK' && newest.verdict !== 'HIGH RISK') ||
    (oldest.verdict === 'CAUTION' && newest.verdict === 'LOOKS SAFE');

  return (
    <div className="space-y-4">

      {/* ── Summary banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-2xl border px-4 py-3 flex items-center gap-4 ${
          hasEscalated ? 'border-red-500/22 bg-red-500/[0.06]' :
          hasImproved  ? 'border-tp-green/22 bg-tp-green/[0.06]' :
                         'border-emerald-300/10 bg-emerald-300/[0.03]'
        }`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />

        {/* Spark chart */}
        {sorted.length > 1 && (
          <div className="shrink-0 border-r border-emerald-300/10 pr-4">
            <ScoreSpark entries={chronological} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {sorted.length === 1 ? (
            <>
              <p className="text-sm font-semibold text-tp-text">First check recorded</p>
              <p className="text-xs text-tp-muted mt-0.5">Check back to see how this score evolves over time.</p>
            </>
          ) : hasEscalated ? (
            <>
              <p className="text-sm font-semibold text-tp-red">
                Risk escalated ·{' '}
                <span style={{ color: cfg(oldest.verdict).color }}>{oldest.verdict}</span>
                <span className="text-tp-muted mx-1.5">→</span>
                <span style={{ color: cfg(newest.verdict).color }}>{newest.verdict}</span>
              </p>
              <p className="text-xs text-tp-muted mt-0.5">
                {sorted.length} checks · Score {totalDelta > 0 ? `+${totalDelta}` : totalDelta} since {relTime(oldest.checked_at)}
              </p>
            </>
          ) : hasImproved ? (
            <>
              <p className="text-sm font-semibold text-tp-green">
                Risk improved ·{' '}
                <span style={{ color: cfg(oldest.verdict).color }}>{oldest.verdict}</span>
                <span className="text-tp-muted mx-1.5">→</span>
                <span style={{ color: cfg(newest.verdict).color }}>{newest.verdict}</span>
              </p>
              <p className="text-xs text-tp-muted mt-0.5">
                {sorted.length} checks · Score {totalDelta > 0 ? `+${totalDelta}` : totalDelta} since {relTime(oldest.checked_at)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-tp-text">
                Score stable ·{' '}
                <span style={{ color: cfg(newest.verdict).color }}>{newest.verdict}</span>
              </p>
              <p className="text-xs text-tp-muted mt-0.5">
                {sorted.length} checks · No verdict changes since {relTime(oldest.checked_at)}
                {totalDelta !== 0 && ` · ${totalDelta > 0 ? `+${totalDelta}` : totalDelta} pts drift`}
              </p>
            </>
          )}
        </div>

        {/* Big delta */}
        {sorted.length > 1 && totalDelta !== 0 && (
          <div className={`shrink-0 font-mono text-lg font-bold ${totalDelta > 0 ? 'text-tp-red' : 'text-tp-green'}`}>
            {totalDelta > 0 ? `+${totalDelta}` : totalDelta}
          </div>
        )}
      </motion.div>

      {/* ── Timeline entries ── */}
      <div className="relative">
        {/* Vertical rail */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-emerald-300/30 via-emerald-300/12 to-transparent pointer-events-none" />

        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visible.map((entry, i) => {
              const c = cfg(entry.verdict);
              const older = sorted[i + 1];
              const delta = older ? entry.score - older.score : null;
              const verdictChanged = older && entry.verdict !== older.verdict;
              const isLatest = i === 0;

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.055, duration: 0.28, ease: 'easeOut' }}
                  className="flex items-center gap-3"
                >
                  {/* Node dot */}
                  <div className="relative shrink-0 flex items-center justify-center w-[16px]">
                    {isLatest && (
                      <motion.div
                        className="absolute w-[16px] h-[16px] rounded-full"
                        animate={{ scale: [1, 1.9, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ backgroundColor: c.color }}
                      />
                    )}
                    <div
                      className="w-[10px] h-[10px] rounded-full border-2 relative z-10 transition-all"
                      style={{
                        backgroundColor: c.color,
                        borderColor: isLatest ? c.color : 'rgba(0,0,0,0.5)',
                        boxShadow: isLatest ? `0 0 12px ${c.color}90` : 'none',
                      }}
                    />
                  </div>

                  {/* Entry card */}
                  <div
                    className="flex-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border transition-all"
                    style={{
                      backgroundColor: verdictChanged ? c.bg : 'rgba(0,0,0,0.18)',
                      borderColor: verdictChanged ? c.border : 'rgba(0,255,136,0.08)',
                    }}
                  >
                    {/* Left: date + change label */}
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="font-mono text-xs shrink-0"
                        style={{ color: isLatest ? c.color : 'rgba(255,255,255,0.35)' }}>
                        {isLatest ? 'Today' : relTime(entry.checked_at)}
                      </span>
                      {verdictChanged && (
                        <span
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-semibold"
                          style={{ color: c.color, borderColor: c.border, backgroundColor: c.bg }}
                        >
                          {older.verdict} → {entry.verdict}
                        </span>
                      )}
                    </div>

                    {/* Right: delta + score + verdict */}
                    <div className="flex items-center gap-2 shrink-0">
                      {delta !== null && delta !== 0 && (
                        <span className={`font-mono text-xs font-bold tabular-nums ${
                          delta > 0 ? 'text-tp-red' : 'text-tp-green'
                        }`}>
                          {delta > 0 ? `▲ +${delta}` : `▼ ${delta}`}
                        </span>
                      )}
                      <span
                        className="font-mono text-sm font-bold tabular-nums"
                        style={{ color: c.color }}
                      >
                        {entry.score}<span className="text-[10px] font-normal opacity-50">/100</span>
                      </span>
                      <span
                        className="hidden sm:inline-block font-mono text-[10px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap"
                        style={{ color: c.color, backgroundColor: c.bg }}
                      >
                        {entry.verdict}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Show more / less */}
        {hasMore && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            onClick={() => setShowAll(v => !v)}
            className="mt-3 ml-7 text-xs font-mono text-tp-muted hover:text-tp-green transition-colors flex items-center gap-1.5"
          >
            <span className="w-3 h-px bg-emerald-300/25 inline-block" />
            {showAll
              ? `Show less`
              : `Show ${sorted.length - LIMIT} older ${sorted.length - LIMIT === 1 ? 'entry' : 'entries'}`}
          </motion.button>
        )}

        {/* "Oldest check" marker */}
        {sorted.length > 1 && (
          <div className="mt-2 ml-7 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-emerald-300/12 to-transparent" />
            <span className="font-mono text-[10px] text-emerald-100/20 shrink-0">
              First check · {new Date(oldest.checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
