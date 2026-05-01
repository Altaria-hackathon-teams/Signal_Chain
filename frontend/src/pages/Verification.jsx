import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar';
import BackButton from '../components/BackButton';
import MatrixBackground from '../components/MatrixBackground';
import { useWallet } from '../context/useWallet';
import { isValidIssuerAddress, normalizeIssuerAddress } from '../utils/stellar';

export default function Verification() {
  const [address, setAddress] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [isAddressError, setIsAddressError] = useState(false);
  const navigate = useNavigate();
  const { address: walletAddress, triggerWalletShake } = useWallet();

  function handleVerify() {
    const normalized = normalizeIssuerAddress(address);
    if (!walletAddress) {
      triggerWalletShake();
      setIsAddressError(false);
      setValidationMessage('Connect your wallet using the button in the top-right corner before verifying.');
      return;
    }
    if (!isValidIssuerAddress(normalized)) {
      setIsAddressError(true);
      setValidationMessage('Invalid issuer address format. Use a Stellar public key that starts with G and is 56 characters long.');
      return;
    }
    setValidationMessage('');
    setIsAddressError(false);
    navigate(`/analyze/${normalized}`);
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#030806] text-tp-text">
      <MatrixBackground />
      <div className="relative">
        <NavBar />

        <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-10">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            <BackButton label="Back to overview" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Verify an issuer with live chain evidence.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-emerald-50/64">
              Enter a Stellar issuer address to generate a concise TrustProof report across risk, behavior, and verified participation.
            </p>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.12, duration: 0.55, ease: 'easeOut' }}
            className="rounded-[28px] border border-emerald-300/14 bg-[#06110d]/86 p-5 shadow-[0_0_80px_rgba(0,255,136,0.07)] backdrop-blur sm:p-7"
          >
            <div className="mb-6 flex items-center justify-between border-b border-emerald-300/10 pb-5">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-tp-green">Verification console</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Asset proof request</h2>
              </div>
              <span className="h-3 w-3 rounded-full bg-tp-green shadow-[0_0_22px_rgba(0,255,136,0.9)]" />
            </div>

            <label htmlFor="verify-address" className="mb-3 block text-sm font-medium text-emerald-50/72">
              Issuer address
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="verify-address"
                type="text"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value.toUpperCase());
                  if (validationMessage) {
                    setValidationMessage('');
                    setIsAddressError(false);
                  }
                }}
                onKeyDown={(event) => event.key === 'Enter' && handleVerify()}
                placeholder="GBXYZ...ABC"
                aria-invalid={isAddressError}
                aria-describedby={validationMessage ? 'verify-address-error' : undefined}
                className={`min-h-14 flex-1 rounded-xl border bg-black/40 px-5 font-mono text-sm text-emerald-50 outline-none transition placeholder:text-emerald-100/35 focus:ring-4 ${
                  isAddressError
                    ? 'border-tp-red/70 focus:border-tp-red focus:ring-tp-red/10'
                    : 'border-emerald-300/15 focus:border-tp-green/70 focus:ring-tp-green/10'
                }`}
              />
              <button
                type="button"
                onClick={handleVerify}
                className="min-h-14 rounded-xl bg-tp-green px-7 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-emerald-300 hover:shadow-[0_0_28px_rgba(0,255,136,0.28)] focus:outline-none focus:ring-4 focus:ring-tp-green/20"
              >
                Verify
              </button>
            </div>

            {validationMessage && (
              <motion.p
                id="verify-address-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2.5 rounded-xl border border-tp-red/25 bg-red-500/10 px-4 py-3 text-sm text-tp-red"
              >
                <span className="mt-px shrink-0">{isAddressError ? '⚠' : '🔗'}</span>
                <span>{validationMessage}</span>
              </motion.p>
            )}

            <div className="mt-8 overflow-hidden rounded-2xl border border-emerald-300/10 bg-black/28 p-4">
              <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-emerald-100/50">
                <span>Signal pipeline</span>
                <span className="text-tp-green">ready</span>
              </div>
              <div className="h-2 rounded-full bg-emerald-300/10 overflow-hidden relative">
                <motion.div
                  className="absolute inset-y-0 rounded-full bg-gradient-to-r from-transparent via-tp-green to-transparent"
                  animate={{ left: ['-55%', '110%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '55%' }}
                />
              </div>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
