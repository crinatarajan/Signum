"""
ml/train.py — Train an XGBoost classification model to predict LONG/SHORT setups.

Target variable:
  1  →  price rises ≥ TARGET_PCT% within FORWARD_HOURS candles without
        hitting STOP_PCT% loss first  (i.e. a winning LONG trade)
  0  →  otherwise (price drops or flat)

Usage:
    python -m app.ml.train --symbol BTC/USDT --timeframe 1h
    → saves model to app/ml/models/BTC_USDT_1h.joblib
"""

import argparse
import os
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import classification_report
from xgboost import XGBClassifier

from app.services.data import fetch_ohlcv
from app.services.indicators import add_all_indicators

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TARGET_PCT  = 0.02   # 2% profit target
STOP_PCT    = 0.01   # 1% stop loss
FORWARD_HOURS = 4    # how many future candles to check

MODEL_DIR = pathlib.Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

FEATURE_COLS = [
    "rsi", "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_mid", "bb_lower", "bb_width",
    "atr", "atr_pct",
    "ema_20", "ema_50", "ema_200",
    "volume",
]


# ---------------------------------------------------------------------------
# Label generation
# ---------------------------------------------------------------------------

def _make_labels(df: pd.DataFrame) -> pd.Series:
    """
    For each candle, look FORWARD_HOURS ahead.
    Label = 1 if price hits TARGET_PCT gain before STOP_PCT loss.
    """
    closes = df["close"].values
    n = len(closes)
    labels = np.zeros(n, dtype=int)

    for i in range(n - FORWARD_HOURS):
        entry = closes[i]
        target    = entry * (1 + TARGET_PCT)
        stop_loss = entry * (1 - STOP_PCT)

        for j in range(1, FORWARD_HOURS + 1):
            future = closes[i + j]
            if future >= target:
                labels[i] = 1
                break
            if future <= stop_loss:
                labels[i] = 0
                break

    return pd.Series(labels, index=df.index)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(symbol: str, timeframe: str = "1h", candles: int = 1000):
    print(f"[train] Fetching {candles} candles for {symbol} @ {timeframe}...")
    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=candles)
    df = add_all_indicators(df)

    # Drop rows where we can't compute a full forward window
    df = df.iloc[: len(df) - FORWARD_HOURS]

    X = df[FEATURE_COLS].values
    y = _make_labels(df).values[: len(X)]

    print(f"[train] Dataset: {len(X)} samples | LONG rate: {y.mean():.1%}")

    # Time-series cross-validation (no data leakage)
    tscv = TimeSeriesSplit(n_splits=5)
    model = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        preds = model.predict(X_val)
        print(f"  Fold {fold+1}: {classification_report(y_val, preds, zero_division=0)}")

    # Save
    slug = symbol.replace("/", "_")
    path = MODEL_DIR / f"{slug}_{timeframe}.joblib"
    joblib.dump({"model": model, "features": FEATURE_COLS}, path)
    print(f"[train] Saved → {path}")
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol",    default="BTC/USDT")
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--candles",   type=int, default=1000)
    args = parser.parse_args()
    train(args.symbol, args.timeframe, args.candles)
