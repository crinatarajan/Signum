"""
finora_ai.py  ─  Finora-style AI analysis engine
Generates natural-language trade analysis + structured suggestions
powered by Anthropic Claude (claude-sonnet-4-20250514).

The style mirrors Finora AI's Telegram bot output:
  • Smart-money / ICT / price-action framing
  • Key support & resistance levels
  • Directional bias with invalidation
  • Concrete long / short setups with entry, TP, SL
  • Risk disclaimer
"""

import os
import json
import logging
from typing import Any
import anthropic
import pandas as pd

from .indicators import (
    rsi,
    macd,
    bollinger_bands,
    atr,
    ema,
)

logger = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_indicator_summary(df: pd.DataFrame) -> dict[str, Any]:
    """Compute a snapshot of all indicators from the OHLCV dataframe."""
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    rsi_val = rsi(close).iloc[-1]
    macd_line, signal_line, hist = macd(close)
    bb_upper, bb_mid, bb_lower = bollinger_bands(close)
    atr_val = atr(high, low, close).iloc[-1]
    ema20 = ema(close, 20).iloc[-1]
    ema50 = ema(close, 50).iloc[-1]
    ema200 = ema(close, 200).iloc[-1]

    current_price = float(close.iloc[-1])
    prev_close = float(close.iloc[-2])
    price_change_pct = ((current_price - prev_close) / prev_close) * 100

    # Recent swing high / low (last 20 candles)
    swing_high = float(high.iloc[-20:].max())
    swing_low = float(low.iloc[-20:].min())
    swing_mid = (swing_high + swing_low) / 2

    return {
        "current_price": round(current_price, 6),
        "price_change_pct": round(price_change_pct, 2),
        "rsi_14": round(float(rsi_val), 2),
        "macd_line": round(float(macd_line.iloc[-1]), 6),
        "macd_signal": round(float(signal_line.iloc[-1]), 6),
        "macd_histogram": round(float(hist.iloc[-1]), 6),
        "bb_upper": round(float(bb_upper.iloc[-1]), 6),
        "bb_mid": round(float(bb_mid.iloc[-1]), 6),
        "bb_lower": round(float(bb_lower.iloc[-1]), 6),
        "atr": round(float(atr_val), 6),
        "ema_20": round(float(ema20), 6),
        "ema_50": round(float(ema50), 6),
        "ema_200": round(float(ema200), 6),
        "swing_high_20": round(swing_high, 6),
        "swing_low_20": round(swing_low, 6),
        "swing_mid_20": round(swing_mid, 6),
        "avg_volume_20": round(float(volume.iloc[-20:].mean()), 2),
        "last_volume": round(float(volume.iloc[-1]), 2),
    }


# ---------------------------------------------------------------------------
# AI analysis
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """
You are Finora AI, an expert crypto trading analyst specialising in:
  - Smart Money Concepts (SMC) / ICT methodology
  - Price Action analysis (swing highs/lows, market structure, liquidity sweeps)
  - Multi-indicator confluence (RSI, MACD, Bollinger Bands, EMAs, ATR)

Your analysis style:
  1. State the overall trend and market structure briefly.
  2. Identify the most recent swing high and swing low; calculate equilibrium.
  3. List critical support and resistance levels with specific prices.
  4. Describe the primary bullish and bearish scenario with exact invalidation levels.
  5. Provide ONE concrete trade setup (entry zone, TP1, TP2, SL) with rationale.
  6. Be direct and specific — use the actual numbers provided.
  7. End with: "This is not investment advice. Always wait for confirmation and manage your risk."

Return ONLY valid JSON (no markdown fences, no preamble) with this exact schema:
{
  "summary": "<2-3 sentence market summary>",
  "trend": "bullish" | "bearish" | "ranging",
  "bias": "long" | "short" | "neutral",
  "key_levels": {
    "resistance": [<float>, ...],
    "support": [<float>, ...]
  },
  "scenarios": {
    "bullish": "<description with invalidation level>",
    "bearish": "<description with invalidation level>"
  },
  "setup": {
    "direction": "long" | "short",
    "entry_zone": [<float>, <float>],
    "take_profit_1": <float>,
    "take_profit_2": <float>,
    "stop_loss": <float>,
    "risk_reward": <float>,
    "rationale": "<1-2 sentences>"
  },
  "confluence_notes": "<indicator confluence summary>",
  "disclaimer": "This is not investment advice. Always wait for confirmation and manage your risk."
}
""".strip()


def analyse(
    symbol: str,
    timeframe: str,
    df: pd.DataFrame,
    funding_rate: float | None = None,
    open_interest: float | None = None,
    extra_context: str = "",
) -> dict[str, Any]:
    """
    Run Finora-style AI analysis on OHLCV data.

    Parameters
    ----------
    symbol        : e.g. "BTC/USDT"
    timeframe     : e.g. "1h"
    df            : OHLCV dataframe from data.fetch_ohlcv
    funding_rate  : optional current funding rate (WEEX perpetuals)
    open_interest : optional open interest value
    extra_context : any additional text to include in the prompt

    Returns
    -------
    Parsed JSON dict matching the schema above.
    """
    indicators = _build_indicator_summary(df)

    oi_text = (
        f"\n- Open Interest: {open_interest:,.0f} USDT"
        if open_interest else ""
    )
    fr_text = (
        f"\n- Funding Rate: {funding_rate:.4%}"
        if funding_rate is not None else ""
    )
    extra_text = f"\n\nAdditional context:\n{extra_context}" if extra_context else ""

    user_msg = f"""
Analyse {symbol} on the {timeframe} timeframe (WEEX exchange, perpetual swap).

=== Indicator Snapshot ===
{json.dumps(indicators, indent=2)}{oi_text}{fr_text}{extra_text}

Provide the full Finora-style analysis JSON.
""".strip()

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw_text = response.content[0].text.strip()
    # Strip accidental markdown fences if model adds them
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw_text = raw_text.strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Finora AI returned non-JSON: %s", raw_text)
        result = {"raw": raw_text, "error": "parse_failed"}

    result["symbol"] = symbol
    result["timeframe"] = timeframe
    result["indicators"] = indicators
    return result


def quick_summary(symbol: str, timeframe: str, df: pd.DataFrame) -> str:
    """
    Return a short plain-text summary (for push notifications / dashboard cards).
    """
    data = analyse(symbol, timeframe, df)
    bias = data.get("bias", "neutral").upper()
    trend = data.get("trend", "unknown")
    setup = data.get("setup", {})
    direction = setup.get("direction", "N/A").upper()
    tp1 = setup.get("take_profit_1", "?")
    sl = setup.get("stop_loss", "?")
    summary = data.get("summary", "")
    return (
        f"[Finora AI] {symbol} | {timeframe}\n"
        f"Trend: {trend}  Bias: {bias}\n"
        f"Setup: {direction}  TP1: {tp1}  SL: {sl}\n"
        f"{summary}\n"
        f"⚠️ Not financial advice."
    )
