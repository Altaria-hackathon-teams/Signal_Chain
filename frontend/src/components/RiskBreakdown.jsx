import { motion } from 'framer-motion';

const SEV_TONE = {
  critical: 'bg-red-500/15 text-tp-red border-red-500/25',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/25',
  medium:   'bg-yellow-500/15 text-tp-amber border-yellow-500/25',
  low:      'bg-blue-500/15 text-blue-400 border-blue-500/25',
};

function MeterRow({ label, value, color, suffix = '%' }) {
  if (value == null) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-tp-muted text-xs">{label}</span>
        <span className="font-mono text-xs font-bold" style={{ color }}>
          {value}{suffix}
        </span>
      </div>
      <div className="h-1.5 bg-tp-border rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}60` }}
        />
      </div>
    </div>
  );
}

export default function RiskBreakdown({ counts, confidence, probability }) {
  if (!counts) return null;
  const probColor = probability == null ? '#7eb89c'
    : probability >= 70 ? '#ff4444'
    : probability >= 40 ? '#ffaa00'
    : '#00ff88';

  return (
    <div className="space-y-4 pt-4 mt-4 border-t border-emerald-300/10">
      {/* Severity counts */}
      <div className="flex flex-wrap gap-2">
        {counts.critical > 0 && (
          <span className={`text-xs px-2 py-1 rounded border font-mono ${SEV_TONE.critical}`}>
            {counts.critical} CRITICAL
          </span>
        )}
        {counts.high > 0 && (
          <span className={`text-xs px-2 py-1 rounded border font-mono ${SEV_TONE.high}`}>
            {counts.high} HIGH
          </span>
        )}
        {counts.medium > 0 && (
          <span className={`text-xs px-2 py-1 rounded border font-mono ${SEV_TONE.medium}`}>
            {counts.medium} MEDIUM
          </span>
        )}
        {counts.low > 0 && (
          <span className={`text-xs px-2 py-1 rounded border font-mono ${SEV_TONE.low}`}>
            {counts.low} LOW
          </span>
        )}
        {counts.critical + counts.high + counts.medium + counts.low === 0 && (
          <span className="text-xs px-2 py-1 rounded border font-mono bg-tp-green/12 text-tp-green border-tp-green/25">
            0 FLAGS
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MeterRow label="Risk probability" value={probability} color={probColor} />
        <MeterRow label="Evidence confidence" value={confidence} color="#00ff88" />
      </div>
    </div>
  );
}
