"""
Stellar Horizon adapter.

This module is the scanner's primary data source. It uses public Horizon
endpoints only and keeps Stellar asset handling in one place so scanner modules
can work with a normalized asset shape.
"""
from __future__ import annotations

import os
import re
import time
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import unquote, urlparse

import requests

SUPPORTED_NETWORKS = {
    "public": "https://horizon.stellar.org",
    "testnet": "https://horizon-testnet.stellar.org",
}
DEFAULT_NETWORK = os.environ.get("STELLAR_NETWORK", "testnet").lower()
ACCOUNT_ID_RE = re.compile(r"^G[A-Z2-7]{55}$")
CONTRACT_ID_RE = re.compile(r"^C[A-Z2-7]{55}$")
EXPERT_CLASSIC_ASSET_RE = re.compile(r"^(?P<code>.+)-(?P<issuer>G[A-Z2-7]{55})(?:-\d+)?$")
PUBLIC_USDC_CODE = "USDC"
PUBLIC_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"


def normalize_network(network: str | None = None) -> str:
    normalized = (network or DEFAULT_NETWORK or "testnet").lower()
    if normalized not in SUPPORTED_NETWORKS:
        valid = ", ".join(sorted(SUPPORTED_NETWORKS))
        raise ValueError(f"Unsupported Stellar network '{network}'. Expected one of: {valid}")
    return normalized


def horizon_url_for_network(network: str | None = None) -> str:
    override = os.environ.get("STELLAR_HORIZON_URL")
    if override:
        return override.rstrip("/")
    return SUPPORTED_NETWORKS[normalize_network(network)]


def normalize_issuer(issuer: str) -> str:
    normalized = (issuer or "").strip().upper()
    if not ACCOUNT_ID_RE.match(normalized):
        raise ValueError("Input must be a 56-character Stellar issuer account starting with G")
    return normalized


def decimal(value: Any, default: str = "0") -> Decimal:
    """Parse API number strings without losing precision."""
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def is_native(asset: dict) -> bool:
    return asset.get("asset_type") == "native"


def is_contract(asset: dict) -> bool:
    return asset.get("asset_type") == "contract"


def asset_type_for_code(asset_code: str) -> str:
    return "credit_alphanum4" if len(asset_code) <= 4 else "credit_alphanum12"


def _asset_from_stellar_expert_url(raw: str) -> str:
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        return raw

    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if "asset" in parts:
        index = parts.index("asset")
        if index + 1 < len(parts):
            return parts[index + 1]
    return raw


def _classic_asset(code: str, issuer: str) -> dict:
    code = code.strip()
    issuer = issuer.strip().upper()

    if not code or len(code) > 12:
        raise ValueError("Stellar asset code must be 1-12 characters")
    if not ACCOUNT_ID_RE.match(issuer):
        raise ValueError("Stellar issuer must be a 56-character public key starting with G")

    return {
        "asset_type": asset_type_for_code(code),
        "asset_code": code,
        "asset_issuer": issuer,
        "contract_id": None,
        "canonical": f"{code}:{issuer}",
        "expert_id": f"{code}-{issuer}",
        "display": f"{code}:{issuer[:8]}...{issuer[-6:]}",
    }


def parse_asset(asset_input: str) -> dict:
    """
    Parse a normalized Stellar asset identifier.

    Accepted forms:
      - XLM
      - native
      - CODE:GISSUER...
      - CODE-GISSUER or CODE-GISSUER-N from StellarExpert
      - C... Soroban/SEP-41 contract ID from StellarExpert
      - StellarExpert asset URLs
    """
    raw = _asset_from_stellar_expert_url((asset_input or "").strip())
    if raw.upper() in {"XLM", "NATIVE"}:
        return {
            "asset_type": "native",
            "asset_code": "XLM",
            "asset_issuer": None,
            "contract_id": None,
            "canonical": "XLM",
            "expert_id": "XLM",
            "display": "XLM",
        }

    upper_raw = raw.upper()
    if CONTRACT_ID_RE.match(upper_raw):
        return {
            "asset_type": "contract",
            "asset_code": None,
            "asset_issuer": None,
            "contract_id": upper_raw,
            "canonical": upper_raw,
            "expert_id": upper_raw,
            "display": f"{upper_raw[:8]}...{upper_raw[-6:]}",
        }

    if ":" not in raw:
        match = EXPERT_CLASSIC_ASSET_RE.match(raw)
        if match:
            return _classic_asset(match.group("code"), match.group("issuer"))
        raise ValueError("Asset must be XLM, CODE:GISSUER, CODE-GISSUER, or a C... contract ID")

    code, issuer = raw.split(":", 1)
    return _classic_asset(code, issuer)


def asset_id_for_expert(asset: dict) -> str:
    if is_native(asset):
        return "XLM"
    if is_contract(asset):
        return asset["contract_id"]
    return f"{asset['asset_code']}-{asset['asset_issuer']}"


def horizon_asset_params(prefix: str, asset: dict) -> dict:
    if is_native(asset):
        return {f"{prefix}_asset_type": "native"}
    return {
        f"{prefix}_asset_type": asset["asset_type"],
        f"{prefix}_asset_code": asset["asset_code"],
        f"{prefix}_asset_issuer": asset["asset_issuer"],
    }


def total_supply_from_asset_record(record: dict) -> Decimal:
    """Horizon splits supply across trustlines, pools, contracts, and balances."""
    balances = record.get("balances", {})
    total = Decimal("0")
    for key in ("authorized", "authorized_to_maintain_liabilities", "unauthorized"):
        total += decimal(balances.get(key))
    for key in ("claimable_balances_amount", "liquidity_pools_amount", "contracts_amount"):
        total += decimal(record.get(key))
    return total


def _not_found(error: Exception) -> bool:
    return "404 Client Error" in str(error)


class HorizonClient:
    def __init__(
        self,
        network: str | None = None,
        base_url: str | None = None,
        timeout: int = 15,
        retries: int = 2,
    ):
        self.network = normalize_network(network)
        self.base_url = (base_url or horizon_url_for_network(self.network)).rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()

    def get_json(self, path_or_url: str, params: dict | None = None) -> dict:
        url = path_or_url if path_or_url.startswith("http") else f"{self.base_url}{path_or_url}"

        for attempt in range(self.retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                if resp.status_code in {429, 500, 502, 503, 504} and attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as e:
                if attempt < self.retries:
                    time.sleep(1 + attempt)
                    continue
                raise ConnectionError(f"Horizon API error: {e}") from e

        raise ConnectionError("Horizon API error: exhausted retries")

    @staticmethod
    def records(data: dict) -> list:
        return data.get("_embedded", {}).get("records", [])

    def get_asset_info(self, asset: dict) -> dict:
        if is_native(asset):
            return {
                "asset_type": "native",
                "asset_code": "XLM",
                "asset_issuer": None,
                "total_supply": None,
                "accounts": {},
                "flags": {
                    "auth_required": False,
                    "auth_revocable": False,
                    "auth_immutable": True,
                    "auth_clawback_enabled": False,
                },
            }
        if is_contract(asset):
            return {
                "asset_type": "contract",
                "asset_code": asset.get("asset_code"),
                "asset_issuer": None,
                "contract_id": asset.get("contract_id"),
                "total_supply": None,
                "accounts": {},
                "flags": {},
                "source": "contract",
            }

        data = self.get_json(
            "/assets",
            {
                "asset_code": asset["asset_code"],
                "asset_issuer": asset["asset_issuer"],
                "limit": 1,
            },
        )
        records = self.records(data)
        if not records:
            raise ValueError(f"Asset not found on Horizon: {asset['canonical']}")
        record = records[0]
        record["total_supply"] = str(total_supply_from_asset_record(record))
        return record

    def get_assets_by_issuer(self, issuer: str, limit: int = 200) -> list:
        issuer = normalize_issuer(issuer)
        data = self.get_json(
            "/assets",
            {
                "asset_issuer": issuer,
                "limit": max(1, min(int(limit), 200)),
                "order": "asc",
            },
        )
        records = self.records(data)
        for record in records:
            record["total_supply"] = str(total_supply_from_asset_record(record))
        return records

    def get_issuer_account(self, asset: dict) -> dict | None:
        if is_native(asset) or is_contract(asset):
            return None
        return self.get_json(f"/accounts/{asset['asset_issuer']}")

    def get_order_book(self, asset: dict, limit: int = 10) -> dict:
        if is_native(asset) or is_contract(asset):
            return {"bids": [], "asks": []}

        params = {
            **horizon_asset_params("selling", asset),
            "buying_asset_type": "native",
            "limit": limit,
        }
        try:
            return self.get_json("/order_book", params)
        except ConnectionError as e:
            if _not_found(e):
                return {"bids": [], "asks": []}
            raise

    def get_liquidity_pools(self, asset: dict, limit: int = 10) -> list:
        if is_native(asset) or is_contract(asset):
            return []

        try:
            data = self.get_json(
                "/liquidity_pools",
                {"reserves": f"native,{asset['asset_code']}:{asset['asset_issuer']}", "limit": limit},
            )
        except ConnectionError as e:
            if _not_found(e):
                return []
            raise
        return self.records(data)

    def get_asset_holders(self, asset: dict, max_records: int = 1000) -> tuple[list, bool]:
        """
        Fetch holders from Horizon as a fallback.

        Horizon does not sort accounts by asset balance, so this is a bounded
        sample. The holder scanner prefers StellarExpert for top-holder order.
        """
        if is_native(asset) or is_contract(asset):
            return [], False

        records = []
        params = {"asset": asset["canonical"], "limit": 200}
        data = self.get_json("/accounts", params)

        while True:
            batch = self.records(data)
            records.extend(batch)
            if len(records) >= max_records:
                return records[:max_records], False

            next_url = data.get("_links", {}).get("next", {}).get("href")
            if not next_url or not batch:
                return records, True

            data = self.get_json(next_url)

    def get_recent_trades(self, asset: dict, limit: int = 100) -> list:
        if is_native(asset) or is_contract(asset):
            return []

        params = {
            **horizon_asset_params("base", asset),
            "counter_asset_type": "native",
            "order": "desc",
            "limit": limit,
        }
        try:
            data = self.get_json("/trades", params)
        except ConnectionError as e:
            if _not_found(e):
                return []
            raise
        return self.records(data)

    def get_payment_paths(self, source_asset: dict, destination_asset: dict, source_amount: str = "1") -> list:
        if is_contract(source_asset) or is_contract(destination_asset):
            return []
        params = {
            **horizon_asset_params("source", source_asset),
            "source_amount": source_amount,
            "destination_assets": "native" if is_native(destination_asset) else destination_asset["canonical"],
        }
        try:
            data = self.get_json("/paths/strict-send", params)
        except ConnectionError as e:
            if _not_found(e):
                return []
            raise
        return self.records(data)

    def get_issuer_transactions(self, asset: dict, limit: int = 1, order: str = "asc") -> list:
        if is_native(asset) or is_contract(asset):
            return []
        data = self.get_json(f"/accounts/{asset['asset_issuer']}/transactions", {"limit": limit, "order": order})
        return self.records(data)

    def get_issuer_operations(self, asset: dict, limit: int = 200, order: str = "desc") -> list:
        if is_native(asset) or is_contract(asset):
            return []
        data = self.get_json(f"/accounts/{asset['asset_issuer']}/operations", {"limit": limit, "order": order})
        return self.records(data)

    def get_xlm_usd_rate(self) -> tuple[float, str]:
        """
        Estimate XLM/USD from public USDC -> XLM pathing.

        The scanner avoids paid price APIs. If Horizon cannot quote USDC, a
        conservative fallback keeps liquidity checks usable but labels the
        source as estimated.
        """
        if self.network != "public":
            return 0.15, f"fallback estimate; {self.network} has no reliable USD market"

        usdc = parse_asset(f"{PUBLIC_USDC_CODE}:{PUBLIC_USDC_ISSUER}")
        try:
            paths = self.get_payment_paths(usdc, parse_asset("XLM"), "1")
            if paths:
                xlm_for_usdc = decimal(paths[0].get("destination_amount"))
                if xlm_for_usdc > 0:
                    return float(Decimal("1") / xlm_for_usdc), "USDC/XLM Horizon path"
        except Exception:
            pass

        return 0.15, "fallback estimate"
