import { useState } from 'react';
import { truncateAddress, formatAmount } from '../utils/format';

const COLORS = ['#00ff88', '#00cc6a', '#009950', '#00662e', '#335040'];
const OTHER_COLOR = '#0f2418';

export default function HolderBar({ holders, totalSupply }) {
  const [tooltip, setTooltip] = useState(null);

  if (!holders || holders.length === 0 || !totalSupply) {
    return (
      <p className="text-tp-muted text-sm">No holder data available.</p>
    );
  }

  const top5 = holders.slice(0, 5);
  const top5Balance = top5.reduce((s, h) => s + h.balance, 0);
  const othersBalance = Math.max(0, totalSupply - top5Balance);
  const othersPercent = totalSupply > 0 ? (othersBalance / totalSupply) * 100 : 0;

  const segments = [
    ...top5.map((h, i) => ({
      address: h.address,
      balance: h.balance,
      percent: totalSupply > 0 ? (h.balance / totalSupply) * 100 : 0,
      color: COLORS[i],
      label: `#${i + 1}`,
    })),
    ...(othersBalance > 0
      ? [{ address: null, balance: othersBalance, percent: othersPercent, color: OTHER_COLOR, label: 'Others' }]
      : []),
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-6 rounded-full overflow-hidden mb-3 relative"
        onMouseLeave={() => setTooltip(null)}
      >
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${seg.percent}%`, backgroundColor: seg.color, minWidth: seg.percent > 0.5 ? '2px' : 0 }}
            className="transition-opacity hover:opacity-80 cursor-default"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.closest('.relative').getBoundingClientRect();
              setTooltip({ seg, x: e.clientX - rect.left });
            }}
          />
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="bg-[#06110d] border border-emerald-300/15 rounded-xl px-3 py-2 text-xs mb-3 inline-block shadow-lg">
          {tooltip.seg.address ? (
            <>
              <span className="font-mono text-tp-muted">{truncateAddress(tooltip.seg.address)}</span>
              <span className="mx-2 text-emerald-300/20">·</span>
              <span className="font-mono text-white">{formatAmount(tooltip.seg.balance)}</span>
            </>
          ) : (
            <span className="text-tp-muted">All other holders</span>
          )}
          <span className="mx-2 text-emerald-300/20">·</span>
          <span className="font-bold" style={{ color: tooltip.seg.color }}>
            {tooltip.seg.percent.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1">
        {segments.filter(s => s.address || s.percent > 0.1).map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-tp-muted font-mono truncate">
              {seg.address ? truncateAddress(seg.address) : 'Others'}
            </span>
            <span className="text-tp-text font-mono ml-auto">{seg.percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
