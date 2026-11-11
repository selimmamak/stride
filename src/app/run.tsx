import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  BackHeader,
  Button,
  Card,
  Chip,
  colors,
  Field,
  Row,
  Screen,
  styles,
  Text,
} from "../components/ui";
import { RouteMap } from "../components/RouteMap";
import { useStore } from "../hooks/useStore";
import { useNow } from "../hooks/useNow";
import { getIntervalPhase, validIntervalPlan } from "../domain/engine";
import {
  beginRun,
  discardRecording,
  finishRecording,
  pauseRecording,
  resumeRecording,
  saveRunNotes,
  supportsBackgroundBuild,
  useTracking,
} from "../tracking/service";
import { displayElapsedMs } from "../tracking/lifecycle";
import { formatDistance, formatDuration, formatPace } from "../lib/format";
import { confirmAction, errorMessage, notify } from "../lib/feedback";
import type { IntervalPlan, RunKind } from "../types";

const names: Record<RunKind, string> = {
  easy: "Easy run",
  long: "Long run",
  interval: "Interval run",
};
export default function RunScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const { data } = useStore();
  const tracking = useTracking();
  const run = data.activeRun;
  const [kind, setKind] = useState<RunKind>(
    params.kind === "long" || params.kind === "interval" ? params.kind : "easy",
  );
  const [warmup, setWarmup] = useState("5"),
    [work, setWork] = useState("2"),
    [rest, setRest] = useState("1"),
    [repeats, setRepeats] = useState("6"),
    [cooldown, setCooldown] = useState("5");
  const [notes, setNotes] = useState(run?.notes ?? "");
  const [notesError, setNotesError] = useState("");
  const notesRunId = useRef(run?.id);
  useEffect(() => {
    if (notesRunId.current !== run?.id) {
      notesRunId.current = run?.id;
      setNotes(run?.notes ?? "");
      setNotesError("");
    }
  }, [run]);
  const [working, setWorking] = useState(false);
  const stoppedAt =
    run && tracking.runId === run.id ? tracking.stoppedAt : null;
  const paused = run?.status === "paused" || stoppedAt !== null;
  const now = useNow(!!run && !paused);
  const elapsed = run ? displayElapsedMs(run, now, stoppedAt) : 0;
  const phase = run?.intervalPlan
    ? getIntervalPhase(run.intervalPlan, elapsed / 1000)
    : null;
  const phaseKey = phase ? `${phase.label}-${phase.round}` : "";
  const previousPhase = useRef(phaseKey);
  useEffect(() => {
    if (
      !paused &&
      previousPhase.current &&
      phaseKey &&
      previousPhase.current !== phaseKey
    )
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    previousPhase.current = phaseKey;
  }, [phaseKey, paused]);
  const busy = working || tracking.busy;
  async function act(action: () => Promise<unknown>) {
    setWorking(true);
    try {
      await action();
    } catch (error) {
      notify("Could not complete that", errorMessage(error));
    } finally {
      setWorking(false);
    }
  }
  function changeNotes(value: string) {
    setNotes(value);
    if (!run) return;
    const runId = run.id;
    void saveRunNotes(runId, value)
      .then(() => {
        if (notesRunId.current === runId) setNotesError("");
      })
      .catch((error) => {
        if (notesRunId.current === runId) setNotesError(errorMessage(error));
      });
  }
  async function start() {
    const plan: IntervalPlan = {
      warmupSeconds: Number(warmup) * 60,
      workSeconds: Number(work) * 60,
      restSeconds: Number(rest) * 60,
      repeats: Number(repeats),
      cooldownSeconds: Number(cooldown) * 60,
    };
    if (
      kind === "interval" &&
      (![warmup, work, rest, repeats, cooldown].every((v) => v.trim() !== "") ||
        !validIntervalPlan(plan))
    ) {
      notify(
        "Check your intervals",
        "Enter valid durations in minutes and 1-100 repeats. The effort must be longer than zero.",
      );
      return;
    }
    await beginRun(kind, kind === "interval" ? plan : undefined);
  }
  async function finish() {
    if (
      !(await confirmAction(
        "Finish your run?",
        run && run.distanceMeters < 10
          ? "No GPS distance has been recorded. You can still save this as a timed run."
          : "Your route, time, and distance will be saved on this phone.",
      ))
    )
      return;
    await act(async () => {
      const id = await finishRecording(notes);
      if (id)
        router.replace({ pathname: "/activity", params: { id, type: "run" } });
    });
  }
  if (!run)
    return (
      <Screen>
        <BackHeader
          title="Make it your run."
          subtitle="A little movement. A little progress."
        />
        <Row>
          {(["easy", "long", "interval"] as RunKind[]).map((value) => (
            <Chip
              key={value}
              label={value === "interval" ? "Intervals" : names[value]}
              selected={kind === value}
              onPress={() => setKind(value)}
              style={{ flex: 1, paddingHorizontal: 7 }}
            />
          ))}
        </Row>
        <Card>
          <Text
            style={{ fontSize: 26, fontWeight: "600", letterSpacing: -0.7 }}
          >
            {names[kind]}
          </Text>
          <Text style={styles.subtitle}>
            {kind === "easy"
              ? "A comfortable effort, at your own pace. Just start and go."
              : kind === "long"
                ? "Settle into a steady rhythm. We’ll handle the distance and time."
                : "Build your session. We’ll show when to push and when to recover."}
          </Text>
          {kind === "interval" ? (
            <View style={{ gap: 16 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field
                    label="WARM UP · MIN"
                    value={warmup}
                    onChangeText={setWarmup}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="COOL DOWN · MIN"
                    value={cooldown}
                    onChangeText={setCooldown}
                    keyboardType="decimal-pad"
                  />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field
                    label="EFFORT · MIN"
                    value={work}
                    onChangeText={setWork}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="RECOVERY · MIN"
                    value={rest}
                    onChangeText={setRest}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="REPEATS"
                    value={repeats}
                    onChangeText={setRepeats}
                    keyboardType="number-pad"
                  />
                </View>
              </Row>
              <Text
                style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}
              >
                Recovery comes between efforts. The last effort goes straight
                into your cool down.
              </Text>
            </View>
          ) : (
            <Row style={{ paddingVertical: 18 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 35,
                    fontWeight: "500",
                    color: colors.accent,
                  }}
                >
                  0.00
                </Text>
                <Text style={styles.label}>
                  DISTANCE · {data.settings.distanceUnit.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 35, fontWeight: "500" }}>00:00</Text>
                <Text style={styles.label}>ELAPSED TIME</Text>
              </View>
            </Row>
          )}
        </Card>
        <View style={{ gap: 8, paddingHorizontal: 2 }}>
          <Text
            style={{ color: colors.accent, fontSize: 13, fontWeight: "600" }}
          >
            {supportsBackgroundBuild
              ? "Ready for your pocket"
              : "Keep the app open while running"}
          </Text>
          <Text style={styles.subtitle}>
            {supportsBackgroundBuild
              ? "Allow Always location access to record with your screen locked. Force-quitting the app stops GPS tracking."
              : "In Expo Go, the screen stays awake during your run. Leaving the app or locking your phone pauses recording. A local iPhone build enables screen-locked tracking."}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            GPS works best outdoors with Precise Location enabled.
          </Text>
        </View>
        <Button
          title={`Start ${kind === "interval" ? "intervals" : "run"}`}
          icon="play"
          loading={busy}
          onPress={() => act(start)}
        />
      </Screen>
    );
  const fresh = !!run.lastAcceptedAt && now - run.lastAcceptedAt < 20000;
  return (
    <Screen>
      <BackHeader
        title={names[run.kind]}
        subtitle={paused ? "Paused. Take your time." : "One step at a time."}
        right={
          <Row style={{ gap: 7 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: paused ? colors.muted : colors.accent,
              }}
            />
            <Text
              style={{
                color: paused ? colors.muted : colors.accent,
                fontSize: 11,
                letterSpacing: 1,
              }}
            >
              {paused ? "PAUSED" : "RECORDING"}
            </Text>
          </Row>
        }
      />
      <View style={{ alignItems: "center", gap: 8, paddingVertical: 18 }}>
        <Text
          style={{
            fontSize: 78,
            lineHeight: 88,
            letterSpacing: -4,
            fontWeight: "500",
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatDistance(run.distanceMeters, data.settings.distanceUnit)}
        </Text>
        <Text style={{ color: colors.accent, letterSpacing: 3, fontSize: 12 }}>
          {data.settings.distanceUnit === "km" ? "KILOMETERS" : "MILES"}
        </Text>
      </View>
      <Row>
        <Card style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.label}>TIME</Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "500",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatDuration(elapsed)}
          </Text>
        </Card>
        <Card style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.label}>
            AVG PACE / {data.settings.distanceUnit.toUpperCase()}
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "500",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatPace(
              run.distanceMeters,
              elapsed,
              data.settings.distanceUnit,
            )}
          </Text>
        </Card>
      </Row>
      {phase ? (
        <Card style={{ borderColor: colors.accent }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ gap: 5 }}>
              <Text
                style={{
                  color: colors.accent,
                  fontWeight: "600",
                  fontSize: 21,
                }}
              >
                {phase.finished ? "Intervals complete" : phase.label}
              </Text>
              <Text style={styles.muted}>
                {phase.finished
                  ? "Keep going or finish your run."
                  : phase.round
                    ? `Round ${phase.round} of ${phase.totalRounds}`
                    : "Find your rhythm"}
              </Text>
            </View>
            {!phase.finished ? (
              <Text style={{ fontSize: 32, fontVariant: ["tabular-nums"] }}>
                {formatDuration(phase.remainingSeconds * 1000)}
              </Text>
            ) : null}
          </Row>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Vibration cues work while this screen is open.
          </Text>
        </Card>
      ) : null}
      <RouteMap points={run.points} height={200} />
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {paused
            ? "GPS paused"
            : fresh
              ? "GPS connected"
              : run.points.length
                ? "Waiting for a clear GPS signal"
                : "Finding your GPS location…"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>
          {run.trackingMode === "background"
            ? "Screen lock supported"
            : "Keep app open"}
        </Text>
      </Row>
      {tracking.message ? (
        <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 20 }}>
          {tracking.message}
        </Text>
      ) : null}
      <Row>
        <Button
          style={{ flex: 1 }}
          title={paused ? "Resume" : "Pause"}
          icon={paused ? "play" : "pause"}
          loading={busy}
          onPress={() => act(paused ? resumeRecording : pauseRecording)}
        />
        <Button
          style={{ flex: 1 }}
          title="Finish"
          variant="secondary"
          icon="checkmark"
          disabled={busy}
          onPress={finish}
        />
      </Row>
      {paused ? (
        <>
          <Field
            label="RUN NOTES"
            placeholder="How did it feel?"
            value={notes}
            onChangeText={changeNotes}
            multiline
            maxLength={10000}
          />
          {notesError ? (
            <Text style={{ color: colors.danger, fontSize: 12 }}>
              {notesError}
            </Text>
          ) : null}
          <Button
            title="Discard run"
            variant="ghost"
            disabled={busy}
            onPress={async () => {
              if (
                await confirmAction(
                  "Discard this run?",
                  "This unfinished run will be removed from this phone.",
                  true,
                )
              )
                await act(async () => {
                  await discardRecording();
                  router.back();
                });
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
