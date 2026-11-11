import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { RouteMap } from "../components/RouteMap";
import {
  BackHeader,
  Button,
  Card,
  colors,
  EmptyState,
  Field,
  Row,
  Screen,
  SectionTitle,
  Text,
  styles,
} from "../components/ui";
import { updateData } from "../data/store";
import { elapsedMs, getSplits } from "../domain/engine";
import { runTitle } from "../domain/importRuns";
import { useStore } from "../hooks/useStore";
import { confirmAction, errorMessage, notify } from "../lib/feedback";
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatPace,
  unitMeters,
} from "../lib/format";

export default function ActivityScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { data } = useStore();
  const run = data.runs.find((item) => item.id === params.id);
  return (
    <RunDetails key={`${params.id}:${run?.notes ?? ""}`} runId={params.id} />
  );
}

function RunDetails({ runId }: { runId?: string }) {
  const { data } = useStore();
  const run = data.runs.find((item) => item.id === runId);
  const [note, setNote] = useState(run?.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  if (!run)
    return (
      <Screen>
        <BackHeader title="Run" />
        <EmptyState
          title="Run not found"
          message="It may have been deleted or replaced by a backup."
          action={
            <Button
              title="Back to history"
              onPress={() => router.replace("/(tabs)/history")}
            />
          }
        />
      </Screen>
    );
  const unit = data.settings.distanceUnit;
  const duration = elapsedMs(run);
  const splits = run.points.length ? getSplits(run, unitMeters(unit)) : [];
  const source =
    run.source?.kind === "apple-health"
      ? `Apple Health${run.source.name ? ` · ${run.source.name}` : ""}`
      : run.source?.kind === "manual"
        ? "Added manually"
        : "Recorded in Stride";

  async function saveNote() {
    if (!run || pending.current) return;
    pending.current = true;
    setBusy("note");
    try {
      await updateData((current) => ({
        ...current,
        runs: current.runs.map((item) =>
          item.id === run.id ? { ...item, notes: note.trim() } : item,
        ),
      }));
      notify("Note saved", "Added to this run.");
    } catch (error) {
      notify("Could not save note", errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function remove() {
    if (!run || pending.current) return;
    const message =
      run.source?.kind === "apple-health"
        ? "This removes the run from Stride only. It stays in Apple Health and may return when you import again."
        : "This removes the run from this device. It cannot be undone without a backup.";
    if (!(await confirmAction("Delete this run?", message, true))) return;
    if (pending.current) return;
    pending.current = true;
    setBusy("delete");
    try {
      await updateData((current) => ({
        ...current,
        runs: current.runs.filter((item) => item.id !== run.id),
      }));
      router.replace("/(tabs)/history");
    } catch (error) {
      notify("Could not delete run", errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <Screen>
      <BackHeader title={runTitle(run)} subtitle={formatDate(run.startedAt)} />
      <Text style={styles.subtitle}>{source}</Text>
      <Card>
        <Text style={styles.label}>DISTANCE</Text>
        <Text
          style={{
            color: colors.accent,
            fontSize: run.distanceUnavailable ? 24 : 54,
            fontWeight: "600",
            letterSpacing: -1.5,
            fontVariant: ["tabular-nums"],
          }}
        >
          {run.distanceUnavailable
            ? "Unavailable"
            : formatDistance(run.distanceMeters, unit)}
          {!run.distanceUnavailable && (
            <Text style={{ color: colors.muted, fontSize: 20 }}> {unit}</Text>
          )}
        </Text>
        <Row
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 18,
            marginTop: 6,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 23, fontWeight: "600" }}>
              {formatDuration(duration)}
            </Text>
            <Text style={styles.muted}>Time</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 23, fontWeight: "600" }}>
              {run.distanceUnavailable
                ? "-"
                : formatPace(run.distanceMeters, duration, unit)}
            </Text>
            <Text style={styles.muted}>Avg. pace /{unit}</Text>
          </View>
        </Row>
        {run.distanceUnavailable && (
          <Text style={styles.subtitle}>
            The source did not include distance. This run is excluded from
            average pace.
          </Text>
        )}
      </Card>
      {run.points.length > 0 && (
        <View
          style={{
            borderRadius: 22,
            overflow: "hidden",
            borderColor: colors.border,
            borderWidth: 1,
          }}
        >
          <RouteMap points={run.points} height={240} />
        </View>
      )}
      {run.intervalPlan && (
        <Card>
          <Row>
            <Ionicons name="repeat-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontWeight: "600" }}>
                {run.intervalPlan.repeats} intervals planned
              </Text>
              <Text style={styles.subtitle}>
                {formatDuration(run.intervalPlan.workSeconds * 1000)} work ·{" "}
                {formatDuration(run.intervalPlan.restSeconds * 1000)} recovery
              </Text>
            </View>
          </Row>
        </Card>
      )}
      {splits.length > 0 && (
        <View style={{ gap: 12 }}>
          <SectionTitle title="Splits" />
          <Card>
            <Row>
              <Text style={[styles.label, { width: 30 }]}>
                {unit.toUpperCase()}
              </Text>
              <Text style={[styles.label, { flex: 1 }]}>DISTANCE</Text>
              <Text style={styles.label}>PACE</Text>
            </Row>
            {splits.map((split) => (
              <Row key={split.index}>
                <Text style={{ width: 30 }}>{split.index}</Text>
                <Text style={[styles.muted, { flex: 1 }]}>
                  {formatDistance(split.distanceMeters, unit)} {unit}
                </Text>
                <Text>
                  {formatPace(split.distanceMeters, split.durationMs, unit)}
                </Text>
              </Row>
            ))}
          </Card>
        </View>
      )}
      <SectionTitle title="Notes" />
      <Card>
        <Field
          value={note}
          onChangeText={setNote}
          placeholder="How did it feel?"
          accessibilityLabel="Run notes"
          multiline
          maxLength={2000}
          style={{ minHeight: 100 }}
          textAlignVertical="top"
        />
        <Button
          title="Save note"
          variant="secondary"
          onPress={saveNote}
          disabled={busy !== null || note.trim() === run.notes}
          loading={busy === "note"}
        />
      </Card>
      <Button
        title="Delete run"
        variant="danger"
        icon="trash-outline"
        onPress={remove}
        disabled={busy !== null}
        loading={busy === "delete"}
      />
    </Screen>
  );
}
