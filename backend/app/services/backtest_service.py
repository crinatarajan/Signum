"""
services/backtest.py — Rules-engine backtest as a callable service.

Returns structured JSON suitable for both CLI and the /backtest REST endpoint.
"""

from __future__ import annotations
import pandas as pd
import numpy as np

from .data import fetch_ohlcv
from .indicators import add_all_indicators
from .rules import generate_signal

CONFIDENCE_THRESHOLD = 0.40   # min confidence to take a trade


def run_backtest(
    symbol: str,
    timeframe: str = "1h",
    candles: int = 500,
    exchange_name: str = "weex",
    target_pct: float = 0.02,
    stop_pct: float = 0.01,
    forward: int = 4,
) -> dict:
    """
    Simulate the rules engine on historical OHLCV data.

    Returns
    -------
    dict with keys:
        summary   : win rate, total trades, avg R:R, etc.
        trades    : list of individual trade dicts
        equity    : list of {time, equity} for the P&L curve
    """
    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=candles, exchange_name=exchange_name)
    df = add_all_indicators(df)
    df.dropna(inplace=True)

    closes = df["close"].values
    highs  = df["high"].values
    lows   = df["low"].values
    times  = df.index

    trades = []
    equity = 100.0   # start at 100 (%)
    equity_curve = []

    for i in range(len(df) - forward):
        row = df.iloc[i]

        # Build a minimal sub-df to reuse generate_signal
        sub = df.iloc[: i + 1]
        if len(sub) < 50:
            continue

        sig = generate_signal(symbol, sub, timeframe=timeframe)

        if sig.direction == "NEUTRAL" or sig.confidence < CONFIDENCE_THRESHOLD:
            continue

        entry = closes[i]
        direction = sig.direction
        target_price = entry * (1 + target_pct) if direction == "LONG" else entry * (1 - target_pct)
        stop_price   = entry * (1 - stop_pct)   if direction == "LONG" else entry * (1 + stop_pct)

        result = "OPEN"
        exit_price = None
        bars_held = 0

        for j in range(1, forward + 1):
            future_high = highs[i + j]
            future_low  = lows[i + j]

            if direction == "LONG":
                if future_high >= target_price:
                    result = "WIN"
                    exit_price = target_price
                    bars_held = j
                    break
                if future_low <= stop_price:
                    result = "LOSS"
                    exit_price = stop_price
                    bars_held = j
                    break
            else:  # SHORT
                if future_low <= target_price:
                    result = "WIN"
                    exit_price = target_price
                    bars_held = j
                    break
                if future_high >= stop_price:
                    result = "LOSS"
                    exit_price = stop_price
                    bars_held = j
                    break

        if result == "OPEN":
            exit_price = closes[i + forward]
            bars_held = forward
            if direction == "LONG":
                result = "WIN" if exit_price > entry else "LOSS"
            else:
                result = "WIN" if exit_price < entry else "LOSS"

        pnl_pct = (
            (exit_price - entry) / entry * 100
            if direction == "LONG"
            else (entry - exit_price) / entry * 100
        )

        equity += pnl_pct * 0.5   # 0.5% risk per trade
        equity_curve.append({
            "time": str(times[i]),
            "equity": round(equity, 2),
        })

        trades.append({
            "time":       str(times[i]),
            "direction":  direction,
            "entry":      round(float(entry), 6),
            "exit":       round(float(exit_price), 6),
            "result":     result,
            "pnl_pct":    round(pnl_pct, 2),
            "bars_held":  bars_held,
            "confidence": round(float(sig.confidence), 3),
            "reasons":    sig.reasons,
        })

    if not trades:
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "exchange": exchange_name,
            "candles": candles,
            "summary": {
                "total_trades": 0,
                "wins": 0,
                "losses": 0,
                "win_rate": 0.0,
                "avg_pnl_pct": 0.0,
                "total_return_pct": 0.0,
                "avg_bars_held": 0,
                "profit_factor": 0.0,
            },
            "trades": [],
            "equity": [],
        }

    df_t = pd.DataFrame(trades)
    wins   = int((df_t["result"] == "WIN").sum())
    losses = int((df_t["result"] == "LOSS").sum())
    total  = wins + losses

    gross_profit = df_t.loc[df_t["result"] == "WIN", "pnl_pct"].sum()
    gross_loss   = abs(df_t.loc[df_t["result"] == "LOSS", "pnl_pct"].sum())
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else float("inf")

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "exchange": exchange_name,
        "candles": candles,
        "summary": {
            "total_trades":    total,
            "wins":            wins,
            "losses":          losses,
            "win_rate":        round(wins / total, 3) if total else 0.0,
            "avg_pnl_pct":     round(float(df_t["pnl_pct"].mean()), 2),
            "total_return_pct": round(equity - 100, 2),
            "avg_bars_held":   round(float(df_t["bars_held"].mean()), 1),
            "profit_factor":   profit_factor,
        },
        "trades": trades,
        "equity": equity_curve,
    }
