"""
services/data.py — Fetches OHLCV candlestick data from Coinbase via CCXT.

Usage:
    from app.services.data import fetch_ohlcv
    df = fetch_ohlcv("BTC/USDT", timeframe="1h", limit=200)
"""

import os
import ccxt
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Exchange setup
# ---------------------------------------------------------------------------

def _get_exchange() -> ccxt.Exchange:
    """Return an authenticated Coinbase Advanced Trade exchange instance."""
    exchange = ccxt.coinbase({
        "apiKey": os.getenv("COINBASE_API_KEY", ""),
        "secret": os.getenv("COINBASE_API_SECRET", ""),
        "enableRateLimit": True,
    })
    return exchange


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def fetch_ohlcv(
    symbol: str,
    timeframe: str = "1h",
    limit: int = 300,
) -> pd.DataFrame:
    """
    Fetch OHLCV data for a given trading pair.

    Args:
        symbol:    e.g. "BTC/USDT"
        timeframe: e.g. "1h", "4h", "1d"
        limit:     number of candles to fetch

    Returns:
        DataFrame with columns: timestamp, open, high, low, close, volume
    """
    exchange = _get_exchange()
    raw = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    df.set_index("timestamp", inplace=True)
    df = df.astype(float)
    return df


def fetch_multi_timeframe(symbol: str) -> dict[str, pd.DataFrame]:
    """
    Convenience: fetch 1h, 4h, and 1d frames in one call.
    Used by the rules engine for multi-timeframe confirmation.
    """
    return {
        "1h":  fetch_ohlcv(symbol, "1h",  limit=200),
        "4h":  fetch_ohlcv(symbol, "4h",  limit=100),
        "1d":  fetch_ohlcv(symbol, "1d",  limit=60),
    }


def get_watch_pairs() -> list[str]:
    """Return the list of pairs configured in .env."""
    raw = os.getenv("WATCH_PAIRS", "BTC/USDT,ETH/USDT")
    return [p.strip() for p in raw.split(",") if p.strip()]
