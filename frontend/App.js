/**
 * App.js — Root of the Signum React Native app.
 * Bottom-tab navigator: Dashboard | Portfolio | Backtest | Settings
 * Stack navigator inside Dashboard tab for the Detail screen.
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";

import DashboardScreen  from "./src/screens/DashboardScreen";
import DetailScreen     from "./src/screens/DetailScreen";
import PortfolioScreen  from "./src/screens/PortfolioScreen";
import BacktestScreen   from "./src/screens/BacktestScreen";
import SettingsScreen   from "./src/screens/SettingsScreen";

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

const COLORS = {
  bg:     "#0E0E1A",
  card:   "#161625",
  border: "#252540",
  text:   "#E8E8F0",
  muted:  "#6B6B8A",
  accent: "#7C6AF7",
};

// Dashboard has its own stack (Dashboard → Detail)
function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: COLORS.bg } }}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} />
      <Stack.Screen name="Detail"        component={DetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.card,
            borderTopColor: COLORS.border,
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor:   COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarIcon: ({ color, size }) => {
            const icons = {
              Dashboard: "📡",
              Portfolio: "💼",
              Backtest:  "📊",
              Settings:  "⚙️",
            };
            return <Text style={{ fontSize: size - 4 }}>{icons[route.name]}</Text>;
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardStack} />
        <Tab.Screen name="Portfolio" component={PortfolioScreen} />
        <Tab.Screen name="Backtest"  component={BacktestScreen} />
        <Tab.Screen name="Settings"  component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
