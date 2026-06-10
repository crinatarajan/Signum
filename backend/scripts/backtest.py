"""
scripts/backtest.py — Simulate the rules engine on historical data (CLI).

Usage:
    python -m scripts.backtest --symbol BTC/USDT --candles 500
"""

import argparse
import json

from app.services.backtest_service import run_backtest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="BTC/USDT")
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--candles", type=int, default=500)
    parser.add_argument("--exchange", default="weex")
    parser.add_argument("--target-pct", type=float, default=0.02)
    parser.add_argument("--stop-pct", type=float, default=0.01)
    parser.add_argument("--forward", type=int, default=4)
    args = parser.parse_args()

    results = run_backtest(
        symbol=args.symbol,
        timeframe=args.timeframe,
        candles=args.candles,
        exchange_name=args.exchange,
        target_pct=args.target_pct,
        stop_pct=args.stop_pct,
        forward=args.forward,
    )

    summary = results["summary"]
    print(f"\n{'='*40}")
    print(f"Backtest: {results['symbol']} | {results['timeframe']} | {results['candles']} candles")
    print(f"Trades: {summary['total_trades']}  |  Wins: {summary['wins']}  |  Losses: {summary['losses']}")
    print(f"Win Rate: {summary['win_rate']:.1%}")
    print(f"Total Return: {summary['total_return_pct']}%")
    print(f"Profit Factor: {summary['profit_factor']}")
    print(f"{'='*40}\n")

    for t in results["trades"]:
        print(json.dumps(t))


if __name__ == "__main__":
    main()
