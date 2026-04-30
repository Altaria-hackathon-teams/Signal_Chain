"""Core scanner service used by the Flask API."""
from __future__ import annotations

import math

from adapters.stellar_expert import (
    StellarExpertClient,
    StellarExpertNotFound,
    enrich_asset_from_expert,
    normalize_expert_asset_info,
    normalize_trustlines,
)
from adapters.stellar_horizon import HorizonClient, is_contract, normalize_issuer, normalize_network, parse_asset
from analyzer.risk_engine import score_scan
from scanners.age_scanner import scan_age
from scanners.authority_scanner import scan_authority
from scanners.holder_scanner import scan_holders
from scanners.honeypot_scanner import scan_honeypot
from scanners.liquidity_scanner import scan_liquidity
from scanners.supply_scanner import scan_supply
from scanners.trade_scanner import scan_trades

DEFAULT_NETWORK = "testnet"
MAX_ISSUER_CANDIDATES = 200


def _asset_key(asset: dict) -> str:
    if is_contract(asset):
        return asset["contract_id"]
    return f"{asset['asset_code']}-{asset['asset_issuer']}"


def _asset_key_from_horizon_record(record: dict) -> str:
    return f"{record.get('asset_code')}-{record.get('asset_issuer')}"


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _log_score(value: int | float, scale: int | float) -> float:
    if value <= 0:
        return 0.0
    return min(1.0, math.log10(value + 1) / math.log10(scale + 1))


def _candidate_score(record: dict, horizon_records: dict) -> tuple[float, list[str]]:
    rating = record.get("rating") or {}
    trustlines = normalize_trustlines(record.get("trustlines"))
    funded = trustlines["funded"]
    payments = _safe_int(record.get("payments"))
    trades = _safe_int(record.get("trades"))
    supply = _safe_int(record.get("supply"))

    asset = parse_asset(record["asset"])
    horizon_verified = _asset_key(asset) in horizon_records
    score = 0.0
    score += float(rating.get("average") or 0) * 5.0
    score += float(rating.get("liquidity") or 0) * 1.5
    score += float(rating.get("activity") or 0) * 1.0
    score += _log_score(funded, 100000) * 15.0
    score += _log_score(payments, 1000000) * 12.0
    score += _log_score(trades, 100000) * 8.0
    score += 15.0 if horizon_verified else 0.0
    score += 5.0 if supply > 0 else 0.0

    reasons = []
    if horizon_verified:
        reasons.append("Horizon issuer match")
    if rating.get("average") is not None:
        reasons.append(f"StellarExpert rating {rating.get('average')}/10")
    if funded:
        reasons.append(f"{funded:,} funded holders")
    if payments:
        reasons.append(f"{payments:,} payments")
    if trades:
        reasons.append(f"{trades:,} trades")
    return round(min(score, 100.0), 2), reasons


def _candidate_from_expert_record(record: dict, horizon_records: dict) -> dict:
    asset = parse_asset(record["asset"])
    score, reasons = _candidate_score(record, horizon_records)
    trustlines = normalize_trustlines(record.get("trustlines"))
    return {
        "asset": asset,
        "scan_input": record["asset"],
        "expert_asset": record["asset"],
        "source": "StellarExpert testnet asset list",
        "selection_score": score,
        "selection_reasons": reasons,
        "horizon_verified": _asset_key(asset) in horizon_records,
        "rating": (record.get("rating") or {}).get("average"),
        "liquidity_rating": (record.get("rating") or {}).get("liquidity"),
        "holders": trustlines["funded"],
        "payments": _safe_int(record.get("payments")),
        "trades": _safe_int(record.get("trades")),
    }


def _candidate_from_horizon_record(record: dict) -> dict:
    asset = parse_asset(f"{record['asset_code']}:{record['asset_issuer']}")
    holder_count = sum(_safe_int(v) for v in (record.get("accounts") or {}).values())
    score = round(35.0 + _log_score(holder_count, 100000) * 25.0, 2)
    return {
        "asset": asset,
        "scan_input": asset["canonical"],
        "expert_asset": None,
        "source": "Horizon issuer fallback",
        "selection_score": score,
        "selection_reasons": ["Horizon issuer match", f"{holder_count:,} Horizon trustlines"],
        "horizon_verified": True,
        "rating": None,
        "liquidity_rating": None,
        "holders": holder_count,
        "payments": None,
        "trades": None,
    }


def resolve_issuer_asset(issuer: str, network: str = DEFAULT_NETWORK) -> dict:
    network = normalize_network(network)
    issuer = normalize_issuer(issuer)
    expert = StellarExpertClient(network=network)
    horizon = HorizonClient(network=network)

    expert_records = expert.get_assets_by_issuer(issuer, limit=MAX_ISSUER_CANDIDATES)
    horizon_record_list = horizon.get_assets_by_issuer(issuer, limit=MAX_ISSUER_CANDIDATES)
    horizon_records = {_asset_key_from_horizon_record(record): record for record in horizon_record_list}

    candidates = [_candidate_from_expert_record(record, horizon_records) for record in expert_records]
    known_keys = {_asset_key(candidate["asset"]) for candidate in candidates}
    for record in horizon_record_list:
        if _asset_key_from_horizon_record(record) not in known_keys:
            candidates.append(_candidate_from_horizon_record(record))

    if not candidates:
        raise ValueError(f"No testnet StellarExpert/Horizon assets found for issuer {issuer}")

    candidates.sort(
        key=lambda item: (
            item["selection_score"],
            item.get("horizon_verified", False),
            item.get("holders") or 0,
            item.get("payments") or 0,
            item.get("trades") or 0,
        ),
        reverse=True,
    )

    return {
        "issuer": issuer,
        "network": network,
        "selected": candidates[0],
        "candidates": candidates,
        "candidate_count": len(candidates),
        "strategy": "StellarExpert search by issuer, Horizon issuer cross-check, evidence-weighted asset selection.",
    }


def _merge_asset_info(asset: dict, horizon_info: dict, expert_info: dict) -> dict:
    if is_contract(asset):
        return expert_info or horizon_info

    merged = dict(horizon_info)
    if expert_info:
        merged["expert"] = expert_info
        merged["expert_rating"] = expert_info.get("rating") or {}
        merged["expert_total_supply"] = expert_info.get("total_supply")
        merged["payments"] = expert_info.get("payments", merged.get("payments"))
        merged["trades"] = expert_info.get("trades", merged.get("trades"))
        if expert_info.get("created"):
            merged["created"] = expert_info["created"]
        if expert_info.get("trustlines") and not merged.get("trustlines"):
            merged["trustlines"] = expert_info["trustlines"]
    return merged


def _data_quality(network: str, asset: dict, asset_info: dict, expert_info: dict | None, horizon_error: str | None) -> dict:
    warnings = []
    if horizon_error:
        warnings.append(f"Horizon cross-check failed: {horizon_error}")
    if is_contract(asset):
        warnings.append("Contract-token admin/mint controls are not decoded from Wasm/source in this scanner.")
    if network == "testnet":
        warnings.append("Testnet values are not production market signals; treat liquidity and reputation as test-only.")
    if not expert_info:
        warnings.append("StellarExpert metadata was unavailable; holder/rating accuracy may be reduced.")

    return {
        "network": network,
        "horizon_verified": horizon_error is None and not is_contract(asset),
        "stellar_expert_verified": bool(expert_info),
        "warnings": warnings,
    }


def scan_asset(asset_input: str, use_stellar_expert: bool = True, network: str = DEFAULT_NETWORK) -> tuple[dict, dict]:
    network = normalize_network(network)
    asset = parse_asset(asset_input)
    horizon = HorizonClient(network=network)
    expert = StellarExpertClient(network=network) if use_stellar_expert else None

    expert_raw = None
    expert_info = {}
    if expert:
        try:
            expert_raw = expert.get_asset_detail(asset)
            asset = enrich_asset_from_expert(asset, expert_raw)
            expert_info = normalize_expert_asset_info(asset, expert_raw)
        except StellarExpertNotFound:
            expert_raw = None
        except ConnectionError:
            expert_raw = None

    horizon_error = None
    issuer_account = None
    asset_info = {}
    try:
        asset_info = horizon.get_asset_info(asset)
    except (ConnectionError, ValueError) as e:
        horizon_error = str(e)

    try:
        issuer_account = horizon.get_issuer_account(asset)
    except (ConnectionError, ValueError) as e:
        horizon_error = str(e) if horizon_error is None else f"{horizon_error}; {e}"

    if not asset_info and not expert_info:
        raise ValueError(horizon_error or f"Asset not found: {asset_input}")

    asset_info = _merge_asset_info(asset, asset_info, expert_info)
    authority = scan_authority(asset, asset_info, issuer_account)
    supply = scan_supply(asset, asset_info, authority)
    liquidity = scan_liquidity(asset, horizon, asset_info)
    honeypot = scan_honeypot(asset, horizon, liquidity, asset_info)
    holders = scan_holders(asset, asset_info, horizon, expert)
    trades = scan_trades(asset, horizon, asset_info)
    age = scan_age(asset, horizon, asset_info)

    scan = {
        "network": network,
        "asset": asset,
        "asset_info": asset_info,
        "issuer_account": issuer_account,
        "expert": {
            "asset": (expert_raw or {}).get("asset"),
            "rating": asset_info.get("rating") or asset_info.get("expert_rating") or {},
            "detail_available": bool(expert_raw),
        },
        "authority": authority,
        "supply": supply,
        "liquidity": liquidity,
        "honeypot": honeypot,
        "holders": holders,
        "trades": trades,
        "age": age,
        "data_quality": _data_quality(network, asset, asset_info, expert_info, horizon_error),
        "data_sources": {
            "ledger": f"Stellar Horizon ({network})" if not is_contract(asset) else "StellarExpert contract-token index",
            "asset_index": "StellarExpert" if expert_info else None,
            "holders": holders.get("source"),
            "price": liquidity.get("price_source"),
        },
    }
    risk = score_scan(scan)
    return scan, risk


def scan_issuer(issuer: str) -> tuple[dict, dict]:
    resolution = resolve_issuer_asset(issuer, network=DEFAULT_NETWORK)
    scan, risk = scan_asset(resolution["selected"]["scan_input"], network=DEFAULT_NETWORK)
    scan["issuer_lookup"] = resolution
    return scan, risk
