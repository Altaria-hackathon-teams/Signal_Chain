"""Holder concentration scanner."""
from __future__ import annotations

from adapters.stellar_horizon import decimal, is_contract, is_native


def _balance_from_horizon_account(account: dict, asset: dict) -> float:
    for balance in account.get("balances", []):
        if (
            balance.get("asset_code") == asset.get("asset_code")
            and balance.get("asset_issuer") == asset.get("asset_issuer")
        ):
            return float(decimal(balance.get("balance")))
    return 0.0


def _holder_count(asset_info: dict) -> int:
    trustlines = asset_info.get("trustlines")
    if isinstance(trustlines, dict):
        return int(trustlines.get("funded") or trustlines.get("total") or 0)
    if isinstance(trustlines, list):
        padded = trustlines + [0, 0, 0]
        return int(padded[2] or padded[0] or 0)

    accounts = asset_info.get("accounts") or {}
    if isinstance(accounts, dict):
        return sum(int(v or 0) for v in accounts.values())
    return 0


def _gini(values: list[float]) -> float | None:
    positive = sorted(value for value in values if value > 0)
    if not positive:
        return None
    total = sum(positive)
    if total <= 0:
        return None
    weighted_sum = sum((index + 1) * value for index, value in enumerate(positive))
    n = len(positive)
    return (2 * weighted_sum) / (n * total) - (n + 1) / n


def scan_holders(asset: dict, asset_info: dict, horizon, expert=None) -> dict:
    if is_native(asset):
        return {
            "holder_count": None,
            "holder_count_known": False,
            "top1_pct": None,
            "top10_pct": None,
            "top_holders": [],
            "complete": False,
            "source": "N/A",
            "summary": "Native XLM holder concentration is not scored by this token-risk scanner.",
        }

    total_supply = decimal(asset_info.get("total_supply"))
    holder_count = _holder_count(asset_info)

    source = "Horizon sample"
    complete = False
    top_holders = []

    if expert:
        try:
            top_holders = expert.get_asset_holders(asset, limit=50)
            source = "StellarExpert top holders"
            complete = True
        except (ConnectionError, ValueError):
            top_holders = []

    if not top_holders and not is_contract(asset):
        accounts, complete = horizon.get_asset_holders(asset, max_records=1000)
        top_holders = [
            {"address": acct.get("account_id") or acct.get("id"), "balance": _balance_from_horizon_account(acct, asset)}
            for acct in accounts
        ]
        top_holders.sort(key=lambda item: item["balance"], reverse=True)

    excluded = {asset["asset_issuer"].lower()} if asset.get("asset_issuer") else set()
    filtered = [
        h for h in top_holders
        if h.get("address") and h["address"].lower() not in excluded and h.get("balance", 0) > 0
    ]

    top10_balance = sum(decimal(h.get("balance")) for h in filtered[:10])
    top1_balance = decimal(filtered[0].get("balance")) if filtered else decimal(0)
    concentration_available = source == "StellarExpert top holders" or complete
    balances = [float(decimal(h.get("balance"))) for h in filtered]

    if concentration_available and total_supply > 0:
        top1_pct = float((top1_balance / total_supply) * 100)
        top10_pct = float((top10_balance / total_supply) * 100)
        shares = [float((decimal(balance) / total_supply) * 100) for balance in balances]
    else:
        top1_pct = None
        top10_pct = None
        shares = []

    hhi = sum(share * share for share in shares)
    gini = _gini(balances)
    whale_count_5pct = sum(1 for share in shares if share >= 5)

    return {
        "holder_count": holder_count,
        "holder_count_known": holder_count > 0,
        "top1_pct": round(top1_pct, 2) if top1_pct is not None else None,
        "top10_pct": round(top10_pct, 2) if top10_pct is not None else None,
        "sample_top1_pct": round(float((top1_balance / total_supply) * 100), 2) if total_supply > 0 else None,
        "sample_top10_pct": round(float((top10_balance / total_supply) * 100), 2) if total_supply > 0 else None,
        "hhi": round(hhi, 2) if shares else None,
        "gini": round(gini, 4) if gini is not None else None,
        "whale_count_5pct": whale_count_5pct if shares else None,
        "top_holders": filtered[:10],
        "complete": complete,
        "source": source,
        "summary": (
            "Issuer account is excluded from concentration calculations."
            if concentration_available
            else "Horizon sample is not sorted by balance; top-holder concentration is not scored."
        ),
    }
