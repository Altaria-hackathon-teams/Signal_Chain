// 40-feature behavioral fingerprint vector for a Stellar issuer account.
// Every feature returns a single number — unknown / missing data resolves to 0.

function ts(str) {
  return str ? new Date(str).getTime() : 0;
}

function secsBetween(a, b) {
  const diff = ts(b) - ts(a);
  return diff >= 0 ? diff / 1000 : 0;
}

function entropy(str = '') {
  if (!str) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const n = str.length;
  return -Object.values(freq).reduce((s, v) => s + (v / n) * Math.log2(v / n), 0);
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function extractVector(pubkey, ops, account, offers, trades) {
  if (!ops || !ops.length) return null;

  const sorted = [...ops].sort((a, b) => ts(a.created_at) - ts(b.created_at));
  const first = sorted[0];
  const firstDate = new Date(first.created_at);

  const tokenIssuanceOp =
    sorted.find((op) =>
      op.type === 'change_trust' || op.type === 'manage_sell_offer' || op.type === 'manage_buy_offer',
    ) ?? sorted[0];

  const firstOffer = offers.length
    ? [...offers].sort((a, b) => ts(a.last_modified_time) - ts(b.last_modified_time))[0]
    : null;

  const first24h = sorted.filter((op) => secsBetween(first.created_at, op.created_at) < 86400);

  const gaps = sorted.slice(0, 10).reduce((acc, op, i, arr) => {
    if (i === 0) return acc;
    acc.push(secsBetween(arr[i - 1].created_at, op.created_at));
    return acc;
  }, []);

  const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  const fundingOp = sorted.find((op) => op.type === 'create_account' || op.type === 'payment');
  const fundingAmount = fundingOp ? parseFloat(fundingOp.starting_balance ?? fundingOp.amount ?? 0) : 0;

  let assetCode = '';
  for (const op of sorted) {
    if (op.asset_code) {
      assetCode = op.asset_code;
      break;
    }
  }
  if (!assetCode && firstOffer) {
    assetCode = firstOffer?.selling?.asset_code ?? '';
  }

  const flags = account?.flags ?? {};

  const counterparties = new Set(
    first24h.flatMap((op) =>
      ['to', 'from', 'account', 'trustor', 'into'].map((f) => op[f]).filter((v) => v && v !== pubkey),
    ),
  );

  const sortedOffers = [...offers].sort((a, b) => ts(a.last_modified_time) - ts(b.last_modified_time));
  const offerAmounts = sortedOffers.map((o) => parseFloat(o.amount ?? 0));
  const offerTimes = sortedOffers.map((o) => ts(o.last_modified_time));
  const offerTimeGaps = offerTimes.slice(1).map((t, i) => (t - offerTimes[i]) / 1000);

  const offersInFirstHour = sortedOffers.filter((o) =>
    firstOffer ? secsBetween(firstOffer.last_modified_time, o.last_modified_time) < 3600 : false,
  ).length;

  const cancelRelist = sortedOffers.length > 3 && offersInFirstHour > 2 ? 1 : 0;

  const hasMicroTx = sorted
    .slice(0, 15)
    .some((op) => op.type === 'payment' && parseFloat(op.amount ?? 0) < 0.1)
    ? 1
    : 0;

  const sortedTrades = [...trades].sort((a, b) => ts(a.ledger_close_time) - ts(b.ledger_close_time));
  const tradeAmounts = sortedTrades.map((t) => parseFloat(t.base_amount ?? 0));
  const tradeGaps = sortedTrades
    .slice(1)
    .map((t, i) => secsBetween(sortedTrades[i].ledger_close_time, t.ledger_close_time));

  const earlyBuyers = new Set(sortedTrades.map((t) => t.counter_account)).size;

  const raw = {
    // TIMING (8)
    f01_account_created_hour: firstDate.getUTCHours(),
    f02_account_created_dow: firstDate.getUTCDay(),
    f03_secs_to_second_op: gaps[0] ?? 0,
    f04_secs_to_token_issuance: secsBetween(first.created_at, tokenIssuanceOp.created_at),
    f05_token_issued_hour: new Date(tokenIssuanceOp.created_at).getUTCHours(),
    f06_secs_to_first_offer: firstOffer
      ? secsBetween(tokenIssuanceOp.created_at, firstOffer.last_modified_time)
      : 0,
    f07_avg_gap_first_10_ops: avgGap,
    f08_stddev_gap_first_10_ops: stddev(gaps),

    // FUNDING (6)
    f09_funding_source_type: fundingOp?.type === 'create_account' ? 1 : fundingOp ? 2 : 0,
    f10_initial_xlm_amount: fundingAmount,
    f11_xlm_buffer_above_minimum: Math.max(0, fundingAmount - 1.5),
    f12_ops_before_token: sorted.indexOf(tokenIssuanceOp),
    f13_has_micro_test_tx: hasMicroTx,
    f14_secs_funding_to_first_op: gaps[0] ?? 0,

    // ASSET CONFIG (8)
    f15_asset_code_length: assetCode.length,
    f16_asset_code_all_caps: assetCode && assetCode === assetCode.toUpperCase() ? 1 : 0,
    f17_asset_code_has_numbers: /\d/.test(assetCode) ? 1 : 0,
    f18_asset_code_entropy: entropy(assetCode),
    f19_flag_auth_required: flags.auth_required ? 1 : 0,
    f20_flag_auth_revocable: flags.auth_revocable ? 1 : 0,
    f21_flag_auth_clawback: flags.auth_clawback_enabled ? 1 : 0,
    f22_num_signers: account?.signers?.length ?? 1,

    // LIQUIDITY BEHAVIOR (8)
    f23_secs_to_first_offer: firstOffer ? secsBetween(first.created_at, firstOffer.last_modified_time) : 0,
    f24_first_offer_price: firstOffer ? parseFloat(firstOffer.price ?? 0) : 0,
    f25_first_offer_amount: offerAmounts[0] ?? 0,
    f26_offers_in_first_hour: offersInFirstHour,
    f27_offer_amount_stddev: stddev(offerAmounts),
    f28_cancel_relist_pattern: cancelRelist,
    f29_avg_secs_between_offers: offerTimeGaps.length
      ? offerTimeGaps.reduce((a, b) => a + b, 0) / offerTimeGaps.length
      : 0,
    f30_total_offers_placed: offers.length,

    // OPERATIONAL STYLE (10)
    f31_ops_in_first_24h: first24h.length,
    f32_unique_counterparties_24h: counterparties.size,
    f33_uses_path_payments: sorted.some((op) => op.type?.includes('path_payment')) ? 1 : 0,
    f34_uses_manage_data: sorted.some((op) => op.type === 'manage_data') ? 1 : 0,
    f35_total_ops_ever: sorted.length,
    f36_early_unique_buyers: earlyBuyers,
    f37_trade_amount_stddev: stddev(tradeAmounts),
    f38_avg_secs_between_trades: tradeGaps.length
      ? tradeGaps.reduce((a, b) => a + b, 0) / tradeGaps.length
      : 0,
    f39_ops_per_counterparty:
      counterparties.size > 0 ? first24h.length / counterparties.size : first24h.length,
    f40_offer_to_trade_ratio: trades.length > 0 ? offers.length / trades.length : offers.length,
  };

  const vector = Object.values(raw);
  return { vector, raw };
}

module.exports = { extractVector };
