import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../context/useWallet';
import { truncateAddress } from '../utils/format';

const NAV_LINKS = [
  { to: '/verify', label: 'Verify',         primary: true },
  { to: '/check',  label: 'Before You Buy' },
  { to: '/fingerprint', label: 'Fingerprint' },
  { to: '/compare', label: 'Compare' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

export default function NavBar() {
  const { address, freighterInstalled, connect, disconnect, shakeSignal } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);
  const portalRef = useRef(null);

  useEffect(() => {
    if (shakeSignal <= 0) return undefined;

    let timer;
    const frame = requestAnimationFrame(() => {
      setIsShaking(true);
      timer = setTimeout(() => setIsShaking(false), 700);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [shakeSignal]);

  // Click-outside handler for the portal-rendered dropdown.
  useEffect(() => {
    function onClickOutside(e) {
      const inButton = buttonRef.current && buttonRef.current.contains(e.target);
      const inPortal = portalRef.current && portalRef.current.contains(e.target);
      if (!inButton && !inPortal) setShowMenu(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Close menu on escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setShowMenu(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);
    try {
      await connect();
    } catch (err) {
      console.error('Connect failed:', err);
    } finally {
      setConnecting(false);
    }
  }

  function handleToggleMenu() {
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropW = 280;
      const rightFromEdge = window.innerWidth - rect.right;
      const wouldClipLeft = rect.right - dropW < 8;
      setDropPos(
        wouldClipLeft
          ? { top: rect.bottom + 8, right: 'auto', left: Math.max(8, rect.left) }
          : { top: rect.bottom + 8, right: Math.max(8, rightFromEdge), left: 'auto' },
      );
    }
    setShowMenu((v) => !v);
  }

  async function handleCopyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between gap-3 px-6 py-4 border-b border-emerald-300/12 bg-[#030806]/92 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2 group">
        <div className="w-2 h-2 rounded-full bg-tp-green shadow-[0_0_10px_#00ff88]" />
        <span className="font-bold text-white tracking-wide group-hover:text-tp-green transition-colors">
          TRUST<span className="text-tp-green">PROOF</span>
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => {
              if (link.primary) {
                return `relative px-3.5 py-1.5 text-sm rounded-lg border transition-colors ${
                  isActive
                    ? 'border-tp-green/55 bg-tp-green/15 text-tp-green shadow-[0_0_12px_rgba(0,255,136,0.18)]'
                    : 'border-tp-green/30 bg-tp-green/[0.06] text-tp-green hover:bg-tp-green/12 hover:border-tp-green/55'
                }`;
              }
              return `relative px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isActive
                  ? 'text-tp-green bg-tp-green/10'
                  : 'text-emerald-100/60 hover:text-tp-green hover:bg-tp-green/5'
              }`;
            }}
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="relative">
        {address ? (
          <button
            ref={buttonRef}
            onClick={handleToggleMenu}
            className={`group flex items-center gap-2.5 rounded-xl border px-3.5 py-2 font-mono text-sm transition-all
              ${showMenu
                ? 'border-tp-green/55 bg-tp-green/15 text-tp-green shadow-[0_0_14px_rgba(0,255,136,0.22)]'
                : 'border-tp-green/30 bg-tp-green/[0.08] text-tp-green hover:border-tp-green/55 hover:bg-tp-green/12 hover:shadow-[0_0_14px_rgba(0,255,136,0.18)]'
              }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-tp-green opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tp-green" />
            </span>
            <span className="tracking-wide">{truncateAddress(address)}</span>
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`}
            >
              <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : freighterInstalled === false ? (
          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-tp-card border border-tp-border text-tp-muted text-sm px-4 py-2
                       rounded-lg hover:border-tp-amber/50 hover:text-tp-amber transition-colors"
          >
            Install Freighter
          </a>
        ) : (
          <motion.button
            key={shakeSignal}
            animate={shakeSignal > 0 ? { x: [0, -8, 8, -8, 8, -4, 4, 0] } : {}}
            transition={{ duration: 0.52, ease: 'easeInOut' }}
            onClick={handleConnect}
            disabled={connecting}
            className={`text-black font-semibold text-sm px-4 py-2 rounded-lg
                       disabled:opacity-50 transition-all
                       ${isShaking
                         ? 'bg-tp-green ring-2 ring-tp-red/70 shadow-[0_0_14px_rgba(255,68,68,0.3)]'
                         : 'bg-tp-green hover:bg-tp-green/90 hover:shadow-[0_0_14px_rgba(0,255,136,0.35)]'
                       }`}
          >
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </motion.button>
        )}
      </div>

      {/* Portal-rendered dropdown — bypasses navbar's stacking & blur context */}
      {address && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showMenu && (
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
                className="w-[280px] rounded-2xl border border-emerald-300/14
                           bg-[#06110d]/98 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,255,136,0.06)]
                           backdrop-blur-xl"
              >
                {/* Connected pill */}
                <div className="mb-2 rounded-xl border border-tp-green/22 bg-gradient-to-br from-tp-green/[0.08] to-tp-green/[0.02] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-tp-green/70">
                      Connected
                    </p>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-tp-green/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-tp-green animate-pulse" />
                      Freighter
                    </span>
                  </div>
                  <p className="font-mono text-xs text-tp-green break-all leading-relaxed">{address}</p>
                </div>

                <p className="px-2 pb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-100/30">
                  Wallet actions
                </p>

                <div className="space-y-1">
                  <button
                    onClick={handleCopyAddress}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
                      ${copied
                        ? 'bg-tp-green/12 border border-tp-green/28 text-tp-green'
                        : 'bg-emerald-300/[0.04] border border-emerald-300/8 text-tp-muted hover:text-tp-text hover:bg-emerald-300/[0.08]'
                      }`}
                  >
                    {copied ? (
                      <>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-3.5 h-3.5 shrink-0">
                          <polyline points="4,10 8,14 16,6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Address copied!
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                          <rect x="8" y="2" width="10" height="13" rx="2" />
                          <path d="M4 6H3a1 1 0 0 0-1 1v10a2 2 0 0 0 2 2h9a1 1 0 0 0 1-1v-1" />
                        </svg>
                        Copy address
                      </>
                    )}
                  </button>

                  <a
                    href={`https://stellar.expert/explorer/testnet/account/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowMenu(false)}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
                               bg-emerald-300/[0.04] border border-emerald-300/8 text-tp-muted hover:text-tp-text hover:bg-emerald-300/[0.08]"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                      <path d="M11 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M17 3l-8 8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 11v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    View on Stellar.expert
                  </a>
                </div>

                <div className="mt-1.5 border-t border-emerald-300/8 pt-1.5">
                  <button
                    onClick={() => { disconnect(); setShowMenu(false); }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
                               bg-rose-500/[0.05] border border-rose-500/15 text-rose-300/80
                               hover:bg-rose-500/12 hover:border-rose-500/35 hover:text-rose-200"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 shrink-0">
                      <path d="M13 14l4-4m0 0l-4-4m4 4H7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Disconnect wallet
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </nav>
  );
}
