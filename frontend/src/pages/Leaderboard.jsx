import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '../components/NavBar';
import SkeletonCard from '../components/SkeletonCard';
import { fetchLeaderboard } from '../utils/api';
import { truncateAddress, formatDate } from '../utils/format';

const TABS = [
  { id: 'safest',    label: 'Safest Tokens',     hint: 'Top 10 by latest TrustProof score' },
  { id: 'reviewed',  label: 'Most Reviewed',     hint: 'Top 10 by community review count' },
  { id: 'reviewers', label: 'Trusted Reviewers', hint: 'Top reviewers by aggregated trust weight' },
];

function MedalIndex({ index }) {
  const colors = ['#ffd76e', '#cfd1d6', '#d8a48f'];
  if (index < 3) {
    return (
      <span
        className="flex items-center justify-center w-9 h-9 rounded-full font-mono text-sm font-bold"
        style={{
          color: colors[index],
          background: `${colors[index]}18`,
          border: `1px solid ${colors[index]}55`,
        }}
      >
        {index + 1}
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-emerald-300/8 border border-emerald-300/15 font-mono text-sm text-tp-muted">
      {index + 1}
    </span>
  );
}

function ExpertLink({ kind, value }) {
  const url =
    kind === 'account'
      ? `https://stellar.expert/explorer/testnet/account/${value}`
      : `https://stellar.expert/explorer/testnet/asset/${value}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-tp-muted hover:text-tp-green text-xs font-mono transition-colors"
    >
      view ↗
    </a>
  );
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('safest');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ safest: null, reviewed: null, reviewers: null });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let active = true;
    if (data[activeTab]) return;

    async function loadActiveTab() {
      setLoading(true);
      try {
        const res = await fetchLeaderboard(activeTab, 10);
        if (!active) return;
        setData((d) => ({ ...d, [activeTab]: res.entries || [] }));
      } catch (err) {
        if (!active) return;
        setErrors((e) => ({ ...e, [activeTab]: err.message || 'Failed to load' }));
        setData((d) => ({ ...d, [activeTab]: [] }));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadActiveTab();
    return () => {
      active = false;
    };
  }, [activeTab, data]);

  const entries = data[activeTab];
  const tabHint = TABS.find((t) => t.id === activeTab)?.hint;

  return (
    <div className="min-h-screen bg-tp-bg text-tp-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.09),transparent_40%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green mb-3">
              Trust Score Leaderboard
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              The safest, the loudest, the most trusted.
            </h1>
            <p className="mt-3 max-w-xl text-emerald-50/64 text-base leading-7">
              Live rankings across every asset analyzed on TrustProof. Updated continuously.
            </p>
          </motion.div>

          {/* Tabs */}
          <div className="mt-8 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-xl border text-sm transition-all
                  ${activeTab === t.id
                    ? 'bg-tp-green/15 border-tp-green/45 text-tp-green'
                    : 'border-emerald-300/12 bg-black/20 text-tp-muted hover:text-tp-text hover:border-emerald-300/25'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-tp-muted font-mono">{tabHint}</p>

          <div className="mt-6 rounded-3xl border border-emerald-300/12 bg-[#07110d]/90 p-5 sm:p-6 shadow-[0_0_45px_rgba(0,255,136,0.05)] backdrop-blur">
            <AnimatePresence mode="wait">
              {loading && !entries ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SkeletonCard lines={6} />
                </motion.div>
              ) : errors[activeTab] ? (
                <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-tp-red text-sm">
                  {errors[activeTab]}
                </motion.p>
              ) : !entries || entries.length === 0 ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                  <p className="text-tp-text font-semibold mb-1">Nothing here yet</p>
                  <p className="text-tp-muted text-sm">
                    {activeTab === 'safest'
                      ? 'Analyze a few assets to populate this list.'
                      : activeTab === 'reviewed'
                      ? 'No on-chain reviews yet — be the first.'
                      : 'No reviewers yet.'}
                  </p>
                </motion.div>
              ) : (
                <motion.ul
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="divide-y divide-emerald-300/6"
                >
                  {entries.map((e, i) => {
                    if (activeTab === 'reviewers') {
                      return (
                        <li key={e.wallet} className="flex items-center gap-4 py-3">
                          <MedalIndex index={i} />
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-tp-text text-sm truncate">{truncateAddress(e.wallet)}</p>
                            <p className="text-tp-muted text-xs">
                              {e.review_count} review{e.review_count !== 1 ? 's' : ''} · avg {e.avg_rating || '—'}★
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-tp-green font-mono text-sm">{e.total_trust}</p>
                            <p className="text-tp-muted text-[10px] uppercase tracking-widest">trust weight</p>
                          </div>
                          <ExpertLink kind="account" value={e.wallet} />
                        </li>
                      );
                    }
                    if (activeTab === 'reviewed') {
                      return (
                        <li key={e.issuer_address} className="flex items-center gap-4 py-3">
                          <MedalIndex index={i} />
                          <div className="flex-1 min-w-0">
                            <Link
                              to={`/analyze/${e.issuer_address}`}
                              className="text-white font-semibold text-sm hover:text-tp-green transition-colors"
                            >
                              {e.asset_code || '(asset)'}
                            </Link>
                            <p className="text-tp-muted text-xs font-mono">{truncateAddress(e.issuer_address)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-mono text-sm">{e.total_reviews}</p>
                            <p className="text-tp-muted text-[10px] uppercase tracking-widest">reviews</p>
                          </div>
                          <p className="text-tp-amber font-mono text-sm w-12 text-right">
                            {e.avg_rating || '—'}★
                          </p>
                        </li>
                      );
                    }
                    // safest
                    return (
                      <li key={e.issuer_address} className="flex items-center gap-4 py-3">
                        <MedalIndex index={i} />
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/analyze/${e.issuer_address}`}
                            className="text-white font-semibold text-sm hover:text-tp-green transition-colors"
                          >
                            {e.asset_code || '(asset)'}
                          </Link>
                          <p className="text-tp-muted text-xs font-mono">{truncateAddress(e.issuer_address)}</p>
                          <p className="text-tp-muted text-[10px] mt-0.5">
                            checked {formatDate(e.checked_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className="font-mono text-2xl font-bold"
                            style={{ color: e.verdict_color }}
                          >
                            {e.score}
                          </p>
                          <p
                            className="text-[10px] uppercase tracking-widest font-mono"
                            style={{ color: e.verdict_color }}
                          >
                            {e.verdict}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          <p className="mt-4 text-xs text-tp-muted font-mono text-center">
            Rankings refresh from chain data every minute.
          </p>
        </main>
      </div>
    </div>
  );
}
