"""Honeypot-equivalent scanner for Stellar markets."""
from __future__ import annotations

from adapters.stellar_horizon import decimal, is_contract, is_native, parse_asset


def scan_honeypot(asset: dict, horizon, liquidity: dict, asset_info: dict | None = None) -> dict:
    if is_native(asset):
        return {
            "honeypot": False,
            "soft_honeypot": False,
            "sell_path_exists": True,
            "best_path_xlm": None,
            "best_bid_xlm": None,
            "slippage_pct": 0.0,
            "summary": "XLM is native and directly liquid.",
        }

    if is_contract(asset):
        rating = (asset_info or {}).get("rating") or {}
        expert_liquidity = rating.get("liquidity")
        trades = int((asset_info or {}).get("trades") or 0)
        has_exit_signal = bool((expert_liquidity or 0) > 0 or trades > 0)
        return {
            "honeypot": False,
            "soft_honeypot": False,
            "sell_path_exists": has_exit_signal,
            "best_path_xlm": None,
            "best_bid_xlm": None,
            "slippage_pct": 0.0,
            "market_unverified": True,
            "expert_liquidity_score": expert_liquidity,
            "expert_trades": trades,
            "summary": (
                "StellarExpert shows contract-token liquidity/trading activity"
                if has_exit_signal
                else "No StellarExpert liquidity or trading exit signal found for this contract token"
            ),
        }

    paths = horizon.get_payment_paths(asset, parse_asset("XLM"), "1")
    order_book = liquidity.get("order_book", {})
    bids = order_book.get("bids", [])

    best_path_xlm = float(decimal(paths[0].get("destination_amount"))) if paths else 0.0
    best_bid_xlm = float(decimal(bids[0].get("price"))) if bids else 0.0
    has_market = bool(paths) or bool(bids) or bool(liquidity.get("liquidity_pools"))

    slippage_pct = 0.0
    if best_path_xlm > 0 and best_bid_xlm > 0:
        slippage_pct = max(0.0, (1 - (best_path_xlm / best_bid_xlm)) * 100)

    honeypot = not has_market
    soft_honeypot = not honeypot and slippage_pct > 30

    return {
        "honeypot": honeypot,
        "soft_honeypot": soft_honeypot,
        "sell_path_exists": bool(paths),
        "best_path_xlm": round(best_path_xlm, 7),
        "best_bid_xlm": round(best_bid_xlm, 7),
        "slippage_pct": round(slippage_pct, 2),
        "summary": (
            "No TOKEN->XLM path, bids, or AMM pool found"
            if honeypot
            else "TOKEN->XLM sell route is available"
        ),
    }
