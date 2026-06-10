/**
 * hooks/useSignals.js — React hook that polls the backend for fresh signals.
 *
 * Usage:
 *   const { signals, loading, error, refresh } = useSignals("rules", 30);
 */

import { useState, useEffect, useCallback } from "react";
import { fetchSignals } from "../api/signals";

/**
 * @param {"rules"|"ml"|"both"} engine
 * @param {number} intervalSecs  — how often to auto-refresh (0 = no auto-refresh)
 */
export function useSignals(engine = "rules", intervalSecs = 60) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSignals(engine);
      setSignals(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [engine]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh interval
  useEffect(() => {
    if (intervalSecs <= 0) return;
    const id = setInterval(refresh, intervalSecs * 1000);
    return () => clearInterval(id);
  }, [refresh, intervalSecs]);

  return { signals, loading, error, lastUpdated, refresh };
}
