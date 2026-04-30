import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar';
import { useWallet } from '../context/useWallet';
import { loadAssetData, checkWalletTxHistory } from '../utils/horizon';
import { submitReview, stellarExpertTxUrl } from '../utils/api';
import { truncateAddress, formatAmount } from '../utils/format';

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="text-3xl transition-transform hover:scale-110 focus:outline-none"
          style={{ color: n <= (hovered || value) ? '#ffaa00' : '#1a3828' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function WriteReview() {
  const { issuerAddress } = useParams();
  const { address: walletAddress, connect } = useWallet();

  const [assetCode, setAssetCode] = useState('');
  const [txCheck, setTxCheck] = useState(null);
  const [loadingCheck, setLoadingCheck] = useState(true);

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  useEffect(() => {
    loadAssetData(issuerAddress)
      .then((records) => {
        if (records.length > 0) setAssetCode(records[0].asset_code);
      })
      .catch(() => {});
  }, [issuerAddress]);

  useEffect(() => {
    let active = true;
    async function runEligibilityCheck() {
      if (!assetCode) return;
      if (!walletAddress) {
        if (active) setLoadingCheck(false);
        return;
      }
      setLoadingCheck(true);
      try {
        const result = await checkWalletTxHistory(walletAddress, assetCode, issuerAddress);
        if (active) setTxCheck(result);
      } finally {
        if (active) setLoadingCheck(false);
      }
    }
    runEligibilityCheck();
    return () => { active = false; };
  }, [walletAddress, assetCode, issuerAddress]);

  async function handleConnect() {
    setConnecting(true);
    try {
      await connect();
    } finally {
      setConnecting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) {
      setSubmitError('Please select a star rating.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitReview({
        issuerAddress,
        assetCode,
        walletPublicKey: walletAddress,
        rating,
        reviewText,
      });
      setLastReceipt(result);
      setRating(0);
      setReviewText('');
    } catch (err) {
      setSubmitError(err.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const canReview = walletAddress && txCheck?.hasTxHistory;

  return (
    <div className="min-h-screen bg-tp-bg">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,255,136,0.09),transparent_40%),linear-gradient(180deg,#030806_0%,#061008_50%,#030806_100%)]" />
        <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(0,255,136,0.11)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,136,0.11)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <div className="relative">
        <NavBar />

        <main className="max-w-xl mx-auto px-4 py-12">
          <div className="flex items-center gap-2 text-tp-muted text-sm mb-6 font-mono">
            <Link to={`/analyze/${issuerAddress}`} className="hover:text-tp-green transition-colors">
              ← Back to analysis
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl border border-emerald-300/12 bg-[#07110d]/90 p-6 backdrop-blur shadow-[0_0_40px_rgba(0,255,136,0.05)]"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tp-green/30 to-transparent" />

            <p className="text-tp-green text-xs uppercase tracking-widest mb-1 font-mono">Write a Review</p>
            <h2 className="text-white text-xl font-bold mb-1 font-mono">{assetCode || '…'}</h2>
            <p className="text-tp-muted text-xs mb-6 font-mono">{truncateAddress(issuerAddress)}</p>

            {!walletAddress ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full border border-tp-green/20 bg-tp-green/5 flex items-center justify-center mx-auto mb-4">
                  <span className="text-tp-green text-xl">🔗</span>
                </div>
                <p className="text-tp-muted mb-4">Connect your Freighter wallet to leave a review.</p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="bg-tp-green text-black font-bold px-6 py-3 rounded-xl
                             hover:bg-emerald-300 disabled:opacity-50 transition-all
                             hover:shadow-[0_0_16px_rgba(0,255,136,0.3)]"
                >
                  {connecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              </div>
            ) : loadingCheck ? (
              <div className="text-center py-8 text-tp-muted animate-pulse">
                Checking transaction history…
              </div>
            ) : !canReview ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full border border-tp-amber/20 bg-tp-amber/5 flex items-center justify-center mx-auto mb-4">
                  <span className="text-tp-amber text-xl">⚠️</span>
                </div>
                <p className="text-tp-amber text-sm font-semibold mb-2">
                  No transaction history found
                </p>
                <p className="text-tp-muted text-sm">
                  You haven't transacted with {assetCode || 'this asset'} from wallet{' '}
                  <span className="font-mono text-emerald-100/40">{truncateAddress(walletAddress)}</span>.
                  <br />
                  Only real holders can leave reviews.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Wallet info */}
                <div className="bg-black/20 rounded-xl p-3 border border-emerald-300/10 text-sm">
                  <p className="text-tp-muted mb-1 text-xs">Reviewing as</p>
                  <p className="font-mono text-tp-text">{truncateAddress(walletAddress)}</p>
                  {txCheck.txAmount > 0 && (
                    <p className="text-tp-muted text-xs mt-1">
                      {formatAmount(txCheck.txAmount)} {assetCode} transacted —
                      <span className="text-tp-green ml-1">verified on-chain ✓</span>
                    </p>
                  )}
                  {txCheck.hasTrustline && txCheck.txAmount === 0 && (
                    <p className="text-tp-green text-xs mt-1">Trustline verified ✓</p>
                  )}
                  <p className="text-tp-muted text-xs mt-2">
                    Reviews are written to the Soroban contract. You can post as many as you want.
                  </p>
                </div>

                {lastReceipt && (
                  <div className="bg-tp-green/8 border border-tp-green/30 rounded-xl p-3 text-sm">
                    <p className="text-tp-green font-semibold mb-1">Review published on-chain ✓</p>
                    <p className="text-tp-muted text-xs">
                      Review #{lastReceipt.reviewId ?? '—'} · trust weight {lastReceipt.trustWeight}
                    </p>
                    {lastReceipt.txHash && (
                      <a
                        href={stellarExpertTxUrl(lastReceipt.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-tp-green text-xs font-mono break-all hover:underline"
                      >
                        {lastReceipt.txHash}
                      </a>
                    )}
                    <div className="mt-2 flex gap-3 text-xs">
                      <Link
                        to={`/analyze/${issuerAddress}`}
                        className="text-tp-green hover:underline"
                      >
                        View all reviews →
                      </Link>
                      <span className="text-tp-muted">or post another below</span>
                    </div>
                  </div>
                )}

                {/* Star rating */}
                <div>
                  <label className="text-tp-muted text-xs uppercase tracking-widest block mb-3">
                    Rating
                  </label>
                  <StarPicker value={rating} onChange={setRating} />
                  {rating > 0 && (
                    <p className="text-tp-muted text-xs mt-2">
                      {['', 'Terrible', 'Poor', 'Fair', 'Good', 'Excellent'][rating]}
                    </p>
                  )}
                </div>

                {/* Review text */}
                <div>
                  <label className="text-tp-muted text-xs uppercase tracking-widest block mb-2">
                    Review (optional)
                  </label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience with this token…"
                    rows={4}
                    className="w-full bg-black/30 border border-emerald-300/12 rounded-xl px-4 py-3
                               text-tp-text text-sm placeholder-emerald-100/20 resize-none
                               focus:outline-none focus:border-tp-green/40 focus:ring-2 focus:ring-tp-green/8
                               transition-all"
                  />
                </div>

                {submitError && (
                  <p className="text-tp-red text-sm bg-red-500/8 border border-red-500/25 rounded-xl px-4 py-2">
                    {submitError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !rating}
                  className="w-full bg-tp-green text-black font-bold py-3 rounded-xl
                             hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
                >
                  {submitting ? 'Submitting…' : 'Sign & Submit Review'}
                </button>
              </form>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
