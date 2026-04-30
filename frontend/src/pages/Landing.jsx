import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import NavBar from '../components/NavBar';
import BlockchainVisual from '../components/BlockchainVisual';
import MatrixBackground from '../components/MatrixBackground';

const workflow = [
  {
    step: '01',
    title: 'Paste issuer',
    text: 'Start with any Stellar asset issuer address.',
  },
  {
    step: '02',
    title: 'Read the chain',
    text: 'TrustProof checks flags, holder spread, age, volume, and wallet behavior.',
  },
  {
    step: '03',
    title: 'Score risk',
    text: 'The signal model turns raw ledger activity into a clear risk view.',
  },
  {
    step: '04',
    title: 'Verify reviews',
    text: 'Only wallets with real token activity can add reputation data.',
  },
];

const metrics = [
  ['15+', 'on-chain signals'],
  ['48h', 'smart-wallet window'],
  ['100%', 'wallet-gated reviews'],
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#030806] text-tp-text">
      <MatrixBackground />
      <div className="relative">
        <NavBar />

        <main>
          <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:px-10">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="max-w-3xl"
            >
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] text-emerald-100/80">
                <span className="h-2 w-2 rounded-full bg-tp-green shadow-[0_0_16px_rgba(0,255,136,0.9)]" />
                Decentralized token intelligence
              </div>

              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
                TrustProof makes token risk visible before you commit.
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-emerald-50/68 sm:text-lg">
                Analyze Stellar assets with live blockchain signals, behavior-weighted risk scoring, and verified wallet reviews in one focused interface.
              </p>

              <Link
                to="/verify"
                className="mt-9 inline-flex min-h-14 items-center rounded-xl bg-tp-green px-7 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-emerald-300 hover:shadow-[0_0_28px_rgba(0,255,136,0.28)] focus:outline-none focus:ring-4 focus:ring-tp-green/20"
              >
                Get Started
              </Link>

              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
                {metrics.map(([value, label]) => (
                  <div key={label} className="border-l border-emerald-300/16 pl-4">
                    <div className="font-mono text-2xl font-bold text-tp-green">{value}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-100/52">{label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.16, duration: 0.7, ease: 'easeOut' }}
              className="w-full"
            >
              <BlockchainVisual />
            </motion.div>
          </section>

          <section className="border-y border-emerald-300/10 bg-black/18 px-5 py-16 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-7xl">
              <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-tp-green">Workflow</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">From address to proof in four steps.</h2>
                </div>
                <p className="max-w-xl text-sm leading-7 text-emerald-50/62">
                  TrustProof combines ledger data and verified participation so users can judge tokens through evidence instead of hype.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                {workflow.map((item, index) => (
                  <motion.article
                    key={item.step}
                    initial={{ opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    className="relative min-h-[210px] rounded-2xl border border-emerald-300/12 bg-[#07110d]/78 p-6 shadow-[0_0_40px_rgba(0,255,136,0.035)]"
                  >
                    <div className="mb-8 flex items-center justify-between">
                      <span className="font-mono text-sm text-tp-green">{item.step}</span>
                      <span className="h-px w-12 bg-emerald-300/25" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-emerald-50/58">{item.text}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
