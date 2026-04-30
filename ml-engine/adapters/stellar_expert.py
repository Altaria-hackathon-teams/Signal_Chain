"""
StellarExpert public API adapter.

Horizon is authoritative for ledger state, but it cannot return top holders
sorted by balance. StellarExpert's free public API is used as an optional
Stellar-native index for holder concentration and broad asset reputation.
"""
from __future__ import annotations

import os
import time
from decimal import Decimal

import requests

from adapters.stellar_horizon import (
    asset_id_for_expert,
    decimal,
    is_contract,
    normalize_issuer,
    normalize_network,
    parse_asset,
)

STELLAR_EXPERT_API_ROOT = os.environ.get(
    "STELLAR_EXPERT_API_ROOT",
    "https://api.stellar.expert/explorer",
).rstrip("/")
STELLAR_EXPERT_BASE_URL = os.environ.get("STELLAR_EXPERT_BASE_URL")
DEFAULT_DECIMALS = 7


class StellarExpertNotFound(ValueError):
    """Raised when StellarExpert has no record for a requested asset."""


def _base_url_for_network(network: str) -> str:
    if STELLAR_EXPERT_BASE_URL:
        return STELLAR_EXPERT_BASE_URL.rstrip("/")
    return f"{STELLAR_EXPERT_API_ROOT}/{normalize_network(network)}"


def _asset_decimals(asset: dict, record: dict | None = None) -> int:
    candidate = (record or {}).get("decimals", asset.get("decimals", DEFAULT_DECIMALS))
    try:
        return int(candidate)
    except (TypeError, ValueError):
        return DEFAULT_DECIMALS


def amount_from_expert_units(value, decimals: int = DEFAULT_DECIMALS) -> Decimal:
    """
    StellarExpert returns many aggregate amounts as integer minor units.

    Endpoint responses that already contain a decimal point are left as-is.
    Integer-like values are scaled by the asset decimals, defaulting to the
    classic Stellar 7 decimal places used by stroops.
    """
    amount = decimal(value)
    if value is None:
        return amount
    if "." in str(value):
        return amount
    return amount / (Decimal("10") ** decimals)


def normalize_trustlines(value) -> dict:
    if isinstance(value, dict):
        return {
            "total": int(value.get("total") or 0),
            "authorized": int(value.get("authorized") or 0),
            "funded": int(value.get("funded") or 0),
        }
    if isinstance(value, list):
        padded = list(value) + [0, 0, 0]
        return {
            "total": int(padded[0] or 0),
            "authorized": int(padded[1] or 0),
            "funded": int(padded[2] or 0),
        }
    return {"total": 0, "authorized": 0, "funded": 0}


def enrich_asset_from_expert(asset: dict, record: dict | None) -> dict:
    if not record:
        return asset

    enriched = dict(asset)
    decimals = _asset_decimals(enriched, record)
    enriched["decimals"] = decimals
    enriched["expert_asset"] = record.get("asset") or asset_id_for_expert(asset)

    if record.get("contract"):
        enriched["contract_id"] = record.get("contract")
    if is_contract(enriched):
        enriched["asset_code"] = record.get("code") or record.get("token_name") or enriched.get("asset_code")
        enriched["token_name"] = record.get("token_name")
        if enriched.get("asset_code"):
            enriched["display"] = f"{enriched['asset_code']}:{enriched['contract_id'][:8]}...{enriched['contract_id'][-6:]}"
    return enriched


def normalize_expert_asset_info(asset: dict, record: dict | None) -> dict:
    if not record:
        return {}

    decimals = _asset_decimals(asset, record)
    supply = amount_from_expert_units(record.get("supply"), decimals)
    info = {
        "asset_type": asset.get("asset_type"),
        "asset_code": asset.get("asset_code") or record.get("code"),
        "asset_issuer": asset.get("asset_issuer"),
        "contract_id": asset.get("contract_id") or record.get("contract"),
        "expert_asset": record.get("asset"),
        "source": "StellarExpert",
        "decimals": decimals,
        "raw_supply": record.get("supply"),
        "total_supply": str(supply),
        "created": record.get("created"),
        "trades": int(record.get("trades") or 0),
        "payments": int(record.get("payments") or 0),
        "traded_amount": str(amount_from_expert_units(record.get("traded_amount"), decimals)),
        "payments_amount": str(amount_from_expert_units(record.get("payments_amount"), decimals)),
        "trustlines": normalize_trustlines(record.get("trustlines")),
        "rating": record.get("rating") or {},
        "token_name": record.get("token_name"),
        "features": record.get("features") or [],
    }
    if record.get("contract"):
        info["stellar_asset_contract"] = record.get("contract")
    return info


class StellarExpertClient:
    def __init__(
        self,
        network: str | None = None,
        base_url: str | None = None,
        timeout: int = 15,
        retries: int = 2,
    ):
        self.network = normalize_network(network)
        self.base_url = (base_url or _base_url_for_network(self.network)).rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()

    def get_json(self, path: str, params: dict | None = None):
        url = f"{self.base_url}{path}"
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                if resp.status_code in {429, 500, 502, 503, 504} and attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                if resp.status_code == 404:
                    raise StellarExpertNotFound(f"StellarExpert asset not found: {url}")
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as e:
                if attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                raise ConnectionError(f"StellarExpert API error: {e}") from e

        raise ConnectionError("StellarExpert API error: exhausted retries")

    def get_text_decimal(self, path: str) -> Decimal:
        url = f"{self.base_url}{path}"
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                if resp.status_code in {429, 500, 502, 503, 504} and attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                if resp.status_code == 404:
                    raise StellarExpertNotFound(f"StellarExpert asset not found: {url}")
                resp.raise_for_status()
                return decimal(resp.text)
            except requests.RequestException as e:
                if attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                raise ConnectionError(f"StellarExpert API error: {e}") from e

        raise ConnectionError("StellarExpert API error: exhausted retries")

    @staticmethod
    def records(data: dict) -> list:
        return data.get("_embedded", {}).get("records", [])

    def list_assets(
        self,
        search: str | None = None,
        sort: str = "rating",
        order: str = "desc",
        limit: int = 20,
        cursor: int | None = None,
    ) -> list:
        params = {
            "sort": sort,
            "order": order,
            "limit": max(1, min(int(limit), 200)),
        }
        if search:
            params["search"] = search
        if cursor is not None:
            params["cursor"] = cursor
        return self.records(self.get_json("/asset", params))

    def get_assets_by_issuer(self, issuer: str, limit: int = 200) -> list:
        issuer = normalize_issuer(issuer)
        records = self.list_assets(search=issuer, limit=limit)
        matched = []
        for record in records:
            try:
                asset = parse_asset(record.get("asset"))
            except ValueError:
                continue
            if asset.get("asset_issuer") == issuer:
                matched.append(record)
        return matched

    def get_asset_detail(self, asset: dict) -> dict:
        return self.get_json(f"/asset/{asset_id_for_expert(asset)}")

    def get_asset_holders(self, asset: dict, limit: int = 50) -> list:
        decimals = _asset_decimals(asset)
        data = self.get_json(
            f"/asset/{asset_id_for_expert(asset)}/holders",
            {"limit": limit, "order": "desc"},
        )
        records = self.records(data)
        normalized = []
        for record in records:
            balance = amount_from_expert_units(record.get("balance"), decimals)
            normalized.append({
                "address": record.get("address") or record.get("account"),
                "balance": float(balance),
                "raw_balance": record.get("balance"),
            })
        return normalized

    def get_asset_supply(self, asset: dict) -> Decimal:
        return self.get_text_decimal(f"/asset/{asset_id_for_expert(asset)}/supply")

    def get_asset_rating(self, asset: dict) -> dict | None:
        try:
            return self.get_json(f"/asset/{asset_id_for_expert(asset)}/rating")
        except (ConnectionError, StellarExpertNotFound):
            return None
