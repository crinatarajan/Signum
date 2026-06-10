"""
ml/predict.py — Load a trained XGBoost or LSTM model and produce live signals.

Usage:
    from app.ml.predict import ml_signal
    signal = ml_signal("BTC/USDT", model_type="lstm")   # or "xgboost" (default)
"""

from __future__ import annotations
import os
import pathlib

import joblib
import numpy as np
import pandas as pd

from app.services.data import fetch_ohlcv
from app.services.indicators import add_all_indicators
from app.services.rules import Signal

MODEL_DIR = pathlib.Path(__file__).parent / "models"

SEQ_LEN = 32  # must match train.py

FEATURE_COLS = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_mid", "bb_lower", "bb_width",
    "atr", "atr_pct",
    "ema_20", "ema_50", "ema_200",
    "volume",
]


def _model_path(symbol: str, timeframe: str = "1h", model_type: str = "xgboost") -> pathlib.Path:
    slug = symbol.replace("/", "_")
    return MODEL_DIR / f"{slug}_{timeframe}_{model_type}.joblib"


def _predict_xgboost(artifact: dict, df: pd.DataFrame, threshold: float) -> tuple[float, float]:
    """Returns (long_prob, short_prob)."""
    model = artifact["model"]
    features = artifact["features"]
    last_row = df[features].iloc[[-1]]
    proba = model.predict_proba(last_row)[0]
    return float(proba[1]), float(proba[0])


def _predict_lstm(artifact: dict, df: pd.DataFrame, threshold: float) -> tuple[float, float]:
    """Returns (long_prob, short_prob)."""
    try:
        import tensorflow as tf  # noqa: F401 — lazy import
    except ImportError:
        raise ImportError(
            "TensorFlow is required for LSTM predictions.\n"
            "Install it with:  pip install tensorflow"
        )

    model = artifact["model"]
    scaler = artifact["scaler"]
    features = artifact.get("features", FEATURE_COLS)
    seq_len = artifact.get("seq_len", SEQ_LEN)

    X = df[features].values
    if len(X) < seq_len:
        raise ValueError(
            f"Not enough candles for LSTM (need {seq_len}, got {len(X)}). "
            "Increase `limit` in fetch_ohlcv."
        )

    X_scaled = scaler.transform(X)
    # Take the last `seq_len` rows as the input sequence
    X_seq = X_scaled[-seq_len:].reshape(1, seq_len, len(features))

    long_prob = float(model.predict(X_seq, verbose=0)[0][0])
    short_prob = 1.0 - long_prob
    return long_prob, short_prob


def ml_signal(
    symbol: str,
    timeframe: str = "1h",
    threshold: float | None = None,
    model_type: str = "xgboost",
    exchange: str = "weex",
) -> Signal:
    """
    Run the trained ML model (XGBoost or LSTM) on live data and return a Signal.

    Falls back to NEUTRAL if no model file exists for this pair/model type.
    Train first with:
        python -m app.ml.train --symbol BTC/USDT --model lstm
    """
    if threshold is None:
        threshold = float(os.getenv("ML_CONFIDENCE_THRESHOLD", 65)) / 100

    path = _model_path(symbol, timeframe, model_type)

    if not path.exists():
        # Try the other model type as a fallback
        other = "lstm" if model_type == "xgboost" else "xgboost"
        fallback_path = _model_path(symbol, timeframe, other)
        if fallback_path.exists():
            path = fallback_path
            model_type = other
        else:
            return Signal(
                symbol=symbol,
                direction="NEUTRAL",
                confidence=0,
                entry=0.0,
                target=0.0,
                stop_loss=0.0,
                risk_reward=0.0,
                timeframe=timeframe,
                exchange=exchange,
                reasons=[
                    f"No trained model found at {path}. "
                    f"Run: python -m app.ml.train --symbol {symbol} --model {model_type}"
                ],
            )

    artifact = joblib.load(path)
    detected_type = artifact.get("type", model_type)

    # Fetch enough candles: LSTM needs at least SEQ_LEN rows after indicators
    limit = max(300, SEQ_LEN + 100)
    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = add_all_indicators(df)
    df.dropna(inplace=True)

    price = float(df["close"].iloc[-1])
    atr = float(df["atr"].iloc[-1])

    if detected_type == "lstm":
        long_prob, short_prob = _predict_lstm(artifact, df, threshold)
    else:
        long_prob, short_prob = _predict_xgboost(artifact, df, threshold)

    engine_label = f"ML/{detected_type.upper()}"

    if long_prob >= threshold and long_prob >= short_prob:
        target = round(price + 2 * atr, 4)
        stop = round(price - 1 * atr, 4)
        rr = round(abs(target - price) / abs(price - stop), 2) if price != stop else 0.0
        return Signal(
            symbol=symbol,
            direction="LONG",
            confidence=round(long_prob, 3),
            entry=price,
            target=target,
            stop_loss=stop,
            risk_reward=rr,
            timeframe=timeframe,
            exchange=exchange,
            reasons=[f"{engine_label} LONG probability: {long_prob:.1%}"],
        )

    if short_prob >= threshold and short_prob > long_prob:
        target = round(price - 2 * atr, 4)
        stop = round(price + 1 * atr, 4)
        rr = round(abs(target - price) / abs(price - stop), 2) if price != stop else 0.0
        return Signal(
            symbol=symbol,
            direction="SHORT",
            confidence=round(short_prob, 3),
            entry=price,
            target=target,
            stop_loss=stop,
            risk_reward=rr,
            timeframe=timeframe,
            exchange=exchange,
            reasons=[f"{engine_label} SHORT probability: {short_prob:.1%}"],
        )

    return Signal(
        symbol=symbol,
        direction="NEUTRAL",
        confidence=round(max(long_prob, short_prob), 3),
        entry=price,
        target=price,
        stop_loss=price,
        risk_reward=0.0,
        timeframe=timeframe,
        exchange=exchange,
        reasons=[
            f"{engine_label} below threshold ({threshold:.0%}). "
            f"Long: {long_prob:.1%} | Short: {short_prob:.1%}"
        ],
    )
