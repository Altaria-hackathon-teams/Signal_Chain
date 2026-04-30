# Stellar Token Safety Scanner

A Flask-only Stellar testnet issuer-risk scanner. Give the API one issuer address from the StellarExpert testnet asset list and it resolves the listed asset, cross-checks it against Horizon, and returns an in-depth JSON risk report.

The runtime is fixed to testnet for issuer scans because the target source is:

```text
https://stellar.expert/explorer/testnet/asset
```

## Flask API

Run the API:

```bash
python app.py
```

For a production process, run the Flask app through Gunicorn:

```bash
gunicorn -w 2 -b 127.0.0.1:5000 app:app
```

Endpoints:

| Method | URL | Description |
|---|---|---|
| `GET` | `/health` | API health check |
| `GET` | `/api/scan/<issuer>` | Scan an issuer and return JSON |
| `GET` | `/api/scan?issuer=<issuer>` | Same scan using a query parameter |

Example:

```bash
curl http://127.0.0.1:5000/api/scan/GAZKBG4Q7JCKTY5K5Q42SSUW6F3O6OE2SLP7PYRVW4NYSEPIUMV5G2MN
```

Response shape:

```json
{
  "ok": true,
  "issuer": "G...",
  "network": "testnet",
  "asset": {},
  "risk": {
    "score": 20,
    "rating": "DANGER",
    "model": {
      "engine": "in-house deterministic ensemble v1",
      "risk_probability_pct": 63.2,
      "confidence_pct": 99,
      "new_token": {}
    }
  },
  "scan": {}
}
```

The API uses permissive CORS by default for local development. Set
`ML_CORS_ORIGIN` to one or more comma-separated frontend origins for production.

## What Happens

1. Validates the input as a Stellar issuer account (`G...`).
2. Searches StellarExpert testnet assets by issuer.
3. Cross-checks candidate assets with Horizon testnet `/assets?asset_issuer=...`.
4. Selects the strongest issuer asset with an evidence-weighted resolver:
   - Horizon issuer match
   - StellarExpert rating
   - funded holders
   - payments
   - trades
   - supply presence
5. Runs the full scanner on the resolved asset.
6. Returns a deterministic ensemble risk model with score, probability, confidence, and signal-level risks.

## Data Sources

| Source | Used For |
|---|---|
| StellarExpert testnet API | Issuer lookup, asset detail, technical rating, holders, payments, trades, supply, contract metadata |
| Horizon testnet API | Ledger cross-check, issuer account, issuer flags, signer thresholds, order book, liquidity pools, paths, trades, operations |

No API keys are required.

## Risk Analysis

The scanner checks:

| Area | Signals |
|---|---|
| Issuer authority | `AUTH_REQUIRED`, `AUTH_REVOCABLE`, `AUTH_CLAWBACK_ENABLED`, issuer signers, thresholds, lock state |
| Mint risk | Whether issuer authority can create more units; supply mismatch between StellarExpert and Horizon |
| Exit route | TOKEN -> XLM pathing, SDEX bids, AMM pools, soft-honeypot slippage |
| Liquidity | SDEX bid depth, AMM reserves, spread, pool count, StellarExpert liquidity rating |
| Holders | Top holder, top 10, HHI, Gini, whale count, holder count |
| Activity | Trades, payments, unique counterparties, wash-trade pattern checks |
| Age/distribution | Asset age, timestamp source confidence, newness band, launch-cluster risk, issuer airdrop-like transfer bursts |
| Reputation | StellarExpert age/activity/trustline/liquidity/volume/interop ratings |
| Data quality | StellarExpert/Horizon availability, source agreement, testnet limitations |

## Risk Model

The score is not a single naive checklist. It combines:

- rule-based hard failures for critical controls such as clawback and no sell route
- evidence-weighted candidate resolution for issuer-only input
- concentration metrics including HHI and Gini
- liquidity depth plus spread and AMM pool checks
- StellarExpert technical rating as an independent reputation signal
- new-token detection from verifiable timestamps with a separate launch-cluster risk that combines age with liquidity/activity/holder weakness
- a transparent from-scratch ensemble model that emits:
  - model score
  - blended final score
  - risk probability
  - evidence confidence
  - new-token band, timestamp confidence, and launch-cluster risk
  - per-category risk signals

No external black-box AI service is called. The model is implemented locally and transparently from ledger/index signals so the report can be audited.

## Architecture

```text
token-safety-scanner/
  adapters/
    stellar_horizon.py      # Horizon API, issuer lookup, asset parsing, paths, pools, trades
    stellar_expert.py       # StellarExpert issuer lookup, asset detail, ratings, holders
  scanners/
    authority_scanner.py    # Issuer flags, signers, threshold control
    supply_scanner.py       # Supply and mint authority
    liquidity_scanner.py    # SDEX, AMM, spread, liquidity depth
    honeypot_scanner.py     # TOKEN -> XLM sellability
    holder_scanner.py       # Concentration, HHI, Gini
    trade_scanner.py        # Activity and wash-trading heuristics
    age_scanner.py          # Age and airdrop patterns
  analyzer/
    risk_engine.py          # Rules plus deterministic ensemble model
  scanner_service.py        # Issuer resolver and scan orchestration
  app.py                    # Flask JSON API
  tests/test_scanner.py
```

## Running Tests

```bash
python -m pytest
```

## Limitations

- Testnet data is useful for scanner validation, but it is not production market safety.
- Classic Stellar assets do not have Solidity-style source verification, proxy contracts, selfdestruct, ERC-20 taxes, or arbitrary transfer hooks.
- Contract-token admin/mint/freeze controls require contract source/spec review. The scanner reports them as unverified instead of pretending classic issuer flags apply.
- Horizon may return empty-market endpoints as 404; the scanner treats those as no market data.
- This is informational analysis only and not financial advice.
