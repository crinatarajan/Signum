/**
 * screens/DashboardScreen.js — Main signal feed screen.
 * Updated: Firebase push notifications added.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  AppState,
  Platform,
} from "react-native";
import messaging from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { useSignals } from "../hooks/useSignals";
import SignalCard from "../components/SignalCard";
import { registerPushToken } from "../api/signals";

// ─── Notification display behaviour (foreground) ─────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
  warn:   "#FF9800",
  error:  "#FF5C5C",
};

const ENGINES = ["rules", "ml", "both"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requestAndGetFCMToken() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  if (!enabled) return null;
  return messaging().getToken();
}

function parseSignalFromMessage(remoteMessage) {
  const { data = {}, notification = {} } = remoteMessage;
  return {
    symbol:     data.symbol    || notification.title || "Unknown",
    direction:  data.direction || "LONG",
    confidence: parseFloat(data.confidence) || 0,
    entry:      parseFloat(data.entry)      || 0,
    target:     parseFloat(data.target)     || 0,
    stopLoss:   parseFloat(data.stopLoss)   || 0,
    timestamp:  data.timestamp || new Date().toISOString(),
    _id:        data.signalId  || String(Date.now()),
    _fromPush:  true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation }) {
  const [engine, setEngine] = useState("rules");
  const { signals, loading, error, lastUpdated, refresh } = useSignals(engine, 60);

  const [pushSignals, setPushSignals]       = useState([]);
  const [notifAllowed, setNotifAllowed]     = useState(null); // true | false | null
  const appState                            = useRef(AppState.currentState);
  const notifListener                       = useRef();
  const responseListener                    = useRef();

  // ── 1. Register FCM token ──────────────────────────────────────────────────
  useEffect(() => {
    let unsubRefresh;
    (async () => {
      try {
        const token = await requestAndGetFCMToken();
        if (token) {
          setNotifAllowed(true);
          await registerPushToken(token);
        } else {
          setNotifAllowed(false);
        }
      } catch (e) {
        console.warn("[FCM] Token error:", e);
      }
    })();

    unsubRefresh = messaging().onTokenRefresh(async (token) => {
      try { await registerPushToken(token); } catch (e) { console.warn(e); }
    });

    return () => unsubRefresh?.();
  }, []);

  // ── 2. Foreground messages ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = messaging().onMessage(async (remoteMessage) => {
      const signal = parseSignalFromMessage(remoteMessage);
      setPushSignals((prev) => [signal, ...prev]);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: remoteMessage.notification?.title ?? `${signal.symbol} Signal`,
          body:  remoteMessage.notification?.body  ??
                 `${signal.direction} • Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
          data:  remoteMessage.data,
        },
        trigger: null,
      });
    });
    return unsub;
  }, []);

  // ── 3. Background / quit-state tap ────────────────────────────────────────
  useEffect(() => {
    messaging().onNotificationOpenedApp((msg) => handleNotifNav(msg));
    messaging().getInitialNotification().then((msg) => { if (msg) handleNotifNav(msg); });
  }, []);

  // ── 4. Expo notification tap listener ─────────────────────────────────────
  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener((res) => {
      const signalId = res.notification.request.content.data?.signalId;
      if (signalId) navigation.navigate("Detail", { signalId });
    });
    return () => {
      Notifications.removeNotificationSubscription(notifListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [navigation]);

  // ── 5. Refresh on foreground ───────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") refresh();
      appState.current = next;
    });
    return () => sub.remove();
  }, [refresh]);

  const handleNotifNav = useCallback((msg) => {
    const signalId = msg?.data?.signalId;
    if (signalId) navigation.navigate("Detail", { signalId });
  }, [navigation]);

  // ── Merge API + push signals (deduplicated) ────────────────────────────────
  const allSignals = React.useMemo(() => {
    const apiIds = new Set((signals || []).map((s) => s.symbol + s.direction));
    const newPush = pushSignals.filter((s) => !apiIds.has(s.symbol + s.direction));
    return [...newPush, ...(signals || [])];
  }, [signals, pushSignals]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Push notifications disabled banner */}
      {notifAllowed === false && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            🔔 Push notifications disabled — enable in Settings to get live signal alerts.
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>⚡ Signals</Text>
        <View style={styles.headerRight}>
          {notifAllowed === true && (
            <Text style={styles.pushBadge}>🔔</Text>
          )}
          {lastUpdated && (
            <Text style={styles.updated}>
              Updated {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
        </View>
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
        data={allSignals}
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
  container:        { flex: 1, backgroundColor: COLORS.bg },
  header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                      paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  headerRight:      { flexDirection: "row", alignItems: "center", gap: 8 },
  title:            { color: COLORS.text, fontSize: 24, fontWeight: "800" },
  updated:          { color: COLORS.muted, fontSize: 11 },
  pushBadge:        { fontSize: 16 },
  permissionBanner: { backgroundColor: "#1c1f26", borderLeftWidth: 3,
                      borderLeftColor: COLORS.warn, paddingHorizontal: 14,
                      paddingVertical: 10, margin: 12, borderRadius: 6 },
  permissionText:   { color: COLORS.warn, fontSize: 12 },
  toggle:           { flexDirection: "row", marginHorizontal: 16, marginBottom: 16,
                      backgroundColor: COLORS.card, borderRadius: 10, padding: 4,
                      borderWidth: 1, borderColor: COLORS.border },
  toggleBtn:        { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  toggleActive:     { backgroundColor: COLORS.accent },
  toggleText:       { color: COLORS.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  toggleTextActive: { color: "#fff" },
  list:             { paddingHorizontal: 16, paddingBottom: 32 },
  errorBox:         { margin: 16, padding: 14, backgroundColor: "#FF5C5C22",
                      borderRadius: 10, borderWidth: 1, borderColor: "#FF5C5C44",
                      flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  errorText:        { color: COLORS.error, fontSize: 13 },
  retryText:        { color: COLORS.accent, fontSize: 13, fontWeight: "600" },
  empty:            { alignItems: "center", paddingTop: 80 },
  emptyTitle:       { color: COLORS.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle:    { color: COLORS.muted, fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
});
