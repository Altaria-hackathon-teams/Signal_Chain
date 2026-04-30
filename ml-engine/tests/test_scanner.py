"""Tests for the Stellar-native scanner."""
from __future__ import annotations

import pytest

from adapters.stellar_horizon import parse_asset
from analyzer.risk_engine import score_scan
from scanner_service import resolve_issuer_asset, scan_asset, scan_issuer
from app import app

USDC = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
TESTNET_EXPERT_USDC = "USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5-1"
TESTNET_CONTRACT = "CAUGJT4GREIY3WHOUUU5RIUDGSPVREF5CDCYJOWMHOVT2GWQT5JEETGJ"
TESTNET_ISSUER = "GAZKBG4Q7JCKTY5K5Q42SSUW6F3O6OE2SLP7PYRVW4NYSEPIUMV5G2MN"


def base_scan(**overrides):
    scan = {
        "asset": parse_asset(USDC),
        "authority": {
            "native": False,
            "flags": {
                "auth_required": False,
                "auth_revocable": False,
                "auth_immutable": True,
                "auth_clawback_enabled": False,
            },
            "flags_available": True,
            "issuer_locked": True,
            "issuer_can_sign_high": False,
        },
        "supply": {"mint_risk": False},
        "honeypot": {"honeypot": False, "soft_honeypot": False, "sell_path_exists": True, "slippage_pct": 0},
        "liquidity": {"total_liquidity_usd": 100000, "sdex_bid_depth_xlm": 1000, "amm_liquidity_xlm": 1000},
        "holders": {
            "holder_count_known": True,
            "holder_count": 1000,
            "top1_pct": 5,
            "top10_pct": 25,
        },
        "trades": {"trade_count": 20, "wash_trading": False},
        "age": {"very_new": False, "new_token": False, "airdrop_pattern": False},
    }
    for key, value in overrides.items():
        scan[key] = value
    return scan


def test_parse_xlm_native_asset():
    asset = parse_asset("XLM")
    assert asset["asset_type"] == "native"
    assert asset["canonical"] == "XLM"


def test_parse_issued_asset():
    asset = parse_asset(USDC)
    assert asset["asset_code"] == "USDC"
    assert asset["asset_issuer"].startswith("G")


def test_usdc_like_asset_scores_safe():
    scan = base_scan(
        authority={
            "native": False,
            "flags": {
                "auth_required": False,
                "auth_revocable": True,
                "auth_immutable": False,
                "auth_clawback_enabled": False,
            },
            "flags_available": True,
            "issuer_locked": False,
            "issuer_can_sign_high": True,
        },
        supply={"mint_risk": True},
        holders={"holder_count_known": True, "holder_count": 2000000, "top1_pct": 34, "top10_pct": 48},
    )
    risk = score_scan(scan)
    assert risk["score"] >= 80
    assert risk["rating"] == "SAFE"


def test_clawback_caps_score_at_30():
    scan = base_scan(
        authority={
            "native": False,
            "flags": {
                "auth_required": False,
                "auth_revocable": True,
                "auth_immutable": False,
                "auth_clawback_enabled": True,
            },
            "flags_available": True,
            "issuer_locked": False,
            "issuer_can_sign_high": True,
        }
    )
    risk = score_scan(scan)
    assert risk["score"] <= 30
    assert risk["rating"] == "DANGER"


def test_honeypot_check_score_is_zero():
    scan = base_scan(honeypot={"honeypot": True, "soft_honeypot": False, "sell_path_exists": False, "slippage_pct": 0})
    risk = score_scan(scan)
    assert risk["check_scores"]["honeypot"] == 0
    assert any(item["label"] == "Sell path" and item["status"] == "FAIL" for item in risk["checks"])


def test_new_token_market_cluster_is_conservative():
    scan = base_scan(
        honeypot={"honeypot": True, "soft_honeypot": False, "sell_path_exists": False, "slippage_pct": 0},
        liquidity={"total_liquidity_usd": 0, "sdex_bid_depth_xlm": 0, "amm_liquidity_xlm": 0},
        holders={"holder_count_known": True, "holder_count": 12, "top1_pct": 68, "top10_pct": 94},
        trades={"trade_count": 0, "wash_trading": False, "payment_count": 0},
        age={
            "very_new": True,
            "new_token": True,
            "newness_band": "first_day",
            "new_token_risk_points": 85,
            "timestamp_confidence": 0.95,
            "timestamp_evidence": "Age is based on StellarExpert asset created timestamp.",
            "airdrop_pattern": False,
        },
    )
    risk = score_scan(scan)
    assert risk["score"] < 50
    assert risk["model"]["new_token"]["band"] == "first_day"
    assert risk["model"]["signals"]["new_launch_cluster"] > 60


def test_xlm_native_scores_safe():
    scan = base_scan(
        asset=parse_asset("XLM"),
        authority={"native": True, "flags": {}, "issuer_locked": True},
        supply={"mint_risk": False},
        honeypot={"honeypot": False, "soft_honeypot": False, "sell_path_exists": True, "slippage_pct": 0},
        liquidity={"total_liquidity_usd": None},
        holders={"holder_count_known": False, "top1_pct": None, "top10_pct": None},
        trades={"trade_count": None, "wash_trading": False},
        age={"very_new": False, "new_token": False, "airdrop_pattern": False},
    )
    risk = score_scan(scan)
    assert risk["score"] >= 80


def test_parse_stellar_expert_classic_asset_id():
    asset = parse_asset(TESTNET_EXPERT_USDC)
    assert asset["asset_code"] == "USDC"
    assert asset["asset_issuer"] == "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    assert asset["canonical"].startswith("USDC:")


def test_parse_stellar_expert_contract_id():
    asset = parse_asset(TESTNET_CONTRACT)
    assert asset["asset_type"] == "contract"
    assert asset["contract_id"] == TESTNET_CONTRACT


def test_parse_stellar_expert_asset_url():
    asset = parse_asset(f"https://stellar.expert/explorer/testnet/asset/{TESTNET_EXPERT_USDC}")
    assert asset["asset_code"] == "USDC"


def test_resolve_testnet_issuer_to_stellar_expert_asset():
    try:
        resolution = resolve_issuer_asset(TESTNET_ISSUER)
    except (ConnectionError, ValueError) as e:
        pytest.skip(f"Live Stellar APIs unavailable: {e}")

    assert resolution["selected"]["asset"]["asset_issuer"] == TESTNET_ISSUER
    assert resolution["selected"]["expert_asset"].startswith("USDXM-")
    assert resolution["selected"]["horizon_verified"] is True


def test_scan_testnet_issuer_returns_risk_model():
    try:
        scan, risk = scan_issuer(TESTNET_ISSUER)
    except (ConnectionError, ValueError) as e:
        pytest.skip(f"Live Stellar APIs unavailable: {e}")

    assert scan["issuer_lookup"]["issuer"] == TESTNET_ISSUER
    assert 0 <= risk["score"] <= 100
    assert risk["model"]["engine"] == "in-house deterministic ensemble v1"
    assert "new_token" in risk["model"]


def test_flask_health_endpoint():
    client = app.test_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["ok"] is True


def test_flask_scan_endpoint_returns_json(monkeypatch):
    def fake_scan_issuer(issuer):
        return (
            {
                "network": "testnet",
                "asset": {"canonical": f"FAKE:{issuer}"},
                "issuer_lookup": {"issuer": issuer},
            },
            {
                "score": 42,
                "rating": "DANGER",
                "model": {
                    "engine": "in-house deterministic ensemble v1",
                    "new_token": {"band": "first_day", "risk_points": 85},
                },
            },
        )

    monkeypatch.setattr("app.scan_issuer", fake_scan_issuer)
    client = app.test_client()
    response = client.get(f"/api/scan/{TESTNET_ISSUER}")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["ok"] is True
    assert payload["issuer"] == TESTNET_ISSUER
    assert payload["risk"]["score"] == 42
    assert payload["risk"]["model"]["new_token"]["band"] == "first_day"


def test_flask_scan_endpoint_rejects_invalid_issuer():
    client = app.test_client()
    response = client.get("/api/scan/not-an-issuer")
    assert response.status_code == 400
    assert response.get_json()["ok"] is False


def test_live_usdc_scores_safe_when_apis_are_available():
    try:
        _, risk = scan_asset(USDC, network="public")
    except (ConnectionError, ValueError) as e:
        pytest.skip(f"Live Stellar APIs unavailable: {e}")

    assert risk["score"] >= 80
