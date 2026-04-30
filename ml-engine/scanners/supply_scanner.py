"""Supply and mint-risk scanner for Stellar assets."""
from __future__ import annotations

from adapters.stellar_horizon import decimal, is_contract, is_native


def scan_supply(asset: dict, asset_info: dict, authority: dict) -> dict:
    if is_native(asset):
        return {
            "total_supply": None,
            "mint_risk": False,
            "hard_cap_verifiable": True,
            "summary": "Native XLM supply is protocol-level, not issuer-minted.",
        }

    total_supply = decimal(asset_info.get("total_supply"))

    if is_contract(asset):
        return {
            "total_supply": float(total_supply) if total_supply else None,
            "mint_risk": None,
            "hard_cap_verifiable": False,
            "supply_source": asset_info.get("source", "StellarExpert"),
            "summary": "Contract token supply is indexed, but mint controls require contract review.",
        }

    issuer_can_sign_high = authority.get("issuer_can_sign_high")
    mint_risk = None if issuer_can_sign_high is None else bool(issuer_can_sign_high) and not authority.get("issuer_locked")
    expert_supply = decimal(asset_info.get("expert_total_supply"))
    supply_delta_pct = None
    if total_supply > 0 and expert_supply > 0:
        supply_delta_pct = float((abs(total_supply - expert_supply) / max(total_supply, expert_supply)) * 100)

    return {
        "total_supply": float(total_supply),
        "expert_total_supply": float(expert_supply) if expert_supply > 0 else None,
        "supply_delta_pct": round(supply_delta_pct, 4) if supply_delta_pct is not None else None,
        "mint_risk": mint_risk,
        "hard_cap_verifiable": bool(authority.get("issuer_locked") or authority.get("flags", {}).get("auth_immutable")),
        "supply_source": asset_info.get("source", "Horizon"),
        "summary": (
            "Issuer can still create additional units by sending the asset"
            if mint_risk
            else (
                "Issuer signing authority appears locked or unable to meet high threshold"
                if mint_risk is False
                else "Issuer signing authority could not be fully verified"
            )
        ),
    }
