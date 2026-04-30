import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../context/useWallet';
import { truncateAddress } from '../utils/format';

const NAV_LINKS = [
  { to: '/check', label: 'Before You Buy' },
  { to: '/compare', label: 'Compare' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

export default function NavBar() {
  const { address, freighterInstalled, connect, disconnect, shakeSignal } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

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
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isActive
                  ? 'text-tp-green bg-tp-green/10'
                  : 'text-emerald-100/60 hover:text-tp-green hover:bg-tp-green/5'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="relative">
        {address ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="flex items-center gap-2 bg-tp-card border border-tp-green/30 text-tp-green
                         font-mono text-sm px-4 py-2 rounded-lg hover:border-tp-green/60 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-tp-green animate-pulse" />
              {truncateAddress(address)}
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 z-50 min-w-[168px] rounded-xl border border-emerald-300/12
                              bg-[#06110d]/98 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(0,255,136,0.05)]">
                <div className="px-3 py-2 border-b border-emerald-300/8">
                  <p className="font-mono text-[10px] text-emerald-100/30 uppercase tracking-[0.18em]">Connected</p>
                  <p className="font-mono text-xs text-tp-green mt-0.5">{truncateAddress(address)}</p>
                </div>
                <button
                  onClick={() => { disconnect(); setShowMenu(false); }}
                  className="w-full text-left px-3 py-2.5 text-tp-muted hover:text-tp-red text-sm transition-colors rounded-b-xl hover:bg-red-500/5"
                >
                  Disconnect wallet
                </button>
              </div>
            )}
          </div>
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
    </nav>
  );
}
