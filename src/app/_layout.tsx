import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, Text } from "../components/ui";
import { hydrateStore } from "../data/store";
import { initializeTracking } from "../tracking/service";
import { useStore } from "../hooks/useStore";

export default function RootLayout() {
  const { ready, error } = useStore();
  const [startupError, setStartupError] = useState("");
  useEffect(() => {
    void hydrateStore()
      .then(initializeTracking)
      .catch((error) =>
        setStartupError(
          error instanceof Error
            ? error.message
            : "Could not open your training log.",
        ),
      );
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!ready ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            backgroundColor: colors.background,
            padding: 28,
          }}
        >
          <Text style={{ fontSize: 28, letterSpacing: 7, fontWeight: "700" }}>
            STRIDE
          </Text>
          {error || startupError ? (
            <Text style={{ color: colors.danger, textAlign: "center" }}>
              {error || startupError}
            </Text>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )}
        </View>
      ) : (
        <>
          {error || startupError ? (
            <View style={{ backgroundColor: "#46272B", padding: 14 }}>
              <Text style={{ color: colors.danger, fontSize: 13 }}>
                {error || startupError}
              </Text>
            </View>
          ) : null}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="run" />
            <Stack.Screen name="marathon" />
            <Stack.Screen
              name="calendar-entry"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen name="health" />
            <Stack.Screen name="activity" />
            <Stack.Screen name="settings" />
          </Stack>
        </>
      )}
    </SafeAreaProvider>
  );
}
