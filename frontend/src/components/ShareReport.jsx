import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import RedFlagCard from './RedFlagCard';

const PLATFORMS = [
  {
    id: 'twitter',
    name: 'Twitter / X',
    textColor: '#e2e8f0',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.10)',
    getHref: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.622 5.905-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    name: 'Telegram',
    textColor: '#38bdf8',
    bg: 'rgba(56,189,248,0.06)',
    border: 'rgba(56,189,248,0.16)',
    getHref: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.018 9.51c-.148.658-.538.818-1.09.508l-3.013-2.22-1.455 1.4c-.16.16-.296.296-.607.296l.214-3.044 5.533-4.997c.24-.214-.052-.333-.373-.12l-6.835 4.304-2.945-.92c-.64-.2-.654-.64.134-.948l11.495-4.432c.533-.193 1.001.13.96.663z" />
      </svg>
    ),
  },
  {
    id: 'reddit',
    name: 'Reddit',
    textColor: '#fb923c',
    bg: 'rgba(251,146,60,0.06)',
    border: 'rgba(251,146,60,0.16)',
    getHref: (url, text) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    textColor: '#60a5fa',
    bg: 'rgba(96,165,250,0.06)',
    border: 'rgba(96,165,250,0.16)',
    getHref: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

export default function ShareReport({ assetCode, score, verdict, verdictColor, signals, issuerAddress }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);
  const portalRef = useRef(null);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const shareText =
    assetCode && score != null
      ? `🔍 ${assetCode} risk score on TrustProof: ${score}/100 — ${verdict}. Full on-chain analysis:`
      : 'Check this token risk report on TrustProof:';

  useEffect(() => {
    function onClickOutside(e) {
      const inButton = buttonRef.current && buttonRef.current.contains(e.target);
      const inPortal = portalRef.current && portalRef.current.contains(e.target);
      if (!inButton && !inPortal) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropW = 208; // w-52 = 13rem = 208px
      const rightFromEdge = window.innerWidth - rect.right;
      // If dropdown would clip left edge, anchor to left side of button instead
      const wouldClipLeft = rect.right - dropW < 8;
      setDropPos(wouldClipLeft
        ? { top: rect.bottom + 8, right: 'auto', left: Math.max(8, rect.left) }
        : { top: rect.bottom + 8, right: Math.max(8, rightFromEdge), left: 'auto' }
      );
    }
    setOpen((v) => !v);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all
          ${open
            ? 'border-tp-green/40 bg-tp-green/10 text-tp-green shadow-[0_0_10px_rgba(0,255,136,0.15)]'
            : 'border-emerald-300/14 bg-emerald-300/[0.04] text-tp-muted hover:border-tp-green/28 hover:text-tp-text'
          }`}
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
          <circle cx="15" cy="4" r="2.2" />
          <circle cx="5" cy="10" r="2.2" />
          <circle cx="15" cy="16" r="2.2" />
          <line x1="7.1" y1="8.7" x2="12.9" y2="5.3" />
          <line x1="7.1" y1="11.3" x2="12.9" y2="14.7" />
        </svg>
        Share
      </button>

      {/* Portal-based dropdown — renders at body level, bypasses all stacking contexts */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <div
              ref={portalRef}
              style={{
                position: 'fixed',
                top: dropPos.top,
                right: dropPos.right,
                left: dropPos.left,
                zIndex: 9999,
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -6 }}
                transition={{ duration: 0.14 }}
                className="w-52 rounded-2xl border border-emerald-300/14
                           bg-[#06110d]/98 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,255,136,0.06)]
                           backdrop-blur-xl"
              >
                {/* Score pill */}
                {score != null && (
                  <div className="mb-2 flex items-center justify-between rounded-xl border border-emerald-300/10 bg-black/30 px-3 py-2">
                    <span className="font-mono text-[10px] text-emerald-100/40">{assetCode}</span>
                    <span className="font-mono text-xs font-bold" style={{ color: verdictColor }}>
                      {score}/100 · {verdict}
                    </span>
                  </div>
                )}

                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-100/30 px-2 pb-1.5">
                  Share report
                </p>

                <div className="space-y-1">
                  {PLATFORMS.map((p) => (
                    <a
                      key={p.id}
                      href={p.getHref(url, shareText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all hover:brightness-125 hover:scale-[1.015]"
                      style={{ color: p.textColor, backgroundColor: p.bg, border: `1px solid ${p.border}` }}
                    >
                      {p.icon}
                      {p.name}
                    </a>
                  ))}
                </div>

                <div className="mt-1.5 border-t border-emerald-300/8 pt-1.5 space-y-1">
                  <button
                    onClick={copyLink}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
                      ${copied
                        ? 'bg-tp-green/12 border border-tp-green/28 text-tp-green'
                        : 'bg-emerald-300/[0.04] border border-emerald-300/8 text-tp-muted hover:text-tp-text hover:bg-emerald-300/[0.08]'
                      }`}
                  >
                    {copied ? (
                      <>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 shrink-0">
                          <polyline points="4,10 8,14 16,6" />
                        </svg>
                        Link copied!
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                          <rect x="8" y="2" width="10" height="13" rx="2" />
                          <path d="M4 6H3a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h9a1 1 0 0 0 1-1v-1" />
                        </svg>
                        Copy link
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => { setOpen(false); setCardOpen(true); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
                               bg-tp-green/[0.08] border border-tp-green/18 text-tp-green hover:bg-tp-green/[0.14]"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                      <rect x="2" y="4" width="16" height="12" rx="2" />
                      <path d="M5 8h6M5 11h4" strokeLinecap="round" />
                      <circle cx="14" cy="9.5" r="2" />
                    </svg>
                    Generate Risk Card
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <RedFlagCard
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        assetCode={assetCode}
        score={score}
        verdict={verdict}
        verdictColor={verdictColor}
        signals={signals}
        issuerAddress={issuerAddress}
      />
    </>
  );
}
