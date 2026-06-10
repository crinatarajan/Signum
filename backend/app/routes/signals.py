"""
routes/signals.py  ─  REST API endpoints

New endpoints added:
  GET  /signals/weex-symbols          ─ list available WEEX perp symbols
  POST /signals/ai-analysis           ─ Finora AI analysis for any symbol
  GET  /signals/{symbol}/full         ─ rules signal + AI analysis combined
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from dataclasses import asdict
import logging

from ..services.data import (
    fetch_ohlcv,
    fetch_ticker,
    fetch_funding_rate,
    fetch_open_interest,
    list_symbols,
)
from ..services.rules import generate_signal
from ..services import finora_ai

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signals", tags=["signals"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AIAnalysisRequest(BaseModel):
    symbol: str = Field(..., example="BTC/USDT")
    timeframe: str = Field("1h", example="4h")
    limit: int = Field(200, ge=50, le=500)
    extra_context: str = Field("", description="Optional additional context for the AI")


class SignalResponse(BaseModel):
    symbol: str
    direction: str
    confidence: float
    entry: float
    target: float
    stop_loss: float
    risk_reward: float
    reasons: list[str]
    timeframe: str
    exchange: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/weex-symbols", summary="List active WEEX perpetual swap symbols")
async def get_weex_symbols(quote: str = Query("USDT")):
    """Return all active perpetual swap symbols quoted in *quote* on WEEX."""
    try:
        symbols = list_symbols(quote=quote)
        return {"exchange": "weex", "quote": quote, "count": len(symbols), "symbols": symbols}
    except Exception as e:
        logger.error("Failed to fetch WEEX symbols: %s", e)
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/{symbol}", summary="Rules-based signal for a symbol")
async def get_signal(
    symbol: str,
    timeframe: str = Query("1h"),
    use_fallback: bool = Query(False, description="Use Binance fallback instead of WEEX"),
):
    """
    Compute a rules-based LONG / SHORT / NEUTRAL signal from WEEX data.
    *symbol* should be URL-encoded, e.g. BTC%2FUSDT.
    """
    symbol = symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=timeframe, use_fallback=use_fallback)
        fr_data = fetch_funding_rate(symbol)
        oi_data = fetch_open_interest(symbol)

        funding_rate = fr_data.get("fundingRate")
        oi_change = None  # Could compare to previous OI if stored

        signal = generate_signal(
            symbol, df, timeframe=timeframe,
            funding_rate=funding_rate,
            open_interest_change=oi_change,
        )
        return asdict(signal)
    except Exception as e:
        logger.error("Signal error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-analysis", summary="Finora-style AI analysis")
async def get_ai_analysis(req: AIAnalysisRequest):
    """
    Run Finora AI analysis on *symbol* / *timeframe* using WEEX data.
    Returns structured JSON with trend, bias, key levels, trade setup, and
    natural-language explanations.
    """
    symbol = req.symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=req.timeframe, limit=req.limit)
        fr_data = fetch_funding_rate(symbol)
        oi_data = fetch_open_interest(symbol)

        funding_rate = fr_data.get("fundingRate")
        open_interest = (
            oi_data.get("openInterestValue") or oi_data.get("openInterest")
        )

        result = finora_ai.analyse(
            symbol=symbol,
            timeframe=req.timeframe,
            df=df,
            funding_rate=funding_rate,
            open_interest=open_interest,
            extra_context=req.extra_context,
        )
        return result
    except Exception as e:
        logger.error("AI analysis error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/full", summary="Combined rules signal + AI analysis")
async def get_full_signal(symbol: str, timeframe: str = Query("1h")):
    """
    Returns both the rules-based signal AND the Finora AI analysis in one call.
    Useful for the mobile dashboard detail screen.
    """
    symbol = symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=timeframe)
        fr_data = fetch_funding_rate(symbol)
        oi_data = fetch_open_interest(symbol)

        funding_rate = fr_data.get("fundingRate")
        open_interest = oi_data.get("openInterestValue") or oi_data.get("openInterest")

        # Rules signal
        signal = generate_signal(
            symbol, df, timeframe=timeframe,
            funding_rate=funding_rate,
        )

        # AI analysis
        ai = finora_ai.analyse(
            symbol=symbol,
            timeframe=timeframe,
            df=df,
            funding_rate=funding_rate,
            open_interest=open_interest,
        )

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "exchange": "weex",
            "rules_signal": asdict(signal),
            "ai_analysis": ai,
        }
    except Exception as e:
        logger.error("Full signal error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ticker/{symbol}", summary="Live ticker from WEEX")
async def get_ticker(symbol: str):
    """Return the latest WEEX ticker for *symbol*."""
    symbol = symbol.replace("-", "/")
    try:
        ticker = fetch_ticker(symbol)
        return {
            "symbol": symbol,
            "exchange": "weex",
            "last": ticker.get("last"),
            "bid": ticker.get("bid"),
            "ask": ticker.get("ask"),
            "volume_24h": ticker.get("baseVolume"),
            "change_24h_pct": ticker.get("percentage"),
            "high_24h": ticker.get("high"),
            "low_24h": ticker.get("low"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
