"""
data.py  ─  OHLCV + market data fetching
Primary exchange : WEEX  (via CCXT)
Fallback exchange: Binance (read-only public data)
"""

import os
import ccxt
import pandas as pd
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exchange initialisation
# ---------------------------------------------------------------------------

def _build_weex() -> ccxt.weex:
    """Instantiate WEEX exchange. API keys are optional for public endpoints."""
    params: dict = {
        "apiKey": os.getenv("WEEX_API_KEY", ""),
        "secret": os.getenv("WEEX_SECRET", ""),
        "options": {
            "defaultType": "swap",          # perpetual futures by default
        },
    }
    exchange = ccxt.weex(params)
    exchange.load_markets()
    return exchange


def _build_fallback() -> ccxt.binance:
    """Binance as a read-only public fallback."""
    exchange = ccxt.binance({"options": {"defaultType": "future"}})
    exchange.load_markets()
    return exchange


_PRIMARY: ccxt.weex | None = None
_FALLBACK: ccxt.binance | None = None


def get_exchange(use_fallback: bool = False):
    """Return a cached exchange instance."""
    global _PRIMARY, _FALLBACK
    if use_fallback:
        if _FALLBACK is None:
            _FALLBACK = _build_fallback()
        return _FALLBACK
    if _PRIMARY is None:
        _PRIMARY = _build_weex()
    return _PRIMARY


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
    use_fallback: bool = False,
) -> pd.DataFrame:
    """
    Fetch OHLCV candles from WEEX (or fallback).

    Parameters
    ----------
    symbol     : e.g. "BTC/USDT"
    timeframe  : one of TIMEFRAME_MAP keys
    limit      : number of candles to fetch
    use_fallback: force Binance instead of WEEX

    Returns
    -------
    pd.DataFrame with columns [timestamp, open, high, low, close, volume]
    """
    tf = TIMEFRAME_MAP.get(timeframe, "1h")
    exchange = get_exchange(use_fallback)

    try:
        raw = exchange.fetch_ohlcv(symbol, tf, limit=limit)
    except ccxt.NetworkError as e:
        logger.warning("WEEX network error — falling back to Binance: %s", e)
        exchange = get_exchange(use_fallback=True)
        raw = exchange.fetch_ohlcv(symbol, tf, limit=limit)
    except ccxt.ExchangeError as e:
        logger.error("Exchange error fetching OHLCV for %s: %s", symbol, e)
        raise

    df = pd.DataFrame(
        raw, columns=["timestamp", "open", "high", "low", "close", "volume"]
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df = df.set_index("timestamp").sort_index()
    return df.astype(float)


def fetch_ticker(symbol: str, use_fallback: bool = False) -> dict:
    """Return latest ticker data for *symbol* from WEEX."""
    exchange = get_exchange(use_fallback)
    try:
        return exchange.fetch_ticker(symbol)
    except ccxt.NetworkError as e:
        logger.warning("WEEX ticker failed — fallback: %s", e)
        return get_exchange(use_fallback=True).fetch_ticker(symbol)


def list_symbols(quote: str = "USDT") -> list[str]:
    """Return all perpetual swap symbols quoted in *quote* available on WEEX."""
    exchange = get_exchange()
    return [
        s for s, m in exchange.markets.items()
        if m.get("quote") == quote and m.get("type") == "swap" and m.get("active")
    ]


def fetch_funding_rate(symbol: str) -> dict:
    """Fetch current funding rate for a perpetual contract on WEEX."""
    exchange = get_exchange()
    try:
        return exchange.fetch_funding_rate(symbol)
    except ccxt.BaseError as e:
        logger.warning("Could not fetch funding rate for %s: %s", symbol, e)
        return {}


def fetch_open_interest(symbol: str) -> dict:
    """Fetch open interest for a perpetual contract on WEEX."""
    exchange = get_exchange()
    try:
        return exchange.fetch_open_interest(symbol)
    except ccxt.BaseError as e:
        logger.warning("Could not fetch open interest for %s: %s", symbol, e)
        return {}
