/**
 * constants/pairs.js — Curated list of common USDT-margined perpetual pairs.
 *
 * This is a static fallback list (not fetched live from the exchange) used
 * to populate symbol dropdowns in the Backtest and Add Position screens.
 * It covers majors, large-caps, and the project's default/extended
 * watchlist. Pairs not listed here can still be entered manually — the
 * dropdown is a convenience, not a restriction.
 *
 * If a pair you want isn't here, type it directly in the symbol field
 * using the standard CCXT format, e.g. "DOGE/USDT".
 */

export const COMMON_PAIRS = [
  // Majors
  "BTC/USDT",
  "ETH/USDT",
  "BNB/USDT",
  "SOL/USDT",
  "XRP/USDT",

  // Large / mid caps
  "ADA/USDT",
  "DOGE/USDT",
  "AVAX/USDT",
  "DOT/USDT",
  "LINK/USDT",
  "TON/USDT",
  "TRX/USDT",
  "MATIC/USDT",
  "LTC/USDT",
  "BCH/USDT",
  "ATOM/USDT",
  "NEAR/USDT",
  "APT/USDT",
  "ARB/USDT",
  "OP/USDT",
  "SUI/USDT",
  "INJ/USDT",

  // DeFi
  "CRV/USDT",
  "CVX/USDT",
  "AAVE/USDT",
  "UNI/USDT",
  "MKR/USDT",

  // Other / DePIN / newer listings
  "XPIN/USDT",
  "FIL/USDT",
  "RNDR/USDT",
  "WIF/USDT",
  "PEPE/USDT",
];
