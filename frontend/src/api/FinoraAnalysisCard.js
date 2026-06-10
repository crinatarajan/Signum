/**
 * FinoraAnalysisCard.js
 * Displays the Finora AI analysis result in a rich card UI.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { fetchAIAnalysis } from "../api/signals";

const BIAS_COLORS = {
  long: "#00C896",
  short: "#FF4D6D",
  neutral: "#FFC947",
};

const TREND_ICON = {
  bullish: "↑",
  bearish: "↓",
  ranging: "↔",
};

export default function FinoraAnalysisCard({ symbol, timeframe = "1h" }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAIAnalysis(symbol, timeframe);
      setAnalysis(data);
      setExpanded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const biasColor = analysis ? BIAS_COLORS[analysis.bias] ?? "#888" : "#888";
  const trendIcon = analysis ? TREND_ICON[analysis.trend] ?? "?" : "";

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.aiLabel}>⚡ Finora AI</Text>
          <Text style={styles.subtitle}>Smart Money Analysis</Text>
        </View>
        {analysis && (
          <View style={[styles.biasBadge, { backgroundColor: biasColor + "22", borderColor: biasColor }]}>
            <Text style={[styles.biasText, { color: biasColor }]}>
              {trendIcon} {analysis.bias?.toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Summary */}
      {analysis && (
        <Text style={styles.summary}>{analysis.summary}</Text>
      )}

      {/* Key Levels */}
      {analysis && expanded && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Levels</Text>
          <View style={styles.levelsRow}>
            <View style={styles.levelCol}>
              <Text style={styles.levelLabel}>Resistance</Text>
              {(analysis.key_levels?.resistance ?? []).map((v, i) => (
                <Text key={i} style={[styles.levelValue, { color: "#FF4D6D" }]}>
                  {v}
                </Text>
              ))}
            </View>
            <View style={styles.levelCol}>
              <Text style={styles.levelLabel}>Support</Text>
              {(analysis.key_levels?.support ?? []).map((v, i) => (
                <Text key={i} style={[styles.levelValue, { color: "#00C896" }]}>
                  {v}
                </Text>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Trade Setup */}
      {analysis && expanded && analysis.setup && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Trade Setup · {analysis.setup.direction?.toUpperCase()}
          </Text>
          <View style={styles.setupGrid}>
            <SetupItem label="Entry Zone" value={`${analysis.setup.entry_zone?.[0]} – ${analysis.setup.entry_zone?.[1]}`} />
            <SetupItem label="TP 1" value={analysis.setup.take_profit_1} color="#00C896" />
            <SetupItem label="TP 2" value={analysis.setup.take_profit_2} color="#00C896" />
            <SetupItem label="Stop Loss" value={analysis.setup.stop_loss} color="#FF4D6D" />
            <SetupItem label="R:R" value={`1 : ${analysis.setup.risk_reward}`} />
          </View>
          {analysis.setup.rationale && (
            <Text style={styles.rationale}>{analysis.setup.rationale}</Text>
          )}
        </View>
      )}

      {/* Scenarios */}
      {analysis && expanded && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scenarios</Text>
          <Text style={styles.scenarioText}>
            <Text style={{ color: "#00C896" }}>▲ Bull: </Text>
            {analysis.scenarios?.bullish}
          </Text>
          <Text style={[styles.scenarioText, { marginTop: 4 }]}>
            <Text style={{ color: "#FF4D6D" }}>▼ Bear: </Text>
            {analysis.scenarios?.bearish}
          </Text>
        </View>
      )}

      {/* Confluence */}
      {analysis && expanded && (
        <Text style={styles.confluence}>{analysis.confluence_notes}</Text>
      )}

      {/* Disclaimer */}
      {analysis && (
        <Text style={styles.disclaimer}>{analysis.disclaimer}</Text>
      )}

      {/* Error */}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={run}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>
              {analysis ? "↻ Refresh Analysis" : "Run Finora AI"}
            </Text>
          )}
        </TouchableOpacity>
        {analysis && (
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setExpanded((v) => !v)}
          >
            <Text style={styles.toggleText}>{expanded ? "Show Less" : "Show More"}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SetupItem({ label, value, color = "#fff" }) {
  return (
    <View style={styles.setupItem}>
      <Text style={styles.setupLabel}>{label}</Text>
      <Text style={[styles.setupValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1D27",
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#2A2D3E",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  aiLabel: { color: "#fff", fontWeight: "700", fontSize: 16 },
  subtitle: { color: "#888", fontSize: 12, marginTop: 2 },
  biasBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  biasText: { fontWeight: "700", fontSize: 13 },
  summary: { color: "#ccc", fontSize: 13, lineHeight: 20, marginBottom: 12 },
  section: { marginTop: 12 },
  sectionTitle: {
    color: "#888",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  levelsRow: { flexDirection: "row", gap: 16 },
  levelCol: { flex: 1 },
  levelLabel: { color: "#888", fontSize: 11, marginBottom: 4 },
  levelValue: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  setupGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  setupItem: {
    backgroundColor: "#252836",
    borderRadius: 8,
    padding: 8,
    minWidth: "45%",
    flex: 1,
  },
  setupLabel: { color: "#888", fontSize: 10, marginBottom: 2 },
  setupValue: { color: "#fff", fontWeight: "700", fontSize: 13 },
  rationale: { color: "#aaa", fontSize: 12, marginTop: 8, lineHeight: 18 },
  scenarioText: { color: "#ccc", fontSize: 12, lineHeight: 18 },
  confluence: {
    color: "#999",
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
    fontStyle: "italic",
  },
  disclaimer: {
    color: "#555",
    fontSize: 10,
    marginTop: 12,
    textAlign: "center",
  },
  error: { color: "#FF4D6D", fontSize: 12, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: {
    flex: 1,
    backgroundColor: "#5B5FEF",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2D3E",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: { color: "#888", fontSize: 13 },
});
