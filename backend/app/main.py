"""
main.py — FastAPI application entry point.

Start with:
  uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.signals import router as signals_router

app = FastAPI(
    title="Crypto Signal API",
    description="Long/Short signal engine powered by rules-based and ML models.",
    version="0.1.0",
)

# Allow the React Native app (and localhost during dev) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signals_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
