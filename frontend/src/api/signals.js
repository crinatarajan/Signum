/**
 * api/signals.js — Signum API client
 * Supports multi-exchange, portfolio, and backtest endpoints.
 */

import Constants from "expo-constants";

const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://localhost:8000/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ─── Exchanges ────────────────────────────────────────────────────────────────

export async function fetchExchanges() {
  return apiFetch("/signals/exchanges");
}

export async function fetchSymbols(exchange = "weex", quote = "USDT") {
  return apiFetch(`/signals/symbols?exchange=${exchange}&quote=${quote}`);
}

// ─── Signals ──────────────────────────────────────────────────────────────────

// Default watchlist used by the dashboard feed. Override with
// EXPO_PUBLIC_WATCH_PAIRS="BTC/USDT,ETH/USDT,SOL/USDT" if desired.
const DEFAULT_WATCHLIST = (
  process.env.EXPO_PUBLIC_WATCH_PAIRS ||
  "BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Fetch signals for the dashboard feed across the default watchlist.
 *
 * @param {"rules"|"ml"|"both"} engine — currently only "rules" is supported
 *        by the backend; "ml"/"both" fall back to the rules engine until
 *        an ML endpoint is added.
 * @param {string} timeframe
 * @param {string} exchange
 * @returns {Promise<Array>} list of Signal objects (NEUTRAL signals filtered out)
 */
export async function fetchSignals(engine = "rules", timeframe = "1h", exchange = "weex") {
  const results = await Promise.allSettled(
    DEFAULT_WATCHLIST.map((symbol) => fetchSignal(symbol, timeframe, exchange))
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((signal) => signal.direction !== "NEUTRAL");
}

export async function fetchSignal(symbol, timeframe = "1h", exchange = "weex") {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/${encoded}?timeframe=${timeframe}&exchange=${exchange}`);
}

export async function fetchFullSignal(symbol, timeframe = "1h", exchange = "weex") {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/${encoded}/full?timeframe=${timeframe}&exchange=${exchange}`);
}

export async function fetchAIAnalysis({ symbol, timeframe = "1h", exchange = "weex", limit = 200, extra_context = "" }) {
  return apiFetch("/signals/ai-analysis", {
    method: "POST",
    body: JSON.stringify({ symbol, timeframe, exchange, limit, extra_context }),
  });
}

export async function fetchTicker(symbol, exchange = "weex") {
  const encoded = encodeURIComponent(symbol);
  return apiFetch(`/signals/ticker/${encoded}?exchange=${exchange}`);
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

export async function runBacktest({
  symbol,
  timeframe = "1h",
  candles = 500,
  exchange = "weex",
  target_pct = 0.02,
  stop_pct = 0.01,
  forward = 4,
}) {
  return apiFetch("/signals/backtest", {
    method: "POST",
    body: JSON.stringify({ symbol, timeframe, candles, exchange, target_pct, stop_pct, forward }),
  });
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function fetchPortfolio() {
  return apiFetch("/portfolio");
}

export async function addPosition({ symbol, exchange, entry_price, quantity, direction, notes = "" }) {
  return apiFetch("/portfolio", {
    method: "POST",
    body: JSON.stringify({ symbol, exchange, entry_price, quantity, direction, notes }),
  });
}

export async function removePosition(symbol) {
  return apiFetch(`/portfolio/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}

// ─── Push notifications (existing) ───────────────────────────────────────────

export async function registerPushToken(token) {
  return apiFetch("/signals/register-push", {
    method: "POST",
    body: JSON.stringify({ token }),
  }).catch(() => null); // non-critical
}
