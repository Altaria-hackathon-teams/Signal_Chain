// Soroban client for the TrustProof review contract.
// All review reads/writes go through this module — there is no SQL fallback.
// Resolve relative to this file so it works no matter where node is launched from.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  Keypair,
  Account,
  nativeToScVal,
  scValToNative,
} = require('@stellar/stellar-sdk');

const SOROBAN_RPC = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const CONTRACT_ID = process.env.REVIEW_CONTRACT_ID || '';
const SUBMITTER_SECRET = process.env.SUBMITTER_SECRET_KEY || '';

const TRUST_SCALE = 100;
const AMOUNT_SCALE = 100;

let _server = null;
function server() {
  if (!_server) _server = new rpc.Server(SOROBAN_RPC, { allowHttp: SOROBAN_RPC.startsWith('http://') });
  return _server;
}

function ensureConfigured() {
  if (!CONTRACT_ID) {
    throw new Error('REVIEW_CONTRACT_ID is not set. Deploy the Soroban contract (see contracts/README.md) and set it in backend/.env');
  }
}

function ensureSubmitter() {
  ensureConfigured();
  if (!SUBMITTER_SECRET) {
    throw new Error('SUBMITTER_SECRET_KEY is not set. Set the testnet secret of the funded submitter account in backend/.env');
  }
}

async function pollForResult(hash, { timeoutMs = 30000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await server().getTransaction(hash);
    if (status.status === 'SUCCESS') return status;
    if (status.status === 'FAILED') {
      throw new Error(`Soroban transaction failed: ${hash}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Soroban transaction ${hash}`);
}

async function postReview({ issuer, assetCode, reviewer, rating, text, trustWeight, txAmount }) {
  ensureSubmitter();

  const submitter = Keypair.fromSecret(SUBMITTER_SECRET);
  const account = await server().getAccount(submitter.publicKey());
  const contract = new Contract(CONTRACT_ID);

  const scaledTrust = Math.max(0, Math.min(0xffffffff, Math.round((trustWeight || 0) * TRUST_SCALE)));
  const scaledAmount = BigInt(Math.max(0, Math.round((txAmount || 0) * AMOUNT_SCALE)));

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'post_review',
        nativeToScVal(issuer, { type: 'string' }),
        nativeToScVal(assetCode || '', { type: 'string' }),
        nativeToScVal(reviewer, { type: 'string' }),
        nativeToScVal(rating, { type: 'u32' }),
        nativeToScVal(text || '', { type: 'string' }),
        nativeToScVal(scaledTrust, { type: 'u32' }),
        nativeToScVal(scaledAmount, { type: 'u64' }),
      ),
    )
    .setTimeout(60)
    .build();

  const prepared = await server().prepareTransaction(tx);
  prepared.sign(submitter);

  const sent = await server().sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(`Soroban send error: ${JSON.stringify(sent.errorResult || sent)}`);
  }

  const result = await pollForResult(sent.hash);
  const reviewId = result.returnValue ? scValToNative(result.returnValue) : null;

  return { hash: sent.hash, reviewId: reviewId != null ? Number(reviewId) : null };
}

async function getReviews(issuer) {
  ensureConfigured();
  const contract = new Contract(CONTRACT_ID);

  // Read-only simulations don't need a funded account; any valid pubkey works.
  const dummy = new Account(Keypair.random().publicKey(), '0');

  const tx = new TransactionBuilder(dummy, {
    fee: '1000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_reviews', nativeToScVal(issuer, { type: 'string' })))
    .setTimeout(30)
    .build();

  const sim = await server().simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Soroban simulation error: ${sim.error}`);
  }

  const retval = sim.result?.retval;
  if (!retval) return [];
  const list = scValToNative(retval) || [];

  return list.map((r) => ({
    id: Number(r.id),
    issuer_address: r.issuer,
    asset_code: r.asset_code,
    wallet_public_key: r.reviewer,
    rating: Number(r.rating),
    review_text: r.text,
    trust_weight: Number(r.trust_weight) / TRUST_SCALE,
    tx_amount_xlm: Number(r.tx_amount) / AMOUNT_SCALE,
    created_at: new Date(Number(r.timestamp) * 1000).toISOString(),
  }));
}

function isConfigured() {
  return Boolean(CONTRACT_ID);
}

module.exports = {
  postReview,
  getReviews,
  isConfigured,
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
};
