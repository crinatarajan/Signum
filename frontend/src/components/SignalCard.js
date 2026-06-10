/**
 * components/SignalCard.js — Renders a single LONG/SHORT signal card.
 *
 * Props:
 *   signal  — Signal object from the API
 *   onPress — called when the card is tapped (navigate to detail)
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

const COLORS = {
  long:    "#00C48C",    // green
  short:   "#FF5C5C",    // red
  neutral: "#888",
  bg:      "#0E0E1A",
  card:    "#161625",
  border:  "#252540",
  text:    "#E8E8F0",
  muted:   "#6B6B8A",
};

export default function SignalCard({ signal, onPress }) {
  const isLong  = signal.direction === "LONG";
  const isShort = signal.direction === "SHORT";
  const accentColor = isLong ? COLORS.long : isShort ? COLORS.short : COLORS.neutral;

  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: accentColor }]} onPress={onPress}>
      {/* Header row */}
      <View style={styles.row}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <View style={[styles.badge, { backgroundColor: accentColor + "22", borderColor: accentColor }]}>
          <Text style={[styles.badgeText, { color: accentColor }]}>
            {signal.direction}
          </Text>
        </View>
      </View>

      {/* Confidence bar */}
      <View style={styles.confRow}>
        <Text style={styles.label}>Confidence</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${signal.confidence}%`, backgroundColor: accentColor }]} />
        </View>
        <Text style={[styles.confPct, { color: accentColor }]}>{signal.confidence}%</Text>
      </View>

      {/* Price targets */}
      <View style={styles.row}>
        <PriceCell label="Entry"     value={signal.entry}     />
        <PriceCell label="Target"    value={signal.target}    color={COLORS.long} />
        <PriceCell label="Stop Loss" value={signal.stop_loss} color={COLORS.short} />
      </View>

      {/* Reason / timeframe */}
      <Text style={styles.reason} numberOfLines={2}>{signal.reason}</Text>
      <Text style={styles.meta}>{signal.engine.toUpperCase()} · {signal.timeframe}</Text>
    </TouchableOpacity>
  );
}

function PriceCell({ label, value, color }) {
  return (
    <View style={styles.priceCell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.price, color ? { color } : {}]}>
        ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  symbol: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "700",
  },
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  confRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  label: {
    color: COLORS.muted,
    fontSize: 11,
    width: 60,
  },
  barBg: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
  confPct: {
    fontSize: 12,
    fontWeight: "600",
    width: 36,
    textAlign: "right",
  },
  priceCell: {
    flex: 1,
  },
  price: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  reason: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  meta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 6,
    textAlign: "right",
  },
});
