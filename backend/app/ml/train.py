"""
ml/train.py — Train a classification model to predict LONG/SHORT setups.

Supports two model backends:
  • xgboost  (default) — gradient-boosted trees, fast, great baseline
  • lstm               — sequence model that looks at the last SEQ_LEN candles

Target variable:
  1  →  price rises ≥ TARGET_PCT% within FORWARD_HOURS candles without
        hitting STOP_PCT% loss first  (i.e. a winning LONG trade)
  0  →  otherwise (price drops or flat)

Usage:
    python -m app.ml.train --symbol BTC/USDT --timeframe 1h
    python -m app.ml.train --symbol BTC/USDT --timeframe 1h --model lstm
    → saves model to app/ml/models/BTC_USDT_1h_{model}.joblib
"""

import argparse
import pathlib

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import classification_report
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from app.services.data import fetch_ohlcv
from app.services.indicators import add_all_indicators

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TARGET_PCT    = 0.02   # 2% profit target
STOP_PCT      = 0.01   # 1% stop loss
FORWARD_HOURS = 4      # how many future candles to check

SEQ_LEN       = 32     # LSTM: number of past candles per sample
LSTM_UNITS    = 64     # LSTM: hidden units per layer
LSTM_DROPOUT  = 0.2    # LSTM: dropout rate
LSTM_EPOCHS   = 30     # LSTM: training epochs
LSTM_BATCH    = 64     # LSTM: batch size

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
# Label generation  (shared by both models)
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
        entry     = closes[i]
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
# LSTM helpers
# ---------------------------------------------------------------------------

def _build_sequences(X: np.ndarray, y: np.ndarray, seq_len: int):
    """
    Convert flat (n_samples, n_features) arrays into overlapping sequences
    of shape (n_samples - seq_len, seq_len, n_features) for LSTM input.
    Labels are aligned to the last timestep of each sequence.
    """
    Xs, ys = [], []
    for i in range(seq_len, len(X)):
        Xs.append(X[i - seq_len : i])
        ys.append(y[i])
    return np.array(Xs), np.array(ys)


def _build_lstm(n_features: int):
    """
    Build and compile a two-layer stacked LSTM binary classifier.
    Requires tensorflow / keras — imported here so the rest of the file
    works without it when using xgboost only.
    """
    try:
        from tensorflow import keras
        from tensorflow.keras import layers
    except ImportError:
        raise ImportError(
            "TensorFlow is required for the LSTM model.\n"
            "Install it with:  pip install tensorflow"
        )

    model = keras.Sequential([
        layers.Input(shape=(SEQ_LEN, n_features)),

        # First LSTM layer — returns sequences so the second layer can attend
        layers.LSTM(LSTM_UNITS, return_sequences=True, name="lstm_1"),
        layers.Dropout(LSTM_DROPOUT, name="drop_1"),

        # Second LSTM layer — returns final hidden state only
        layers.LSTM(LSTM_UNITS, return_sequences=False, name="lstm_2"),
        layers.Dropout(LSTM_DROPOUT, name="drop_2"),

        # Dense head
        layers.Dense(32, activation="relu", name="dense_1"),
        layers.Dense(1,  activation="sigmoid", name="output"),
    ])

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ---------------------------------------------------------------------------
# XGBoost training
# ---------------------------------------------------------------------------

def _train_xgboost(X: np.ndarray, y: np.ndarray, slug: str, timeframe: str) -> pathlib.Path:
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
        print(f"  Fold {fold+1}:\n{classification_report(y_val, preds, zero_division=0)}")

    path = MODEL_DIR / f"{slug}_{timeframe}_xgboost.joblib"
    joblib.dump({"model": model, "features": FEATURE_COLS, "type": "xgboost"}, path)
    return path


# ---------------------------------------------------------------------------
# LSTM training
# ---------------------------------------------------------------------------

def _train_lstm(X: np.ndarray, y: np.ndarray, slug: str, timeframe: str) -> pathlib.Path:
    try:
        from tensorflow.keras.callbacks import EarlyStopping
    except ImportError:
        raise ImportError(
            "TensorFlow is required for the LSTM model.\n"
            "Install it with:  pip install tensorflow"
        )

    # Scale features — critical for LSTM stability
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Build overlapping sequences
    X_seq, y_seq = _build_sequences(X_scaled, y, SEQ_LEN)
    n_features = X_seq.shape[2]

    print(f"[train] LSTM sequences: {X_seq.shape}  |  LONG rate: {y_seq.mean():.1%}")

    tscv = TimeSeriesSplit(n_splits=5)

    # We train a single model on the last fold (most recent data) after
    # printing cross-val metrics across all folds.
    final_model = None
    for fold, (train_idx, val_idx) in enumerate(tscv.split(X_seq)):
        X_train, X_val = X_seq[train_idx], X_seq[val_idx]
        y_train, y_val = y_seq[train_idx], y_seq[val_idx]

        m = _build_lstm(n_features)
        early_stop = EarlyStopping(
            monitor="val_loss", patience=5, restore_best_weights=True
        )
        m.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=LSTM_EPOCHS,
            batch_size=LSTM_BATCH,
            callbacks=[early_stop],
            verbose=0,
        )

        preds = (m.predict(X_val, verbose=0) >= 0.5).astype(int).flatten()
        print(f"  Fold {fold+1}:\n{classification_report(y_val, preds, zero_division=0)}")
        final_model = m   # keep the last fold's model

    path = MODEL_DIR / f"{slug}_{timeframe}_lstm.joblib"
    joblib.dump(
        {
            "model":    final_model,
            "scaler":   scaler,
            "features": FEATURE_COLS,
            "seq_len":  SEQ_LEN,
            "type":     "lstm",
        },
        path,
    )
    return path


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

def train(
    symbol:    str,
    timeframe: str = "1h",
    candles:   int = 1000,
    model_type: str = "xgboost",   # "xgboost" | "lstm"
) -> pathlib.Path:
    """
    Fetch OHLCV data, engineer features, train the chosen model, and save it.

    Returns the path to the saved model file.
    """
    model_type = model_type.lower()
    if model_type not in ("xgboost", "lstm"):
        raise ValueError(f"Unknown model_type '{model_type}'. Choose 'xgboost' or 'lstm'.")

    print(f"[train] Fetching {candles} candles for {symbol} @ {timeframe}  (model={model_type})...")
    df = fetch_ohlcv(symbol, timeframe=timeframe, limit=candles)
    df = add_all_indicators(df)

    # Drop rows where we can't compute a full forward window
    df = df.iloc[: len(df) - FORWARD_HOURS]

    X = df[FEATURE_COLS].values
    y = _make_labels(df).values[: len(X)]

    print(f"[train] Dataset: {len(X)} samples  |  LONG rate: {y.mean():.1%}")

    slug = symbol.replace("/", "_")

    if model_type == "xgboost":
        path = _train_xgboost(X, y, slug, timeframe)
    else:
        path = _train_lstm(X, y, slug, timeframe)

    print(f"[train] Saved → {path}")
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train a crypto signal model (XGBoost or LSTM)."
    )
    parser.add_argument("--symbol",     default="BTC/USDT",  help="Trading pair, e.g. BTC/USDT")
    parser.add_argument("--timeframe",  default="1h",         help="Candle timeframe, e.g. 1h, 4h, 1d")
    parser.add_argument("--candles",    type=int, default=1000, help="Number of historical candles to fetch")
    parser.add_argument(
        "--model",
        default="xgboost",
        choices=["xgboost", "lstm"],
        help="Model backend to train  (default: xgboost)",
    )
    args = parser.parse_args()
    train(args.symbol, args.timeframe, args.candles, model_type=args.model)
