import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  BackHeader,
  Button,
  Card,
  colors,
  Screen,
  styles,
  Text,
} from "../components/ui";
import { updateData } from "../data/store";
import { importHealthRuns } from "../domain/importRuns";
import { errorMessage } from "../lib/feedback";
import {
  getRunningWorkouts,
  isAvailable,
  isHealthModuleAvailable,
  requestReadAuthorization,
} from "../../modules/stride-health";

export default function HealthScreen() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    void isAvailable()
      .then((value) => {
        if (active) setAvailable(value);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function sync() {
    if (pending.current || !available) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await requestReadAuthorization();
      const samples = await getRunningWorkouts(0, Date.now());
      if (samples.length === 0) {
        setMessage(
          "No accessible runs found. Check that Health has running workouts and allows Stride to read Workouts and Walking + Running Distance.",
        );
        return;
      }
      let added = 0,
        updated = 0,
        skipped = 0;
      await updateData((data) => {
        const imported = importHealthRuns(data.runs, samples);
        added = imported.added;
        updated = imported.updated;
        skipped = imported.skipped;
        return { ...data, runs: imported.runs };
      });
      setMessage(
        `${added} ${added === 1 ? "run" : "runs"} added. ${updated} refreshed.${skipped ? ` ${skipped} skipped.` : ""} Your Calendar and History are updated.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackHeader
        title="Import your runs"
        subtitle="From Apple Health. Saved in Stride."
      />
      <Card>
        <Ionicons name="heart-outline" size={30} color={colors.accent} />
        <Text style={{ fontSize: 22, fontWeight: "600" }}>Apple Health</Text>
        <Text style={styles.subtitle}>
          Read your running workouts, distance, and duration. Imported runs
          appear on their dates and count toward your totals.
        </Text>
        <Text style={styles.subtitle}>
          Refresh any time. The same Health workout is only added once. Stride
          does not write to Health.
        </Text>
        {available === false && (
          <Text style={{ color: colors.accent, lineHeight: 21 }}>
            {Platform.OS !== "ios" || !isHealthModuleAvailable()
              ? "Available in the installed iPhone app. The browser preview and Expo Go cannot read Apple Health."
              : "Apple Health is not available on this device."}
          </Text>
        )}
        <Button
          title="Import or refresh runs"
          icon="sync-outline"
          onPress={sync}
          loading={busy}
          disabled={!available || busy}
        />
      </Card>
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.accent, lineHeight: 23 }}
        >
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.danger, lineHeight: 23 }}
        >
          {error}
        </Text>
      ) : null}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Using WHOOP?</Text>
        <Text style={styles.subtitle}>
          In WHOOP, open More, App Settings, Integrations, then Apple Health.
          Allow WHOOP to share workouts, then import your runs here.
        </Text>
        <Text style={styles.subtitle}>
          Distance depends on what the source recorded. Runs without distance
          keep their time, but do not change your distance or average pace. If
          two devices recorded the same run, choose one source in Health to
          avoid duplicate workouts.
        </Text>
      </View>
    </Screen>
  );
}
