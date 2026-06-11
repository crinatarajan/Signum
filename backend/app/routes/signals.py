"""
routes/signals.py  ─  REST API endpoints

Endpoints:
  GET  /signals/exchanges              ─ list supported exchanges
  GET  /signals/symbols                ─ list symbols for any exchange
  GET  /signals/{symbol}               ─ rules signal
  GET  /signals/{symbol}/full          ─ rules + AI analysis
  POST /signals/ai-analysis            ─ Finora AI analysis
  GET  /signals/ticker/{symbol}        ─ live ticker

  GET  /portfolio                      ─ get saved portfolio positions
  POST /portfolio                      ─ add a position
  DELETE /portfolio/{symbol}           ─ remove a position

  POST /backtest                       ─ run backtest and return results JSON
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
    get_supported_exchanges,
)
from ..services.rules import generate_signal
from ..services import finora_ai
from ..services.backtest_service import run_backtest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signals", tags=["signals"])

# In-memory portfolio store (replace with DB in production)
_portfolio: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AIAnalysisRequest(BaseModel):
    symbol: str = Field(..., example="BTC/USDT")
    timeframe: str = Field("1h", example="4h")
    limit: int = Field(200, ge=50, le=500)
    exchange: str = Field("weex", example="binance")
    extra_context: str = Field("", description="Optional additional context for the AI")


class BacktestRequest(BaseModel):
    symbol: str = Field(..., example="BTC/USDT")
    timeframe: str = Field("1h")
    candles: int = Field(500, ge=100, le=2000)
    exchange: str = Field("weex")
    target_pct: float = Field(0.02, ge=0.005, le=0.10)
    stop_pct: float = Field(0.01, ge=0.003, le=0.05)
    forward: int = Field(4, ge=1, le=24)


class PortfolioPosition(BaseModel):
    symbol: str
    exchange: str = "weex"
    entry_price: float
    quantity: float
    direction: str = Field("LONG", pattern="^(LONG|SHORT)$")
    notes: str = ""


# ---------------------------------------------------------------------------
# Exchange + Symbol endpoints
# ---------------------------------------------------------------------------

@router.get("/exchanges", summary="List supported exchanges")
async def get_exchanges():
    """Return all supported exchanges with their metadata."""
    return {"exchanges": get_supported_exchanges()}


@router.get("/symbols", summary="List active symbols on an exchange")
async def get_symbols(
    exchange: str = Query("weex", description="Exchange id: weex, binance, bybit, okx"),
    quote: str = Query("USDT"),
):
    """Return all active perpetual symbols quoted in *quote* on the given exchange."""
    try:
        symbols = list_symbols(quote=quote, exchange_name=exchange)
        return {"exchange": exchange, "quote": quote, "count": len(symbols), "symbols": symbols}
    except Exception as e:
        logger.error("Failed to fetch symbols for %s: %s", exchange, e)
        raise HTTPException(status_code=503, detail=str(e))


# Keep backward-compat alias
@router.get("/weex-symbols", summary="[Deprecated] Use /symbols?exchange=weex")
async def get_weex_symbols(quote: str = Query("USDT")):
    return await get_symbols(exchange="weex", quote=quote)


# ---------------------------------------------------------------------------
# Signal endpoints
# ---------------------------------------------------------------------------

@router.get("/{symbol}", summary="Rules-based signal for a symbol")
async def get_signal(
    symbol: str,
    timeframe: str = Query("1h"),
    exchange: str = Query("weex"),
):
    symbol = symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=timeframe, exchange_name=exchange)
        fr_data = fetch_funding_rate(symbol, exchange_name=exchange)
        oi_data = fetch_open_interest(symbol, exchange_name=exchange)

        funding_rate = fr_data.get("fundingRate")
        oi_change = None

        signal = generate_signal(
            symbol, df, timeframe=timeframe,
            funding_rate=funding_rate,
            open_interest_change=oi_change,
        )
        result = asdict(signal)
        result["exchange"] = exchange
        return result
    except Exception as e:
        logger.error("Signal error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-analysis", summary="Finora-style AI analysis")
async def get_ai_analysis(req: AIAnalysisRequest):
    symbol = req.symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=req.timeframe, limit=req.limit, exchange_name=req.exchange)
        fr_data = fetch_funding_rate(symbol, exchange_name=req.exchange)
        oi_data = fetch_open_interest(symbol, exchange_name=req.exchange)

        result = finora_ai.analyse(
            symbol=symbol,
            timeframe=req.timeframe,
            df=df,
            funding_rate=fr_data.get("fundingRate"),
            open_interest=oi_data.get("openInterestValue") or oi_data.get("openInterest"),
            extra_context=req.extra_context,
        )
        return result
    except Exception as e:
        logger.error("AI analysis error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/full", summary="Combined rules signal + AI analysis")
async def get_full_signal(
    symbol: str,
    timeframe: str = Query("1h"),
    exchange: str = Query("weex"),
):
    symbol = symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=timeframe, exchange_name=exchange)
        fr_data = fetch_funding_rate(symbol, exchange_name=exchange)
        oi_data = fetch_open_interest(symbol, exchange_name=exchange)

        funding_rate = fr_data.get("fundingRate")
        open_interest = oi_data.get("openInterestValue") or oi_data.get("openInterest")

        signal = generate_signal(
            symbol, df, timeframe=timeframe,
            funding_rate=funding_rate,
        )

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
            "exchange": exchange,
            "rules_signal": asdict(signal),
            "ai_analysis": ai,
        }
    except Exception as e:
        logger.error("Full signal error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}/candles", summary="Recent OHLCV candles for charting")
async def get_candles(
    symbol: str,
    timeframe: str = Query("1h"),
    exchange: str = Query("weex"),
    limit: int = Query(50, ge=10, le=500),
):
    symbol = symbol.replace("-", "/")
    try:
        df = fetch_ohlcv(symbol, timeframe=timeframe, limit=limit, exchange_name=exchange)
        candles = [
            {
                "timestamp": int(idx.timestamp() * 1000),
                "open": round(float(row["open"]), 8),
                "high": round(float(row["high"]), 8),
                "low": round(float(row["low"]), 8),
                "close": round(float(row["close"]), 8),
                "volume": round(float(row["volume"]), 8),
            }
            for idx, row in df.tail(limit).iterrows()
        ]
        return {"symbol": symbol, "timeframe": timeframe, "exchange": exchange, "candles": candles}
    except Exception as e:
        logger.error("Candles error for %s: %s", symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ticker/{symbol}", summary="Live ticker")
async def get_ticker(
    symbol: str,
    exchange: str = Query("weex"),
):
    symbol = symbol.replace("-", "/")
    try:
        ticker = fetch_ticker(symbol, exchange_name=exchange)
        return {
            "symbol": symbol,
            "exchange": exchange,
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


# ---------------------------------------------------------------------------
# Backtest endpoint
# ---------------------------------------------------------------------------

@router.post("/backtest", summary="Run backtest and return trade results")
async def post_backtest(req: BacktestRequest):
    """
    Runs the rules engine on historical data and returns full trade results
    including win rate, P&L curve, and individual trade list.
    """
    try:
        results = run_backtest(
            symbol=req.symbol,
            timeframe=req.timeframe,
            candles=req.candles,
            exchange_name=req.exchange,
            target_pct=req.target_pct,
            stop_pct=req.stop_pct,
            forward=req.forward,
        )
        return results
    except Exception as e:
        logger.error("Backtest error for %s: %s", req.symbol, e)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Portfolio endpoints
# ---------------------------------------------------------------------------

portfolio_router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@portfolio_router.get("", summary="Get all portfolio positions with current P&L")
async def get_portfolio():
    """Return all saved positions enriched with current price and unrealized P&L."""
    enriched = []
    for sym, pos in _portfolio.items():
        try:
            ticker = fetch_ticker(sym, exchange_name=pos.get("exchange", "weex"))
            current_price = ticker.get("last") or pos["entry_price"]
        except Exception:
            current_price = pos["entry_price"]

        entry = pos["entry_price"]
        qty = pos["quantity"]
        direction = pos["direction"]

        if direction == "LONG":
            pnl_pct = (current_price - entry) / entry * 100
        else:
            pnl_pct = (entry - current_price) / entry * 100

        pnl_usd = pnl_pct / 100 * entry * qty

        enriched.append({
            **pos,
            "current_price": round(current_price, 6),
            "pnl_pct": round(pnl_pct, 2),
            "pnl_usd": round(pnl_usd, 2),
        })

    total_pnl = sum(p["pnl_usd"] for p in enriched)
    return {
        "positions": enriched,
        "count": len(enriched),
        "total_pnl_usd": round(total_pnl, 2),
    }


@portfolio_router.post("", summary="Add a position to portfolio")
async def add_position(pos: PortfolioPosition):
    sym = pos.symbol.replace("-", "/")
    _portfolio[sym] = pos.model_dump()
    _portfolio[sym]["symbol"] = sym
    return {"status": "added", "position": _portfolio[sym]}


@portfolio_router.delete("/{symbol}", summary="Remove a position")
async def remove_position(symbol: str):
    symbol = symbol.replace("-", "/")
    if symbol not in _portfolio:
        raise HTTPException(status_code=404, detail=f"{symbol} not in portfolio")
    del _portfolio[symbol]
    return {"status": "removed", "symbol": symbol}
