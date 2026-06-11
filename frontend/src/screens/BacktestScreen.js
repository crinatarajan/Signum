/**
 * screens/BacktestScreen.js
 * Run and visualise backtests from within the app.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  FlatList,
  Dimensions,
} from "react-native";
import { runBacktest } from "../api/signals";
import SymbolPicker from "../components/SymbolPicker";

const { width: SCREEN_W } = Dimensions.get("window");

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
  green:  "#22C55E",
  red:    "#EF4444",
  input:  "#1E1E30",
};

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const EXCHANGES  = ["weex", "binance", "bybit", "okx"];

// ─── Mini equity curve (SVG-free, bar chart) ─────────────────────────────────

function EquityCurve({ equity }) {
  if (!equity || equity.length < 2) return null;
  const W = SCREEN_W - 48;
  const H = 80;
  const values = equity.map((e) => e.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const barW = Math.max(2, W / values.length - 1);

  return (
    <View style={{ height: H, width: W, flexDirection: "row", alignItems: "flex-end", gap: 1 }}>
      {values.map((v, i) => {
        const h = ((v - min) / range) * H;
        const color = v >= 100 ? COLORS.green : COLORS.red;
        return <View key={i} style={{ width: barW, height: Math.max(2, h), backgroundColor: color, borderRadius: 1 }} />;
      })}
    </View>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </View>
  );
}

// ─── Trade row ────────────────────────────────────────────────────────────────

function TradeRow({ trade, index }) {
  const isWin = trade.result === "WIN";
  return (
    <View style={[styles.tradeRow, index % 2 === 0 && { backgroundColor: "#12121E" }]}>
      <Text style={[styles.tradeDir, { color: trade.direction === "LONG" ? COLORS.green : COLORS.red }]}>
        {trade.direction === "LONG" ? "▲" : "▼"} {trade.direction}
      </Text>
      <Text style={styles.tradeEntry}>${trade.entry.toLocaleString()}</Text>
      <Text style={[styles.tradePnl, { color: isWin ? COLORS.green : COLORS.red }]}>
        {trade.pnl_pct >= 0 ? "+" : ""}{trade.pnl_pct.toFixed(2)}%
      </Text>
      <Text style={[styles.tradeResult, { color: isWin ? COLORS.green : COLORS.red }]}>
        {isWin ? "WIN" : "LOSS"}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function BacktestScreen() {
  const [symbol,    setSymbol]    = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [exchange,  setExchange]  = useState("weex");
  const [candles,   setCandles]   = useState("500");
  const [targetPct, setTargetPct] = useState("2");
  const [stopPct,   setStopPct]   = useState("1");

  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState(null);
  const [error,   setError]     = useState(null);
  const [tab,     setTab]       = useState("summary"); // "summary" | "trades"

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await runBacktest({
        symbol: symbol.toUpperCase().replace("-", "/"),
        timeframe,
        exchange,
        candles: parseInt(candles, 10),
        target_pct: parseFloat(targetPct) / 100,
        stop_pct:   parseFloat(stopPct) / 100,
        forward: 4,
      });
      setResults(res);
      setTab("summary");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const s = results?.summary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Backtest</Text>
      </View>

      {/* Config panel */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Configuration</Text>

        <SymbolPicker value={symbol} onChange={setSymbol} placeholder="BTC/USDT" />

        <Text style={styles.inputLabel}>Exchange</Text>
        <View style={styles.toggleRow}>
          {EXCHANGES.map((ex) => (
            <TouchableOpacity
              key={ex}
              style={[styles.toggleBtn, exchange === ex && styles.toggleBtnActive]}
              onPress={() => setExchange(ex)}
            >
              <Text style={[styles.toggleText, exchange === ex && styles.toggleTextActive]}>
                {ex.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.inputLabel}>Timeframe</Text>
        <View style={styles.toggleRow}>
          {TIMEFRAMES.map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.toggleBtn, timeframe === tf && styles.toggleBtnActive]}
              onPress={() => setTimeframe(tf)}
            >
              <Text style={[styles.toggleText, timeframe === tf && styles.toggleTextActive]}>{tf}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row3}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Candles</Text>
            <TextInput style={styles.input} value={candles} onChangeText={setCandles}
              keyboardType="number-pad" placeholderTextColor={COLORS.muted} />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.inputLabel}>Target %</Text>
            <TextInput style={styles.input} value={targetPct} onChangeText={setTargetPct}
              keyboardType="decimal-pad" placeholderTextColor={COLORS.muted} />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.inputLabel}>Stop %</Text>
            <TextInput style={styles.input} value={stopPct} onChangeText={setStopPct}
              keyboardType="decimal-pad" placeholderTextColor={COLORS.muted} />
          </View>
        </View>

        <TouchableOpacity style={styles.runBtn} onPress={handleRun} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.runBtnText}>▶  Run Backtest</Text>
          }
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Tab selector */}
          <View style={styles.tabRow}>
            {["summary", "trades"].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "summary" && s && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>
                {results.symbol}  ·  {results.timeframe}  ·  {results.candles} candles
              </Text>

              {/* Equity curve */}
              <View style={styles.curveContainer}>
                <Text style={styles.curveLabel}>Equity Curve (starting $100)</Text>
                <EquityCurve equity={results.equity} />
                <View style={styles.curveFooter}>
                  <Text style={styles.curveStat}>Start: $100.00</Text>
                  <Text style={[styles.curveStat, {
                    color: s.total_return_pct >= 0 ? COLORS.green : COLORS.red
                  }]}>
                    End: ${(100 + s.total_return_pct).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <StatCard label="Win Rate"       value={`${(s.win_rate * 100).toFixed(1)}%`}
                  color={s.win_rate >= 0.5 ? COLORS.green : COLORS.red} />
                <StatCard label="Total Trades"   value={s.total_trades} />
                <StatCard label="Wins"           value={s.wins}  color={COLORS.green} />
                <StatCard label="Losses"         value={s.losses} color={COLORS.red} />
                <StatCard label="Avg P&L"        value={`${s.avg_pnl_pct > 0 ? "+" : ""}${s.avg_pnl_pct.toFixed(2)}%`}
                  color={s.avg_pnl_pct >= 0 ? COLORS.green : COLORS.red} />
                <StatCard label="Total Return"   value={`${s.total_return_pct > 0 ? "+" : ""}${s.total_return_pct.toFixed(2)}%`}
                  color={s.total_return_pct >= 0 ? COLORS.green : COLORS.red} />
                <StatCard label="Profit Factor"  value={s.profit_factor === Infinity ? "∞" : s.profit_factor.toFixed(2)}
                  color={s.profit_factor >= 1.5 ? COLORS.green : COLORS.red} />
                <StatCard label="Avg Bars Held"  value={s.avg_bars_held.toFixed(1)} />
              </View>
            </View>
          )}

          {tab === "trades" && (
            <View style={styles.panel}>
              <View style={styles.tradeHeader}>
                <Text style={styles.tradeHeaderCell}>Direction</Text>
                <Text style={styles.tradeHeaderCell}>Entry</Text>
                <Text style={styles.tradeHeaderCell}>P&L</Text>
                <Text style={styles.tradeHeaderCell}>Result</Text>
              </View>
              {results.trades.map((trade, i) => (
                <TradeRow key={i} trade={trade} index={i} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.bg },
  header:        { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  headerTitle:   { fontSize: 24, fontWeight: "700", color: COLORS.text },

  panel:         { margin: 12, borderRadius: 12, backgroundColor: COLORS.card,
                   borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  panelTitle:    { color: COLORS.text, fontWeight: "700", fontSize: 14, marginBottom: 12 },

  inputLabel:    { color: COLORS.muted, fontSize: 12, marginBottom: 4, marginTop: 10 },
  input:         { backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1,
                   borderColor: COLORS.border, color: COLORS.text, padding: 10, fontSize: 14 },
  toggleRow:     { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  toggleBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                   borderWidth: 1, borderColor: COLORS.border },
  toggleBtnActive: { backgroundColor: COLORS.accent + "30", borderColor: COLORS.accent },
  toggleText:    { color: COLORS.muted, fontSize: 12 },
  toggleTextActive: { color: COLORS.accent },
  row3:          { flexDirection: "row", marginTop: 8 },

  runBtn:        { marginTop: 16, backgroundColor: COLORS.accent, borderRadius: 10,
                   paddingVertical: 14, alignItems: "center" },
  runBtnText:    { color: "#fff", fontWeight: "700", fontSize: 15 },

  errorBox:      { margin: 12, padding: 14, backgroundColor: "#2D1515", borderRadius: 10,
                   borderWidth: 1, borderColor: COLORS.red + "40" },
  errorText:     { color: COLORS.red, fontSize: 13 },

  tabRow:        { flexDirection: "row", marginHorizontal: 12, marginBottom: 0, gap: 8 },
  tabBtn:        { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                   backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  tabBtnActive:  { borderColor: COLORS.accent, backgroundColor: COLORS.accent + "20" },
  tabText:       { color: COLORS.muted, fontWeight: "600" },
  tabTextActive: { color: COLORS.accent },

  curveContainer: { marginBottom: 12 },
  curveLabel:    { color: COLORS.muted, fontSize: 11, marginBottom: 6 },
  curveFooter:   { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  curveStat:     { color: COLORS.muted, fontSize: 11 },

  statsGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  statCard:      { width: "46%", backgroundColor: COLORS.input, borderRadius: 8,
                   padding: 10, borderWidth: 1, borderColor: COLORS.border },
  statLabel:     { color: COLORS.muted, fontSize: 11, marginBottom: 4 },
  statValue:     { color: COLORS.text, fontSize: 18, fontWeight: "700" },

  tradeHeader:   { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1,
                   borderColor: COLORS.border, marginBottom: 2 },
  tradeHeaderCell: { flex: 1, color: COLORS.muted, fontSize: 11, textAlign: "center" },
  tradeRow:      { flexDirection: "row", paddingVertical: 8, borderRadius: 4 },
  tradeDir:      { flex: 1, fontSize: 11, fontWeight: "600", textAlign: "center" },
  tradeEntry:    { flex: 1, color: COLORS.text, fontSize: 11, textAlign: "center" },
  tradePnl:      { flex: 1, fontSize: 11, fontWeight: "600", textAlign: "center" },
  tradeResult:   { flex: 1, fontSize: 11, fontWeight: "700", textAlign: "center" },
});
