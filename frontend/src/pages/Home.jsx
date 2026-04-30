import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar';

const FEATURES = [
  {
    icon: '⛓️',
    title: 'On-chain risk analysis',
    desc: 'Reads Stellar auth flags, issuer age, supply concentration, and 15+ on-chain signals in real time.',
  },
  {
    icon: '🧠',
    title: 'Smart money signals',
    desc: "See what experienced wallets DID with this token in 48 hours. Actual sells. Can't fake selling.",
  },
  {
    icon: '✅',
    title: 'Verified reviews',
    desc: 'Only wallets that transacted with the asset can review it. A $4,000 loss outweighs a $2 buy.',
  },
];

const DEMO_TOKENS = [
  {
    label: 'HIGH RISK',
    color: '#ff4444',
    bg: 'bg-red-500/8',
    border: 'border-red-500/25',
    code: 'ZZVHQWETIVUN',
    address: 'GD23MUMZKNI5KEOEGW3JMGHGMNKIR3UETHURLWLR6C2M4ZDEHQXHCQOA',
    reason: 'Clawback + Revocable + Auth Required flags set',
  },
  {
    label: 'CAUTION',
    color: '#ffaa00',
    bg: 'bg-yellow-500/8',
    border: 'border-yellow-500/25',
    code: 'ZYPMJUEJOSUQ',
    address: 'GBCQUBIIJBT5Q32IGWP3JY3AGTHKJMLYPODDVTG63QI7SP53EP4THT3J',
    reason: 'All 3 auth flags set, very few holders',
  },
  {
    label: 'ANALYZE',
    color: '#7a9985',
    bg: 'bg-emerald-300/5',
    border: 'border-emerald-300/12',
    code: 'ZZZ',
    address: 'GDCTRHU477MBU7D7LGKLTIQDHBSVYSI77YHYSACW4TDAVUYHAUYBYOXW',
    reason: 'Established testnet token — no auth flags',
  },
];

export default function Home() {
  const [address, setAddress] = useState('');
  const navigate = useNavigate();

  function handleAnalyze() {
    const trimmed = address.trim();
    if (!trimmed) return;
    navigate(`/analyze/${trimmed}`);
  }

  return (
    <div className="min-h-screen bg-tp-bg">
      {/* Background — matches global visual language */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.11),transparent_42%),radial-gradient(circle_at_85%_80%,rgba(0,255,136,0.05),transparent_35%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.10] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,6,0.4),transparent_40%,transparent_60%,rgba(3,8,6,0.4))]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="flex flex-col items-center justify-center min-h-[75vh] px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="w-3 h-3 rounded-full bg-tp-green mx-auto mb-8 shadow-[0_0_24px_#00ff88] animate-pulse" />

            <h1 className="text-5xl md:text-7xl font-bold text-white mb-5 leading-tight tracking-tight">
              Is this token
              <br />
              <span className="text-tp-green">safe?</span>
            </h1>

            <p className="text-tp-muted text-lg mb-10 max-w-xl mx-auto leading-relaxed">
              Paste a Stellar asset issuer address for an instant AI risk analysis.
              <br />
              <span className="text-emerald-100/35 text-sm">15+ on-chain signals · wash trading detection · verified reviews</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                placeholder="Paste issuer address — e.g. GBXYZ...ABC"
                className="flex-1 bg-[#07110d]/80 border border-emerald-300/12 rounded-xl px-5 py-4
                           text-tp-text font-mono text-sm placeholder-emerald-100/25
                           focus:outline-none focus:border-tp-green/50 focus:ring-2 focus:ring-tp-green/10
                           transition-all backdrop-blur"
              />
              <button
                onClick={handleAnalyze}
                className="bg-tp-green text-black font-bold px-8 py-4 rounded-xl whitespace-nowrap
                           hover:bg-emerald-300 transition-all
                           hover:shadow-[0_0_28px_rgba(0,255,136,0.35)]"
              >
                Analyze →
              </button>
            </div>
          </motion.div>

          {/* Demo tokens */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-12 max-w-3xl mx-auto w-full px-4"
          >
            <p className="text-tp-muted text-xs uppercase tracking-widest text-center mb-3 font-mono">
              Try these real Stellar testnet tokens
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DEMO_TOKENS.map((t) => (
                <button
                  key={t.address}
                  onClick={() => navigate(`/analyze/${t.address}`)}
                  className={`${t.bg} border ${t.border} rounded-2xl p-4 text-left
                              hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,255,136,0.08)]
                              transition-all group`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-white text-sm">{t.code}</span>
                    <span className="text-xs font-bold font-mono" style={{ color: t.color }}>
                      {t.label}
                    </span>
                  </div>
                  <p className="font-mono text-tp-muted text-xs truncate mb-2">
                    {t.address.slice(0, 12)}…
                  </p>
                  <p className="text-tp-muted text-xs leading-tight">{t.reason}</p>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 max-w-4xl mx-auto w-full px-4"
          >
            {FEATURES.map((f, i) => (
              <div key={i}
                className="relative overflow-hidden rounded-2xl border border-emerald-300/10 bg-[#07110d]/80
                           p-6 backdrop-blur
                           hover:border-tp-green/25 hover:shadow-[0_0_24px_rgba(0,255,136,0.07)]
                           transition-all"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/25 to-transparent" />
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-tp-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
