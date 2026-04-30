# TrustProof

A DeFi safety layer for Stellar. Paste an issuer address and TrustProof returns
a transparent, on-ledger risk report — issuer authority flags, supply controls,
liquidity, holder concentration, sell-path (honeypot) checks, age, reputation
and an ensemble model verdict — alongside community reviews stored on-chain
via a Soroban contract.

> Network: Stellar **testnet**. Risk scoring is informational, not financial advice.

---

## Architecture

```
trustproof/
├── frontend/         # Vite + React + Tailwind UI (port 5173)
├── backend/          # Express API + SQLite cache + Soroban client (port 3001)
├── ml-engine/        # Flask token-safety scanner (port 5000)
├── contracts/        # Soroban (Rust) review contract
└── database/         # SQLite init script (risk-history snapshots only)
```

| Service | Stack | Port | Responsibility |
|---|---|---|---|
| `frontend` | React 19 + Vite + Tailwind | 5173 | UI: PreCheck, Analyze, Compare, Reviews, Leaderboard |
| `backend` | Express + better-sqlite3 + @stellar/stellar-sdk | 3001 | Reviews proxy to Soroban, Horizon-derived smart-money signals, risk-history snapshots, leaderboards |
| `ml-engine` | Flask + requests | 5000 | Issuer-only risk scan: Horizon + StellarExpert cross-check, deterministic ensemble scoring |
| `contracts/review-contract` | Soroban Rust SDK 22 | — | Append-only on-chain reviews |

The frontend proxies `/api → backend` and `/ml → ml-engine` via `vite.config.js`,
so there's only one origin to talk to during development.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Python | ≥ 3.10 |
| Rust + `cargo` | latest stable (only needed for redeploying the Soroban contract) |
| `stellar` CLI | ≥ 22 (only needed for redeploying the Soroban contract) |

---

## First-time setup

```bash
# 1. Clone and install all JS deps (root, backend, frontend, database)
git clone <your-fork-url> trustproof
cd trustproof
nvm use
npm run install:all

# 2. Create the Python venv for the ml-engine and install its requirements
npm run ml:venv

# 3. Initialize the local SQLite cache (risk-history + wallet trust cache)
npm run db:init

# 4. Configure backend secrets — copy the example and fill the two values
cp backend/.env.example backend/.env
# then edit backend/.env to set REVIEW_CONTRACT_ID and SUBMITTER_SECRET_KEY

# 5. Optional: configure the scanner runtime
cp ml-engine/.env.example ml-engine/.env
```

### Configuring `backend/.env`

The backend writes reviews to the Soroban contract and pays fees on testnet,
so it needs:

```env
REVIEW_CONTRACT_ID=C...        # contract id printed by `stellar contract deploy`
SUBMITTER_SECRET_KEY=S...      # testnet secret of a funded account
# SOROBAN_RPC_URL=https://soroban-testnet.stellar.org   # optional override
# CORS_ORIGIN=https://your-frontend.example             # production override
```

If you don't want to redeploy, you can point at an existing test deployment —
the only requirement is that `REVIEW_CONTRACT_ID` is a deployed copy of
`contracts/review-contract` and `SUBMITTER_SECRET_KEY` is a funded testnet
account. See [`contracts/README.md`](contracts/README.md) for the full deploy
recipe.

---

## Running the stack

One command starts the frontend, backend, and Flask ml-engine concurrently
with colour-coded output:

```bash
npm run dev
```

| URL | What |
|---|---|
| http://localhost:5173 | Frontend |
| http://localhost:3001/health | Backend health |
| http://localhost:5000/health | ml-engine health |

Useful sub-commands:

```bash
npm run ml          # start only the Flask scanner
npm run ml:install  # re-install Python deps into the existing venv
npm run ml:venv     # bootstrap a fresh venv from scratch
npm run check       # lint + build + Python tests + contract tests
npm run audit       # npm audit for all JS packages
npm run db:init     # (re)initialize the SQLite tables
```

---

## Building for production

```bash
npm run build
# → output: frontend/dist/
```

Serve `frontend/dist/` from any static host (Vercel, Netlify, S3, nginx) and
deploy `backend/` and `ml-engine/` behind a reverse proxy that maps `/api` to
the Express service and `/ml` to the Flask service.

Production process examples:

```bash
npm --prefix backend start
cd ml-engine && .venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 app:app
```

Set `PORT`, `CORS_ORIGIN`, `HORIZON_URL`, and `SOROBAN_RPC_URL` for the
backend as needed. Set `ML_HOST`, `ML_PORT`, `ML_CORS_ORIGIN`, and
`STELLAR_HORIZON_URL` for the scanner.

---

## How the risk score works

The ml-engine returns a **trust score 0–100 (higher = safer)** plus a rating:

| Score | Rating | Meaning |
|---|---|---|
| ≥ 80 | `SAFE` | No critical signals |
| 50–79 | `WARNING` | One or more notable risks |
| < 50 | `DANGER` | Critical or compounding risks |

Every score is the output of an evidence-weighted, deterministic ensemble over
nine categories: issuer authority, supply / mint, exit route (honeypot),
liquidity, holder concentration, trading activity, asset age, new-launch
cluster, and reputation. There is **no external AI model** — the engine reads
ledger data from Horizon, asset metadata from StellarExpert, and the risk
report can be audited end-to-end.

See [`ml-engine/README.md`](ml-engine/README.md) for the full scanner spec and
[`ml-engine/analyzer/risk_engine.py`](ml-engine/analyzer/risk_engine.py) for
the rule definitions.

---

## Reviews are on-chain

Reviews are not stored in SQLite. The backend verifies a reviewer's wallet has
real activity with the asset (via Horizon), then submits the review to the
Soroban contract under `SUBMITTER_SECRET_KEY`. The contract is append-only:
once written, reviews cannot be edited or deleted.

The SQLite database holds only:

- `risk_history` — local snapshots of past risk scores per issuer
- `wallet_trust_cache` — Horizon-derived trust factors

Both are cache layers and can be safely re-initialized at any time.

---

## Repository layout details

- **`frontend/src/pages/`** — `Landing`, `Home`, `PreCheck`, `Analyze`, `Compare`, `Verification`, `WriteReview`, `Leaderboard`.
- **`frontend/src/utils/api.js`** — axios clients for `/api` (backend) and `/ml` (scanner).
- **`frontend/src/utils/risk.js`** — adapters that turn the raw scan payload into UI shapes.
- **`backend/index.js`** — Express endpoints: `/api/reviews/*`, `/api/signals/*`, `/api/risk-history/*`, `/api/leaderboard/*`.
- **`backend/contractClient.js`** — Soroban read/write client used by the review endpoints.
- **`ml-engine/app.py`** — Flask app exposing `GET /api/scan/<issuer>`.
- **`ml-engine/scanner_service.py`** — issuer resolver + scan orchestrator.
- **`ml-engine/scanners/`** — per-category scanners (authority, supply, liquidity, honeypot, holders, trades, age).
- **`ml-engine/analyzer/risk_engine.py`** — rule-based deductions + deterministic ensemble model.
- **`contracts/review-contract/`** — the Soroban review contract source.

---

## Contributing

The codebase is small enough to read in an afternoon. A few conventions worth
knowing:

- **Tailwind** with a custom token palette (`tp-green`, `tp-amber`, `tp-red`, etc.).
- **No backwards-compat shims** — the ml-engine output shape is the contract;
  if it changes, update `frontend/src/utils/risk.js` in the same change.
- **Reviews are the on-chain surface.** Don't add SQLite tables for review
  data — it lives on the Soroban contract.

---

## License

MIT. See `LICENSE` if added; otherwise treat the code as MIT-licensed.
