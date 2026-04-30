"""Stellar-native risk scoring engine."""
from __future__ import annotations

import math

RATING_BANDS = (
    (80, "SAFE"),
    (50, "WARNING"),
    (0, "DANGER"),
)


def _rating(score: int) -> str:
    for minimum, rating in RATING_BANDS:
        if score >= minimum:
            return rating
    return "DANGER"


def _check(checks: list, check_scores: dict, category: str, label: str, status: str, deduction: int, detail: str):
    checks.append({
        "category": category,
        "label": label,
        "status": status,
        "deduction": deduction,
        "detail": detail,
    })
    if status == "FAIL":
        check_scores[category] = min(check_scores.get(category, 100), 0 if deduction >= 40 else 50)
    elif status == "WARN":
        check_scores[category] = min(check_scores.get(category, 100), max(50, 100 - deduction * 3))


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _number(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def _liquidity_risk(liquidity: dict) -> float:
    expert_score = liquidity.get("expert_liquidity_score")
    if expert_score is not None:
        return _clamp(100 - _number(expert_score) * 10)

    liq_usd = liquidity.get("total_liquidity_usd")
    if liq_usd is None:
        return 0.0
    if liq_usd <= 0:
        return 100.0
    if liq_usd < 1000:
        return 90.0
    if liq_usd < 10000:
        return 65.0
    if liq_usd < 100000:
        return 30.0
    spread = liquidity.get("spread_pct")
    spread_risk = _clamp((_number(spread) - 2) * 3) if spread is not None else 0.0
    return _clamp(10 + spread_risk)


def _holder_risk(holders: dict) -> float:
    top1 = holders.get("top1_pct")
    top10 = holders.get("top10_pct")
    if top1 is None or top10 is None:
        return 35.0
    hhi = _number(holders.get("hhi"))
    gini = _number(holders.get("gini"))
    holder_count = _number(holders.get("holder_count"))

    concentration = max(
        _number(top1) * 1.15,
        max(0.0, _number(top10) - 50) * 1.7,
        min(100.0, hhi / 45) if hhi else 0.0,
        gini * 70 if gini else 0.0,
    )
    thin_holder_penalty = 25 if 0 < holder_count < 100 else 0
    return _clamp(concentration + thin_holder_penalty)


def _activity_risk(trades: dict, expert_rating: dict) -> float:
    trade_count = trades.get("trade_count")
    if trade_count is None:
        return 0.0
    payment_count = _number(trades.get("payment_count"))
    activity_rating = expert_rating.get("activity")
    if activity_rating is not None:
        base = 100 - _number(activity_rating) * 10
    elif trade_count == 0:
        base = 75
    else:
        base = _clamp(60 - math.log10(_number(trade_count) + 1) * 22)
    if trade_count == 0 and payment_count > 1000:
        base = max(base, 45)
    if trades.get("wash_trading"):
        base += 25
    return _clamp(base)


def _authority_risk(authority: dict) -> float:
    if authority.get("native"):
        return 0.0
    if authority.get("contract"):
        return 65.0
    flags = authority.get("flags") or {}
    risk = 0.0
    if flags.get("auth_clawback_enabled"):
        risk = max(risk, 100)
    if flags.get("auth_required"):
        risk += 20
    if flags.get("auth_revocable"):
        risk += 18
    if authority.get("issuer_can_sign_high"):
        risk += 15
    if not authority.get("authority_verified", True):
        risk += 20
    return _clamp(risk)


def _evidence_confidence(scan: dict, holders: dict) -> float:
    data_quality = scan.get("data_quality") or {}
    confidence = 35.0
    if data_quality.get("stellar_expert_verified"):
        confidence += 25
    if data_quality.get("horizon_verified"):
        confidence += 20
    if holders.get("complete") and holders.get("top10_pct") is not None:
        confidence += 15
    if (scan.get("age") or {}).get("source"):
        confidence += 5
    if (scan.get("trades") or {}).get("trade_count") is not None:
        confidence += 5
    warnings = data_quality.get("warnings") or []
    confidence -= 8 * sum("failed" in warning.lower() or "unavailable" in warning.lower() for warning in warnings)
    return round(_clamp(confidence, 5, 99), 1)


def _advanced_model(scan: dict, check_scores: dict, base_score: int, score_cap: int) -> dict:
    expert_rating = (scan.get("expert") or {}).get("rating") or {}
    authority = scan.get("authority") or {}
    supply = scan.get("supply") or {}
    honeypot = scan.get("honeypot") or {}
    liquidity = scan.get("liquidity") or {}
    holders = scan.get("holders") or {}
    trades = scan.get("trades") or {}
    age = scan.get("age") or {}

    exit_risk = 100.0 if honeypot.get("honeypot") else 0.0
    if honeypot.get("market_unverified"):
        exit_risk = 90.0 if not honeypot.get("sell_path_exists") else 45.0
    elif honeypot.get("soft_honeypot"):
        exit_risk = max(exit_risk, 65.0)

    mint_risk = supply.get("mint_risk")
    supply_risk = 55.0 if mint_risk is None else (45.0 if mint_risk else 5.0)
    if supply.get("supply_delta_pct") is not None:
        supply_risk += min(40.0, _number(supply.get("supply_delta_pct")) * 8)

    age_days = age.get("age_days")
    if age.get("new_token_risk_points") is not None:
        age_risk = _number(age.get("new_token_risk_points"))
    else:
        age_risk = 45.0 if age_days is None else _clamp(70 - min(_number(age_days), 180) / 180 * 70)
        if age.get("very_new"):
            age_risk = max(age_risk, 90.0)
        elif age.get("new_token"):
            age_risk = max(age_risk, 60.0)

    reputation_risk = 35.0
    if expert_rating.get("average") is not None:
        reputation_risk = _clamp(100 - _number(expert_rating.get("average")) * 10)

    liquidity_risk = _liquidity_risk(liquidity)
    holder_risk = _holder_risk(holders)
    activity_risk = _activity_risk(trades, expert_rating)
    new_launch_cluster = 0.0
    if age_risk >= 65:
        new_launch_cluster = max(
            0.0,
            (liquidity_risk * 0.45)
            + (activity_risk * 0.25)
            + (holder_risk * 0.20)
            + (exit_risk * 0.10),
        )

    signals = {
        "authority": _authority_risk(authority),
        "supply": supply_risk,
        "exit_route": exit_risk,
        "liquidity": liquidity_risk,
        "holders": holder_risk,
        "activity": activity_risk,
        "age": age_risk,
        "new_launch_cluster": new_launch_cluster,
        "reputation": reputation_risk,
        "data_quality": 100 - _number(check_scores.get("data_quality"), 100),
    }
    category_weights = {
        "authority": 1.25,
        "supply": 1.0,
        "exit_route": 1.35,
        "liquidity": 1.2,
        "holders": 1.15,
        "activity": 0.8,
        "age": 0.85,
        "new_launch_cluster": 1.0,
        "reputation": 0.7,
        "data_quality": 0.75,
    }
    weighted_risk = sum(signals[key] * category_weights[key] for key in signals) / sum(category_weights.values())
    model_score = int(round(_clamp(100 - weighted_risk)))
    blended_score = int(round(_clamp(base_score * 0.6 + model_score * 0.4, 0, score_cap)))
    risk_probability = round(_sigmoid((weighted_risk - 45) / 11) * 100, 1)
    confidence = _evidence_confidence(scan, holders)

    return {
        "engine": "in-house deterministic ensemble v1",
        "score": model_score,
        "blended_score": blended_score,
        "weighted_risk": round(weighted_risk, 2),
        "risk_probability_pct": risk_probability,
        "confidence_pct": confidence,
        "signals": {key: round(value, 2) for key, value in signals.items()},
        "category_weights": category_weights,
        "new_token": {
            "band": age.get("newness_band", "unknown"),
            "age_days": age.get("age_days"),
            "timestamp_confidence": age.get("timestamp_confidence"),
            "risk_points": round(age_risk, 2),
            "cluster_risk": round(new_launch_cluster, 2),
            "evidence": age.get("timestamp_evidence"),
        },
        "note": "No external AI model is used; this is a transparent from-scratch ensemble over ledger/index signals.",
    }


def score_scan(scan: dict) -> dict:
    checks = []
    check_scores = {
        "authority": 100,
        "supply": 100,
        "honeypot": 100,
        "liquidity": 100,
        "holders": 100,
        "activity": 100,
        "age": 100,
        "reputation": 100,
        "data_quality": 100,
    }
    deductions = 0
    score_cap = 100

    def apply(category: str, label: str, status: str, deduction: int, detail: str):
        nonlocal deductions
        _check(checks, check_scores, category, label, status, deduction, detail)
        if status in {"WARN", "FAIL"}:
            deductions += deduction

    authority = scan["authority"]
    flags = authority.get("flags", {})

    if authority.get("native"):
        apply("authority", "Issuer authority", "PASS", 0, "XLM has no issuer account.")
    elif authority.get("contract"):
        apply(
            "authority",
            "Contract controls",
            "WARN",
            12,
            "Contract-token admin, mint, and freeze controls require source/spec review.",
        )
    else:
        if not authority.get("authority_verified", True):
            apply(
                "authority",
                "Issuer authority",
                "WARN",
                12,
                "Issuer flags or signer thresholds could not be fully cross-checked with Horizon.",
            )

        if not authority.get("flags_available", True):
            apply("authority", "Issuer flags", "WARN", 10, "Issuer flags were not available for clawback/freeze checks.")
        else:
            if flags.get("auth_clawback_enabled"):
                apply("authority", "AUTH_CLAWBACK_ENABLED", "FAIL", 70, "Issuer can claw back tokens from holders.")
                score_cap = min(score_cap, 30)
            else:
                apply("authority", "AUTH_CLAWBACK_ENABLED", "PASS", 0, "Clawback is not enabled.")

            if flags.get("auth_required"):
                apply("authority", "AUTH_REQUIRED", "WARN", 10, "Issuer must approve trustlines.")
            else:
                apply("authority", "AUTH_REQUIRED", "PASS", 0, "Trustlines do not require issuer pre-approval.")

            if flags.get("auth_revocable"):
                apply("authority", "AUTH_REVOCABLE", "WARN", 5, "Issuer can revoke authorization/freeze trustlines.")
            else:
                apply("authority", "AUTH_REVOCABLE", "PASS", 0, "Issuer cannot revoke trustline authorization.")

            if flags.get("auth_immutable") or authority.get("issuer_locked"):
                apply("authority", "Issuer lock", "PASS", 0, "Issuer flags/signing authority appear locked.")
            elif authority.get("issuer_can_sign_high"):
                apply("authority", "Issuer lock", "WARN", 0, "Issuer can still meet high-threshold operations.")

    supply = scan["supply"]
    if supply.get("mint_risk") is None:
        apply("supply", "Mint authority", "WARN", 8, "Mint authority is not verifiable from available data.")
    elif supply.get("mint_risk"):
        apply("supply", "Mint authority", "WARN", 8, "Issuer can still create additional asset units.")
    else:
        apply("supply", "Mint authority", "PASS", 0, "No active mint authority detected.")
    if supply.get("supply_delta_pct") is not None and supply.get("supply_delta_pct") > 1:
        apply(
            "supply",
            "Supply cross-check",
            "WARN",
            8,
            f"Horizon and StellarExpert supply differ by {supply.get('supply_delta_pct')}%.",
        )

    honeypot = scan["honeypot"]
    if honeypot.get("market_unverified"):
        if honeypot.get("sell_path_exists"):
            apply(
                "honeypot",
                "Contract exit route",
                "WARN",
                8,
                "Exit route is inferred from StellarExpert aggregate activity, not a simulated Horizon path.",
            )
            check_scores["honeypot"] = min(check_scores["honeypot"], 70)
        else:
            apply(
                "honeypot",
                "Contract exit route",
                "FAIL",
                25,
                "No StellarExpert liquidity or trading exit signal was found for this contract token.",
            )
            check_scores["honeypot"] = min(check_scores["honeypot"], 30)
    elif honeypot.get("honeypot"):
        apply("honeypot", "Sell path", "FAIL", 50, "No TOKEN->XLM path, bids, or AMM pool found.")
        check_scores["honeypot"] = 0
    elif honeypot.get("soft_honeypot"):
        apply("honeypot", "Sell slippage", "WARN", 15, f"Small sell path slippage is {honeypot.get('slippage_pct')}%.")
        check_scores["honeypot"] = min(check_scores["honeypot"], 60)
    else:
        apply("honeypot", "Sell path", "PASS", 0, "TOKEN->XLM selling route is available.")

    liquidity = scan["liquidity"]
    liq_usd = liquidity.get("total_liquidity_usd")
    expert_liquidity = liquidity.get("expert_liquidity_score")
    if expert_liquidity is not None:
        if expert_liquidity <= 0:
            apply("liquidity", "Measured liquidity", "FAIL", 20, "StellarExpert liquidity rating is 0/10.")
            check_scores["liquidity"] = 0
        elif expert_liquidity < 3:
            apply("liquidity", "Measured liquidity", "WARN", 12, f"StellarExpert liquidity rating is {expert_liquidity}/10.")
        else:
            apply("liquidity", "Measured liquidity", "PASS", 0, f"StellarExpert liquidity rating is {expert_liquidity}/10.")
    elif liq_usd is None:
        if (scan.get("asset") or {}).get("asset_type") == "contract":
            apply("liquidity", "Liquidity depth", "WARN", 12, "Contract-token liquidity could not be measured.")
        else:
            apply("liquidity", "Liquidity depth", "PASS", 0, "Native XLM liquidity is not scored.")
    elif liq_usd < 1000:
        apply("liquidity", "Liquidity depth", "FAIL", 25, f"Estimated liquidity is ${liq_usd:,.0f}.")
        check_scores["liquidity"] = 0
    elif liq_usd < 10000:
        apply("liquidity", "Liquidity depth", "WARN", 12, f"Estimated liquidity is ${liq_usd:,.0f}.")
    else:
        apply("liquidity", "Liquidity depth", "PASS", 0, f"Estimated liquidity is ${liq_usd:,.0f}.")

    holders = scan["holders"]
    top1 = holders.get("top1_pct")
    top10 = holders.get("top10_pct")
    if top1 is None or top10 is None:
        apply("holders", "Holder concentration", "PASS", 0, holders.get("summary", "Holder concentration is not scored."))
    else:
        if top1 > 50:
            apply("holders", "Top holder", "FAIL", 25, f"Top holder controls {top1:.1f}% excluding issuer.")
        elif top10 > 80:
            apply("holders", "Top 10 holders", "WARN", 15, f"Top 10 holders control {top10:.1f}% excluding issuer.")
        elif top10 > 50:
            apply("holders", "Top 10 holders", "WARN", 5, f"Top 10 holders control {top10:.1f}% excluding issuer.")
        else:
            apply("holders", "Holder concentration", "PASS", 0, f"Top 10 holders control {top10:.1f}% excluding issuer.")

        if holders.get("holder_count_known") and holders.get("holder_count", 0) < 100:
            apply("holders", "Holder count", "WARN", 5, f"Only {holders.get('holder_count')} trustlines hold the asset.")

    trades = scan["trades"]
    trade_count = trades.get("trade_count")
    if trade_count is None:
        apply("activity", "Trading activity", "PASS", 0, "Native XLM activity is not scored.")
    elif trade_count == 0:
        apply("activity", "Trading activity", "WARN", 8, "No recent TOKEN/XLM trades found.")
    elif trades.get("wash_trading"):
        apply("activity", "Wash trading", "WARN", 10, "Recent trades are low-counterparty and repetitive in size.")
    else:
        apply("activity", "Trading activity", "PASS", 0, f"{trade_count} recent TOKEN/XLM trades found.")

    age = scan["age"]
    age_detail = age.get("timestamp_evidence") or "No new-token age warning."
    if age.get("very_new"):
        apply("age", "Asset age", "WARN", 18, f"Asset appears less than 24 hours old. {age_detail}")
    elif age.get("new_token"):
        apply("age", "Asset age", "WARN", 10, f"Asset appears less than 7 days old. {age_detail}")
    elif age.get("newness_band") == "first_month":
        apply("age", "Asset age", "WARN", 4, f"Asset appears less than 30 days old. {age_detail}")
    elif age.get("newness_band") == "unknown":
        apply("age", "Asset age", "WARN", 4, "Asset creation time could not be verified.")
    else:
        apply("age", "Asset age", "PASS", 0, "No new-token age warning.")

    if age.get("airdrop_pattern"):
        apply("age", "Airdrop pattern", "WARN", 8, "Issuer recently sent many asset transfers in one transaction.")

    liquidity_for_cluster = scan.get("liquidity") or {}
    trades_for_cluster = scan.get("trades") or {}
    holders_for_cluster = scan.get("holders") or {}
    if (
        age.get("new_token_risk_points", 0) >= 65
        and (
            liquidity_for_cluster.get("total_liquidity_usd") in {None, 0}
            or trades_for_cluster.get("trade_count") == 0
            or (holders_for_cluster.get("holder_count_known") and holders_for_cluster.get("holder_count", 0) < 100)
        )
    ):
        apply(
            "age",
            "New launch risk",
            "WARN",
            12,
            "New-token timestamp combines with weak liquidity, trading, or holder evidence.",
        )

    expert_rating = (scan.get("expert") or {}).get("rating") or {}
    average = expert_rating.get("average")
    if average is not None:
        if average < 2:
            apply("reputation", "StellarExpert rating", "WARN", 10, f"Technical rating is {average}/10.")
        elif average < 5:
            apply("reputation", "StellarExpert rating", "WARN", 5, f"Technical rating is {average}/10.")
        else:
            apply("reputation", "StellarExpert rating", "PASS", 0, f"Technical rating is {average}/10.")

    data_warnings = (scan.get("data_quality") or {}).get("warnings") or []
    scored_warnings = [
        warning for warning in data_warnings
        if "Horizon cross-check failed" in warning or "metadata was unavailable" in warning
    ]
    if scored_warnings:
        apply("data_quality", "Data cross-check", "WARN", 6, "; ".join(scored_warnings[:2]))
    else:
        apply("data_quality", "Data cross-check", "PASS", 0, "Primary data sources were available.")

    base_score = max(0, min(score_cap, 100 - deductions))
    model = _advanced_model(scan, check_scores, int(base_score), score_cap)
    final_score = model["blended_score"]
    risk_flags = [
        f"{item['status']}: {item['label']} - {item['detail']}"
        for item in checks
        if item["status"] in {"WARN", "FAIL"}
    ]

    return {
        "score": int(final_score),
        "rating": _rating(int(final_score)),
        "checks": checks,
        "check_scores": check_scores,
        "flags": risk_flags,
        "deductions": deductions,
        "base_score": int(base_score),
        "model": model,
    }
