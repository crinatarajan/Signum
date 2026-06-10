"""
routes/signals.py — REST API endpoints consumed by the React Native app.

Endpoints:
  GET /api/signals          → scan all watch pairs, return active signals
  GET /api/signals/{symbol} → evaluate a single pair (both engines)
  GET /api/pairs            → return the configured watch list
"""

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Query

from app.services.data import get_watch_pairs
from app.services.rules import evaluate_signal as rules_signal, scan_all_pairs
from app.ml.predict import ml_signal

router = APIRouter()


@router.get("/signals")
def get_all_signals(engine: str = Query("rules", enum=["rules", "ml", "both"])):
    """
    Scan all configured pairs and return non-neutral signals.

    - engine=rules  → rules-based only (default, no model required)
    - engine=ml     → ML predictions only (requires trained models)
    - engine=both   → merge results from both engines
    """
    pairs = get_watch_pairs()
    results = []

    if engine in ("rules", "both"):
        results += scan_all_pairs(pairs)

    if engine in ("ml", "both"):
        for pair in pairs:
            try:
                sig = ml_signal(pair)
                if sig.direction != "NEUTRAL":
                    results.append(sig)
            except Exception as e:
                print(f"[ml] Error on {pair}: {e}")

    # Sort by confidence descending
    results.sort(key=lambda s: s.confidence, reverse=True)
    return [asdict(s) for s in results]


@router.get("/signals/{symbol:path}")
def get_signal(symbol: str, engine: str = Query("rules", enum=["rules", "ml"])):
    """
    Evaluate a single symbol.
    Symbol should be URL-encoded, e.g. BTC%2FUSDT or passed as BTC-USDT.
    """
    # Accept both BTC-USDT and BTC/USDT
    symbol = symbol.replace("-", "/").upper()

    try:
        if engine == "ml":
            sig = ml_signal(symbol)
        else:
            sig = rules_signal(symbol)
        return asdict(sig)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pairs")
def get_pairs():
    """Return the list of configured watch pairs."""
    return {"pairs": get_watch_pairs()}
