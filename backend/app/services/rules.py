"""
rules.py  ─  Rules-based signal engine
Combines technical indicators + WEEX-specific market data
(funding rate, open interest) for stronger signal confluence.
"""

import pandas as pd
import numpy as np
from .indicators import rsi, macd, bollinger_bands, atr, ema


# ---------------------------------------------------------------------------
# Signal dataclass
# ---------------------------------------------------------------------------

from dataclasses import dataclass, field


@dataclass
class Signal:
    symbol: str
    direction: str          # "LONG" | "SHORT" | "NEUTRAL"
    confidence: float       # 0.0 – 1.0
    entry: float
    target: float
    stop_loss: float
    risk_reward: float
    reasons: list[str] = field(default_factory=list)
    timeframe: str = "1h"
    exchange: str = "weex"
    bullish_score: float = 0.0
    bearish_score: float = 0.0
    max_score: float = 4.0


# ---------------------------------------------------------------------------
# Core rules engine
# ---------------------------------------------------------------------------

def generate_signal(
    symbol: str,
    df: pd.DataFrame,
    timeframe: str = "1h",
    funding_rate: float | None = None,
    open_interest_change: float | None = None,   # % change vs prev period
) -> Signal:
    """
    Generate a LONG / SHORT / NEUTRAL signal from OHLCV data.

    WEEX-specific enhancements:
      - Funding rate contrarian filter:
          extreme positive FR (>0.05 %) → bearish bias
          extreme negative FR (<-0.03 %) → bullish bias
      - Open interest confirmation:
          rising OI + bullish indicators → stronger LONG
          rising OI + bearish indicators → stronger SHORT
    """
    close = df["close"]
    high = df["high"]
    low = df["low"]

    # Indicators
    rsi_val = float(rsi(close).iloc[-1])
    macd_line, signal_line, hist = macd(close)
    macd_cross = float(hist.iloc[-1])
    bb_upper, bb_mid, bb_lower = bollinger_bands(close)
    atr_val = float(atr(high, low, close).iloc[-1])
    ema20 = float(ema(close, 20).iloc[-1])
    ema50 = float(ema(close, 50).iloc[-1])
    price = float(close.iloc[-1])

    bullish_score = 0
    bearish_score = 0
    reasons: list[str] = []

    # ── RSI ──────────────────────────────────────────────────────────────
    if rsi_val < 35:
        bullish_score += 1
        reasons.append(f"RSI oversold ({rsi_val:.1f})")
    elif rsi_val > 65:
        bearish_score += 1
        reasons.append(f"RSI overbought ({rsi_val:.1f})")

    # ── MACD ─────────────────────────────────────────────────────────────
    if macd_cross > 0 and float(hist.iloc[-2]) < 0:
        bullish_score += 1
        reasons.append("MACD bullish crossover")
    elif macd_cross < 0 and float(hist.iloc[-2]) > 0:
        bearish_score += 1
        reasons.append("MACD bearish crossover")
    elif macd_cross > 0:
        bullish_score += 0.5
    elif macd_cross < 0:
        bearish_score += 0.5

    # ── Bollinger Bands ───────────────────────────────────────────────────
    bb_u = float(bb_upper.iloc[-1])
    bb_l = float(bb_lower.iloc[-1])
    if price < bb_l:
        bullish_score += 1
        reasons.append("Price below lower Bollinger Band (oversold squeeze)")
    elif price > bb_u:
        bearish_score += 1
        reasons.append("Price above upper Bollinger Band (overbought)")

    # ── EMA trend ────────────────────────────────────────────────────────
    if price > ema20 > ema50:
        bullish_score += 1
        reasons.append("Price above EMA20 > EMA50 (uptrend)")
    elif price < ema20 < ema50:
        bearish_score += 1
        reasons.append("Price below EMA20 < EMA50 (downtrend)")

    # ── WEEX: Funding rate contrarian ─────────────────────────────────────
    if funding_rate is not None:
        if funding_rate > 0.0005:          # > 0.05 % → longs paying heavily
            bearish_score += 0.5
            reasons.append(f"High funding rate ({funding_rate:.4%}) — longs crowded")
        elif funding_rate < -0.0003:       # < -0.03 % → shorts paying heavily
            bullish_score += 0.5
            reasons.append(f"Negative funding rate ({funding_rate:.4%}) — shorts crowded")

    # ── WEEX: Open interest confirmation ──────────────────────────────────
    if open_interest_change is not None:
        if open_interest_change > 5:       # OI rising > 5 %
            if bullish_score > bearish_score:
                bullish_score += 0.5
                reasons.append(f"Rising OI (+{open_interest_change:.1f}%) confirms longs")
            else:
                bearish_score += 0.5
                reasons.append(f"Rising OI (+{open_interest_change:.1f}%) confirms shorts")

    # ── Determine direction ───────────────────────────────────────────────
    max_score = 4.0   # denominator for confidence
    if bullish_score > bearish_score and bullish_score >= 1.5:
        direction = "LONG"
        confidence = min(bullish_score / max_score, 1.0)
        target = price + 2.5 * atr_val
        stop_loss = price - 1.5 * atr_val
    elif bearish_score > bullish_score and bearish_score >= 1.5:
        direction = "SHORT"
        confidence = min(bearish_score / max_score, 1.0)
        target = price - 2.5 * atr_val
        stop_loss = price + 1.5 * atr_val
    else:
        direction = "NEUTRAL"
        confidence = 0.0
        # Still compute "would-be" levels based on the leaning side, so a
        # near-threshold signal can be surfaced as a "Watch" candidate.
        if bullish_score >= bearish_score:
            target = price + 2.5 * atr_val
            stop_loss = price - 1.5 * atr_val
        else:
            target = price - 2.5 * atr_val
            stop_loss = price + 1.5 * atr_val

    risk = abs(price - stop_loss)
    reward = abs(target - price)
    rr = round(reward / risk, 2) if risk > 0 else 0.0

    return Signal(
        symbol=symbol,
        direction=direction,
        confidence=round(confidence, 3),
        entry=round(price, 6),
        target=round(target, 6),
        stop_loss=round(stop_loss, 6),
        risk_reward=rr,
        reasons=reasons,
        timeframe=timeframe,
        exchange="weex",
        bullish_score=round(bullish_score, 2),
        bearish_score=round(bearish_score, 2),
        max_score=max_score,
    )
