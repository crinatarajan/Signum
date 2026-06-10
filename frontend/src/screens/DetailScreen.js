/**
 * screens/DetailScreen.js — Full signal detail view.
 */

import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  long:   "#00C48C",
  short:  "#FF5C5C",
  accent: "#7C6AF7",
};

export default function DetailScreen({ route, navigation }) {
  const { signal } = route.params;
  const isLong = signal.direction === "LONG";
  const accentColor = isLong ? COLORS.long : COLORS.short;
  const rr = Math.abs(signal.target - signal.entry) / Math.abs(signal.stop_loss - signal.entry);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back */}
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {/* Symbol + direction */}
      <View style={styles.heroRow}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <Text style={[styles.direction, { color: accentColor }]}>{signal.direction}</Text>
      </View>

      {/* Confidence */}
      <View style={styles.confContainer}>
        <Text style={styles.sectionLabel}>Confidence</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${signal.confidence}%`, backgroundColor: accentColor }]} />
        </View>
        <Text style={[styles.confValue, { color: accentColor }]}>{signal.confidence}%</Text>
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
        <Text style={styles.reasonText}>{signal.reason}</Text>
      </View>

      {/* Meta */}
      <View style={styles.metaRow}>
        <Chip label="Engine"    value={signal.engine.toUpperCase()} />
        <Chip label="Timeframe" value={signal.timeframe} />
      </View>
    </ScrollView>
  );
}

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

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  content:      { padding: 20, paddingBottom: 48 },
  back:         { marginBottom: 20 },
  backText:     { color: COLORS.accent, fontSize: 15 },
  heroRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  symbol:       { color: COLORS.text, fontSize: 28, fontWeight: "800" },
  direction:    { fontSize: 22, fontWeight: "800", letterSpacing: 1 },
  sectionLabel: { color: COLORS.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  confContainer:{ marginBottom: 20 },
  barBg:        { height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: "hidden", marginBottom: 6 },
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
