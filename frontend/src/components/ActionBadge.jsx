const configs = {
  EXIT: 'bg-red-500/20 text-tp-red border-red-500/30',
  HOLD: 'bg-emerald-300/[0.06] text-tp-muted border-emerald-300/14',
  ACCUMULATE: 'bg-green-500/20 text-tp-green border-green-500/30',
};

export default function ActionBadge({ action }) {
  return (
    <span
      className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
        configs[action] || configs.HOLD
      }`}
    >
      {action}
    </span>
  );
}
