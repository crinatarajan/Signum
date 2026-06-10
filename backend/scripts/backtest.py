"""
scripts/backtest.py — Simulate the rules engine on historical data.

Usage:
    python -m scripts.backtest --symbol BTC/USDT --candles 500
"""

import argparse
import pandas as pd

from app.services.data import fetch_ohlcv
from app.services.indicators import add_all_indicators
from app.services.rules import _score_long, _score_short

THRESHOLD   = 60
TARGET_PCT  = 0.02
STOP_PCT    = 0.01
FORWARD     = 4      # candles to check for target/stop hit


def backtest(symbol: str, timeframe: str = "1h", candles: int = 500):
    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=candles)
    df = add_all_indicators(df)
    df["macd_hist_prev"] = df["macd_hist"].shift(1)
    df.dropna(inplace=True)

    trades = []
    closes = df["close"].values

    for i in range(len(df) - FORWARD):
        row       = df.iloc[i]
        long_sc   = _score_long(row)
        short_sc  = _score_short(row)

        if long_sc < THRESHOLD and short_sc < THRESHOLD:
            continue

        direction = "LONG" if long_sc >= short_sc else "SHORT"
        entry     = closes[i]
        result    = "OPEN"

        for j in range(1, FORWARD + 1):
            future = closes[i + j]
            if direction == "LONG":
                if future >= entry * (1 + TARGET_PCT):
                    result = "WIN"
                    break
                if future <= entry * (1 - STOP_PCT):
                    result = "LOSS"
                    break
            else:
                if future <= entry * (1 - TARGET_PCT):
                    result = "WIN"
                    break
                if future >= entry * (1 + STOP_PCT):
                    result = "LOSS"
                    break

        trades.append({
            "time":      df.index[i],
            "direction": direction,
            "entry":     entry,
            "result":    result,
            "confidence": max(long_sc, short_sc),
        })

    df_trades = pd.DataFrame(trades)
    if df_trades.empty:
        print("No trades found.")
        return

    wins   = (df_trades["result"] == "WIN").sum()
    losses = (df_trades["result"] == "LOSS").sum()
    total  = wins + losses
    wr     = wins / total if total else 0

    print(f"\n{'='*40}")
    print(f"Backtest: {symbol} | {timeframe} | {candles} candles")
    print(f"Trades: {total}  |  Wins: {wins}  |  Losses: {losses}")
    print(f"Win Rate: {wr:.1%}")
    print(f"{'='*40}\n")
    print(df_trades.to_string(index=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol",    default="BTC/USDT")
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--candles",   type=int, default=500)
    args = parser.parse_args()
    backtest(args.symbol, args.timeframe, args.candles)
