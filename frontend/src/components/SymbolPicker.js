/**
 * components/SymbolPicker.js — Text input with a filterable dropdown of
 * common trading pairs.
 *
 * Users can either pick from the curated list (src/constants/pairs.js) or
 * type any symbol manually (e.g. a newly-listed pair not yet in the list).
 *
 * Props:
 *   value       — current symbol string, e.g. "BTC/USDT"
 *   onChange    — (newValue: string) => void
 *   label       — input label text (default "Symbol")
 *   placeholder — input placeholder
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { COMMON_PAIRS } from "../constants/pairs";

const COLORS = {
  bg:     "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
};

export default function SymbolPicker({
  value,
  onChange,
  label = "Symbol",
  placeholder = "e.g. BTC/USDT",
}) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const query = (value || "").toUpperCase().replace("-", "/").trim();
    if (!query) return COMMON_PAIRS.slice(0, 8);
    return COMMON_PAIRS.filter((p) => p.includes(query)).slice(0, 8);
  }, [value]);

  const showDropdown = focused && suggestions.length > 0;

  return (
    <View style={styles.wrapper}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        // Delay blur so a tap on a suggestion registers before closing
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        autoCapitalize="characters"
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted}
      />

      {showDropdown && (
        <View style={styles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.option}
                onPress={() => {
                  onChange(item);
                  setFocused(false);
                }}
              >
                <Text style={styles.optionText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          <Text style={styles.hint}>
            Not listed? Just type the pair, e.g. "DOGE/USDT".
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 10,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    padding: 10,
    fontSize: 14,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 220,
    overflow: "hidden",
    zIndex: 20,
    elevation: 5,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionText: {
    color: COLORS.text,
    fontSize: 14,
  },
  hint: {
    color: COLORS.muted,
    fontSize: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
