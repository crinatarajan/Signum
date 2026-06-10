"""
main.py — FastAPI application entry point.

Start with:
  uvicorn app.main:app --reload

Env vars (see .env.example):
  EXCHANGE            — primary exchange: weex | binance | bybit | okx  (default: weex)
  WEEX_API_KEY / WEEX_SECRET
  BINANCE_API_KEY / BINANCE_SECRET
  BYBIT_API_KEY / BYBIT_SECRET
  OKX_API_KEY / OKX_SECRET / OKX_PASSPHRASE
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.signals import router as signals_router, portfolio_router

app = FastAPI(
    title="Signum — Crypto Signal API",
    description="Long/Short signal engine: rules-based, XGBoost, and LSTM models. Multi-exchange.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signals_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.2.0"}
