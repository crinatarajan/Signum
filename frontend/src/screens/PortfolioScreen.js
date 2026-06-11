/**
 * screens/PortfolioScreen.js
 * Live portfolio tracker — shows all open positions with real-time P&L.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchPortfolio, addPosition, removePosition } from "../api/signals";
import SymbolPicker from "../components/SymbolPicker";

const COLORS = {
  bg:      "#0E0E1A",
  card:    "#161625",
  border:  "#252540",
  text:    "#E8E8F0",
  muted:   "#6B6B8A",
  accent:  "#7C6AF7",
  green:   "#22C55E",
  red:     "#EF4444",
  warn:    "#FF9800",
  input:   "#1E1E30",
};

const EXCHANGES = ["weex", "binance", "bybit", "okx"];
const DIRECTIONS = ["LONG", "SHORT"];

// ─── P&L badge ──────────────────────────────────────────────────────────────

function PnlBadge({ pnl_pct, pnl_usd }) {
  const positive = pnl_pct >= 0;
  return (
    <View style={[styles.pnlBadge, { backgroundColor: positive ? "#16301D" : "#2D1515" }]}>
      <Text style={[styles.pnlPct, { color: positive ? COLORS.green : COLORS.red }]}>
        {positive ? "+" : ""}{pnl_pct.toFixed(2)}%
      </Text>
      <Text style={[styles.pnlUsd, { color: positive ? COLORS.green : COLORS.red }]}>
        {positive ? "+" : ""}${pnl_usd.toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Position card ───────────────────────────────────────────────────────────

function PositionCard({ position, onRemove }) {
  const isLong = position.direction === "LONG";
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.symbol}>{position.symbol}</Text>
          <Text style={styles.meta}>
            {position.exchange.toUpperCase()}  ·  {position.direction}  ·  Qty: {position.quantity}
          </Text>
        </View>
        <PnlBadge pnl_pct={position.pnl_pct} pnl_usd={position.pnl_usd} />
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Entry</Text>
          <Text style={styles.priceValue}>${position.entry_price.toLocaleString()}</Text>
        </View>
        <View style={styles.priceArrow}>
          <Text style={{ color: COLORS.muted, fontSize: 18 }}>→</Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Current</Text>
          <Text style={[styles.priceValue, { color: isLong
            ? (position.current_price >= position.entry_price ? COLORS.green : COLORS.red)
            : (position.current_price <= position.entry_price ? COLORS.green : COLORS.red)
          }]}>
            ${position.current_price.toLocaleString()}
          </Text>
        </View>
      </View>

      {position.notes ? (
        <Text style={styles.notes}>{position.notes}</Text>
      ) : null}

      <TouchableOpacity style={styles.removeBtn} onPress={() => onRemove(position.symbol)}>
        <Text style={styles.removeBtnText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Add Position Modal ───────────────────────────────────────────────────────

function AddPositionModal({ visible, onClose, onAdd }) {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [exchange, setExchange] = useState("weex");
  const [direction, setDirection] = useState("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Position sizing calculator ──────────────────────────────────────────
  const [showCalc, setShowCalc] = useState(false);
  const [accountBalance, setAccountBalance] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [stopPrice, setStopPrice] = useState("");

  const entry = parseFloat(entryPrice);
  const stop = parseFloat(stopPrice);
  const balance = parseFloat(accountBalance);
  const risk = parseFloat(riskPct);

  const validCalcInputs =
    !isNaN(entry) && !isNaN(stop) && !isNaN(balance) && !isNaN(risk) &&
    entry > 0 && balance > 0 && risk > 0 && entry !== stop;

  const riskAmountUsd = validCalcInputs ? (balance * risk) / 100 : null;
  const stopDistance = validCalcInputs ? Math.abs(entry - stop) : null;
  const calculatedQty = validCalcInputs ? riskAmountUsd / stopDistance : null;
  const positionValueUsd = validCalcInputs ? calculatedQty * entry : null;

  // Sanity check: warn if stop is on the wrong side for the chosen direction
  const stopDirectionMismatch =
    validCalcInputs &&
    ((direction === "LONG" && stop >= entry) ||
     (direction === "SHORT" && stop <= entry));

  const applyCalculatedQty = () => {
    if (calculatedQty && calculatedQty > 0) {
      // Use a sensible number of decimals depending on size
      const decimals = calculatedQty < 1 ? 6 : calculatedQty < 100 ? 4 : 2;
      setQuantity(calculatedQty.toFixed(decimals));
    }
  };

  const handleAdd = async () => {
    if (!entryPrice || !quantity) {
      Alert.alert("Missing fields", "Entry price and quantity are required.");
      return;
    }
    setLoading(true);
    try {
      await onAdd({
        symbol: symbol.toUpperCase().replace("-", "/"),
        exchange,
        direction,
        entry_price: parseFloat(entryPrice),
        quantity: parseFloat(quantity),
        notes,
      });
      onClose();
      setEntryPrice(""); setQuantity(""); setNotes("");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Position</Text>

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

          <Text style={styles.inputLabel}>Direction</Text>
          <View style={styles.toggleRow}>
            {DIRECTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.toggleBtn, direction === d && styles.toggleBtnActive,
                  { borderColor: d === "LONG" ? COLORS.green : COLORS.red }]}
                onPress={() => setDirection(d)}
              >
                <Text style={[styles.toggleText, direction === d && {
                  color: d === "LONG" ? COLORS.green : COLORS.red
                }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Entry Price (USD)</Text>
          <TextInput
            style={styles.input}
            value={entryPrice}
            onChangeText={setEntryPrice}
            keyboardType="decimal-pad"
            placeholder="e.g. 65000"
            placeholderTextColor={COLORS.muted}
          />

          {/* ── Position size calculator ───────────────────────────────── */}
          <TouchableOpacity
            style={styles.calcToggle}
            onPress={() => setShowCalc((v) => !v)}
          >
            <Text style={styles.calcToggleText}>
              {showCalc ? "▾" : "▸"} Position size calculator
            </Text>
          </TouchableOpacity>

          {showCalc && (
            <View style={styles.calcBox}>
              <Text style={styles.calcHint}>
                Size your position based on account risk — never risk more than
                you can afford to lose on a single trade.
              </Text>

              <Text style={styles.inputLabel}>Account Balance (USD)</Text>
              <TextInput
                style={styles.input}
                value={accountBalance}
                onChangeText={setAccountBalance}
                keyboardType="decimal-pad"
                placeholder="e.g. 1000"
                placeholderTextColor={COLORS.muted}
              />

              <Text style={styles.inputLabel}>Risk per Trade (%)</Text>
              <TextInput
                style={styles.input}
                value={riskPct}
                onChangeText={setRiskPct}
                keyboardType="decimal-pad"
                placeholder="e.g. 1"
                placeholderTextColor={COLORS.muted}
              />
              <Text style={styles.calcSubHint}>
                Common guidance: 0.5–2% of account balance per trade.
              </Text>

              <Text style={styles.inputLabel}>Stop-Loss Price (USD)</Text>
              <TextInput
                style={styles.input}
                value={stopPrice}
                onChangeText={setStopPrice}
                keyboardType="decimal-pad"
                placeholder="e.g. 63500"
                placeholderTextColor={COLORS.muted}
              />

              {stopDirectionMismatch && (
                <Text style={styles.calcWarning}>
                  ⚠ For a {direction} position, the stop-loss should be{" "}
                  {direction === "LONG" ? "below" : "above"} the entry price.
                  Double-check your levels.
                </Text>
              )}

              {validCalcInputs && !stopDirectionMismatch && (
                <View style={styles.calcResult}>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Risk amount</Text>
                    <Text style={styles.calcValue}>${riskAmountUsd.toFixed(2)}</Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Stop distance</Text>
                    <Text style={styles.calcValue}>
                      ${stopDistance.toFixed(stopDistance < 1 ? 6 : 2)}
                    </Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Suggested quantity</Text>
                    <Text style={[styles.calcValue, { color: COLORS.accent, fontWeight: "700" }]}>
                      {calculatedQty.toFixed(calculatedQty < 1 ? 6 : calculatedQty < 100 ? 4 : 2)}
                    </Text>
                  </View>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Position value</Text>
                    <Text style={styles.calcValue}>${positionValueUsd.toFixed(2)}</Text>
                  </View>

                  <TouchableOpacity style={styles.calcApplyBtn} onPress={applyCalculatedQty}>
                    <Text style={styles.calcApplyBtnText}>Use this quantity</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <Text style={styles.inputLabel}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="e.g. 0.1"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.inputLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { height: 60 }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Why you entered this trade..."
            placeholderTextColor={COLORS.muted}
          />

          <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.addBtnText}>Add Position</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchPortfolio();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async (pos) => {
    await addPosition(pos);
    load();
  };

  const handleRemove = (symbol) => {
    Alert.alert("Remove position", `Remove ${symbol}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await removePosition(symbol);
        load();
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  const totalPnl = data?.total_pnl_usd ?? 0;
  const positions = data?.positions ?? [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Portfolio</Text>
          <Text style={styles.headerSubtitle}>
            Manual tracking only — Signum doesn't place trades
          </Text>
        </View>
        <TouchableOpacity style={styles.addIconBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addIconText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Total P&L banner */}
      <View style={[styles.totalBanner, { borderColor: totalPnl >= 0 ? COLORS.green : COLORS.red }]}>
        <Text style={styles.totalLabel}>Unrealized P&L</Text>
        <Text style={[styles.totalValue, { color: totalPnl >= 0 ? COLORS.green : COLORS.red }]}>
          {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
        </Text>
        <Text style={styles.positionCount}>{positions.length} position{positions.length !== 1 ? "s" : ""}</Text>
      </View>

      {positions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No positions yet.</Text>
          <Text style={styles.emptyHint}>Tap ＋ to add your first trade.</Text>
        </View>
      ) : (
        <FlatList
          data={positions}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item }) => (
            <PositionCard position={item} onRemove={handleRemove} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={COLORS.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      <AddPositionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  center:       { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  headerTitle:  { fontSize: 24, fontWeight: "700", color: COLORS.text },
  headerSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  addIconBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent,
                  alignItems: "center", justifyContent: "center" },
  addIconText:  { color: "#fff", fontSize: 20, lineHeight: 22 },

  totalBanner:  { margin: 16, borderRadius: 12, borderWidth: 1, padding: 16,
                  backgroundColor: COLORS.card, alignItems: "center" },
  totalLabel:   { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  totalValue:   { fontSize: 28, fontWeight: "800" },
  positionCount:{ color: COLORS.muted, fontSize: 12, marginTop: 4 },

  card:         { margin: 12, marginTop: 0, borderRadius: 12, backgroundColor: COLORS.card,
                  borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  cardHeader:   { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  symbol:       { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  meta:         { color: COLORS.muted, fontSize: 11, marginTop: 2 },

  pnlBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "flex-end" },
  pnlPct:       { fontSize: 15, fontWeight: "700" },
  pnlUsd:       { fontSize: 11, fontWeight: "500", marginTop: 1 },

  priceRow:     { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  priceItem:    { flex: 1, alignItems: "center" },
  priceArrow:   { paddingHorizontal: 8 },
  priceLabel:   { color: COLORS.muted, fontSize: 10, marginBottom: 2 },
  priceValue:   { color: COLORS.text, fontSize: 14, fontWeight: "600" },

  notes:        { color: COLORS.muted, fontSize: 12, fontStyle: "italic", marginTop: 4 },
  removeBtn:    { marginTop: 10, alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 5,
                  borderRadius: 6, borderWidth: 1, borderColor: COLORS.red + "60" },
  removeBtnText:{ color: COLORS.red, fontSize: 12 },

  empty:        { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText:    { color: COLORS.text, fontSize: 16, marginBottom: 6 },
  emptyHint:    { color: COLORS.muted, fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  padding: 24, paddingBottom: 40 },
  modalTitle:   { color: COLORS.text, fontSize: 20, fontWeight: "700", marginBottom: 16 },
  inputLabel:   { color: COLORS.muted, fontSize: 12, marginBottom: 4, marginTop: 12 },
  input:        { backgroundColor: COLORS.input, borderRadius: 8, borderWidth: 1,
                  borderColor: COLORS.border, color: COLORS.text, padding: 10, fontSize: 14 },
  toggleRow:    { flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" },
  toggleBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                  borderWidth: 1, borderColor: COLORS.border },
  toggleBtnActive: { backgroundColor: COLORS.accent + "30", borderColor: COLORS.accent },
  toggleText:   { color: COLORS.muted, fontSize: 12 },
  toggleTextActive: { color: COLORS.accent },
  addBtn:       { marginTop: 20, backgroundColor: COLORS.accent, borderRadius: 10,
                  paddingVertical: 14, alignItems: "center" },
  addBtnText:   { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn:    { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  cancelBtnText:{ color: COLORS.muted, fontSize: 14 },

  // Position size calculator
  calcToggle:    { marginTop: 14, paddingVertical: 6 },
  calcToggleText:{ color: COLORS.accent, fontSize: 13, fontWeight: "600" },
  calcBox:       { marginTop: 8, padding: 12, borderRadius: 10,
                   backgroundColor: COLORS.input, borderWidth: 1, borderColor: COLORS.border },
  calcHint:      { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  calcSubHint:   { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  calcWarning:   { color: COLORS.warn, fontSize: 12, marginTop: 10, lineHeight: 17 },
  calcResult:    { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  calcRow:       { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  calcLabel:     { color: COLORS.muted, fontSize: 12 },
  calcValue:     { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  calcApplyBtn:  { marginTop: 8, backgroundColor: COLORS.accent + "30", borderRadius: 8,
                   borderWidth: 1, borderColor: COLORS.accent, paddingVertical: 10, alignItems: "center" },
  calcApplyBtnText: { color: COLORS.accent, fontWeight: "700", fontSize: 13 },
});
