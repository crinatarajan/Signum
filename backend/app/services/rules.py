"""
services/rules.py — Rules-based long/short signal engine.

Scoring breakdown (max 100 pts each direction):

  Technicals  (up to 75 pts)
  ─────────────────────────────────────────────────────────────
  RSI position            0 / 10 / 20 / 30
  MACD histogram flip     0 / 25
  Price vs Bollinger Band 0 / 8 / 15
  EMA trend filter        0 / 5 / 10

  Order-flow / derivatives  (up to 45 pts — total capped at 100)
  ─────────────────────────────────────────────────────────────
  OI trend (5-candle slope)  0 / 10 / 20   rising vs falling vs diverging
  OI divergence bonus        0 / 10        price/OI disagree → exhaustion
  Funding rate extremes      0 / 10 / 25   crowded retail = contrarian signal
  Long/Short ratio           0 / 5         extreme retail positioning

  Multi-timeframe penalty    −20 pts  if 4h trend contradicts

  Final score is capped at 100.

Funding rate thresholds (hourly):
  > +0.01%  → retail crowded LONG  → SHORT boost / LONG penalty
  < −0.01%  → retail crowded SHORT → LONG boost  / SHORT penalty
  |rate| > 0.03% → extreme crowd  → maximum counter-trade boost

Open Interest logic (5-candle slope):
  OI rising  + price rising  → confirms LONG
  OI rising  + price falling → confirms SHORT (new shorts piling in)
  OI falling + price rising  → long exhaustion → SHORT setup
  OI falling + price falling → short exhaustion → LONG setup

OI source:
  Coinbase does not provide OI/funding data (spot-only exchange).
  We fall back to Binance Futures (unauthenticated — public endpoints only).
  Symbol mapping: BTC/USDT → BTC/USDT:USDT on Binance futures.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

import ccxt
import pandas as pd
from dotenv import load_dotenv

from app.services.data import fetch_ohlcv, fetch_multi_timeframe
from app.services.indicators import add_all_indicators

load_dotenv()


# ─────────────────────────────────────────────────────────────────────────────
# Shared exchange instances (module-level singletons — avoids reconnecting
# on every call inside scan_all_pairs)
# ─────────────────────────────────────────────────────────────────────────────

_coinbase_exchange: ccxt.Exchange | None = None
_binance_futures_exchange: ccxt.Exchange | None = None


def _get_coinbase() -> ccxt.Exchange:
    global _coinbase_exchange
    if _coinbase_exchange is None:
        _coinbase_exchange = ccxt.coinbase({
            "apiKey":          os.getenv("COINBASE_API_KEY", ""),
            "secret":          os.getenv("COINBASE_API_SECRET", ""),
            "enableRateLimit": True,
        })
    return _coinbase_exchange


def _get_binance_futures() -> ccxt.Exchange:
    """
    Binance USDM futures — used for OI + funding data only.
    No API key required for public market data endpoints.
    """
    global _binance_futures_exchange
    if _binance_futures_exchange is None:
        _binance_futures_exchange = ccxt.binanceusdm({
            "enableRateLimit": True,
            "options": {"defaultType": "future"},
        })
    return _binance_futures_exchange


def _spot_to_futures_symbol(symbol: str) -> str:
    """
    Convert a spot symbol to a Binance USDM perpetual symbol.
    e.g. "BTC/USDT" → "BTC/USDT:USDT"
    """
    if ":" in symbol:
        return symbol          # already a futures symbol
    base, quote = symbol.split("/")
    return f"{base}/{quote}:{quote}"


# ─────────────────────────────────────────────────────────────────────────────
# Data models
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class OrderFlowData:
    """Snapshot of derivatives market data for one symbol."""
    open_interest: float            # latest OI in base currency
    oi_history: list[float]         # last N OI values (oldest → newest)
    funding_rate: float             # current hourly funding rate (decimal)
    long_ratio: Optional[float]     # long/short ratio 0–1, or None if unavailable
    source: str = "binance_futures"

    # ── Derived OI properties ──────────────────────────────────────────────

    @property
    def oi_change_pct(self) -> float:
        """Change from one period ago to now."""
        if len(self.oi_history) < 2 or self.oi_history[-2] == 0:
            return 0.0
        return (self.oi_history[-1] - self.oi_history[-2]) / self.oi_history[-2]

    @property
    def oi_slope(self) -> float:
        """
        Linear regression slope over oi_history, normalised by mean OI.
        Positive = sustained OI growth; negative = sustained drainage.
        """
        if len(self.oi_history) < 3:
            return self.oi_change_pct
        n   = len(self.oi_history)
        xs  = list(range(n))
        mean_x = sum(xs) / n
        mean_y = sum(self.oi_history) / n
        num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, self.oi_history))
        den = sum((x - mean_x) ** 2 for x in xs)
        raw_slope = num / den if den else 0.0
        return raw_slope / mean_y if mean_y else 0.0   # normalised

    @property
    def oi_trending_up(self) -> bool:
        return self.oi_slope > 0.003    # sustained 0.3%/candle growth

    @property
    def oi_trending_down(self) -> bool:
        return self.oi_slope < -0.003

    @property
    def oi_spike(self) -> bool:
        """Single-candle OI spike >2% — aggressive new position entry."""
        return self.oi_change_pct > 0.02

    # ── Derived funding rate properties ────────────────────────────────────

    @property
    def funding_extreme_long(self) -> bool:
        """Retail crowded LONG — contrarian SHORT signal."""
        return self.funding_rate > 0.0003     # 0.03%/hr

    @property
    def funding_high_long(self) -> bool:
        return 0.0001 < self.funding_rate <= 0.0003   # 0.01–0.03%/hr

    @property
    def funding_extreme_short(self) -> bool:
        """Retail crowded SHORT — contrarian LONG signal."""
        return self.funding_rate < -0.0003

    @property
    def funding_high_short(self) -> bool:
        return -0.0003 <= self.funding_rate < -0.0001

    @property
    def funding_neutral(self) -> bool:
        return abs(self.funding_rate) <= 0.0001


@dataclass
class Signal:
    symbol: str
    direction: str          # "LONG" | "SHORT" | "NEUTRAL"
    confidence: int         # 0–100
    entry: float
    target: float
    stop_loss: float
    timeframe: str
    reason: str
    engine: str = "rules"
    # Score breakdown (exposed in API for debugging / Detail screen)
    tech_score: int = 0
    flow_score: int = 0
    funding_rate: Optional[float] = None
    oi_change_pct: Optional[float] = None
    oi_slope: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────────────
# Order-flow fetching
# ─────────────────────────────────────────────────────────────────────────────

OI_HISTORY_CANDLES = 6    # use 6 candles for the slope — ~6 hours on 1h chart


def fetch_order_flow(symbol: str) -> OrderFlowData | None:
    """
    Fetch Open Interest history + funding rate from Binance USDM futures.

    Falls back gracefully to None for:
      - Spot-only symbols with no futures equivalent
      - Network/rate-limit errors
      - Exchanges that don't support these endpoints

    Args:
        symbol: spot symbol e.g. "BTC/USDT" — auto-converted to futures format
    """
    futures_symbol = _spot_to_futures_symbol(symbol)
    exchange       = _get_binance_futures()

    try:
        # ── Open Interest history ───────────────────────────────────────────
        oi_raw = exchange.fetch_open_interest_history(
            futures_symbol,
            timeframe="1h",
            limit=OI_HISTORY_CANDLES,
        )
        if not oi_raw or len(oi_raw) < 2:
            return None

        oi_history = [float(r.get("openInterestAmount", 0)) for r in oi_raw]
        if any(v == 0 for v in oi_history):
            return None     # bad data

        # ── Funding rate ────────────────────────────────────────────────────
        funding_data = exchange.fetch_funding_rate(futures_symbol)
        funding_rate = float(funding_data.get("fundingRate", 0))

        # ── Long/short ratio (best-effort) ──────────────────────────────────
        long_ratio: Optional[float] = None
        try:
            ls = exchange.fetch_long_short_ratio(futures_symbol, "1h", limit=1)
            if ls:
                long_ratio = float(ls[-1].get("longAccount", 0.5))
        except Exception:
            pass    # not critical — skip silently

        return OrderFlowData(
            open_interest=oi_history[-1],
            oi_history=oi_history,
            funding_rate=funding_rate,
            long_ratio=long_ratio,
        )

    except ccxt.BadSymbol:
        # This pair has no futures market
        return None
    except Exception as exc:
        print(f"[order_flow] {symbol}: {type(exc).__name__}: {exc}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Technical scoring
# ─────────────────────────────────────────────────────────────────────────────

def _score_long_tech(row: pd.Series) -> tuple[int, list[str]]:
    """
    Score a LONG setup based on technical indicators.
    Returns (score 0–75, list of reason strings).
    """
    score   = 0
    reasons = []

    # RSI: oversold zones
    rsi = row["rsi"]
    if rsi < 25:
        score += 30; reasons.append(f"RSI {rsi:.1f} — deeply oversold")
    elif rsi < 32:
        score += 20; reasons.append(f"RSI {rsi:.1f} — oversold")
    elif rsi < 40:
        score += 10; reasons.append(f"RSI {rsi:.1f} — approaching oversold")

    # MACD histogram: turning up
    hist      = row.get("macd_hist", 0)
    hist_prev = row.get("macd_hist_prev", 0)
    if hist > 0 and hist > hist_prev:
        score += 25; reasons.append("MACD hist flipping positive")
    elif hist > hist_prev and hist_prev < 0:
        score += 12; reasons.append("MACD hist recovering (still negative)")

    # Price at/below lower Bollinger Band
    close = row["close"]
    if close <= row["bb_lower"] * 1.002:
        score += 15; reasons.append("Price at lower BB")
    elif close <= row["bb_lower"] * 1.01:
        score += 8;  reasons.append("Price near lower BB")

    # EMA alignment
    if close > row.get("ema_50", 0):
        score += 5
    if row.get("ema_20", 0) > row.get("ema_50", 0):
        score += 5;  reasons.append("EMA 20 > EMA 50 — bullish alignment")

    return min(score, 75), reasons


def _score_short_tech(row: pd.Series) -> tuple[int, list[str]]:
    """
    Score a SHORT setup based on technical indicators.
    Returns (score 0–75, list of reason strings).
    """
    score   = 0
    reasons = []

    rsi = row["rsi"]
    if rsi > 75:
        score += 30; reasons.append(f"RSI {rsi:.1f} — deeply overbought")
    elif rsi > 68:
        score += 20; reasons.append(f"RSI {rsi:.1f} — overbought")
    elif rsi > 60:
        score += 10; reasons.append(f"RSI {rsi:.1f} — approaching overbought")

    hist      = row.get("macd_hist", 0)
    hist_prev = row.get("macd_hist_prev", 0)
    if hist < 0 and hist < hist_prev:
        score += 25; reasons.append("MACD hist flipping negative")
    elif hist < hist_prev and hist_prev > 0:
        score += 12; reasons.append("MACD hist rolling over (still positive)")

    close = row["close"]
    if close >= row["bb_upper"] * 0.998:
        score += 15; reasons.append("Price at upper BB")
    elif close >= row["bb_upper"] * 0.99:
        score += 8;  reasons.append("Price near upper BB")

    if close < row.get("ema_50", float("inf")):
        score += 5
    if row.get("ema_20", float("inf")) < row.get("ema_50", float("inf")):
        score += 5;  reasons.append("EMA 20 < EMA 50 — bearish alignment")

    return min(score, 75), reasons


# ─────────────────────────────────────────────────────────────────────────────
# Order-flow scoring
# ─────────────────────────────────────────────────────────────────────────────

def _score_long_flow(of: OrderFlowData, price_rising: bool) -> tuple[int, list[str]]:
    """
    Order-flow score for a LONG setup (−30 to +45, floored at 0).
    Returns (score, list of reason strings).
    """
    score   = 0
    reasons = []

    # ── Open Interest trend (5-candle slope) ────────────────────────────────
    if of.oi_trending_up and price_rising:
        # New money entering as price rises = genuine demand
        score += 20
        reasons.append(
            f"OI trend ↑ (slope {of.oi_slope:+.3f}) + price rising — demand confirmed"
        )
    elif of.oi_trending_up and not price_rising:
        # New money entering as price falls = new shorts → bearish
        score -= 15
        reasons.append(
            f"OI trend ↑ (slope {of.oi_slope:+.3f}) while price falls — shorts entering, LONG headwind"
        )
    elif of.oi_trending_down and not price_rising:
        # Short positions being closed → short exhaustion → LONG opportunity
        score += 10
        reasons.append(
            f"OI draining (slope {of.oi_slope:+.3f}) while price falls — short exhaustion / reversal risk"
        )
    elif of.oi_trending_down and price_rising:
        # Longs closing into the rally → weak move
        score -= 5
        reasons.append(
            f"OI draining (slope {of.oi_slope:+.3f}) while price rises — longs taking profit, weak rally"
        )

    # Spike bonus: single-candle OI burst while price is rising → strong LONG momentum
    if of.oi_spike and price_rising:
        score += 10
        reasons.append(f"OI spike {of.oi_change_pct:+.1%} — aggressive buyers entering")

    # ── Funding rate ────────────────────────────────────────────────────────
    if of.funding_extreme_short:
        # Everyone is short → squeeze fuel → strong LONG signal
        score += 25
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — extreme retail SHORT, squeeze risk ↑"
        )
    elif of.funding_high_short:
        score += 10
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — elevated retail SHORT bias"
        )
    elif of.funding_extreme_long:
        # Everyone is long → flush fuel → bad for LONG
        score -= 20
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — retail crowded LONG, flush risk ↑"
        )
    elif of.funding_high_long:
        score -= 8
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — elevated LONG bias, mild headwind"
        )
    # neutral funding → no score adjustment

    # ── Long/short ratio ────────────────────────────────────────────────────
    if of.long_ratio is not None:
        if of.long_ratio < 0.35:
            score += 5
            reasons.append(
                f"L/S ratio {of.long_ratio:.0%} long — extreme retail short positioning"
            )
        elif of.long_ratio > 0.72:
            score -= 5
            reasons.append(
                f"L/S ratio {of.long_ratio:.0%} long — retail overly bullish"
            )

    return max(score, 0), reasons


def _score_short_flow(of: OrderFlowData, price_rising: bool) -> tuple[int, list[str]]:
    """
    Order-flow score for a SHORT setup (−30 to +45, floored at 0).
    Returns (score, list of reason strings).
    """
    score   = 0
    reasons = []

    # ── Open Interest trend ──────────────────────────────────────────────────
    if of.oi_trending_up and not price_rising:
        # New shorts piling in as price falls = confirmed downtrend
        score += 20
        reasons.append(
            f"OI trend ↑ (slope {of.oi_slope:+.3f}) + price falling — SHORT confirmed"
        )
    elif of.oi_trending_up and price_rising:
        # New longs entering into strength → bullish, bad for SHORT
        score -= 15
        reasons.append(
            f"OI trend ↑ (slope {of.oi_slope:+.3f}) while price rises — longs entering, SHORT headwind"
        )
    elif of.oi_trending_down and price_rising:
        # Longs closing into rally → bull exhaustion → SHORT opportunity
        score += 10
        reasons.append(
            f"OI draining (slope {of.oi_slope:+.3f}) while price rises — long exhaustion / reversal risk"
        )
    elif of.oi_trending_down and not price_rising:
        # Shorts covering into dip → weak move
        score -= 5
        reasons.append(
            f"OI draining (slope {of.oi_slope:+.3f}) while price falls — shorts covering, weak dump"
        )

    # Spike bonus: OI burst while price is falling → aggressive shorting
    if of.oi_spike and not price_rising:
        score += 10
        reasons.append(f"OI spike {of.oi_change_pct:+.1%} — aggressive sellers entering")

    # ── Funding rate ────────────────────────────────────────────────────────
    if of.funding_extreme_long:
        # Everyone is long → flush fuel → strong SHORT signal
        score += 25
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — extreme retail LONG, flush risk ↑"
        )
    elif of.funding_high_long:
        score += 10
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — elevated retail LONG bias"
        )
    elif of.funding_extreme_short:
        score -= 20
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — retail crowded SHORT, squeeze risk ↑"
        )
    elif of.funding_high_short:
        score -= 8
        reasons.append(
            f"Funding {of.funding_rate*100:+.4f}% — elevated SHORT bias, mild headwind"
        )

    # ── Long/short ratio ────────────────────────────────────────────────────
    if of.long_ratio is not None:
        if of.long_ratio > 0.72:
            score += 5
            reasons.append(
                f"L/S ratio {of.long_ratio:.0%} long — retail crowded long, ripe for flush"
            )
        elif of.long_ratio < 0.35:
            score -= 5
            reasons.append(
                f"L/S ratio {of.long_ratio:.0%} long — retail already short-heavy"
            )

    return max(score, 0), reasons


# ─────────────────────────────────────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

def _trend_from_df(df: pd.DataFrame) -> str:
    """Return 'up', 'down', or 'neutral' based on EMA 50 slope over last 3 candles."""
    if len(df) < 3:
        return "neutral"
    ema = df["ema_50"].dropna()
    if len(ema) < 3:
        return "neutral"
    if ema.iloc[-1] > ema.iloc[-3]:
        return "up"
    if ema.iloc[-1] < ema.iloc[-3]:
        return "down"
    return "neutral"


def _price_direction(df: pd.DataFrame, lookback: int = 3) -> bool:
    """True if net price movement over `lookback` candles is positive."""
    closes = df["close"].iloc[-lookback:]
    return float(closes.iloc[-1]) > float(closes.iloc[0])


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_signal(symbol: str, threshold: int | None = None) -> Signal:
    """
    Full evaluation: technicals + order-flow, multi-timeframe confirmation.

    Args:
        symbol:    Spot symbol e.g. "BTC/USDT".
                   OI/funding fetched from Binance futures (no key required).
        threshold: Minimum confidence to emit LONG/SHORT.
                   Defaults to env RULES_CONFIDENCE_THRESHOLD (default 60).
    """
    if threshold is None:
        threshold = int(os.getenv("RULES_CONFIDENCE_THRESHOLD", 60))

    # ── Price data (from Coinbase) ───────────────────────────────────────────
    frames = fetch_multi_timeframe(symbol)
    dfs    = {tf: add_all_indicators(df.copy()) for tf, df in frames.items()}

    df_1h = dfs["1h"]
    df_4h = dfs["4h"]

    last = df_1h.iloc[-1].copy()
    last["macd_hist_prev"] = df_1h.iloc[-2]["macd_hist"]

    price     = float(last["close"])
    atr       = float(last["atr"])
    trend_4h  = _trend_from_df(df_4h)
    rising_1h = _price_direction(df_1h)

    # ── Order-flow data (from Binance futures — no auth needed) ─────────────
    of = fetch_order_flow(symbol)

    # ── Score ────────────────────────────────────────────────────────────────
    long_tech,  long_tech_reasons  = _score_long_tech(last)
    short_tech, short_tech_reasons = _score_short_tech(last)

    if of is not None:
        long_flow,  long_flow_reasons  = _score_long_flow(of,  rising_1h)
        short_flow, short_flow_reasons = _score_short_flow(of, rising_1h)
    else:
        long_flow = short_flow = 0
        long_flow_reasons = short_flow_reasons = ["OI/funding unavailable (spot-only pair)"]

    long_score  = min(long_tech  + long_flow,  100)
    short_score = min(short_tech + short_flow, 100)

    # Multi-timeframe confirmation penalty
    if trend_4h == "down":
        long_score  = max(0, long_score  - 20)
    if trend_4h == "up":
        short_score = max(0, short_score - 20)

    # ── Shared metadata ──────────────────────────────────────────────────────
    oi_change  = of.oi_change_pct if of else None
    oi_slope   = of.oi_slope      if of else None
    fund_rate  = of.funding_rate  if of else None

    base_meta  = [f"4h trend: {trend_4h}"]
    if of is None:
        base_meta.append("no derivatives data")

    # ── Emit signal ──────────────────────────────────────────────────────────
    if long_score >= threshold and long_score >= short_score:
        reasons = long_tech_reasons + long_flow_reasons + base_meta
        return Signal(
            symbol=symbol,
            direction="LONG",
            confidence=long_score,
            entry=price,
            target=round(price + 2 * atr, 4),
            stop_loss=round(price - 1 * atr, 4),
            timeframe="1h",
            reason=" | ".join(r for r in reasons if r),
            tech_score=long_tech,
            flow_score=long_flow,
            funding_rate=fund_rate,
            oi_change_pct=oi_change,
            oi_slope=oi_slope,
        )

    if short_score >= threshold and short_score > long_score:
        reasons = short_tech_reasons + short_flow_reasons + base_meta
        return Signal(
            symbol=symbol,
            direction="SHORT",
            confidence=short_score,
            entry=price,
            target=round(price - 2 * atr, 4),
            stop_loss=round(price + 1 * atr, 4),
            timeframe="1h",
            reason=" | ".join(r for r in reasons if r),
            tech_score=short_tech,
            flow_score=short_flow,
            funding_rate=fund_rate,
            oi_change_pct=oi_change,
            oi_slope=oi_slope,
        )

    return Signal(
        symbol=symbol,
        direction="NEUTRAL",
        confidence=max(long_score, short_score),
        entry=price,
        target=price,
        stop_loss=price,
        timeframe="1h",
        reason="No high-confidence setup — " + " | ".join(base_meta),
        tech_score=max(long_tech, short_tech),
        flow_score=max(long_flow, short_flow),
        funding_rate=fund_rate,
        oi_change_pct=oi_change,
        oi_slope=oi_slope,
    )


def scan_all_pairs(pairs: list[str]) -> list[Signal]:
    """
    Scan all pairs and return non-neutral signals, sorted by confidence.
    Reuses module-level exchange singletons across pairs to avoid reconnecting.
    """
    signals: list[Signal] = []
    for pair in pairs:
        try:
            sig = evaluate_signal(pair)
            if sig.direction != "NEUTRAL":
                signals.append(sig)
        except Exception as exc:
            print(f"[rules] {pair}: {type(exc).__name__}: {exc}")

    signals.sort(key=lambda s: s.confidence, reverse=True)
    return signals
