// Gemini-powered AI helpers.
//   summarizeAnalysis() — short structured human-readable verdict for a scan
//   webSearchInvestigation() — uses Google Search grounding to look up the
//     issuer / asset across the public web and returns an independent verdict
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _ai = null;
function client() {
  if (_ai) return _ai;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add it to backend/.env (get a key at https://aistudio.google.com/apikey).',
    );
  }
  _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Slim a scan payload down to a compact JSON-friendly form for the model.
function distillScan(scan = {}, address) {
  const asset_info  = scan.asset_info  || {};
  const authority   = scan.authority   || {};
  const liquidity   = scan.liquidity   || {};
  const holders     = scan.holders     || {};
  const trades      = scan.trades      || {};
  const age         = scan.age         || {};
  const honeypot    = scan.honeypot    || {};
  const expert      = scan.expert      || {};

  return {
    issuer: address,
    asset_code: asset_info.asset_code || asset_info.code,
    total_supply: asset_info.total_supply,
    trustlines: asset_info.trustlines,
    holders: {
      count: holders.holder_count,
      top1_pct: holders.top1_pct,
      top10_pct: holders.top10_pct,
      whale_count_5pct: holders.whale_count_5pct,
      gini: holders.gini,
    },
    authority: {
      flags: authority.flags,
      home_domain: authority.home_domain,
      issuer_locked: authority.issuer_locked,
    },
    liquidity: {
      total_liquidity_usd: liquidity.total_liquidity_usd,
      pool_count: liquidity.pool_count,
      sdex_bid_depth_xlm: liquidity.sdex_bid_depth_xlm,
      spread_pct: liquidity.spread_pct,
    },
    trades: {
      trade_count: trades.trade_count,
      payment_count: trades.payment_count,
      unique_counterparties: trades.unique_counterparties,
      wash_trading: trades.wash_trading,
    },
    age: {
      age_days: age.age_days,
      newness_band: age.newness_band,
      airdrop_pattern: age.airdrop_pattern,
    },
    honeypot: {
      verdict: honeypot.verdict,
      reasons: honeypot.reasons,
    },
    expert_rating: expert?.rating,
  };
}

// Pull the first JSON object/array out of a model response that may include
// prose or ```json fences.
function extractJson(text) {
  if (!text) return null;
  // Strip ```json ... ``` fence first
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  // Find the first { or [ and the matching last } or ]
  const startObj = candidate.indexOf('{');
  const startArr = candidate.indexOf('[');
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);
  if (start === -1) return null;
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);
  if (end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Summary — reasoned plain-English verdict for the existing scan
// ────────────────────────────────────────────────────────────────────
async function summarizeAnalysis({ address, scan, riskScore }) {
  const distilled = distillScan(scan, address);

  const systemInstruction = `You are TrustProof's analyst. Given a Stellar token scan, you must
return a JSON object with these fields:
  "headline": 1 sentence verdict, max 120 chars.
  "summary": 2-3 sentence paragraph in plain English explaining the score.
  "strengths": array of 0-4 short positive findings (objects: {title, detail}).
  "concerns":  array of 0-5 short negative findings (objects: {title, detail, severity in CRITICAL|HIGH|MEDIUM|LOW}).
  "recommendation": one of "AVOID", "RISKY", "WATCH", "OK".
  "rationale": 1-2 sentences justifying the recommendation.
Use numeric facts from the input. Never invent data not present in the input.`;

  const prompt = `TrustProof score: ${riskScore ?? 'unknown'}/100
Scan data (JSON):
${JSON.stringify(distilled, null, 2)}

Reply with the JSON object only.`;

  const response = await client().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text || '';
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error('Gemini returned an unparseable summary response.');
  }
  return { ...parsed, model: MODEL };
}

// ────────────────────────────────────────────────────────────────────
// Web search investigation — uses Google Search grounding
// ────────────────────────────────────────────────────────────────────
async function webSearchInvestigation({ address, assetCode, scan, reviews }) {
  const distilled = distillScan(scan, address);
  const reviewSummary = (reviews || []).slice(0, 25).map((r) => ({
    rating: r.rating,
    text: r.review_text,
    trust_weight: r.trust_weight,
  }));

  const systemInstruction = `You are TrustProof's open-source intelligence analyst. You investigate a
Stellar token by combining (a) the on-chain scan we already have, (b) the user-submitted reviews,
and (c) live Google Search results that you must perform yourself.

Search the public web for:
- The issuer address itself (Stellar issuer / Stellar.expert hits).
- The asset code on Stellar (forums, twitter, reddit, news).
- Any team / domain / project name that turns up.
- Mentions of scams, rug pulls, or honeypots involving these identifiers.

Then write your final answer as a JSON object with these fields, and these only:
  "executive_summary":    2-3 sentence verdict using the strongest evidence found.
  "verdict":              one of "TRUSTED", "MIXED", "SUSPICIOUS", "DANGEROUS".
  "score":                integer 0-100 (your independent score, not the on-chain score).
  "score_label":          short label, e.g. "high confidence", "weak evidence".
  "review_sentiment": {
      "label":   one of "POSITIVE", "MIXED", "NEGATIVE", "NONE".
      "score":   integer 0-100 (positive sentiment percentage).
      "summary": 1-2 sentences describing the review tone, themes, red flags.
  },
  "web_findings": array (max 6) of objects:
      { "title": "...", "snippet": "...", "source": "...", "url": "...",
        "stance": "POSITIVE|NEGATIVE|NEUTRAL", "weight": "HIGH|MEDIUM|LOW" }.
  "red_flags":  array (max 5) of {title, detail}.
  "green_flags":array (max 4) of {title, detail}.
  "recommendation": 1 sentence, plain English.
  "confidence": integer 0-100 (how confident the verdict is given the evidence).

Never fabricate URLs. If a claim isn't supported by a search result, omit it.`;

  const prompt = `Asset code: ${assetCode || '(unknown)'}
Issuer address: ${address}

On-chain scan summary:
${JSON.stringify(distilled, null, 2)}

User reviews from our DApp (first 25):
${JSON.stringify(reviewSummary, null, 2)}

Run the web searches now, then return a single JSON object as specified. JSON only — no prose.`;

  const response = await client().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.4,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || '';
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error('Gemini websearch returned an unparseable response.');
  }

  // Surface grounding metadata (the actual sources Gemini consulted).
  const grounding =
    response.candidates?.[0]?.groundingMetadata ||
    response.candidates?.[0]?.grounding_metadata ||
    null;

  const sources = [];
  if (grounding?.groundingChunks) {
    for (const chunk of grounding.groundingChunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri,
        });
      }
    }
  }
  const queries = grounding?.webSearchQueries || grounding?.web_search_queries || [];

  return {
    ...parsed,
    sources,
    search_queries: queries,
    model: MODEL,
  };
}

module.exports = { summarizeAnalysis, webSearchInvestigation, isConfigured };
