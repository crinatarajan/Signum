/**
 * api/signals.js
 * API client for the Crypto Signal App backend.
 * Primary exchange: WEEX
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  return res.json();
}

// ─── signal endpoints ──────────────────────────────────────────────────────

/**
 * Fetch a rules-based LONG / SHORT / NEUTRAL signal from WEEX data.
 * @param {string} symbol  e.g. "BTC/USDT"
 * @param {string} timeframe e.g. "1h"
 */
export async function fetchSignal(symbol, timeframe = "1h") {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/${encoded}?timeframe=${timeframe}`);
}

/**
 * Fetch combined rules signal + Finora AI analysis.
 * @param {string} symbol
 * @param {string} timeframe
 */
export async function fetchFullSignal(symbol, timeframe = "1h") {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/${encoded}/full?timeframe=${timeframe}`);
}

/**
 * Request a Finora-style AI analysis.
 * @param {string} symbol
 * @param {string} timeframe
 * @param {string} [extraContext]  Optional context to pass to the AI
 */
export async function fetchAIAnalysis(symbol, timeframe = "1h", extraContext = "") {
  return apiFetch("/signals/ai-analysis", {
    method: "POST",
    body: JSON.stringify({ symbol, timeframe, extra_context: extraContext }),
  });
}

/**
 * Fetch live WEEX ticker for a symbol.
 * @param {string} symbol
 */
export async function fetchTicker(symbol) {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/ticker/${encoded}`);
}

/**
 * List all active WEEX perpetual swap symbols.
 * @param {string} [quote="USDT"]
 */
export async function fetchWeexSymbols(quote = "USDT") {
  return apiFetch(`/signals/weex-symbols?quote=${quote}`);
}
