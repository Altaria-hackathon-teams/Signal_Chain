# TrustProof Review Contract (Soroban)

Stores all community reviews for Stellar assets on-chain. Once submitted, reviews
cannot be modified or deleted — only appended. Eligible wallets may post any
number of reviews per asset.

## Build & deploy (Stellar testnet)

Requires the Stellar CLI (`stellar` >= 22.x) and `cargo` with the
`wasm32-unknown-unknown` target installed.

```bash
# 1. Build (run from inside the contract package)
cd contracts/review-contract
stellar contract build

# 2. Create / fund a deployer identity (one-time)
stellar keys generate --global deployer --network testnet --fund

# 3. Deploy (returns a contract ID, copy it)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/review_contract.wasm \
  --source deployer \
  --network testnet
```

> The Stellar CLI (>= 22.x) builds to `target/wasm32v1-none/release/` and
> automatically installs the right Rust target. Older CLI versions emit
> `target/wasm32-unknown-unknown/release/` instead — adjust the `--wasm` path
> to match what `stellar contract build` printed.

After deployment, copy the printed contract ID and the deployer secret key
(`stellar keys show deployer`) into `backend/.env`:

```
REVIEW_CONTRACT_ID=C....
SUBMITTER_SECRET_KEY=S....
```

The same `deployer` account is reused as the submitter that pays Soroban fees
when the backend calls `post_review` on behalf of an authenticated reviewer.
That account must stay funded on testnet (run `stellar keys fund deployer
--network testnet` if it runs out).

## Contract API

```
post_review(issuer, asset_code, reviewer, rating, text, trust_weight, tx_amount) -> u64
get_reviews(issuer) -> Vec<Review>
get_count(issuer)   -> u32
```

`trust_weight` is sent as an integer scaled by 100 (so `1.5` → `150`).
`tx_amount` is also scaled by 100. The frontend / backend perform the scaling.
