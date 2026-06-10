"""
services/indicators.py — Technical indicator calculations using pandas-ta.

All functions accept a DataFrame (from data.py) and return it
with additional indicator columns appended.

Usage:
    from app.services.indicators import add_all_indicators
    df = add_all_indicators(df)
    print(df[["close", "rsi", "macd", "atr"]].tail())
"""

import pandas as pd
import pandas_ta as ta


def add_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    df["rsi"] = ta.rsi(df["close"], length=period)
    return df


def add_macd(df: pd.DataFrame) -> pd.DataFrame:
    macd = ta.macd(df["close"])   # returns DataFrame: MACD_12_26_9, MACDh_..., MACDs_...
    df["macd"]        = macd["MACD_12_26_9"]
    df["macd_signal"] = macd["MACDs_12_26_9"]
    df["macd_hist"]   = macd["MACDh_12_26_9"]
    return df


def add_bollinger(df: pd.DataFrame, period: int = 20, std: float = 2.0) -> pd.DataFrame:
    bb = ta.bbands(df["close"], length=period, std=std)
    df["bb_upper"] = bb[f"BBU_{period}_{std}"]
    df["bb_mid"]   = bb[f"BBM_{period}_{std}"]
    df["bb_lower"] = bb[f"BBL_{period}_{std}"]
    df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / df["bb_mid"]  # volatility proxy
    return df


def add_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    df["atr"] = ta.atr(df["high"], df["low"], df["close"], length=period)
    df["atr_pct"] = df["atr"] / df["close"] * 100   # ATR as % of price
    return df


def add_ema(df: pd.DataFrame, periods: list[int] = [20, 50, 200]) -> pd.DataFrame:
    for p in periods:
        df[f"ema_{p}"] = ta.ema(df["close"], length=p)
    return df


def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Apply the full indicator suite in one call."""
    df = add_rsi(df)
    df = add_macd(df)
    df = add_bollinger(df)
    df = add_atr(df)
    df = add_ema(df)
    df.dropna(inplace=True)
    return df
