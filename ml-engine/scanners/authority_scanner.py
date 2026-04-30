"""
Issuer authority scanner.

Classic Stellar assets do not have bytecode ownership like ERC-20 contracts.
The issuer account, flags, thresholds, and signers define the control surface.
"""
from __future__ import annotations

from adapters.stellar_horizon import is_contract, is_native


def _signer_weight(signers: list, key: str) -> int:
    for signer in signers:
        if signer.get("key") == key:
            return int(signer.get("weight") or 0)
    return 0


def scan_authority(asset: dict, asset_info: dict, issuer_account: dict | None) -> dict:
    if is_native(asset):
        return {
            "native": True,
            "contract": False,
            "authority_verified": True,
            "flags_available": True,
            "flags": {
                "auth_required": False,
                "auth_revocable": False,
                "auth_immutable": True,
                "auth_clawback_enabled": False,
            },
            "issuer_locked": True,
            "issuer_can_sign_high": False,
            "master_key_weight": 0,
            "high_threshold": 0,
            "signers": [],
            "summary": "XLM is the native Stellar asset and has no issuer account.",
        }

    if is_contract(asset):
        return {
            "native": False,
            "contract": True,
            "authority_verified": False,
            "flags_available": False,
            "flags": {},
            "issuer_locked": False,
            "issuer_can_sign_high": None,
            "master_key_weight": None,
            "high_threshold": None,
            "signer_count": None,
            "signers": [],
            "thresholds": {},
            "contract_id": asset.get("contract_id"),
            "features": asset_info.get("features") or [],
            "summary": "Soroban contract-token admin/mint controls require contract source/spec review.",
        }

    flags = asset_info.get("flags") or (issuer_account or {}).get("flags") or {}
    thresholds = (issuer_account or {}).get("thresholds", {})
    signers = (issuer_account or {}).get("signers", [])

    high_threshold = int(thresholds.get("high_threshold") or 0)
    master_weight = _signer_weight(signers, asset["asset_issuer"])
    total_signing_weight = sum(int(s.get("weight") or 0) for s in signers)
    nonzero_signers = [s for s in signers if int(s.get("weight") or 0) > 0]
    issuer_can_sign_high = high_threshold > 0 and total_signing_weight >= high_threshold
    issuer_locked = high_threshold > 0 and total_signing_weight < high_threshold
    authority_verified = bool(issuer_account and flags)

    return {
        "native": False,
        "contract": False,
        "authority_verified": authority_verified,
        "flags_available": bool(flags),
        "flags": {
            "auth_required": bool(flags.get("auth_required")),
            "auth_revocable": bool(flags.get("auth_revocable")),
            "auth_immutable": bool(flags.get("auth_immutable")),
            "auth_clawback_enabled": bool(flags.get("auth_clawback_enabled")),
        },
        "issuer_locked": issuer_locked,
        "issuer_can_sign_high": issuer_can_sign_high,
        "master_key_weight": master_weight,
        "high_threshold": high_threshold,
        "signer_count": len(nonzero_signers),
        "signers": signers,
        "thresholds": thresholds,
        "home_domain": (issuer_account or {}).get("home_domain"),
        "summary": (
            "Issuer account and asset flags fetched from Horizon."
            if authority_verified
            else "Issuer authority was only partially available; treat mint/freeze findings as lower confidence."
        ),
    }
