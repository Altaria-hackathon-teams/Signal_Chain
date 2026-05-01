import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '../components/NavBar';
import BackButton from '../components/BackButton';
import RiskGauge from '../components/RiskGauge';
import SeverityBadge from '../components/SeverityBadge';
import { isValidIssuerAddress, normalizeIssuerAddress } from '../utils/stellar';
import { runAnalysis } from '../utils/analyze';
import { truncateAddress } from '../utils/format';

const SEV_ICON = { CRITICAL: '🚨', HIGH: '⚠️', MEDIUM: '⚡', LOW: 'ℹ️' };

function verdictRecommendation(score) {
  if (!score) return '';
  if (score.score >= 80) return 'Looks safe to consider — but always do your own research.';
  if (score.score >= 50) return 'Proceed with caution. Read the flagged signals before buying.';
  if (score.score >= 25) return 'High risk — only buy if you fully understand each signal.';
  return 'Stop. Multiple critical signals detected. Do not buy.';
}

export default function PreCheck() {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleCheck(e) {
    e?.preventDefault();
    const normalized = normalizeIssuerAddress(address);
    if (!isValidIssuerAddress(normalized)) {
      setError('Invalid issuer address. Use a 56-character Stellar public key starting with G.');
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await runAnalysis(normalized);
      setResult({ ...res, issuerAddress: normalized });
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  const score = result?.score;
  const topSignals = (score?.signals || [])
    .slice()
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    })
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-tp-bg text-tp-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.09),transparent_40%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <BackButton className="mb-6" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green mb-3">
              The seatbelt of DeFi
            </p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
              Before&nbsp;You&nbsp;Buy.
            </h1>
            <p className="mt-3 max-w-xl text-emerald-50/64 text-base leading-7">
              Paste an issuer address. We'll surface the verdict, the worst signals, and a single recommendation in seconds.
              No connect-wallet step required.
            </p>
          </motion.div>

          <motion.form
            onSubmit={handleCheck}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="mt-8 rounded-3xl border border-emerald-300/14 bg-[#06110d]/86 p-5 sm:p-6 shadow-[0_0_60px_rgba(0,255,136,0.06)] backdrop-blur"
          >
            <label className="mb-3 block text-sm font-medium text-emerald-50/72">
              Issuer address
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value.toUpperCase())}
                placeholder="G..."
                className={`flex-1 rounded-xl bg-black/40 border px-4 py-3 font-mono text-sm
                            text-white placeholder-emerald-100/20 focus:outline-none focus:ring-2
                            ${error ? 'border-tp-red/60 focus:ring-tp-red/30' : 'border-emerald-300/14 focus:border-tp-green/40 focus:ring-tp-green/20'}`}
              />
              <button
                type="submit"
                disabled={loading || !address}
                className="bg-tp-green text-black font-bold px-6 py-3 rounded-xl
                           hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all hover:shadow-[0_0_18px_rgba(0,255,136,0.35)]"
              >
                {loading ? 'Checking…' : 'Check Asset'}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-tp-red">{error}</p>}
          </motion.form>

          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-8 text-center text-tp-muted animate-pulse"
              >
                Pulling chain evidence and scoring…
              </motion.div>
            )}

            {result && score && (
              <motion.section
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-8 space-y-5"
              >
                <div
                  className="relative rounded-3xl border p-6 backdrop-blur shadow-[0_0_60px_rgba(0,0,0,0.3)]"
                  style={{
                    borderColor: `${score.verdictColor}44`,
                    background: `linear-gradient(135deg, ${score.verdictColor}10, transparent 60%), #07110d`,
                  }}
                >
                  <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-muted mb-2">
                        {result.assetCode} · {truncateAddress(result.issuerAddress)}
                      </p>
                      <h2
                        className="text-3xl sm:text-4xl font-bold tracking-tight"
                        style={{ color: score.verdictColor }}
                      >
                        {score.verdict}
                      </h2>
                      <p className="mt-2 text-tp-text text-base leading-7 max-w-md">
                        {verdictRecommendation(score)}
                      </p>
                    </div>
                    <RiskGauge score={score.score} color={score.verdictColor} />
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-300/12 bg-[#07110d]/90 p-6 backdrop-blur">
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green mb-4">
                    Top signals
                  </p>
                  {topSignals.length === 0 ? (
                    <p className="text-tp-muted text-sm">No risk signals detected.</p>
                  ) : (
                    <ul className="space-y-3">
                      {topSignals.map((sig, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 rounded-xl border border-emerald-300/8 bg-black/20 p-3"
                        >
                          <span className="text-2xl">{SEV_ICON[sig.severity] || '•'}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <SeverityBadge severity={sig.severity} />
                              <span className="text-tp-text font-semibold text-sm">{sig.title}</span>
                            </div>
                            {sig.detail && (
                              <p className="text-tp-muted text-xs leading-relaxed">{sig.detail}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to={`/analyze/${result.issuerAddress}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-tp-green text-black font-bold px-5 py-3
                               hover:bg-emerald-300 transition-all hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
                  >
                    See full analysis →
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAddress('');
                      setResult(null);
                    }}
                    className="inline-flex items-center rounded-xl border border-emerald-300/15 px-5 py-3
                               text-tp-muted hover:text-tp-green hover:border-tp-green/35 transition-colors"
                  >
                    Check another asset
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
