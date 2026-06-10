"""
data.py  ─  OHLCV + market data fetching
Supports multiple exchanges via CCXT.
Primary  : WEEX   (perpetual swaps)
Secondary: Binance (perpetual futures — fallback or explicit)
"""

from __future__ import annotations
import os
import ccxt
import pandas as pd
from datetime import datetime
import logging
from typing import Literal

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exchange registry
# ---------------------------------------------------------------------------

SUPPORTED_EXCHANGES = ["weex", "binance", "bybit", "okx"]

ExchangeName = Literal["weex", "binance", "bybit", "okx"]

_EXCHANGE_CACHE: dict[str, ccxt.Exchange] = {}


def _build_exchange(name: str) -> ccxt.Exchange:
    """Build and cache a CCXT exchange instance by name."""
    name = name.lower()
    key = os.getenv(f"{name.upper()}_API_KEY", "")
    secret = os.getenv(f"{name.upper()}_SECRET", "")

    if name == "weex":
        ex = ccxt.weex({
            "apiKey": key,
            "secret": secret,
            "options": {"defaultType": "swap"},
        })
    elif name == "binance":
        ex = ccxt.binance({
            "apiKey": key,
            "secret": secret,
            "options": {"defaultType": "future"},
        })
    elif name == "bybit":
        ex = ccxt.bybit({
            "apiKey": key,
            "secret": secret,
            "options": {"defaultType": "linear"},
        })
    elif name == "okx":
        ex = ccxt.okx({
            "apiKey": key,
            "secret": secret,
            "password": os.getenv("OKX_PASSPHRASE", ""),
            "options": {"defaultType": "swap"},
        })
    else:
        raise ValueError(f"Unsupported exchange: {name}. Choose from {SUPPORTED_EXCHANGES}")

    ex.load_markets()
    return ex


def get_exchange(name: str = "weex") -> ccxt.Exchange:
    """Return a cached exchange instance, building it on first call."""
    name = name.lower()
    if name not in _EXCHANGE_CACHE:
        _EXCHANGE_CACHE[name] = _build_exchange(name)
    return _EXCHANGE_CACHE[name]


def get_primary_exchange() -> ccxt.Exchange:
    """Return the configured primary exchange (env var EXCHANGE, default: weex)."""
    return get_exchange(os.getenv("EXCHANGE", "weex"))


# ---------------------------------------------------------------------------
# OHLCV helpers
# ---------------------------------------------------------------------------

TIMEFRAME_MAP = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
}


def fetch_ohlcv(
    symbol: str,
    timeframe: str = "1h",
    limit: int = 200,
    exchange_name: str | None = None,
) -> pd.DataFrame:
    """
    Fetch OHLCV candles from the specified (or primary) exchange.
    Automatically falls back to Binance on network errors.

    Parameters
    ----------
    symbol        : e.g. "BTC/USDT"
    timeframe     : one of TIMEFRAME_MAP keys
    limit         : number of candles to fetch
    exchange_name : override exchange ("weex", "binance", "bybit", "okx")

    Returns
    -------
    pd.DataFrame with columns [open, high, low, close, volume] indexed by timestamp
    """
    tf = TIMEFRAME_MAP.get(timeframe, "1h")
    name = exchange_name or os.getenv("EXCHANGE", "weex")
    exchange = get_exchange(name)

    try:
        raw = exchange.fetch_ohlcv(symbol, tf, limit=limit)
    except ccxt.NetworkError as e:
        logger.warning("%s network error — falling back to Binance: %s", name, e)
        exchange = get_exchange("binance")
        raw = exchange.fetch_ohlcv(symbol, tf, limit=limit)
    except ccxt.ExchangeError as e:
        logger.error("Exchange error fetching OHLCV for %s on %s: %s", symbol, name, e)
        raise

    df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.set_index("timestamp").sort_index()
    return df.astype(float)


def fetch_ticker(symbol: str, exchange_name: str | None = None) -> dict:
    """Return latest ticker data for *symbol*."""
    name = exchange_name or os.getenv("EXCHANGE", "weex")
    exchange = get_exchange(name)
    try:
        return exchange.fetch_ticker(symbol)
    except ccxt.NetworkError as e:
        logger.warning("%s ticker failed — fallback to Binance: %s", name, e)
        return get_exchange("binance").fetch_ticker(symbol)


def list_symbols(quote: str = "USDT", exchange_name: str | None = None) -> list[str]:
    """Return all perpetual swap symbols quoted in *quote* on the given exchange."""
    name = exchange_name or os.getenv("EXCHANGE", "weex")
    exchange = get_exchange(name)
    return [
        s for s, m in exchange.markets.items()
        if m.get("quote") == quote
        and m.get("type") in ("swap", "future", "linear")
        and m.get("active")
    ]


def fetch_funding_rate(symbol: str, exchange_name: str | None = None) -> dict:
    """Fetch current funding rate for a perpetual contract."""
    name = exchange_name or os.getenv("EXCHANGE", "weex")
    exchange = get_exchange(name)
    try:
        return exchange.fetch_funding_rate(symbol)
    except ccxt.BaseError as e:
        logger.warning("Could not fetch funding rate for %s on %s: %s", symbol, name, e)
        return {}


def fetch_open_interest(symbol: str, exchange_name: str | None = None) -> dict:
    """Fetch open interest for a perpetual contract."""
    name = exchange_name or os.getenv("EXCHANGE", "weex")
    exchange = get_exchange(name)
    try:
        return exchange.fetch_open_interest(symbol)
    except ccxt.BaseError as e:
        logger.warning("Could not fetch open interest for %s on %s: %s", symbol, name, e)
        return {}


def get_supported_exchanges() -> list[dict]:
    """Return metadata about all supported exchanges."""
    return [
        {"id": "weex",    "name": "WEEX",    "type": "swap",   "primary": True},
        {"id": "binance", "name": "Binance", "type": "future", "primary": False},
        {"id": "bybit",   "name": "Bybit",   "type": "linear", "primary": False},
        {"id": "okx",     "name": "OKX",     "type": "swap",   "primary": False},
    ]
