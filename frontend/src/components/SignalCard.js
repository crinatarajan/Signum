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
  watch:   "#FFB020",    // amber — "watch" candidates
  bg:      "#0E0E1A",
  card:    "#161625",
  border:  "#252540",
  text:    "#E8E8F0",
  muted:   "#6B6B8A",
};

export default function SignalCard({ signal, onPress }) {
  const isWatch = signal.display === "WATCH";
  const isLong  = !isWatch && signal.direction === "LONG";
  const isShort = !isWatch && signal.direction === "SHORT";
  const accentColor = isWatch
    ? COLORS.watch
    : isLong ? COLORS.long : isShort ? COLORS.short : COLORS.neutral;

  // For WATCH cards, show the "leaning" direction (what it would become
  // if confluence strengthens) rather than NEUTRAL.
  const badgeLabel = isWatch ? `WATCH · ${signal._leaning || "—"}` : signal.direction;

  // Score progress: for active signals use confidence (0-1), for watch
  // candidates show the raw score relative to the activation threshold.
  const maxScore = signal.max_score || 4;
  const watchScore = Math.max(signal.bullish_score || 0, signal.bearish_score || 0);
  const progressPct = isWatch
    ? Math.round((watchScore / maxScore) * 100)
    : Math.round((signal.confidence || 0) * 100);
  const progressLabel = isWatch ? "Setup score" : "Confidence";

  return (
    <TouchableOpacity style={[styles.card, { borderLeftColor: accentColor }]} onPress={onPress}>
      {/* Header row */}
      <View style={styles.row}>
        <Text style={styles.symbol}>{signal.symbol}</Text>
        <View style={[styles.badge, { backgroundColor: accentColor + "22", borderColor: accentColor }]}>
          <Text style={[styles.badgeText, { color: accentColor }]}>
            {badgeLabel}
          </Text>
        </View>
      </View>

      {/* Confidence / setup score bar */}
      <View style={styles.confRow}>
        <Text style={styles.label}>{progressLabel}</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${progressPct}%`, backgroundColor: accentColor }]} />
        </View>
        <Text style={[styles.confPct, { color: accentColor }]}>{progressPct}%</Text>
      </View>

      {isWatch && (
        <Text style={styles.watchHint}>
          Below confidence threshold — not an active setup yet, but closest of your watchlist.
        </Text>
      )}

      {/* Price targets */}
      <View style={styles.row}>
        <PriceCell label="Entry"     value={signal.entry}     />
        <PriceCell label={isWatch ? "If target" : "Target"}    value={signal.target}    color={COLORS.long} />
        <PriceCell label={isWatch ? "If stop" : "Stop Loss"} value={signal.stop_loss} color={COLORS.short} />
      </View>

      {/* Reason / timeframe */}
      {!!(signal.reasons && signal.reasons.length) && (
        <Text style={styles.reason} numberOfLines={2}>{signal.reasons.join(" • ")}</Text>
      )}
      <Text style={styles.meta}>{(signal.exchange || "").toUpperCase()} · {signal.timeframe}</Text>
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
  watchHint: {
    color: COLORS.watch,
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
    fontStyle: "italic",
  },
  meta: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 6,
    textAlign: "right",
  },
});
