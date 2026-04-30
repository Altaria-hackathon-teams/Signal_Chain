"""Flask API for the Stellar testnet issuer-risk scanner."""
from __future__ import annotations

import time
import os
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request

from adapters.stellar_horizon import normalize_issuer
from scanner_service import scan_issuer

load_dotenv(Path(__file__).with_name(".env"))

CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ML_CORS_ORIGIN", "*").split(",")
    if origin.strip()
]

app = Flask(__name__)
_CACHE: dict[str, tuple[float, dict]] = {}


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _scan_payload(issuer: str) -> dict:
    issuer = normalize_issuer(issuer)
    now = time.time()
    cached = _CACHE.get(issuer)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        payload = dict(cached[1])
        payload["cache"] = {"hit": True, "ttl_seconds": CACHE_TTL_SECONDS}
        return payload

    scan, risk = scan_issuer(issuer)
    payload = {
        "ok": True,
        "issuer": issuer,
        "network": scan.get("network"),
        "asset": scan.get("asset"),
        "risk": risk,
        "scan": scan,
        "cache": {"hit": False, "ttl_seconds": CACHE_TTL_SECONDS},
    }
    safe_payload = _json_safe(payload)
    _CACHE[issuer] = (now, safe_payload)
    return safe_payload


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if "*" in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "stellar-token-safety-scanner"})


@app.get("/api/scan")
def scan_query():
    issuer = request.args.get("issuer", "")
    if not issuer:
        return jsonify({"ok": False, "error": "Missing issuer query parameter"}), 400
    return _scan_response(issuer)


@app.get("/api/scan/<issuer>")
def scan_path(issuer: str):
    return _scan_response(issuer)


def _scan_response(issuer: str):
    try:
        return jsonify(_scan_payload(issuer))
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except ConnectionError as e:
        return jsonify({"ok": False, "error": str(e)}), 502


if __name__ == "__main__":
    host = os.environ.get("ML_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", os.environ.get("ML_PORT", "5000")))
    app.run(host=host, port=port, debug=False, use_reloader=False)
