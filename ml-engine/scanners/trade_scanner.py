"""Trading activity and wash-trading heuristics."""
from __future__ import annotations

from statistics import pstdev

from adapters.stellar_horizon import decimal, is_contract, is_native


def scan_trades(asset: dict, horizon, asset_info: dict | None = None) -> dict:
    if is_native(asset):
        return {
            "trade_count": None,
            "unique_counterparties": None,
            "payment_count": None,
            "wash_trading": False,
            "recent_trades": [],
            "summary": "Native XLM is the market counter asset.",
        }

    if is_contract(asset):
        return {
            "trade_count": int((asset_info or {}).get("trades") or 0),
            "unique_counterparties": None,
            "payment_count": int((asset_info or {}).get("payments") or 0),
            "wash_trading": False,
            "recent_trades": [],
            "source": (asset_info or {}).get("source", "StellarExpert"),
            "summary": "Contract-token activity uses StellarExpert aggregate counts.",
        }

    trades = horizon.get_recent_trades(asset, limit=100)
    accounts = set()
    sizes = []

    for trade in trades:
        for key in ("base_account", "counter_account"):
            account = trade.get(key)
            if account:
                accounts.add(account)
        sizes.append(float(decimal(trade.get("base_amount"))))

    rounded_sizes = {round(size, 2) for size in sizes if size > 0}
    size_variance = pstdev(sizes) if len(sizes) > 1 else 0.0
    wash_trading = len(trades) >= 10 and len(accounts) <= 3 and len(rounded_sizes) <= 2

    return {
        "trade_count": len(trades),
        "unique_counterparties": len(accounts),
        "payment_count": int((asset_info or {}).get("payments") or 0) if asset_info else None,
        "size_variance": round(size_variance, 7),
        "wash_trading": wash_trading,
        "recent_trades": trades[:10],
        "summary": "Recent TOKEN/XLM trades from Horizon.",
    }
