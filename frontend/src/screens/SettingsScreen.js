/**
 * screens/SettingsScreen.js
 * Exchange selection, API config, and ML model settings.
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Switch, TextInput, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
  green:  "#22C55E",
  input:  "#1E1E30",
};

const EXCHANGES = [
  { id: "weex",    name: "WEEX",    description: "Primary — Perpetual swaps" },
  { id: "binance", name: "Binance", description: "Most liquid futures exchange" },
  { id: "bybit",   name: "Bybit",   description: "Linear perpetuals (USDT-settled)" },
  { id: "okx",     name: "OKX",     description: "Unified perpetual swaps" },
];

const ML_MODELS = ["xgboost", "lstm"];

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, description, right }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDesc}>{description}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const [primaryExchange, setPrimaryExchange] = useState("weex");
  const [mlModel,         setMlModel]         = useState("xgboost");
  const [mlEnabled,       setMlEnabled]       = useState(true);
  const [notifications,   setNotifications]   = useState(true);
  const [apiUrl,          setApiUrl]          = useState("http://localhost:8000");
  const [confidenceThr,   setConfidenceThr]   = useState("65");

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("signum_settings");
        if (saved) {
          const s = JSON.parse(saved);
          setPrimaryExchange(s.primaryExchange ?? "weex");
          setMlModel(s.mlModel ?? "xgboost");
          setMlEnabled(s.mlEnabled ?? true);
          setNotifications(s.notifications ?? true);
          setApiUrl(s.apiUrl ?? "http://localhost:8000");
          setConfidenceThr(s.confidenceThr ?? "65");
        }
      } catch (_) {}
    })();
  }, []);

  const save = async (patch) => {
    const current = {
      primaryExchange, mlModel, mlEnabled, notifications, apiUrl, confidenceThr,
      ...patch,
    };
    try {
      await AsyncStorage.setItem("signum_settings", JSON.stringify(current));
      Alert.alert("Saved", "Settings updated.");
    } catch (_) {
      Alert.alert("Error", "Could not save settings.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <Section title="Primary Exchange">
        <Text style={styles.sectionDesc}>
          Signals and portfolio prices will use this exchange by default.
        </Text>
        {EXCHANGES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            style={[styles.exchangeCard, primaryExchange === ex.id && styles.exchangeCardActive]}
            onPress={() => setPrimaryExchange(ex.id)}
          >
            <View style={styles.exchangeInfo}>
              <Text style={styles.exchangeName}>{ex.name}</Text>
              <Text style={styles.exchangeDesc}>{ex.description}</Text>
            </View>
            <View style={[styles.radio, primaryExchange === ex.id && styles.radioActive]}>
              {primaryExchange === ex.id && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </Section>

      <Section title="ML Model">
        <Row
          label="ML Signals Enabled"
          description="Run the trained ML model alongside rules engine"
          right={
            <Switch
              value={mlEnabled}
              onValueChange={setMlEnabled}
              trackColor={{ true: COLORS.accent }}
              thumbColor="#fff"
            />
          }
        />
        {mlEnabled && (
          <>
            <Text style={[styles.sectionDesc, { marginTop: 8 }]}>Model backend:</Text>
            <View style={styles.toggleRow}>
              {ML_MODELS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.toggleBtn, mlModel === m && styles.toggleBtnActive]}
                  onPress={() => setMlModel(m)}
                >
                  <Text style={[styles.toggleText, mlModel === m && styles.toggleTextActive]}>
                    {m.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>Confidence Threshold (%)</Text>
            <TextInput
              style={styles.input}
              value={confidenceThr}
              onChangeText={setConfidenceThr}
              keyboardType="number-pad"
              placeholderTextColor={COLORS.muted}
            />
          </>
        )}
      </Section>

      <Section title="Notifications">
        <Row
          label="Push Notifications"
          description="Receive alerts when high-confidence signals fire"
          right={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: COLORS.accent }}
              thumbColor="#fff"
            />
          }
        />
      </Section>

      <Section title="API">
        <Text style={styles.inputLabel}>Backend URL</Text>
        <TextInput
          style={styles.input}
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
          keyboardType="url"
          placeholderTextColor={COLORS.muted}
        />
      </Section>

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => save({ primaryExchange, mlModel, mlEnabled, notifications, apiUrl, confidenceThr })}
      >
        <Text style={styles.saveBtnText}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  header:           { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  headerTitle:      { fontSize: 24, fontWeight: "700", color: COLORS.text },

  section:          { margin: 12, borderRadius: 12, backgroundColor: COLORS.card,
                      borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 0 },
  sectionTitle:     { color: COLORS.text, fontWeight: "700", fontSize: 15, marginBottom: 4 },
  sectionDesc:      { color: COLORS.muted, fontSize: 12, marginBottom: 8 },

  row:              { flexDirection: "row", alignItems: "center", paddingVertical: 12,
                      borderBottomWidth: 1, borderColor: COLORS.border },
  rowLabel:         { color: COLORS.text, fontSize: 14 },
  rowDesc:          { color: COLORS.muted, fontSize: 11, marginTop: 2 },

  exchangeCard:     { flexDirection: "row", alignItems: "center", paddingVertical: 12,
                      paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
                      borderColor: COLORS.border, marginTop: 8, backgroundColor: COLORS.input },
  exchangeCardActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + "15" },
  exchangeInfo:     { flex: 1 },
  exchangeName:     { color: COLORS.text, fontWeight: "600", fontSize: 14 },
  exchangeDesc:     { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  radio:            { width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                      borderColor: COLORS.muted, alignItems: "center", justifyContent: "center" },
  radioActive:      { borderColor: COLORS.accent },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },

  toggleRow:        { flexDirection: "row", gap: 8, marginTop: 6 },
  toggleBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
                      borderWidth: 1, borderColor: COLORS.border },
  toggleBtnActive:  { backgroundColor: COLORS.accent + "30", borderColor: COLORS.accent },
  toggleText:       { color: COLORS.muted, fontSize: 12 },
  toggleTextActive: { color: COLORS.accent },

  inputLabel:       { color: COLORS.muted, fontSize: 12, marginBottom: 4, marginTop: 10 },
  input:            { backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1,
                      borderColor: COLORS.border, color: COLORS.text, padding: 10, fontSize: 14 },

  saveBtn:          { margin: 16, marginTop: 20, backgroundColor: COLORS.accent, borderRadius: 10,
                      paddingVertical: 14, alignItems: "center" },
  saveBtnText:      { color: "#fff", fontWeight: "700", fontSize: 15 },
});
