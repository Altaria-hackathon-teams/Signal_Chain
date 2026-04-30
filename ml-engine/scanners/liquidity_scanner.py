"""SDEX order-book and Stellar AMM liquidity scanner."""
from __future__ import annotations

from adapters.stellar_horizon import decimal, is_contract, is_native


def _bid_xlm_value(bid: dict) -> float:
    amount = decimal(bid.get("amount"))
    price = decimal(bid.get("price"))
    return float(amount * price)


def _pool_native_reserve(pool: dict) -> float:
    for reserve in pool.get("reserves", []):
        if reserve.get("asset") == "native":
            return float(decimal(reserve.get("amount")))
    return 0.0


def _best_price(order_book: dict, side: str) -> float | None:
    offers = order_book.get(side) or []
    if not offers:
        return None
    price = decimal(offers[0].get("price"))
    return float(price) if price > 0 else None


def _spread_pct(order_book: dict) -> float | None:
    best_bid = _best_price(order_book, "bids")
    best_ask = _best_price(order_book, "asks")
    if best_bid is None or best_ask is None or best_bid <= 0 or best_ask <= 0:
        return None
    midpoint = (best_bid + best_ask) / 2
    if midpoint <= 0:
        return None
    return max(0.0, ((best_ask - best_bid) / midpoint) * 100)


def scan_liquidity(asset: dict, horizon, asset_info: dict | None = None) -> dict:
    xlm_usd, price_source = horizon.get_xlm_usd_rate()

    if is_native(asset):
        return {
            "sdex_bid_depth_xlm": None,
            "amm_liquidity_xlm": None,
            "total_liquidity_xlm": None,
            "total_liquidity_usd": None,
            "xlm_usd": xlm_usd,
            "price_source": price_source,
            "order_book": {"bids": [], "asks": []},
            "liquidity_pools": [],
            "summary": "Native XLM is the counter asset for liquidity checks.",
        }

    if is_contract(asset):
        rating = (asset_info or {}).get("rating") or {}
        return {
            "sdex_bid_depth_xlm": None,
            "amm_liquidity_xlm": None,
            "total_liquidity_xlm": None,
            "total_liquidity_usd": None,
            "xlm_usd": xlm_usd,
            "price_source": price_source,
            "order_book": {"bids": [], "asks": []},
            "liquidity_pools": [],
            "expert_liquidity_score": rating.get("liquidity"),
            "expert_volume7d_score": rating.get("volume7d"),
            "summary": "Contract-token liquidity is scored from StellarExpert aggregate ratings.",
        }

    order_book = horizon.get_order_book(asset, limit=10)
    pools = horizon.get_liquidity_pools(asset, limit=10)
    spread_pct = _spread_pct(order_book)

    sdex_bid_depth_xlm = sum(_bid_xlm_value(bid) for bid in order_book.get("bids", [])[:10])
    # Pool value is both sides of a token/XLM pool, represented in XLM terms.
    amm_liquidity_xlm = sum(_pool_native_reserve(pool) * 2 for pool in pools)
    total_liquidity_xlm = sdex_bid_depth_xlm + amm_liquidity_xlm

    return {
        "sdex_bid_depth_xlm": round(sdex_bid_depth_xlm, 7),
        "amm_liquidity_xlm": round(amm_liquidity_xlm, 7),
        "total_liquidity_xlm": round(total_liquidity_xlm, 7),
        "total_liquidity_usd": round(total_liquidity_xlm * xlm_usd, 2),
        "xlm_usd": xlm_usd,
        "price_source": price_source,
        "best_bid_xlm": _best_price(order_book, "bids"),
        "best_ask_xlm": _best_price(order_book, "asks"),
        "spread_pct": round(spread_pct, 2) if spread_pct is not None else None,
        "pool_count": len(pools),
        "order_book": order_book,
        "liquidity_pools": pools,
        "summary": "Liquidity combines top-10 SDEX bids and XLM-paired AMM reserves.",
    }
