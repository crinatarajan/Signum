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

/**
 * Convert a CCXT-style symbol ("BTC/USDT") into the URL-safe form the
 * backend expects in path parameters ("BTC-USDT").
 *
 * NOTE: do NOT use encodeURIComponent("BTC/USDT") for path segments —
 * browsers/fetch normalize "%2F" back to "/" before sending the request,
 * which FastAPI then treats as two path segments and 404s on the route.
 * The backend's /signals/{symbol} routes accept "-" and convert it back
 * to "/" internally.
 */
function urlSafeSymbol(symbol) {
  return symbol.replace(/\//g, "-");
}

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
/**
 * Fetch signals for the dashboard feed across the watchlist.
 *
 * Returns LONG/SHORT signals if any qualify. If none do (the common case —
 * markets are NEUTRAL most of the time), returns the top-ranked NEUTRAL
 * candidates as "WATCH" — the pairs closest to a confluence-based setup,
 * so there's always something useful to look at.
 *
 * @param {"rules"|"ml"|"both"} engine — currently only "rules" is supported
 *        by the backend; "ml"/"both" fall back to the rules engine until
 *        an ML endpoint is added.
 * @param {string} timeframe
 * @param {string} exchange
 * @param {number} maxWatch — max number of "WATCH" candidates to return
 *        when no active LONG/SHORT signals exist (default 3)
 * @returns {Promise<Array>} list of Signal objects, each with an added
 *        `display` field: "ACTIVE" for LONG/SHORT, "WATCH" for ranked NEUTRAL
 */
export async function fetchSignals(engine = "rules", timeframe = "1h", exchange = "weex", maxWatch = 3) {
  const results = await Promise.allSettled(
    DEFAULT_WATCHLIST.map((symbol) => fetchSignal(symbol, timeframe, exchange))
  );

  const signals = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);

  const active = signals
    .filter((s) => s.direction !== "NEUTRAL")
    .map((s) => ({ ...s, display: "ACTIVE" }));

  if (active.length > 0) {
    // Sort by confidence, highest first
    return active.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  // Nothing active — rank NEUTRAL candidates by how close they are to a
  // setup (max of bullish/bearish score relative to the threshold).
  const ranked = signals
    .map((s) => {
      const score = Math.max(s.bullish_score || 0, s.bearish_score || 0);
      const leaning = (s.bullish_score || 0) >= (s.bearish_score || 0) ? "LONG" : "SHORT";
      return { ...s, display: "WATCH", _score: score, _leaning: leaning };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, maxWatch);

  return ranked;
}

export async function fetchSignal(symbol, timeframe = "1h", exchange = "weex") {
  const safe = urlSafeSymbol(symbol);
  return apiFetch(`/signals/${safe}?timeframe=${timeframe}&exchange=${exchange}`);
}

export async function fetchFullSignal(symbol, timeframe = "1h", exchange = "weex") {
  const safe = urlSafeSymbol(symbol);
  return apiFetch(`/signals/${safe}/full?timeframe=${timeframe}&exchange=${exchange}`);
}

export async function fetchAIAnalysis({ symbol, timeframe = "1h", exchange = "weex", limit = 200, extra_context = "" }) {
  return apiFetch("/signals/ai-analysis", {
    method: "POST",
    body: JSON.stringify({ symbol, timeframe, exchange, limit, extra_context }),
  });
}

export async function fetchTicker(symbol, exchange = "weex") {
  const safe = urlSafeSymbol(symbol);
  return apiFetch(`/signals/ticker/${safe}?exchange=${exchange}`);
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
  const safe = urlSafeSymbol(symbol);
  return apiFetch(`/portfolio/${safe}`, { method: "DELETE" });
}

// ─── Push notifications (existing) ───────────────────────────────────────────

export async function registerPushToken(token) {
  return apiFetch("/signals/register-push", {
    method: "POST",
    body: JSON.stringify({ token }),
  }).catch(() => null); // non-critical
}
