import { motion } from 'framer-motion';

const SOURCES = [
  { label: 'Stellar Horizon', sub: 'Live ledger · testnet', color: '#00ff88', bg: 'rgba(0,255,136,0.07)', border: 'rgba(0,255,136,0.25)' },
  { label: 'ML Risk Engine',  sub: '3-category scorer',    color: '#60d0ff', bg: 'rgba(96,208,255,0.07)', border: 'rgba(96,208,255,0.25)' },
  { label: 'Wallet Reviews',  sub: 'On-chain gated',       color: '#ffaa00', bg: 'rgba(255,170,0,0.07)',  border: 'rgba(255,170,0,0.25)'  },
];

const SIGNALS = [
  { label: '15+ On-chain Signals', sub: 'Auth flags · age · volume' },
  { label: 'Risk Score (3 cats)',   sub: 'Technical · Market · Behavioral' },
  { label: 'Trust Weight',          sub: 'Tx amount × wallet age' },
];

// Dot that slides down a vertical segment
function SlidingDot({ color, delay, top = '0%', bottom = '100%' }) {
  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}
      animate={{ top: [top, bottom], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, delay, repeat: Infinity, repeatDelay: 2, ease: 'linear' }}
    />
  );
}

// Fan-out: one center line splits into three columns
function FanOut({ color = '#00ff88' }) {
  const cols = ['16.5%', '50%', '83.5%'];
  return (
    <div className="relative w-full" style={{ height: 44 }}>
      {/* Center vertical stub down from input */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px" style={{ height: '45%', background: `${color}35` }} />
      {/* Horizontal bridge */}
      <div className="absolute top-[45%] w-px h-px" style={{
        left: '16.5%', right: '16.5%', width: 'calc(83.5% - 16.5%)',
        height: 1, background: `${color}28`,
      }} />
      <div className="absolute" style={{
        top: '45%', left: '16.5%', right: '16.5%', height: 1,
        background: `linear-gradient(90deg, transparent, ${color}28 30%, ${color}28 70%, transparent)`,
      }} />
      {/* Three drops */}
      {cols.map((left, i) => (
        <div key={i} className="absolute" style={{
          left, top: '45%', bottom: 0, width: 1,
          background: `${color}30`,
        }}>
          <SlidingDot color={color} delay={i * 0.35} top="0%" bottom="100%" />
        </div>
      ))}
      {/* Arrow tips */}
      {cols.map((left, i) => (
        <div key={`tip-${i}`} className="absolute bottom-0 -translate-x-1/2" style={{
          left,
          width: 0, height: 0,
          borderLeft: '3.5px solid transparent',
          borderRight: '3.5px solid transparent',
          borderTop: `4px solid ${color}45`,
        }} />
      ))}
    </div>
  );
}

// Straight triple: three parallel drops (source → signal, color-coded)
function TripleStraps() {
  const cols = ['16.5%', '50%', '83.5%'];
  return (
    <div className="relative w-full" style={{ height: 38 }}>
      {cols.map((left, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left, background: `${SOURCES[i].color}28` }}>
          <SlidingDot color={SOURCES[i].color} delay={0.15 + i * 0.28} top="0%" bottom="100%" />
        </div>
      ))}
      {cols.map((left, i) => (
        <div key={`tip-${i}`} className="absolute bottom-0 -translate-x-1/2" style={{
          left,
          width: 0, height: 0,
          borderLeft: '3.5px solid transparent',
          borderRight: '3.5px solid transparent',
          borderTop: `4px solid ${SOURCES[i].color}40`,
        }} />
      ))}
    </div>
  );
}

// Fan-in: three columns merge into one center
function FanIn({ color = '#00ff88' }) {
  const cols = ['16.5%', '50%', '83.5%'];
  return (
    <div className="relative w-full" style={{ height: 44 }}>
      {/* Three risers */}
      {cols.map((left, i) => (
        <div key={i} className="absolute top-0 w-px" style={{ left, height: '55%', background: `${color}28` }}>
          <SlidingDot color={color} delay={0.1 + i * 0.28} top="0%" bottom="100%" />
        </div>
      ))}
      {/* Horizontal bridge */}
      <div className="absolute" style={{
        top: '55%', left: '16.5%', right: '16.5%', height: 1,
        background: `linear-gradient(90deg, transparent, ${color}28 30%, ${color}28 70%, transparent)`,
      }} />
      {/* Center drop to verdict */}
      <div className="absolute left-1/2 -translate-x-1/2 w-px" style={{ top: '55%', bottom: 0, background: `${color}38` }}>
        <SlidingDot color={color} delay={0.55} top="0%" bottom="100%" />
      </div>
      {/* Arrow tip */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{
        width: 0, height: 0,
        borderLeft: '3.5px solid transparent',
        borderRight: '3.5px solid transparent',
        borderTop: `4px solid ${color}50`,
      }} />
    </div>
  );
}

export default function BlockchainVisual() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-emerald-300/15 bg-[#06110d]/85 shadow-[0_0_80px_rgba(0,255,136,0.09)] backdrop-blur p-5 flex flex-col select-none">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(0,255,136,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.1)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(0,255,136,0.08),transparent_55%)]" />

      {/* ── 1. Input row ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 flex items-center gap-3 rounded-2xl border border-emerald-300/14 bg-black/30 px-4 py-3 backdrop-blur"
      >
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="h-2 w-2 shrink-0 rounded-full bg-tp-green shadow-[0_0_10px_#00ff88]"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-100/40">Issuer address</span>
        <span className="flex-1 text-center font-mono text-xs text-emerald-50/25 truncate">GBXYZ…ABC</span>
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="font-mono text-xs font-semibold text-tp-green tracking-[0.12em] uppercase shrink-0"
        >
          Verify →
        </motion.span>
      </motion.div>

      {/* Fan out → 3 sources */}
      <FanOut color="#00ff88" />

      {/* ── 2. Data source cards ── */}
      <div className="relative z-10 grid grid-cols-3 gap-2">
        {SOURCES.map((src, i) => (
          <motion.div
            key={src.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.09, duration: 0.4 }}
            whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
            className="rounded-xl border px-3 py-3 cursor-default"
            style={{ borderColor: src.border, backgroundColor: src.bg }}
          >
            <motion.div
              className="h-1.5 w-1.5 rounded-full mb-2"
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.2, 1] }}
              transition={{ duration: 1.6, delay: i * 0.4, repeat: Infinity }}
              style={{ backgroundColor: src.color, boxShadow: `0 0 7px ${src.color}` }}
            />
            <p className="font-mono text-[10px] font-semibold leading-tight" style={{ color: src.color }}>
              {src.label}
            </p>
            <p className="font-mono text-[9px] text-emerald-100/32 mt-0.5">{src.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Straight triple drop → signal cards */}
      <TripleStraps />

      {/* ── 3. Signal output cards ── */}
      <div className="relative z-10 grid grid-cols-3 gap-2">
        {SIGNALS.map((sig, i) => (
          <motion.div
            key={sig.label}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.09, duration: 0.4 }}
            whileHover={{ scale: 1.04, transition: { duration: 0.15 } }}
            className="rounded-xl border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-3 cursor-default
                       hover:bg-emerald-300/[0.08] hover:border-emerald-300/18 transition-colors"
          >
            <p className="font-mono text-[10px] font-semibold text-emerald-100/82 leading-tight">{sig.label}</p>
            <p className="font-mono text-[9px] text-emerald-100/28 mt-0.5">{sig.sub}</p>
            {/* Animated activity bar */}
            <div className="mt-2 h-0.5 rounded-full bg-emerald-300/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-tp-green/55"
                animate={{ width: ['15%', '80%', '15%'] }}
                transition={{ duration: 2.8 + i * 0.6, delay: i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Fan in → verdict */}
      <FanIn color="#00ff88" />

      {/* ── 4. Verdict row ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38, duration: 0.45 }}
        className="relative z-10 flex items-center justify-between rounded-2xl border border-tp-green/28 bg-tp-green/[0.07] px-4 py-3.5"
      >
        <div>
          <p className="font-mono text-xs font-semibold text-tp-green">TrustProof Risk Verdict</p>
          <p className="font-mono text-[9px] text-emerald-100/32 mt-0.5">Score · signals · reviews fused</p>
        </div>
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="h-3 w-3 rounded-full bg-tp-green shadow-[0_0_18px_rgba(0,255,136,0.95)]"
        />
      </motion.div>
    </div>
  );
}
