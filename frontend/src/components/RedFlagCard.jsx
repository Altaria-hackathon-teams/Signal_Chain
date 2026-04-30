import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCard(canvas, { assetCode, score, verdict, verdictColor, signals, issuerAddress }) {
  const ctx = canvas.getContext('2d');
  const DPR = 2;
  const W = 560;
  const top = (signals || []).slice(0, 4);
  const H = Math.max(256, 152 + top.length * 40 + 58);

  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.scale(DPR, DPR);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#06110d');
  bgGrad.addColorStop(1, '#030806');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(0,255,136,0.07)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Radial glow
  const glo = ctx.createRadialGradient(0, 0, 0, 0, 0, 220);
  glo.addColorStop(0, 'rgba(0,255,136,0.10)');
  glo.addColorStop(1, 'transparent');
  ctx.fillStyle = glo;
  ctx.fillRect(0, 0, W, H);

  // Border
  rr(ctx, 1, 1, W - 2, H - 2, 12);
  ctx.strokeStyle = 'rgba(0,255,136,0.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Top accent line
  const acG = ctx.createLinearGradient(0, 0, W, 0);
  acG.addColorStop(0, 'transparent');
  acG.addColorStop(0.38, 'rgba(0,255,136,0.52)');
  acG.addColorStop(0.62, 'rgba(0,255,136,0.52)');
  acG.addColorStop(1, 'transparent');
  ctx.strokeStyle = acG;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(60, 1.5); ctx.lineTo(W - 60, 1.5); ctx.stroke();

  const P = 28;

  // Green dot
  ctx.beginPath(); ctx.arc(P, 41, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 12;
  ctx.fill(); ctx.shadowBlur = 0;

  // Header
  ctx.font = 'bold 9.5px monospace';
  ctx.fillStyle = '#00ff88';
  ctx.fillText('TRUSTPROOF  ·  RISK REPORT', P + 14, 46);

  // Score badge (top-right)
  ctx.font = 'bold 11px monospace';
  const bText = `${score}/100`;
  const bw = ctx.measureText(bText).width + 20;
  const bh = 22, bx = W - P - bw, by = 30;
  rr(ctx, bx, by, bw, bh, 5);
  ctx.fillStyle = verdictColor + '22'; ctx.fill();
  rr(ctx, bx, by, bw, bh, 5);
  ctx.strokeStyle = verdictColor + '55'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = verdictColor;
  ctx.fillText(bText, bx + 10, by + 15);

  // Token
  ctx.font = 'bold 46px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(assetCode, P, 110);

  // Score line
  ctx.font = 'bold 17px monospace';
  ctx.fillStyle = verdictColor;
  ctx.fillText(`Risk Score: ${score}/100  —  ${verdict}`, P, 138);

  // Divider 1
  ctx.fillStyle = 'rgba(0,255,136,0.10)';
  ctx.fillRect(P, 152, W - P * 2, 1);

  // Signals
  if (top.length === 0) {
    ctx.font = '13px system-ui, monospace';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('✓  No critical risk signals detected', P, 186);
  } else {
    top.forEach((sig, i) => {
      const sy = 183 + i * 40;
      const col = sig.severity === 'CRITICAL' ? '#ff4444'
        : sig.severity === 'HIGH' ? '#ff8844'
        : '#ffaa00';
      const icon = sig.severity === 'CRITICAL' ? '⛔'
        : sig.severity === 'HIGH' ? '⚠️'
        : '⚡';
      ctx.font = '600 13px system-ui, monospace';
      ctx.fillStyle = col;
      ctx.fillText(`${icon}  ${sig.flag}`, P, sy);
    });
  }

  // Divider 2
  ctx.fillStyle = 'rgba(0,255,136,0.08)';
  ctx.fillRect(P, H - 36, W - P * 2, 1);

  // Footer
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText('trustproof.app  ·  Stellar Testnet', P, H - 16);
  if (issuerAddress) {
    const short = issuerAddress.slice(0, 8) + '…' + issuerAddress.slice(-6);
    const tw = ctx.measureText(short).width;
    ctx.fillText(short, W - tw - P, H - 16);
  }
}

export default function RedFlagCard({ open, onClose, assetCode, score, verdict, verdictColor, signals, issuerAddress }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (open && canvasRef.current) {
      drawCard(canvasRef.current, { assetCode, score, verdict, verdictColor, signals, issuerAddress });
    }
  }, [open, assetCode, score, verdict, verdictColor, signals, issuerAddress]);

  function handleDownload() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `trustproof-${assetCode}-risk.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const top2 = (signals || []).slice(0, 2);
  const shareText = [
    `🚨 ${assetCode} Risk Report on TrustProof`,
    `Risk Score: ${score}/100 — ${verdict}`,
    ...top2.map(s => `⛔ ${s.flag}`),
    '',
    'Full on-chain analysis:',
  ].join('\n');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        /* Backdrop */
        <motion.div
          key="rfcard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(7px)' }}
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          {/* Centering wrapper */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.93, y: 22 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 18 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: '620px' }}
              className="rounded-2xl border border-emerald-300/14 bg-[#06110d] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(0,255,136,0.06)]"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-tp-green">Shareable Risk Card</p>
                  <p className="text-tp-muted text-xs mt-0.5">Download and attach to your post for best impact</p>
                </div>
                <button
                  onClick={onClose}
                  className="text-tp-muted hover:text-tp-text transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-4 h-4">
                    <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Card preview */}
              <div className="overflow-hidden rounded-xl border border-emerald-300/10 mb-4 bg-black/20">
                <canvas ref={canvasRef} className="block w-full" />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-xl bg-tp-green px-4 py-2.5 text-xs font-bold text-black
                             transition-all hover:bg-emerald-300 hover:shadow-[0_0_14px_rgba(0,255,136,0.3)]"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5">
                    <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M3 16h14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Download PNG
                </button>

                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5
                             text-xs font-medium text-slate-200 transition-all hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.622 5.905-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Post on X
                </a>

                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-sky-400/16 bg-sky-500/[0.08] px-4 py-2.5
                             text-xs font-medium text-sky-300 transition-all hover:bg-sky-500/[0.14]"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.018 9.51c-.148.658-.538.818-1.09.508l-3.013-2.22-1.455 1.4c-.16.16-.296.296-.607.296l.214-3.044 5.533-4.997c.24-.214-.052-.333-.373-.12l-6.835 4.304-2.945-.92c-.64-.2-.654-.64.134-.948l11.495-4.432c.533-.193 1.001.13.96.663z" />
                  </svg>
                  Share on Telegram
                </a>
              </div>

              <p className="mt-3 text-[11px] text-tp-muted/55">
                Tip: Download the PNG and attach it manually when posting — X and Telegram display attached images much more prominently.
              </p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
