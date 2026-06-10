/**
 * App.js — Root of the React Native app.
 * Sets up React Navigation stack: Dashboard → Detail
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "expo-status-bar";

import DashboardScreen from "./src/screens/DashboardScreen";
import DetailScreen    from "./src/screens/DetailScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: "#0E0E1A" },
        }}
      >
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="Detail"    component={DetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
