// Shared asset-analysis pipeline. PreCheck, Compare and Analyze all use this
// so they hit the Stellar token-safety scanner with identical inputs.
import { scanIssuer } from './api';
import { buildRiskView } from './risk';

export async function runAnalysis(issuerAddress) {
  const payload = await scanIssuer(issuerAddress);

  const asset = payload.asset || {};
  const scan = payload.scan || {};
  const assetInfo = scan.asset_info || {};
  const authority = scan.authority || {};
  const liquidity = scan.liquidity || {};
  const holders = scan.holders || {};
  const trades = scan.trades || {};
  const age = scan.age || {};
  const expert = scan.expert || {};

  const risk = buildRiskView(payload);

  const code = asset.asset_code || '';
  const issuerAccount = scan.issuer_account || {};
  const xlmBalance =
    (issuerAccount.balances || []).find((b) => b.asset_type === 'native')?.balance || '0';

  const numAccounts = (() => {
    const t = assetInfo.trustlines;
    if (t && typeof t === 'object') return t.funded || t.total || 0;
    return holders.holder_count || 0;
  })();

  const orderBook = liquidity.order_book || {};
  const bids = orderBook.bids || [];
  const asks = orderBook.asks || [];
  const bestBid = bids[0] ? parseFloat(bids[0].price) : 0;
  const bestAsk = asks[0] ? parseFloat(asks[0].price) : 0;
  let spreadPercent = liquidity.spread_pct;
  if (spreadPercent === null || spreadPercent === undefined) {
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      spreadPercent = mid > 0 ? ((bestAsk - bestBid) / mid) * 100 : 100;
    } else {
      spreadPercent = 100;
    }
  }

  const signalsAsTitle = risk.signals.map((s) => ({
    ...s,
    title: s.flag,
  }));

  const score = {
    score: risk.score,
    rating: risk.rating,
    verdict: risk.rating,
    verdictColor: risk.verdictColor,
    confidence: risk.model.confidencePct,
    riskProbability: risk.model.riskProbabilityPct,
    signals: signalsAsTitle,
    signalCounts: risk.counts,
    flags: risk.flags,
    categoryScores: risk.categoryScores,
    model: risk.model,
    deductions: risk.deductions,
    baseScore: risk.baseScore,
  };

  return {
    payload,
    risk,
    issuerAddress,
    assetCode: code,
    asset,
    assetRecord: {
      asset_code: code,
      asset_issuer: asset.asset_issuer,
      asset_type: asset.asset_type,
      amount: assetInfo.total_supply || '0',
      num_accounts: numAccounts,
    },
    issuer: {
      id: issuerAccount.account_id,
      accountAgeDays: age.age_days != null ? Math.floor(age.age_days) : null,
      createdAt: age.created_at || null,
      flags: authority.flags || {},
      xlmBalance,
      thresholds: authority.thresholds || {},
      signers: authority.signers || [],
      homeDomain: authority.home_domain,
      issuerLocked: !!authority.issuer_locked,
    },
    holders: (holders.top_holders || []).map((h) => ({
      address: h.address,
      balance: parseFloat(h.balance || 0),
    })),
    holderCount: holders.holder_count || 0,
    holderStats: {
      top1Pct: holders.top1_pct,
      top10Pct: holders.top10_pct,
      hhi: holders.hhi,
      gini: holders.gini,
      whaleCount: holders.whale_count_5pct,
    },
    orderBook: {
      bids,
      asks,
      bidCount: bids.length,
      askCount: asks.length,
      bestBidPrice: bestBid,
      bestAskPrice: bestAsk,
      spreadPercent,
    },
    liquidity: {
      totalLiquidityUsd: liquidity.total_liquidity_usd ?? 0,
      totalLiquidityXlm: liquidity.total_liquidity_xlm ?? 0,
      ammLiquidityXlm: liquidity.amm_liquidity_xlm ?? 0,
      sdexBidDepthXlm: liquidity.sdex_bid_depth_xlm ?? 0,
      poolCount: liquidity.pool_count ?? 0,
      pools: liquidity.liquidity_pools || [],
      priceSource: liquidity.price_source,
      xlmUsd: liquidity.xlm_usd,
    },
    honeypot: scan.honeypot || {},
    trades: {
      tradeCount: trades.trade_count ?? 0,
      paymentCount: trades.payment_count ?? 0,
      uniqueCounterparties: trades.unique_counterparties ?? 0,
      washTrading: !!trades.wash_trading,
      recent: trades.recent_trades || [],
      summary: trades.summary,
    },
    wash: {
      washTradingScore: trades.wash_trading ? 0.5 : 0,
      washAccountCount: 0,
      uniqueParticipants: trades.unique_counterparties ?? 0,
    },
    age: {
      ageDays: age.age_days,
      newToken: !!age.new_token,
      veryNew: !!age.very_new,
      newnessBand: age.newness_band,
      createdAt: age.created_at,
      timestampConfidence: age.timestamp_confidence,
      airdropPattern: !!age.airdrop_pattern,
      summary: age.summary,
      source: age.source,
    },
    expertRating: expert.rating || null,
    dataQuality: scan.data_quality || {},
    dataSources: scan.data_sources || {},
    issuerLookup: scan.issuer_lookup || {},
    network: payload.network,
    cache: payload.cache,
    volatility: 0,
    score,
  };
}
