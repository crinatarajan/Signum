/**
 * screens/DashboardScreen.js — Main signal feed screen.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useSignals } from "../hooks/useSignals";
import SignalCard from "../components/SignalCard";

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
};

const ENGINES = ["rules", "ml", "both"];

export default function DashboardScreen({ navigation }) {
  const [engine, setEngine] = useState("rules");
  const { signals, loading, error, lastUpdated, refresh } = useSignals(engine, 60);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>⚡ Signals</Text>
        {lastUpdated && (
          <Text style={styles.updated}>
            Updated {lastUpdated.toLocaleTimeString()}
          </Text>
        )}
      </View>

      {/* Engine toggle */}
      <View style={styles.toggle}>
        {ENGINES.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.toggleBtn, engine === e && styles.toggleActive]}
            onPress={() => setEngine(e)}
          >
            <Text style={[styles.toggleText, engine === e && styles.toggleTextActive]}>
              {e.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error state */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠ {error}</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Signal list */}
      <FlatList
        data={signals}
        keyExtractor={(item, i) => `${item.symbol}-${item.direction}-${i}`}
        renderItem={({ item }) => (
          <SignalCard
            signal={item}
            onPress={() => navigation.navigate("Detail", { signal: item })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No active setups</Text>
              <Text style={styles.emptySubtitle}>
                All pairs are below confidence threshold. Pull to refresh.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                     paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title:           { color: COLORS.text, fontSize: 24, fontWeight: "800" },
  updated:         { color: COLORS.muted, fontSize: 11 },
  toggle:          { flexDirection: "row", marginHorizontal: 16, marginBottom: 16,
                     backgroundColor: COLORS.card, borderRadius: 10, padding: 4,
                     borderWidth: 1, borderColor: COLORS.border },
  toggleBtn:       { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  toggleActive:    { backgroundColor: COLORS.accent },
  toggleText:      { color: COLORS.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  toggleTextActive:{ color: "#fff" },
  list:            { paddingHorizontal: 16, paddingBottom: 32 },
  errorBox:        { margin: 16, padding: 14, backgroundColor: "#FF5C5C22",
                     borderRadius: 10, borderWidth: 1, borderColor: "#FF5C5C44",
                     flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  errorText:       { color: "#FF5C5C", fontSize: 13 },
  retryText:       { color: COLORS.accent, fontSize: 13, fontWeight: "600" },
  empty:           { alignItems: "center", paddingTop: 80 },
  emptyTitle:      { color: COLORS.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle:   { color: COLORS.muted, fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
