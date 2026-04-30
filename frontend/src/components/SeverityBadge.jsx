const configs = {
  CRITICAL: 'bg-red-500/20 text-tp-red border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-tp-amber/20 text-tp-amber border-tp-amber/30',
  LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function SeverityBadge({ severity }) {
  return (
    <span
      className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
        configs[severity] || configs.LOW
      }`}
    >
      {severity}
    </span>
  );
}
