const HORIZON_URL = 'https://horizon-testnet.stellar.org';

function assetTypeForCode(assetCode) {
  return assetCode.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
}

function assetParams(prefix, assetCode, issuerAddress) {
  return {
    [`${prefix}_asset_type`]: assetTypeForCode(assetCode),
    [`${prefix}_asset_code`]: assetCode,
    [`${prefix}_asset_issuer`]: issuerAddress,
  };
}

async function horizonGet(path, params = {}) {
  const url = new URL(path, HORIZON_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Horizon request failed: ${response.status}`);
  }
  return response.json();
}

function records(data) {
  return data?._embedded?.records || data?.records || [];
}

export async function loadIssuerData(issuerAddress) {
  const account = await horizonGet(`/accounts/${issuerAddress}`);

  let accountAgeDays = 0;
  let firstOpTime = null;
  try {
    const ops = await horizonGet(`/accounts/${issuerAddress}/operations`, { order: 'asc', limit: 1 });
    const firstOp = records(ops)[0];
    if (firstOp?.created_at) {
      firstOpTime = firstOp.created_at;
      accountAgeDays = Math.floor((Date.now() - new Date(firstOp.created_at).getTime()) / 86400000);
    }
  } catch {
    const modified = new Date(account.last_modified_time);
    accountAgeDays = Math.floor((Date.now() - modified.getTime()) / 86400000);
    firstOpTime = account.last_modified_time;
  }

  return {
    id: account.id,
    accountAgeDays,
    createdAt: firstOpTime,
    flags: {
      auth_required: account.flags?.auth_required || false,
      auth_revocable: account.flags?.auth_revocable || false,
      auth_clawback_enabled: account.flags?.auth_clawback_enabled || false,
    },
    balances: account.balances,
    xlmBalance: account.balances.find(b => b.asset_type === 'native')?.balance || '0',
  };
}

export async function loadAssetData(issuerAddress) {
  const response = await horizonGet('/assets', { asset_issuer: issuerAddress });
  return records(response);
}

export async function loadTopHolders(assetCode, issuerAddress, limit = 20) {
  try {
    const response = await horizonGet('/accounts', {
      asset: `${assetCode}:${issuerAddress}`,
      limit,
    });
    return records(response)
      .map((acc) => {
        const bal = acc.balances.find(
          (b) => b.asset_issuer === issuerAddress && b.asset_code === assetCode
        );
        return { address: acc.id, balance: parseFloat(bal?.balance || 0) };
      })
      .filter((h) => h.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  } catch {
    return [];
  }
}

export async function loadRecentTrades(assetCode, issuerAddress, limit = 100) {
  try {
    const baseSide = await horizonGet('/trades', {
      ...assetParams('base', assetCode, issuerAddress),
      counter_asset_type: 'native',
      order: 'desc',
      limit,
    });
    const counterSide = await horizonGet('/trades', {
      base_asset_type: 'native',
      ...assetParams('counter', assetCode, issuerAddress),
      order: 'desc',
      limit,
    });
    const seen = new Set();
    return [...records(baseSide), ...records(counterSide)]
      .filter((trade) => {
        const key = trade.id || trade.paging_token;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.ledger_close_time) - new Date(a.ledger_close_time))
      .slice(0, limit);
  } catch {
    return [];
  }
}

// Order book — bid/ask depth and spread analysis
export async function loadOrderBook(assetCode, issuerAddress) {
  try {
    const book = await horizonGet('/order_book', {
      ...assetParams('selling', assetCode, issuerAddress),
      buying_asset_type: 'native',
    });
    const bids = book.bids || [];
    const asks = book.asks || [];

    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;

    // Spread as % of mid price
    let spreadPercent = 100;
    if (bestBid > 0 && bestAsk > 0) {
      const mid = (bestBid + bestAsk) / 2;
      spreadPercent = ((bestAsk - bestBid) / mid) * 100;
    } else if (bestBid > 0 || bestAsk > 0) {
      spreadPercent = 100; // one side empty = infinite spread conceptually
    }

    // Liquidity depth: total XLM across top 5 bids
    const bidDepthXLM = bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.amount) * parseFloat(b.price), 0);
    const askDepthXLM = asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.amount) * parseFloat(a.price), 0);

    return {
      bids,
      asks,
      bidCount: bids.length,
      askCount: asks.length,
      bestBidPrice: bestBid,
      bestAskPrice: bestAsk,
      spreadPercent,
      bidDepthXLM,
      askDepthXLM,
    };
  } catch {
    return {
      bids: [], asks: [],
      bidCount: 0, askCount: 0,
      bestBidPrice: 0, bestAskPrice: 0,
      spreadPercent: 100,
      bidDepthXLM: 0, askDepthXLM: 0,
    };
  }
}

// Trade aggregations — OHLCV price history for chart
export async function loadTradeAggregations(assetCode, issuerAddress, days = 30) {
  try {
    const endTime = Date.now();
    const startTime = endTime - days * 86400000;
    // Daily resolution for ≤30 days, hourly for ≤7 days
    const resolution = days <= 7 ? 3600000 : 86400000;

    const response = await horizonGet('/trade_aggregations', {
      ...assetParams('base', assetCode, issuerAddress),
      counter_asset_type: 'native',
      start_time: startTime,
      end_time: endTime,
      resolution,
      offset: 0,
      limit: 200,
    });
    return records(response);
  } catch {
    return [];
  }
}

// Who funded the issuer account, and how many other issuers they've created
export async function loadCreatorInfo(issuerAddress) {
  try {
    const ops = await horizonGet(`/accounts/${issuerAddress}/operations`, { order: 'asc', limit: 1 });
    const createOp = records(ops)[0];
    if (!createOp || createOp.type !== 'create_account') return null;

    const creatorAddress = createOp.funder;

    // Count how many accounts the creator recently funded/created
    const creatorOps = await horizonGet(`/accounts/${creatorAddress}/operations`, { order: 'desc', limit: 100 });

    const cutoff = new Date(Date.now() - 30 * 86400000);
    const recentCreations = records(creatorOps).filter(
      op => op.type === 'create_account' && new Date(op.created_at) > cutoff
    );

    return {
      creatorAddress,
      recentIssuances: recentCreations.length,
      isSerial: recentCreations.length > 5,
    };
  } catch {
    return null;
  }
}

// Wash trading analysis — detect accounts that appear on both sides of trades
export function analyzeWashTrading(trades, assetCode, issuerAddress) {
  if (!trades || trades.length < 3) {
    return { washTradingScore: 0, washAccountCount: 0, uniqueParticipants: 0 };
  }

  const buyers = new Set();
  const sellers = new Set();

  for (const trade of trades) {
    const assetIsBase =
      trade.base_asset_issuer === issuerAddress && trade.base_asset_code === assetCode;

    if (assetIsBase) {
      // base_account sold the asset (received XLM)
      if (trade.base_account) sellers.add(trade.base_account);
      if (trade.counter_account) buyers.add(trade.counter_account);
    } else {
      // counter_account sold the asset
      if (trade.counter_account) sellers.add(trade.counter_account);
      if (trade.base_account) buyers.add(trade.base_account);
    }
  }

  const bothSides = [...sellers].filter(a => buyers.has(a));
  const uniqueParticipants = new Set([...buyers, ...sellers]).size;
  const washTradingScore = uniqueParticipants > 0
    ? bothSides.length / uniqueParticipants
    : 0;

  return {
    washTradingScore: Math.round(washTradingScore * 100) / 100,
    washAccountCount: bothSides.length,
    uniqueParticipants,
  };
}

// Price volatility — coefficient of variation of close prices
export function calcPriceVolatility(aggregations) {
  if (!aggregations || aggregations.length < 3) return 0;
  const prices = aggregations.map(a => parseFloat(a.close)).filter(p => p > 0);
  if (prices.length < 3) return 0;
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (mean === 0) return 0;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return Math.round((Math.sqrt(variance) / mean) * 100) / 100;
}

export async function checkWalletTxHistory(walletAddress, assetCode, issuerAddress) {
  try {
    const payments = await horizonGet(`/accounts/${walletAddress}/payments`, { limit: 200 });
    const relevant = records(payments).filter(
      (p) => p.asset_issuer === issuerAddress && p.asset_code === assetCode
    );
    const txAmount = relevant.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    let hasTrustline = false;
    try {
      const account = await horizonGet(`/accounts/${walletAddress}`);
      hasTrustline = account.balances.some(
        (b) => b.asset_issuer === issuerAddress && b.asset_code === assetCode
      );
    } catch {
      hasTrustline = false;
    }

    return {
      hasTxHistory: relevant.length > 0 || hasTrustline,
      txCount: relevant.length,
      txAmount,
      hasTrustline,
    };
  } catch {
    return { hasTxHistory: false, txCount: 0, txAmount: 0, hasTrustline: false };
  }
}
