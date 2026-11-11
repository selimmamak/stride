import { useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  BackHeader,
  Button,
  Chip,
  Field,
  Row,
  Screen,
  Text,
  colors,
  styles,
} from "../components/ui";
import { id, updateData } from "../data/store";
import { localDateKey, parseLocalDate } from "../domain/calendar";
import { manualRun } from "../domain/importRuns";
import { useStore } from "../hooks/useStore";
import { confirmAction, errorMessage } from "../lib/feedback";
import { unitMeters } from "../lib/format";
import type { CalendarEntry, RunKind } from "../types";

const runKinds: { kind: RunKind; title: string }[] = [
  { kind: "easy", title: "Easy" },
  { kind: "long", title: "Long" },
  { kind: "interval", title: "Intervals" },
];
const liftingKinds = [
  { value: "push", title: "Push" },
  { value: "pull", title: "Pull" },
  { value: "legs", title: "Legs/Abs" },
] as const;
const numberValue = (value: string) =>
  value.trim() ? Number(value.trim().replace(",", ".")) : undefined;

export default function CalendarEntryScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    date?: string;
    kind?: string;
  }>();
  const { data, ready } = useStore();
  if (!ready)
    return (
      <Screen>
        <Text style={styles.muted}>Opening your calendar...</Text>
      </Screen>
    );
  const existing = data.calendarEntries.find((entry) => entry.id === params.id);
  return (
    <EntryForm
      key={params.id ?? `${params.date}:${params.kind}`}
      existing={existing}
      missing={!!params.id && !existing}
      initialDate={params.date}
      lifting={
        existing
          ? existing.kind === "weightlifting"
          : params.kind === "weightlifting"
      }
    />
  );
}

function EntryForm({
  existing,
  missing,
  initialDate,
  lifting,
}: {
  existing?: CalendarEntry;
  missing: boolean;
  initialDate?: string;
  lifting: boolean;
}) {
  const { data } = useStore();
  const unit = data.settings.distanceUnit;
  const [kind, setKind] = useState<RunKind>(
    existing && ["easy", "long", "interval"].includes(existing.kind)
      ? (existing.kind as RunKind)
      : "easy",
  );
  const [liftType, setLiftType] = useState<"push" | "pull" | "legs">(
    existing?.liftType ?? "push",
  );
  const [date, setDate] = useState(
    existing?.date ??
      (initialDate && parseLocalDate(initialDate)
        ? initialDate
        : localDateKey()),
  );
  const [distance, setDistance] = useState(
    existing?.distanceMeters == null
      ? ""
      : String(Number((existing.distanceMeters / unitMeters(unit)).toFixed(3))),
  );
  const [duration, setDuration] = useState(
    existing?.durationMinutes == null ? "" : String(existing.durationMinutes),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [completed, setCompleted] = useState(
    () =>
      existing?.completed ?? (!initialDate || initialDate <= localDateKey()),
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/calendar");
  }

  async function save() {
    if (pending.current) return;
    if (!parseLocalDate(date.trim())) {
      setError("Enter a real date as YYYY-MM-DD.");
      return;
    }
    const distanceNumber = numberValue(distance);
    const minutes = numberValue(duration);
    const meters =
      distanceNumber == null ? undefined : distanceNumber * unitMeters(unit);
    if (
      !lifting &&
      meters !== undefined &&
      (!Number.isFinite(meters) || meters <= 0 || meters > 1_000_000)
    ) {
      setError("Enter a distance above zero and below 1,000 km.");
      return;
    }
    if (
      !lifting &&
      minutes !== undefined &&
      (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)
    ) {
      setError("Enter a duration above zero and up to 1,440 minutes.");
      return;
    }
    if (
      !lifting &&
      completed &&
      (meters === undefined || minutes === undefined)
    ) {
      setError("Add distance and duration to save a completed run.");
      return;
    }
    const title = lifting
      ? liftingKinds.find((item) => item.value === liftType)!.title
      : `${kind === "interval" ? "Interval" : kind === "long" ? "Long" : "Easy"} run`;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const entryId = existing?.id ?? id();
      const run =
        !lifting && completed
          ? manualRun({
              id: id(),
              kind,
              date: date.trim(),
              distanceMeters: meters!,
              durationMinutes: minutes!,
              notes: notes.trim(),
            })
          : null;
      const entry: CalendarEntry = {
        id: entryId,
        title,
        date: date.trim(),
        kind: lifting ? "weightlifting" : kind,
        notes: notes.trim(),
        completed: lifting ? (existing?.completed ?? false) : completed,
        ...(lifting
          ? { liftType }
          : { distanceMeters: meters, durationMinutes: minutes }),
      };
      await updateData((current) => {
        if (
          existing &&
          !current.calendarEntries.some((item) => item.id === existing.id)
        )
          throw new Error("This entry no longer exists.");
        return {
          ...current,
          runs: run ? [...current.runs, run] : current.runs,
          calendarEntries: run
            ? current.calendarEntries.filter((item) => item.id !== entryId)
            : existing
              ? current.calendarEntries.map((item) =>
                  item.id === entryId ? entry : item,
                )
              : [...current.calendarEntries, entry],
        };
      });
      leave();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || pending.current) return;
    if (
      !(await confirmAction(
        "Delete this entry?",
        "This removes the entry from your calendar.",
        true,
      ))
    )
      return;
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await updateData((current) => ({
        ...current,
        calendarEntries: current.calendarEntries.filter(
          (item) => item.id !== existing.id,
        ),
      }));
      leave();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (missing)
    return (
      <Screen>
        <BackHeader title="Entry not found" />
        <Button
          title="Open calendar"
          onPress={() => router.replace("/(tabs)/calendar")}
        />
      </Screen>
    );

  return (
    <Screen>
      <BackHeader
        title={
          lifting ? "Weightlifting" : existing ? "Run details" : "Add a run"
        }
        subtitle={
          lifting ? "Pick your session. That's it." : "Your day, your run."
        }
      />
      <Field
        label="Date"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        maxLength={10}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        editable={!busy}
      />
      {lifting ? (
        <Row style={{ flexWrap: "wrap", gap: 8 }}>
          {liftingKinds.map((item) => (
            <Chip
              key={item.value}
              label={item.title}
              selected={liftType === item.value}
              onPress={() => setLiftType(item.value)}
            />
          ))}
        </Row>
      ) : (
        <>
          <Row style={{ flexWrap: "wrap", gap: 8 }}>
            {runKinds.map((item) => (
              <Chip
                key={item.kind}
                label={item.title}
                selected={kind === item.kind}
                onPress={() => setKind(item.kind)}
              />
            ))}
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Field
                label={`Distance (${unit})`}
                value={distance}
                onChangeText={setDistance}
                placeholder="0.00"
                keyboardType="decimal-pad"
                maxLength={9}
                editable={!busy}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Time (minutes)"
                value={duration}
                onChangeText={setDuration}
                placeholder="30"
                keyboardType="decimal-pad"
                maxLength={7}
                editable={!busy}
              />
            </View>
          </Row>
          <Row>
            <Chip
              label="Completed"
              selected={completed}
              onPress={() => setCompleted(true)}
            />
            <Chip
              label="Planned"
              selected={!completed}
              onPress={() => setCompleted(false)}
            />
          </Row>
          <Field
            label="Notes (optional)"
            placeholder="How did it feel?"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={2000}
            style={{ minHeight: 90, textAlignVertical: "top" }}
            editable={!busy}
          />
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <Button
        title={lifting ? "Save lifting day" : "Save run"}
        icon="checkmark"
        loading={busy}
        onPress={() => void save()}
      />
      {existing ? (
        <Button
          title="Delete entry"
          variant="danger"
          disabled={busy}
          onPress={() => void remove()}
        />
      ) : null}
    </Screen>
  );
}
