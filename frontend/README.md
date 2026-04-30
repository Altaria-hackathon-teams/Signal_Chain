# TrustProof Frontend

The Vite + React 19 + Tailwind UI for [TrustProof](../README.md) — the DeFi
safety layer on Stellar. Surfaces issuer risk reports from the Flask
ml-engine, smart-money signals from the Express backend, and on-chain reviews
written to the Soroban review contract.

## Stack

- **Vite 8** + **React 19**
- **Tailwind CSS** with a custom palette (`tp-green`, `tp-amber`, `tp-red`, `tp-bg`, `tp-muted`, `tp-text`, `tp-border`)
- **react-router-dom 7** for routing
- **framer-motion** for animations
- **@stellar/freighter-api** for wallet integration
- **axios** for API calls

## Scripts

```bash
npm run dev       # Vite dev server on http://localhost:5173
npm run build     # production build → dist/
npm run preview   # serve the built bundle
npm run lint      # eslint .
```

The full stack (frontend + backend + ml-engine) is also runnable with one
command from the repo root:

```bash
# from the repo root
npm run dev
```

## Dev-server proxy

`vite.config.js` proxies API traffic so the app talks to a single origin in
development:

| Frontend path | Proxied to | Service |
|---|---|---|
| `/api/*` | `http://localhost:3001` | Express backend |
| `/ml/*` | `http://127.0.0.1:5000/api/*` | Flask ml-engine |

If you change ports, update the proxy block in `vite.config.js` to match.

## Source layout

```
src/
├── pages/                 # Route-level views
│   ├── Landing.jsx        # Marketing / hero page
│   ├── Home.jsx           # Connected dashboard
│   ├── PreCheck.jsx       # Quick issuer pre-buy check
│   ├── Analyze.jsx        # Full risk-analysis report (5 tabs)
│   ├── Compare.jsx        # Side-by-side asset comparison + reviews
│   ├── WriteReview.jsx    # Submit an on-chain review
│   ├── Verification.jsx   # Wallet verification flow
│   └── Leaderboard.jsx    # Top safe / reviewed / reviewers
│
├── components/            # Reusable UI pieces
│   ├── NavBar.jsx
│   ├── RiskGauge.jsx           # SVG arc gauge
│   ├── RiskBreakdown.jsx       # Severity-count pills + meters
│   ├── RiskTimeline.jsx        # Historical-score timeline
│   ├── HolderBar.jsx           # Stacked holder-distribution bar
│   ├── PriceChart.jsx
│   ├── ShareReport.jsx         # Twitter/Telegram/Reddit share dropdown
│   ├── RedFlagCard.jsx         # Image card for sharing
│   ├── SeverityBadge.jsx
│   ├── ActionBadge.jsx
│   ├── SkeletonCard.jsx
│   ├── CopyButton.jsx
│   ├── BlockchainVisual.jsx
│   └── MatrixBackground.jsx
│
├── context/
│   ├── WalletContext.jsx       # Freighter provider
│   └── useWallet.js            # Wallet hook / context
│
├── utils/
│   ├── api.js                  # axios clients for /api and /ml
│   ├── analyze.js              # runAnalysis() — single scan + adapter
│   ├── risk.js                 # buildRiskView() — payload normalizer
│   ├── horizon.js              # Direct Horizon REST helpers (wallet eligibility, etc.)
│   ├── stellar.js              # StrKey address validation / normalization
│   └── format.js               # truncateAddress, formatNumber, formatAmount, formatDate
│
├── App.jsx                # Router setup
├── main.jsx               # Entry point
├── index.css              # Tailwind layers + custom CSS variables
└── App.css                # App-level styles
```

## How the risk data flows

```
issuer address
   ↓
runAnalysis(issuer)         ← src/utils/analyze.js
   ↓
scanIssuer(issuer)          ← src/utils/api.js  →  GET /ml/scan/<issuer>
   ↓
buildRiskView(payload)      ← src/utils/risk.js
   ↓
{ score, rating, verdictColor, signals, categoryScores, model, ... }
   ↓
Pages consume this normalized shape (Analyze, PreCheck, Compare).
```

The ml-engine is the source of truth for risk scoring — `risk.js` only
*adapts* its output for UI components. If the engine's payload shape changes,
update `risk.js` and the consuming pages in the same change.

## Design tokens

Defined in `tailwind.config.js`:

| Token | Use |
|---|---|
| `tp-bg` | Page background |
| `tp-text` | Default text |
| `tp-muted` | Secondary text |
| `tp-border` | Hairlines |
| `tp-green` | Safe / success / brand |
| `tp-amber` | Warning |
| `tp-red` | Danger / critical |

The "trust score" colour is derived from the rating, not the score number:
`SAFE → tp-green`, `WARNING → tp-amber`, `DANGER → tp-red`.

## Wallet integration

The app uses Freighter for wallet connect. State is exposed by
`WalletContext.jsx`:

```jsx
import { useWallet } from '../context/useWallet';

const { address, connect, disconnect, freighterInstalled } = useWallet();
```

If Freighter isn't installed, `freighterInstalled` is `false` and the connect
banner is hidden. Reviews require the connected wallet to have on-chain
activity with the asset (verified by the backend via Horizon).

## Adding a new route

1. Drop a new component into `src/pages/`.
2. Register it in `App.jsx` inside the `<Routes>` block.
3. Add a `NavBar` link if it should be discoverable.
4. If it consumes scan data, use `runAnalysis(issuer)` from `utils/analyze.js`
   rather than calling the ml-engine directly — that keeps the payload shape
   consistent across pages.

## Production build

```bash
npm run build
```

Output lands in `frontend/dist/`. Serve it from any static host. The proxy
rules in `vite.config.js` only apply to `vite dev`; in production the
frontend expects an upstream that maps `/api → backend` and `/ml → ml-engine`.
