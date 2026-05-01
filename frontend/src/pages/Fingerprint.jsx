import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '../components/NavBar';
import BackButton from '../components/BackButton';
import CopyButton from '../components/CopyButton';
import SkeletonCard from '../components/SkeletonCard';
import { isValidIssuerAddress, normalizeIssuerAddress } from '../utils/stellar';
import { scanDNA, fetchDNAStats } from '../utils/api';
import { truncateAddress, formatNumber } from '../utils/format';

const RISK_TONE = {
  critical: { color: '#ff4444', bg: 'bg-red-500/12',  border: 'border-red-500/30',  text: 'text-tp-red'   },
  high:     { color: '#ff5577', bg: 'bg-red-500/10',  border: 'border-red-500/25',  text: 'text-tp-red'   },
  medium:   { color: '#ffaa00', bg: 'bg-tp-amber/12', border: 'border-tp-amber/25', text: 'text-tp-amber' },
  low:      { color: '#00ff88', bg: 'bg-tp-green/12', border: 'border-tp-green/25', text: 'text-tp-green' },
  unknown:  { color: '#7eb89c', bg: 'bg-emerald-300/8', border: 'border-emerald-300/14', text: 'text-tp-muted' },
};

// 40-feature names paired with the field labels we want to surface in the UI.
const FEATURE_GROUPS = [
  {
    title: 'Timing',
    keys: [
      ['f01_account_created_hour', 'Created hour (UTC)'],
      ['f02_account_created_dow', 'Created day of week'],
      ['f03_secs_to_second_op', 'Secs to 2nd op'],
      ['f04_secs_to_token_issuance', 'Secs to token issuance'],
      ['f07_avg_gap_first_10_ops', 'Avg gap (first 10 ops)'],
      ['f08_stddev_gap_first_10_ops', 'Stddev gap'],
    ],
  },
  {
    title: 'Funding',
    keys: [
      ['f09_funding_source_type', 'Funding source type'],
      ['f10_initial_xlm_amount', 'Initial XLM'],
      ['f11_xlm_buffer_above_minimum', 'XLM above minimum'],
      ['f12_ops_before_token', 'Ops before token'],
      ['f13_has_micro_test_tx', 'Has micro test-tx'],
    ],
  },
  {
    title: 'Asset config',
    keys: [
      ['f15_asset_code_length', 'Asset code length'],
      ['f17_asset_code_has_numbers', 'Asset code has digits'],
      ['f18_asset_code_entropy', 'Asset code entropy'],
      ['f19_flag_auth_required', 'Flag: auth_required'],
      ['f20_flag_auth_revocable', 'Flag: auth_revocable'],
      ['f21_flag_auth_clawback', 'Flag: auth_clawback'],
      ['f22_num_signers', 'Signers'],
    ],
  },
  {
    title: 'Liquidity behavior',
    keys: [
      ['f23_secs_to_first_offer', 'Secs to first offer'],
      ['f25_first_offer_amount', 'First offer amount'],
      ['f26_offers_in_first_hour', 'Offers in first hour'],
      ['f28_cancel_relist_pattern', 'Cancel-and-relist'],
      ['f29_avg_secs_between_offers', 'Avg secs between offers'],
      ['f30_total_offers_placed', 'Total offers placed'],
    ],
  },
  {
    title: 'Operational style',
    keys: [
      ['f31_ops_in_first_24h', 'Ops in first 24h'],
      ['f32_unique_counterparties_24h', 'Unique counterparties (24h)'],
      ['f35_total_ops_ever', 'Total ops ever'],
      ['f36_early_unique_buyers', 'Early unique buyers'],
      ['f39_ops_per_counterparty', 'Ops per counterparty'],
      ['f40_offer_to_trade_ratio', 'Offer-to-trade ratio'],
    ],
  },
];

function fmtFeature(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value !== 'number') return String(value);
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toFixed(2);
}

function Panel({ children, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-emerald-300/12 bg-[#07110d]/90 p-6 shadow-[0_0_45px_rgba(0,255,136,0.05)] backdrop-blur ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/35 to-transparent" />
      {children}
    </div>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="flex items-end justify-between mb-4">
      <p className="text-tp-green text-xs uppercase tracking-[0.22em] font-mono">{children}</p>
      {hint && <p className="text-tp-muted text-xs">{hint}</p>}
    </div>
  );
}

function VerdictHeader({ result, network }) {
  const { verdict, asset, issuer, dna } = result;
  const tone = RISK_TONE[verdict.risk] || RISK_TONE.unknown;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl border bg-[#07110d]/90 px-6 py-5 mb-4 backdrop-blur"
      style={{ borderColor: `${tone.color}33` }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/30 to-transparent" />
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-bold font-mono text-white">{asset || 'TOKEN'}</span>
            <span className="text-emerald-100/40 text-sm capitalize">on Stellar {network}</span>
            <span
              className={`text-xs font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${tone.bg} ${tone.border} ${tone.text}`}
            >
              {verdict.label}
            </span>
            {dna?.modelLoaded === false && (
              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-tp-amber/15 text-tp-amber border border-tp-amber/25 font-mono">
                ml model missing
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="font-mono text-emerald-100/35 text-xs">{truncateAddress(issuer)}</span>
            <CopyButton text={issuer} />
          </div>
          <p className="mt-3 text-tp-text text-sm leading-relaxed max-w-2xl">{verdict.headline}</p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <div className="rounded-xl border border-emerald-300/10 bg-black/30 px-3 py-2">
            <p className="text-emerald-100/45 text-[10px] uppercase tracking-widest">DNA confidence</p>
            <p className="font-mono font-bold text-base" style={{ color: tone.color }}>
              {Math.round((verdict.confidence || 0) * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/10 bg-black/30 px-3 py-2">
            <p className="text-emerald-100/45 text-[10px] uppercase tracking-widest">Top similarity</p>
            <p className="font-mono font-bold text-base text-tp-text">
              {Math.round((dna?.topSimilarity || 0) * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/10 bg-black/30 px-3 py-2">
            <p className="text-emerald-100/45 text-[10px] uppercase tracking-widest">Rug matches</p>
            <p className="font-mono font-bold text-base text-tp-text">{dna?.matchCount ?? 0}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RedFlagsPanel({ flags, body }) {
  if (!flags || flags.length === 0) {
    return (
      <Panel>
        <SectionTitle>Behavioral red flags</SectionTitle>
        <div className="text-center py-6">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-tp-green font-semibold">No behavioral anomalies detected</p>
          <p className="text-tp-muted text-sm mt-1 max-w-md mx-auto">{body}</p>
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionTitle hint={`${flags.length} flag${flags.length > 1 ? 's' : ''}`}>Behavioral red flags</SectionTitle>
      <p className="text-tp-muted text-xs leading-relaxed mb-3">{body}</p>
      <ul className="space-y-2">
        {flags.map((flag, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-tp-text flex items-start gap-2"
          >
            <span className="text-tp-red text-base shrink-0">⚠</span>
            <span className="leading-relaxed">{flag}</span>
          </motion.li>
        ))}
      </ul>
    </Panel>
  );
}

function MatchesPanel({ matches, network, onSelectMatch }) {
  if (!matches || matches.length === 0) {
    return (
      <Panel>
        <SectionTitle>Fingerprint matches</SectionTitle>
        <p className="text-tp-muted text-sm">
          No issuer in the database has a fingerprint above the 82% similarity threshold.
        </p>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionTitle hint={`${matches.length} match${matches.length > 1 ? 'es' : ''}`}>
        Fingerprint matches
      </SectionTitle>
      <div className="space-y-2">
        {matches.map((m, i) => {
          const matchClass = 'font-mono text-tp-text text-xs truncate hover:text-tp-green transition-colors';

          return (
            <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/6 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-tp-red font-bold text-xs">
                    {Math.round((m.similarity || 0) * 100)}%
                  </span>
                  {onSelectMatch ? (
                    <button
                      type="button"
                      onClick={() => onSelectMatch(m.pubkey)}
                      className={`${matchClass} min-w-0 text-left`}
                    >
                      {truncateAddress(m.pubkey)}
                    </button>
                  ) : (
                    <Link
                      to={`/fingerprint/${m.pubkey}`}
                      className={matchClass}
                    >
                      {truncateAddress(m.pubkey)}
                    </Link>
                  )}
                  <CopyButton text={m.pubkey} />
                </div>
                <span className="text-tp-muted text-[10px] font-mono uppercase tracking-wider shrink-0">
                  {m.asset_code || 'TOKEN'}
                </span>
              </div>
              {m.rug_loss_usd > 0 && (
                <p className="text-tp-muted text-[11px] mt-1">
                  est. loss: ${formatNumber(m.rug_loss_usd)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-tp-muted text-[11px] mt-3">
        Click a match to scan that issuer's fingerprint on the {network}.
      </p>
    </Panel>
  );
}

function FeaturePanel({ features }) {
  if (!features) {
    return (
      <Panel>
        <SectionTitle>40-feature fingerprint</SectionTitle>
        <p className="text-tp-muted text-sm">No fingerprint extracted — issuer has no on-chain history.</p>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionTitle hint="raw vector — what the model saw">
        40-feature fingerprint
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="text-tp-green text-[10px] uppercase tracking-widest font-mono mb-1.5">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.keys.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-xs gap-3">
                  <span className="text-tp-muted truncate">{label}</span>
                  <span className="font-mono text-tp-text">{fmtFeature(features[key])}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function OperatorDNASection({
  issuerAddress,
  embedded = false,
  onIssuerSubmit,
  onViewRiskReport,
}) {
  const navigate = useNavigate();

  const [input, setInput] = useState(issuerAddress || '');
  const [network, setNetwork] = useState('testnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDNAStats().then(setStats).catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (!issuerAddress) return;
    setInput(issuerAddress);
    runScan(issuerAddress, network);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerAddress]);

  async function runScan(addr, net) {
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await scanDNA(addr, net);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    const normalized = normalizeIssuerAddress(input);
    if (!isValidIssuerAddress(normalized)) {
      setError('Invalid issuer address. Use a 56-character Stellar public key starting with G.');
      return;
    }
    setError('');
    if (embedded) {
      setInput(normalized);
      if (onIssuerSubmit?.(normalized)) return;
      runScan(normalized, network);
    } else if (issuerAddress === normalized) {
      runScan(normalized, network);
    } else {
      navigate(`/fingerprint/${normalized}`, { replace: false });
    }
  }

  function handleSelectMatch(pubkey) {
    setInput(pubkey);
    runScan(pubkey, network);
  }

  const content = (
    <>
      {!embedded && <BackButton className="mb-6" />}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green mb-3">Operator DNA</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
          Behavioral&nbsp;Fingerprint.
        </h1>
        <p className="mt-3 max-w-2xl text-emerald-50/64 text-base leading-7">
          Every issuer leaves a behavioral signature in how they fund, configure, and operate
          their account. We extract a 40-feature fingerprint, run cosine similarity against
          known rugs, and ask a behavioral random forest for a verdict.
        </p>
        {stats?.stats && (
          <p className="mt-3 text-tp-muted text-xs font-mono">
            DB: {formatNumber(stats.stats.total)} fingerprints · {formatNumber(stats.stats.rugs)} confirmed rugs
          </p>
        )}
      </motion.div>

      {/* Search */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="mt-8 rounded-3xl border border-emerald-300/14 bg-[#06110d]/86 p-5 sm:p-6 shadow-[0_0_60px_rgba(0,255,136,0.06)] backdrop-blur"
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-muted mb-1.5 block">
              Issuer address
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="G..."
              className={`w-full rounded-xl bg-black/40 border px-3 py-2.5 font-mono text-sm
                text-white placeholder-emerald-100/20 focus:outline-none focus:ring-2
                ${error ? 'border-tp-red/60 focus:ring-tp-red/30' : 'border-emerald-300/14 focus:border-tp-green/40 focus:ring-tp-green/20'}`}
            />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-tp-muted mb-1.5 block">
              Network
            </label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-emerald-300/14 px-3 py-2.5 font-mono text-sm text-tp-text focus:outline-none focus:ring-2 focus:ring-tp-green/20"
            >
              <option value="testnet">Testnet</option>
              <option value="mainnet">Mainnet</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || !input}
              className="w-full sm:w-auto bg-tp-green text-black font-bold px-5 py-2.5 rounded-xl
                         hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
            >
              {loading ? 'Fingerprinting…' : 'Run DNA scan'}
            </button>
          </div>
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
            className="mt-8 grid grid-cols-1 gap-4"
          >
            <SkeletonCard lines={5} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard lines={5} />
              <SkeletonCard lines={5} />
            </div>
          </motion.div>
        )}

        {result && !loading && (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-8"
          >
            <VerdictHeader result={result} network={network} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <RedFlagsPanel flags={result.verdict.redFlags} body={result.verdict.body} />
              <MatchesPanel
                matches={result.dna?.matches}
                network={network}
                onSelectMatch={embedded ? handleSelectMatch : undefined}
              />
            </div>

            <FeaturePanel features={result.features} />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-tp-muted font-mono">
              <span>
                {result.stats?.operations_harvested} ops · {result.stats?.offers_harvested} offers · {result.stats?.trades_harvested} trades harvested
              </span>
              {onViewRiskReport ? (
                <button
                  type="button"
                  onClick={() => onViewRiskReport(result.issuer)}
                  className="text-tp-green hover:underline"
                >
                  View full risk report →
                </button>
              ) : (
                <Link
                  to={`/analyze/${result.issuer}`}
                  className="text-tp-green hover:underline"
                >
                  View full risk report →
                </Link>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );

  if (embedded) {
    return (
      <section className="text-tp-text">
        {content}
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-tp-bg text-tp-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.09),transparent_40%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
          {content}
        </main>
      </div>
    </div>
  );
}

export default function Fingerprint() {
  const { issuerAddress } = useParams();
  return <OperatorDNASection issuerAddress={issuerAddress} />;
}
