/**
 * screens/DetailScreen.js — Full signal detail view with candlestick chart.
 *
 * Dependencies to install (if not already present):
 *   npx expo install react-native-svg
 *   npm install victory-native
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Svg, Rect, Line, Text as SvgText } from "react-native-svg";
import { fetchCandles } from "../api/signals";

const COLORS = {
  bg:      "#0E0E1A",
  card:    "#161625",
  border:  "#252540",
  text:    "#E8E8F0",
  muted:   "#6B6B8A",
  long:    "#00C48C",
  short:   "#FF5C5C",
  accent:  "#7C6AF7",
  gridLine:"#1E1E35",
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_H      = 220;
const CHART_PAD    = { top: 16, bottom: 28, left: 8, right: 8 };

// ─── Candlestick Chart ────────────────────────────────────────────────────────

function CandlestickChart({ candles, entryPrice, targetPrice, stopLossPrice }) {
  if (!candles || candles.length === 0) return null;

  const chartW    = SCREEN_WIDTH - 40; // horizontal padding from parent
  const innerW    = chartW - CHART_PAD.left - CHART_PAD.right;
  const innerH    = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  const prices    = candles.flatMap(c => [c.high, c.low]);
  const priceLow  = Math.min(...prices, stopLossPrice) * 0.9995;
  const priceHigh = Math.max(...prices, targetPrice)   * 1.0005;
  const priceRange = priceHigh - priceLow;

  const toY = p => CHART_PAD.top + ((priceHigh - p) / priceRange) * innerH;

  const candleW   = Math.max(2, Math.floor(innerW / candles.length) - 1);
  const bodyMinH  = 1;

  // 4 price labels on y-axis
  const yLabels = Array.from({ length: 4 }, (_, i) => {
    const fraction = i / 3;
    const price    = priceLow + fraction * priceRange;
    return { price, y: toY(price) };
  }).reverse();

  const fmtPrice = p =>
    p >= 1000
      ? p.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : p.toLocaleString(undefined, { maximumFractionDigits: 4 });

  const levelLine = (price, color, label) => {
    if (price < priceLow || price > priceHigh) return null;
    const y = toY(price);
    return (
      <React.Fragment key={label}>
        <Line
          x1={CHART_PAD.left} y1={y}
          x2={CHART_PAD.left + innerW} y2={y}
          stroke={color} strokeWidth={1} strokeDasharray="4,3" opacity={0.8}
        />
        <SvgText
          x={CHART_PAD.left + innerW - 2}
          y={y - 3}
          fontSize={8} fill={color} textAnchor="end"
        >
          {label}
        </SvgText>
      </React.Fragment>
    );
  };

  return (
    <Svg width={chartW} height={CHART_H}>
      {/* Grid lines */}
      {yLabels.map(({ price, y }, i) => (
        <React.Fragment key={i}>
          <Line
            x1={CHART_PAD.left} y1={y}
            x2={CHART_PAD.left + innerW} y2={y}
            stroke={COLORS.gridLine} strokeWidth={1}
          />
          <SvgText
            x={CHART_PAD.left + 2} y={y - 3}
            fontSize={8} fill={COLORS.muted}
          >
            {fmtPrice(price)}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Signal level lines */}
      {levelLine(entryPrice,    COLORS.text,  "Entry")}
      {levelLine(targetPrice,   COLORS.long,  "Target")}
      {levelLine(stopLossPrice, COLORS.short, "Stop")}

      {/* Candles */}
      {candles.map((c, i) => {
        const x    = CHART_PAD.left + (i / candles.length) * innerW + (candleW / 2);
        const isUp = c.close >= c.open;
        const col  = isUp ? COLORS.long : COLORS.short;

        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH   = Math.max(bodyMinH, bodyBot - bodyTop);

        return (
          <React.Fragment key={i}>
            {/* Wick */}
            <Line
              x1={x} y1={toY(c.high)}
              x2={x} y2={toY(c.low)}
              stroke={col} strokeWidth={1}
            />
            {/* Body */}
            <Rect
              x={x - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={isUp ? col : "none"}
              stroke={col}
              strokeWidth={1}
            />
          </React.Fragment>
        );
      })}

      {/* X-axis: first, middle, last timestamps */}
      {[0, Math.floor(candles.length / 2), candles.length - 1].map(idx => {
        const c = candles[idx];
        if (!c) return null;
        const x = CHART_PAD.left + (idx / candles.length) * innerW;
        const label = new Date(c.timestamp).toLocaleTimeString([], {
          hour: "2-digit", minute: "2-digit",
        });
        return (
          <SvgText
            key={idx}
            x={x} y={CHART_H - 6}
            fontSize={8} fill={COLORS.muted}
            textAnchor={idx === 0 ? "start" : idx === candles.length - 1 ? "end" : "middle"}
          >
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DetailScreen({ route, navigation }) {
  const signal = route.params?.signal;

  // ── Hooks must run unconditionally, before any early return ───────────
  const [candles, setCandles]           = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError,   setChartError]   = useState(null);

  const loadCandles = useCallback(async () => {
    if (!signal) return;
    setChartLoading(true);
    setChartError(null);
    try {
      const data = await fetchCandles(signal.symbol, signal.timeframe ?? "1h", signal.exchange ?? "weex");
      setCandles(data);
    } catch (e) {
      setChartError(e.message ?? "Failed to load chart");
    } finally {
      setChartLoading(false);
    }
  }, [signal?.symbol, signal?.timeframe, signal?.exchange]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  if (!signal) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartError}>No signal data was passed to this screen.</Text>
        </View>
      </View>
    );
  }

  const isWatch = signal.display === "WATCH";
  const effectiveDirection = isWatch ? (signal._leaning || "LONG") : signal.direction;
  const isLong = effectiveDirection === "LONG";
  const accentColor = isWatch ? "#FFB020" : (isLong ? COLORS.long : COLORS.short);
  const rrDenominator = Math.abs(signal.stop_loss - signal.entry);
  const rr = rrDenominator > 0
    ? Math.abs(signal.target - signal.entry) / rrDenominator
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Symbol + direction */}
      <View style={styles.heroRow}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <Text style={[styles.direction, { color: accentColor }]}>
          {isWatch ? `WATCH · ${effectiveDirection}` : signal.direction}
        </Text>
      </View>

      {/* ── Candlestick Chart ── */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionLabel}>
            Last 50 Candles · {signal.timeframe ?? "1h"}
          </Text>
          <TouchableOpacity onPress={loadCandles} disabled={chartLoading}>
            <Text style={[styles.refreshBtn, chartLoading && { opacity: 0.4 }]}>↻</Text>
          </TouchableOpacity>
        </View>

        {chartLoading ? (
          <View style={styles.chartPlaceholder}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={styles.chartHint}>Loading candles…</Text>
          </View>
        ) : chartError ? (
          <View style={styles.chartPlaceholder}>
            <Text style={styles.chartError}>{chartError}</Text>
            <TouchableOpacity onPress={loadCandles} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CandlestickChart
            candles={candles}
            entryPrice={signal.entry}
            targetPrice={signal.target}
            stopLossPrice={signal.stop_loss}
          />
        )}

        <View style={styles.chartLegend}>
          <LegendDot color={COLORS.text}  label="Entry" />
          <LegendDot color={COLORS.long}  label="Target" />
          <LegendDot color={COLORS.short} label="Stop" />
        </View>
      </View>

      {/* Confidence */}
      <View style={styles.confContainer}>
        <Text style={styles.sectionLabel}>Confidence</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${Math.round((signal.confidence || 0) * 100)}%`, backgroundColor: accentColor }]} />
        </View>
        <Text style={[styles.confValue, { color: accentColor }]}>{Math.round((signal.confidence || 0) * 100)}%</Text>
      </View>

      {/* Price levels */}
      <View style={styles.priceGrid}>
        <PriceBlock label="Entry"     value={signal.entry}     color={COLORS.text} />
        <PriceBlock label="Target"    value={signal.target}    color={COLORS.long} />
        <PriceBlock label="Stop Loss" value={signal.stop_loss} color={COLORS.short} />
      </View>

      {/* Risk/Reward */}
      <View style={styles.rrCard}>
        <Text style={styles.sectionLabel}>Risk / Reward Ratio</Text>
        <Text style={[styles.rrValue, { color: rr >= 2 ? COLORS.long : COLORS.muted }]}>
          1 : {rr.toFixed(2)}
        </Text>
        <Text style={styles.rrHint}>
          {rr >= 2 ? "✅ Favourable R:R" : "⚠ R:R below 1:2 — consider skipping"}
        </Text>
      </View>

      {/* Signal reason */}
      <View style={styles.reasonCard}>
        <Text style={styles.sectionLabel}>Signal Reason</Text>
        {signal.reasons && signal.reasons.length > 0 ? (
          signal.reasons.map((reason, i) => (
            <Text key={i} style={styles.reasonText}>• {reason}</Text>
          ))
        ) : (
          <Text style={styles.reasonText}>No specific confluence factors triggered.</Text>
        )}
      </View>

      {/* Meta */}
      <View style={styles.metaRow}>
        <Chip label="Exchange"  value={(signal.exchange || "weex").toUpperCase()} />
        <Chip label="Timeframe" value={signal.timeframe} />
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceBlock({ label, value, color }) {
  return (
    <View style={styles.priceBlock}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.priceValue, { color }]}>
        ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </Text>
    </View>
  );
}

function Chip({ label, value }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  content:      { padding: 20, paddingBottom: 48 },

  back:         { marginBottom: 20 },
  backText:     { color: COLORS.accent, fontSize: 15 },

  heroRow:      { flexDirection: "row", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 20 },
  symbol:       { color: COLORS.text, fontSize: 28, fontWeight: "800" },
  direction:    { fontSize: 22, fontWeight: "800", letterSpacing: 1 },

  sectionLabel: { color: COLORS.muted, fontSize: 11, letterSpacing: 1,
                  textTransform: "uppercase", marginBottom: 8 },

  // Chart card
  chartCard:    { backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
                  borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  chartHeader:  { flexDirection: "row", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8 },
  refreshBtn:   { color: COLORS.accent, fontSize: 20, paddingHorizontal: 4 },
  chartPlaceholder: { height: CHART_H, justifyContent: "center", alignItems: "center", gap: 8 },
  chartHint:    { color: COLORS.muted, fontSize: 12, marginTop: 6 },
  chartError:   { color: COLORS.short, fontSize: 13, textAlign: "center" },
  retryBtn:     { marginTop: 10, paddingHorizontal: 16, paddingVertical: 6,
                  backgroundColor: COLORS.border, borderRadius: 6 },
  retryText:    { color: COLORS.accent, fontSize: 13 },

  chartLegend:  { flexDirection: "row", gap: 12, marginTop: 10 },
  legendItem:   { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendLabel:  { color: COLORS.muted, fontSize: 11 },

  confContainer:{ marginBottom: 20 },
  barBg:        { height: 8, backgroundColor: COLORS.border, borderRadius: 4,
                  overflow: "hidden", marginBottom: 6 },
  barFill:      { height: "100%", borderRadius: 4 },
  confValue:    { fontSize: 16, fontWeight: "700" },

  priceGrid:    { flexDirection: "row", gap: 10, marginBottom: 16 },
  priceBlock:   { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 14,
                  borderWidth: 1, borderColor: COLORS.border },
  priceLabel:   { color: COLORS.muted, fontSize: 10, marginBottom: 6, textTransform: "uppercase" },
  priceValue:   { fontSize: 13, fontWeight: "700" },

  rrCard:       { backgroundColor: COLORS.card, borderRadius: 10, padding: 16,
                  borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  rrValue:      { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  rrHint:       { color: COLORS.muted, fontSize: 12 },

  reasonCard:   { backgroundColor: COLORS.card, borderRadius: 10, padding: 16,
                  borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  reasonText:   { color: COLORS.text, fontSize: 14, lineHeight: 22 },

  metaRow:      { flexDirection: "row", gap: 10 },
  chip:         { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 12,
                  borderWidth: 1, borderColor: COLORS.border },
  chipLabel:    { color: COLORS.muted, fontSize: 10, textTransform: "uppercase", marginBottom: 4 },
  chipValue:    { color: COLORS.text, fontSize: 14, fontWeight: "600" },
});
