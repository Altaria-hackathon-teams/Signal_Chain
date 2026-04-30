import { useState } from 'react';

const W = 800, H = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 58 };
const CW = W - PAD.left - PAD.right;
const CH = H - PAD.top - PAD.bottom;
const PRICE_H = CH * 0.65;
const VOL_H   = CH * 0.22;
const GAP     = CH * 0.13;

function formatPrice(p) {
  if (p === 0) return '0';
  if (p < 0.000001) return p.toExponential(2);
  if (p < 0.001) return p.toFixed(7);
  if (p < 1) return p.toFixed(5);
  return p.toFixed(4);
}

export default function PriceChart({ data, assetCode, days = 30 }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-black/20 rounded-xl
                      border border-emerald-300/10 text-tp-muted text-sm">
        No DEX trading history found for this token
      </div>
    );
  }

  const prices  = data.map(d => parseFloat(d.close));
  const volumes = data.map(d => parseFloat(d.base_volume));
  const times   = data.map(d => parseInt(d.timestamp));

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const maxV = Math.max(...volumes);
  const pRange = maxP - minP || maxP * 0.01 || 0.000001;
  const tRange = times[times.length - 1] - times[0] || 1;

  const xT = i => PAD.left + ((times[i] - times[0]) / tRange) * CW;
  const yP = p  => PAD.top + PRICE_H - ((p - minP) / pRange) * PRICE_H;
  const yVbot   = PAD.top + PRICE_H + GAP + VOL_H;
  // SVG path for the price line
  const linePath = prices.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xT(i).toFixed(1)} ${yP(p).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L ${xT(prices.length - 1).toFixed(1)} ${(PAD.top + PRICE_H).toFixed(1)} L ${PAD.left} ${(PAD.top + PRICE_H).toFixed(1)} Z`;

  const isUp = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? '#00ff88' : '#ff4444';
  const pctChange = ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(1);

  const hover = hoverIdx !== null ? {
    x: xT(hoverIdx),
    price: prices[hoverIdx],
    volume: volumes[hoverIdx],
    time: new Date(times[hoverIdx]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  } : null;

  // Y-axis labels (3 price levels)
  const priceLabels = [maxP, (maxP + minP) / 2, minP];
  // X-axis ticks (up to 5 dates)
  const tickCount = Math.min(data.length, 5);
  const tickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round(i * (data.length - 1) / (tickCount - 1))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-white">
            {formatPrice(prices[prices.length - 1])} XLM
          </span>
          <span className={`text-sm font-mono font-semibold ${isUp ? 'text-tp-green' : 'text-tp-red'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(Number(pctChange))}%
          </span>
          <span className="text-tp-muted text-xs">{days}d</span>
          {assetCode && <span className="text-tp-muted text-xs font-mono">{assetCode}</span>}
        </div>
        {hover && (
          <div className="text-right text-xs text-tp-muted font-mono">
            <span>{hover.time}</span>
            <span className="ml-3">{formatPrice(hover.price)} XLM</span>
          </div>
        )}
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair"
        style={{ height: '160px' }}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          // find nearest data point
          const idx = prices.reduce((best, _, i) => {
            return Math.abs(xT(i) - svgX) < Math.abs(xT(best) - svgX) ? i : best;
          }, 0);
          setHoverIdx(idx);
        }}
      >
        {/* Grid lines */}
        {[0, 0.33, 0.66, 1].map(pct => (
          <line key={pct}
            x1={PAD.left} y1={PAD.top + pct * PRICE_H}
            x2={PAD.left + CW} y2={PAD.top + pct * PRICE_H}
            stroke="#0f2418" strokeWidth="1"
          />
        ))}

        {/* Fill under line */}
        <path d={fillPath} fill={`${lineColor}12`} />

        {/* Price line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 4px ${lineColor}60)` }}
        />

        {/* Volume bars */}
        {volumes.map((v, i) => {
          const barW = Math.max(CW / volumes.length - 1.5, 2);
          const barH = maxV > 0 ? (v / maxV) * VOL_H : 0;
          return (
            <rect key={i}
              x={xT(i) - barW / 2} y={yVbot - barH}
              width={barW} height={barH}
              fill={`${lineColor}30`}
            />
          );
        })}

        {/* Hover vertical line */}
        {hover && (
          <>
            <line
              x1={hover.x} y1={PAD.top}
              x2={hover.x} y2={PAD.top + PRICE_H + GAP + VOL_H}
              stroke={lineColor} strokeWidth="1" strokeDasharray="3,3" opacity="0.6"
            />
            <circle cx={hover.x} cy={yP(hover.price)} r="4"
              fill={lineColor} stroke="#06110d" strokeWidth="2"
            />
          </>
        )}

        {/* Y-axis labels */}
        {priceLabels.map((p, i) => (
          <text key={i}
            x={PAD.left - 6}
            y={PAD.top + (i / (priceLabels.length - 1)) * PRICE_H + 3}
            textAnchor="end" fill="rgba(255,255,255,0.28)" fontSize="9" fontFamily="monospace"
          >
            {formatPrice(p)}
          </text>
        ))}

        {/* X-axis date labels */}
        {tickIndices.map(idx => (
          <text key={idx}
            x={xT(idx)} y={H - 4}
            textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize="9" fontFamily="monospace"
          >
            {new Date(times[idx]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </text>
        ))}

        {/* Y-axis line */}
        <line x1={PAD.left} y1={PAD.top}
          x2={PAD.left} y2={PAD.top + PRICE_H + GAP + VOL_H}
          stroke="#0f2418" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
