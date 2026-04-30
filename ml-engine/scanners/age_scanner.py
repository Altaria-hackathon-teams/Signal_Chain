"""Asset age and airdrop-pattern scanner."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from adapters.stellar_horizon import is_contract, is_native


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _parse_expert_timestamp(value) -> datetime | None:
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return None
    if timestamp <= 0:
        return None
    return datetime.fromtimestamp(timestamp, timezone.utc)


def _newness_profile(age_days: float | None, source: str | None) -> dict:
    if age_days is None:
        return {
            "band": "unknown",
            "risk_points": 35,
            "source_confidence": 0.0,
            "evidence": "No verifiable creation timestamp was available.",
        }

    if age_days < 1 / 24:
        band = "first_hour"
        risk_points = 95
    elif age_days < 1:
        band = "first_day"
        risk_points = 85
    elif age_days < 7:
        band = "first_week"
        risk_points = 65
    elif age_days < 30:
        band = "first_month"
        risk_points = 35
    else:
        band = "established"
        risk_points = 10

    confidence = 0.95 if source == "StellarExpert asset created timestamp" else 0.6
    return {
        "band": band,
        "risk_points": risk_points,
        "source_confidence": confidence,
        "evidence": f"Age is based on {source}.",
    }


def scan_age(asset: dict, horizon, asset_info: dict | None = None) -> dict:
    if is_native(asset):
        return {
            "created_at": None,
            "age_days": None,
            "very_new": False,
            "new_token": False,
            "airdrop_pattern": False,
            "summary": "XLM is the native Stellar asset.",
        }

    source = None
    created_at = _parse_expert_timestamp((asset_info or {}).get("created"))
    if created_at:
        source = "StellarExpert asset created timestamp"
    elif not is_contract(asset):
        txs = horizon.get_issuer_transactions(asset, limit=1, order="asc")
        created_at = _parse_time(txs[0].get("created_at")) if txs else None
        source = "issuer account first transaction" if created_at else None

    age_days = None
    very_new = False
    new_token = False
    if created_at:
        delta = datetime.now(timezone.utc) - created_at
        age_days = delta.total_seconds() / 86400
        very_new = age_days < 1
        new_token = age_days < 7
    profile = _newness_profile(age_days, source)

    operations = [] if is_contract(asset) else horizon.get_issuer_operations(asset, limit=200, order="desc")
    transfer_ops = [
        op for op in operations
        if op.get("asset_code") == asset.get("asset_code")
        and op.get("asset_issuer") == asset.get("asset_issuer")
        and op.get("type") in {"payment", "path_payment_strict_send", "path_payment_strict_receive"}
    ]
    per_tx = Counter(op.get("transaction_hash") for op in transfer_ops if op.get("transaction_hash"))
    airdrop_pattern = bool(per_tx and max(per_tx.values()) >= 50)

    return {
        "created_at": created_at.isoformat() if created_at else None,
        "age_days": round(age_days, 2) if age_days is not None else None,
        "very_new": very_new,
        "new_token": new_token,
        "newness_band": profile["band"],
        "new_token_risk_points": profile["risk_points"],
        "timestamp_confidence": profile["source_confidence"],
        "timestamp_evidence": profile["evidence"],
        "airdrop_pattern": airdrop_pattern,
        "recent_issuer_transfer_ops": len(transfer_ops),
        "source": source,
        "summary": (
            f"Age is estimated from {source}."
            if source
            else "Age could not be verified from the available sources."
        ),
    }
