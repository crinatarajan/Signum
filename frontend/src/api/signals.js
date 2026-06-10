/**
 * api/signals.js — Thin API client for the FastAPI backend.
 *
 * Change BASE_URL to your backend's IP/domain when deploying.
 * For local dev with Expo on a phone: use your machine's LAN IP, e.g. http://192.168.1.10:8000
 */

import { Platform } from "react-native";

const BASE_URL = __DEV__
  ? "http://localhost:8000/api"
  : "https://your-production-backend.com/api";   // ← update when deploying

/**
 * Fetch all active signals for the configured watch pairs.
 * @param {"rules"|"ml"|"both"} engine
 * @returns {Promise<Signal[]>}
 */
export async function fetchSignals(engine = "rules") {
  const res = await fetch(`${BASE_URL}/signals?engine=${engine}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch a signal for a single symbol.
 * @param {string} symbol  e.g. "BTC/USDT"
 * @param {"rules"|"ml"}  engine
 */
export async function fetchSignalForSymbol(symbol, engine = "rules") {
  const encoded = symbol.replace("/", "-");   // BTC/USDT → BTC-USDT
  const res = await fetch(`${BASE_URL}/signals/${encoded}?engine=${engine}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch the configured watch pairs list.
 */
export async function fetchPairs() {
  const res = await fetch(`${BASE_URL}/pairs`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/**
 * Register the device's FCM push token with the backend.
 * Call once on app start and again whenever the token refreshes.
 * @param {string} token  FCM device token from @react-native-firebase/messaging
 */
export async function registerPushToken(token) {
  const res = await fetch(`${BASE_URL}/push-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  if (!res.ok) throw new Error(`Push token registration failed: ${res.status}`);
  return res.json();
}
