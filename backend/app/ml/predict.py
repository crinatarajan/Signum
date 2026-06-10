"""
ml/predict.py — Load a trained XGBoost model and produce live signals.

Usage:
    from app.ml.predict import ml_signal
    signal = ml_signal("BTC/USDT")
"""

from __future__ import annotations
import os
import pathlib

import joblib
import pandas as pd

from app.services.data import fetch_ohlcv
from app.services.indicators import add_all_indicators
from app.services.rules import Signal   # reuse the same dataclass

MODEL_DIR = pathlib.Path(__file__).parent / "models"


def _model_path(symbol: str, timeframe: str = "1h") -> pathlib.Path:
    slug = symbol.replace("/", "_")
    return MODEL_DIR / f"{slug}_{timeframe}.joblib"


def ml_signal(symbol: str, timeframe: str = "1h", threshold: float | None = None) -> Signal:
    """
    Run the trained XGBoost model on live data and return a Signal.

    Falls back to NEUTRAL if no model file exists for this pair.
    Train first with:  python -m app.ml.train --symbol BTC/USDT
    """
    if threshold is None:
        threshold = float(os.getenv("ML_CONFIDENCE_THRESHOLD", 65)) / 100

    path = _model_path(symbol, timeframe)

    if not path.exists():
        return Signal(
            symbol=symbol,
            direction="NEUTRAL",
            confidence=0,
            entry=0.0,
            target=0.0,
            stop_loss=0.0,
            timeframe=timeframe,
            reason=f"No trained model found at {path}. Run ml/train.py first.",
            engine="ml",
        )

    artifact = joblib.load(path)
    model    = artifact["model"]
    features = artifact["features"]

    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=300)
    df = add_all_indicators(df)

    last_row = df[features].iloc[[-1]]   # shape (1, n_features)
    proba    = model.predict_proba(last_row)[0]   # [prob_0, prob_1]

    price = float(df["close"].iloc[-1])
    atr   = float(df["atr"].iloc[-1])

    long_prob  = float(proba[1])
    short_prob = float(proba[0])   # P(price drops) used as SHORT confidence

    if long_prob >= threshold and long_prob >= short_prob:
        return Signal(
            symbol=symbol,
            direction="LONG",
            confidence=int(long_prob * 100),
            entry=price,
            target=round(price + 2 * atr, 4),
            stop_loss=round(price - 1 * atr, 4),
            timeframe=timeframe,
            reason=f"XGBoost LONG probability: {long_prob:.1%}",
            engine="ml",
        )

    if short_prob >= threshold and short_prob > long_prob:
        return Signal(
            symbol=symbol,
            direction="SHORT",
            confidence=int(short_prob * 100),
            entry=price,
            target=round(price - 2 * atr, 4),
            stop_loss=round(price + 1 * atr, 4),
            timeframe=timeframe,
            reason=f"XGBoost SHORT probability: {short_prob:.1%}",
            engine="ml",
        )

    return Signal(
        symbol=symbol,
        direction="NEUTRAL",
        confidence=int(max(long_prob, short_prob) * 100),
        entry=price,
        target=price,
        stop_loss=price,
        timeframe=timeframe,
        reason=f"ML confidence below threshold ({threshold:.0%}). Long: {long_prob:.1%} | Short: {short_prob:.1%}",
        engine="ml",
    )
