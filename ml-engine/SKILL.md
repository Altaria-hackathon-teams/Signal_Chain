---
title: Stellar Token Safety Scanner
description: |
  Stellar testnet issuer-risk analysis and Flask JSON API for issuer-only input. Use when a user
  provides a Stellar issuer account from https://stellar.expert/explorer/testnet/asset
  and wants a safety/risk JSON report. The scanner resolves the issuer to the matching
  StellarExpert testnet asset, cross-checks Horizon, checks issuer authority,
  mint risk, liquidity, sellability, holders, activity, age, data quality, and
  a transparent from-scratch ensemble risk model, or wants a frontend-ready Flask endpoint.
metadata:
  author: Bob-QoQ
  version: "4.0-stellar-api-only"
license: MIT
---

# Stellar Token Safety Scanner

## Input Format

The Flask API accepts exactly one issuer account:

| Input | Meaning |
|---|---|
| `G...` | Stellar issuer account |

Rejected input:

| Input | Reason |
|---|---|
| `CODE:GISSUER` | The endpoint is issuer-only |
| `CODE-GISSUER-N` | The scanner resolves this itself from the issuer |
| `C...` | Contract IDs do not identify a classic issuer |
| `--asset`, `--json`, `--network` | Legacy flags are not accepted by the HTTP endpoint |

## Flask API

Run:

```bash
py app.py
```

Endpoints:

| Method | URL |
|---|---|
| `GET` | `/health` |
| `GET` | `/api/scan/<issuer>` |
| `GET` | `/api/scan?issuer=<issuer>` |

The JSON response contains `ok`, `issuer`, `network`, `asset`, `risk`, and `scan`. The `risk.model` object includes model score, probability, confidence, signals, and `new_token` evidence.

## Resolution

1. Validate issuer address.
2. Query StellarExpert testnet `/asset?search=<issuer>`.
3. Keep only assets whose parsed issuer matches exactly.
4. Query Horizon testnet `/assets?asset_issuer=<issuer>`.
5. Score candidates by:
   - StellarExpert rating
   - Horizon issuer match
   - funded holders
   - payments
   - trades
   - positive supply
6. Scan the highest-evidence asset.

## Data Sources

| Step | Source |
|---|---|
| Issuer asset lookup | StellarExpert testnet asset list |
| Asset metadata and flags | Horizon testnet `/assets` |
| Issuer signers and thresholds | Horizon testnet `/accounts/{issuer}` |
| Sell-path simulation | Horizon testnet `/paths/strict-send` |
| SDEX depth | Horizon testnet `/order_book` |
| AMM pools | Horizon testnet `/liquidity_pools` |
| Trades | Horizon testnet `/trades` |
| Holder concentration | StellarExpert `/asset/{asset}/holders` |
| Ratings and aggregate counts | StellarExpert `/asset/{asset}` |

## Risk Model

The score combines hard rules and a transparent local ensemble. Do not claim a hidden external AI model is being called.

Hard-rule examples:

| Condition | Effect |
|---|---|
| `AUTH_CLAWBACK_ENABLED` | Critical, caps score |
| No TOKEN -> XLM route, SDEX bids, or AMM pool | Sellability failure |
| Very low liquidity | Liquidity failure |
| Extreme holder concentration | Concentration failure/warning |

Ensemble signals:

| Signal | Examples |
|---|---|
| Authority | flags, thresholds, signer ability |
| Supply | mint risk, StellarExpert/Horizon supply delta |
| Exit route | pathing, SDEX, AMM, slippage |
| Liquidity | bid depth, pools, spread, StellarExpert liquidity rating |
| Holders | top 1, top 10, HHI, Gini |
| Activity | trades, payments, wash-trade heuristics |
| Age | created timestamp and new-token risk |
| New launch cluster | newly created asset plus weak liquidity/activity/holders |
| Reputation | StellarExpert technical rating |
| Data quality | source availability and cross-checks |

Output includes score, rating, model score, risk probability, confidence, timestamp evidence, newness band, launch-cluster risk, and per-category model risks.

## Limitations

1. Testnet signals are not production market-safety signals.
2. Contract-token admin/mint/freeze controls require contract source/spec review.
3. Horizon cannot sort holders by balance, so StellarExpert is preferred for concentration.
4. Classic Stellar assets do not have EVM bytecode, ERC-20 taxes, Solidity proxies, or transfer-hook honeypots.
5. This is informational only and not financial advice.
