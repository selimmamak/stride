import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  BackHeader,
  Button,
  Card,
  Chip,
  colors,
  Field,
  Row,
  Screen,
  SectionTitle,
  Text,
} from "../components/ui";
import { getSnapshot, importData, updateData } from "../data/store";
import { useStore } from "../hooks/useStore";
import { pickBackup, saveBackup } from "../lib/backup";
import { confirmAction, notify } from "../lib/feedback";
import type { UnitSystem } from "../types";

export default function SettingsScreen() {
  const { data } = useStore();
  const [distanceUnit, setDistanceUnit] = useState<UnitSystem>(
    data.settings.distanceUnit,
  );
  const [weeklyGoal, setWeeklyGoal] = useState(
    String(
      Math.round(
        (data.settings.weeklyGoalKm /
          (data.settings.distanceUnit === "mi" ? 1.609344 : 1)) *
          10,
      ) / 10,
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);

  function changeDistanceUnit(unit: UnitSystem) {
    if (unit === distanceUnit) return;
    const value = Number(weeklyGoal.replace(",", "."));
    if (Number.isFinite(value) && value > 0) {
      const kilometers = value * (distanceUnit === "mi" ? 1.609344 : 1);
      setWeeklyGoal(
        String(
          Math.round((kilometers / (unit === "mi" ? 1.609344 : 1)) * 10) / 10,
        ),
      );
    }
    setDistanceUnit(unit);
  }

  async function saveSettings() {
    const goal = Number(weeklyGoal.replace(",", "."));
    const goalKm = goal * (distanceUnit === "mi" ? 1.609344 : 1);
    if (!Number.isFinite(goal) || goalKm < 1 || goalKm > 500) {
      notify(
        "Check your weekly goal",
        `Enter a goal between ${distanceUnit === "mi" ? "0.7 and 310" : "1 and 500"} ${distanceUnit}.`,
      );
      return;
    }
    setBusy("settings");
    try {
      await updateData((current) => ({
        ...current,
        settings: {
          ...current.settings,
          distanceUnit,
          weeklyGoalKm: Math.round(goalKm * 1000) / 1000,
        },
      }));
      notify("Preferences saved", "Your units and weekly goal are updated.");
    } catch (error) {
      notify(
        "Could not save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function exportBackup() {
    setBusy("export");
    try {
      await saveBackup();
    } catch (error) {
      notify(
        "Could not export",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    if (data.activeRun) {
      notify(
        "Finish your session first",
        "Save or discard your current run before restoring a backup.",
      );
      return;
    }
    setBusy("import");
    try {
      const json = await pickBackup();
      if (!json) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new Error("This is not a valid JSON backup.");
      }
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("version" in parsed) ||
        parsed.version !== 1
      )
        throw new Error("Choose a backup exported by Stride.");
      const approved = await confirmAction(
        "Replace your training data?",
        "This replaces all saved activities, marathons, calendar entries, and preferences on this device with the selected backup. Export your current data first if you want to keep it.",
        true,
      );
      if (!approved) return;
      await importData(json);
      const restored = getSnapshot().data.settings;
      setDistanceUnit(restored.distanceUnit);
      setWeeklyGoal(
        String(
          Math.round(
            (restored.weeklyGoalKm /
              (restored.distanceUnit === "mi" ? 1.609344 : 1)) *
              10,
          ) / 10,
        ),
      );
      notify("Backup restored", "Your training data is saved on this device.");
    } catch (error) {
      notify(
        "Could not restore",
        error instanceof Error
          ? error.message
          : "Your existing data has not been replaced.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <BackHeader
        title="Your settings"
        subtitle="A few things. Just for you."
      />
      <SectionTitle title="Units" />
      <Card style={s.card}>
        <Text style={s.label}>Distance</Text>
        <Row style={s.options}>
          <Chip
            label="Kilometers"
            selected={distanceUnit === "km"}
            onPress={() => changeDistanceUnit("km")}
          />
          <Chip
            label="Miles"
            selected={distanceUnit === "mi"}
            onPress={() => changeDistanceUnit("mi")}
          />
        </Row>
      </Card>
      <SectionTitle title="Weekly running goal" />
      <Card style={s.card}>
        <Field
          label={`Distance per week (${distanceUnit})`}
          value={weeklyGoal}
          onChangeText={setWeeklyGoal}
          keyboardType="decimal-pad"
          maxLength={6}
          selectTextOnFocus
        />
        <Text style={s.hint}>Your week starts on Monday.</Text>
      </Card>
      <Button
        title="Save preferences"
        onPress={saveSettings}
        loading={busy === "settings"}
        disabled={busy !== null}
      />
      <View style={s.sectionGap} />
      <SectionTitle title="Apple Health" />
      <Button
        title="Import runs"
        icon="heart-outline"
        variant="secondary"
        onPress={() => router.push("/health")}
      />
      <SectionTitle title="Your data" />
      <Card style={s.card}>
        <Row style={s.privacyHeading}>
          <Ionicons
            name="phone-portrait-outline"
            size={22}
            color={colors.accent}
          />
          <Text style={s.label}>Saved on your phone.</Text>
        </Row>
        <Text style={s.body}>
          Runs, routes, races, and your calendar stay on this device. No Stride
          account or server.
        </Text>
        <Text style={s.hint}>
          Deleting the app can delete its data. Keep a backup in Files. Choose
          “On My iPhone” if you want the backup stored locally too. Device
          backups follow your iPhone settings.
        </Text>
        <View style={s.actions}>
          <Button
            title="Export backup"
            icon="download-outline"
            variant="secondary"
            onPress={exportBackup}
            loading={busy === "export"}
            disabled={busy !== null}
          />
          <Button
            title="Restore backup"
            icon="folder-open-outline"
            variant="ghost"
            onPress={restoreBackup}
            loading={busy === "import"}
            disabled={busy !== null}
          />
        </View>
      </Card>
      <Text style={s.footer}>STRIDE / PERSONAL TRAINING</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { padding: 20, marginBottom: 20, gap: 10 },
  label: { fontSize: 16, fontWeight: "600" },
  options: { gap: 8, marginTop: 3, flexWrap: "wrap" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 22, color: colors.muted },
  sectionGap: { height: 28 },
  privacyHeading: { gap: 10, marginBottom: 3 },
  actions: { marginTop: 8, gap: 8 },
  footer: {
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 2,
    textAlign: "center",
    marginTop: 12,
  },
});
