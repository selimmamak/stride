import type * as LocationTypes from "expo-location";
import type { createStore } from "../data/storeCore";
import {
  appendPoint,
  createRun,
  finishRun,
  pauseRun,
  resumeRun,
} from "../domain/engine";
import { SessionGate, updateRunNotes, type SessionToken } from "./lifecycle";
import type { IntervalPlan, Run, RunKind } from "../types";

type NativeDependencies = {
  platform: string;
  isExpoGo: boolean;
  appState: Pick<
    typeof import("react-native").AppState,
    "currentState" | "addEventListener"
  >;
  location: Pick<
    typeof import("expo-location"),
    | "Accuracy"
    | "ActivityType"
    | "hasServicesEnabledAsync"
    | "requestForegroundPermissionsAsync"
    | "requestBackgroundPermissionsAsync"
    | "watchPositionAsync"
    | "startLocationUpdatesAsync"
    | "hasStartedLocationUpdatesAsync"
    | "stopLocationUpdatesAsync"
  >;
  taskManager: Pick<
    typeof import("expo-task-manager"),
    "isTaskDefined" | "defineTask" | "isAvailableAsync"
  >;
  activateKeepAwakeAsync: typeof import("expo-keep-awake").activateKeepAwakeAsync;
  deactivateKeepAwake: typeof import("expo-keep-awake").deactivateKeepAwake;
  store: ReturnType<typeof createStore>;
  now?: () => number;
};

/** Native operations are injected so lifecycle races can be tested without a phone. */
export function createTrackingService(dependencies: NativeDependencies) {
  const {
    platform,
    isExpoGo,
    appState: AppState,
    location: Location,
    taskManager: TaskManager,
    activateKeepAwakeAsync,
    deactivateKeepAwake,
    store,
    now = Date.now,
  } = dependencies;
  const { getSnapshot, hydrateStore, updateData } = store;
  const TASK = "stride-location";
  const gate = new SessionGate();
  let watcher: LocationTypes.LocationSubscription | null = null;
  let operation: Promise<unknown> = Promise.resolve();
  let state = {
    message: "",
    accuracy: null as number | null,
    busy: false,
    stoppedAt: null as number | null,
    runId: null as string | null,
  };
  const listeners = new Set<() => void>();
  function report(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  function getTrackingSnapshot() {
    return state;
  }
  const supportsBackgroundBuild = platform !== "web" && !isExpoGo;

  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = operation.then(async () => {
      report({ busy: true });
      try {
        return await fn();
      } finally {
        report({ busy: false });
      }
    });
    operation = result.catch(() => undefined);
    return result;
  }
  function stoppedTime(run: Run, fallback = now()): number {
    return state.runId === run.id && state.stoppedAt !== null
      ? state.stoppedAt
      : fallback;
  }
  function markStopped(run: Run, at = now()): number {
    const time = stoppedTime(run, at);
    gate.close();
    watcher?.remove();
    watcher = null;
    report({ runId: run.id, stoppedAt: time, accuracy: null });
    return time;
  }
  function clearStopped(runId: string) {
    if (state.runId === runId) report({ stoppedAt: null, runId: null });
  }

  async function receive(
    locations: LocationTypes.LocationObject[],
    runId?: string,
    token?: SessionToken,
  ) {
    await hydrateStore();
    if (token && !gate.accepts(token)) return;
    let acceptedSession = false;
    await updateData((data) => {
      let run = data.activeRun;
      if (
        !run ||
        run.status !== "running" ||
        (runId && run.id !== runId) ||
        (token && !gate.accepts(token)) ||
        (state.runId === run.id && state.stoppedAt !== null)
      )
        return data;
      acceptedSession = true;
      for (const position of [...locations].sort(
        (a, b) => a.timestamp - b.timestamp,
      )) {
        run = appendPoint(run, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: position.timestamp,
        });
      }
      return run === data.activeRun ? data : { ...data, activeRun: run };
    });
    if (acceptedSession && (!token || gate.accepts(token)))
      report({ accuracy: locations.at(-1)?.coords.accuracy ?? null });
  }

  async function stopNative() {
    gate.close();
    watcher?.remove();
    watcher = null;
    await deactivateKeepAwake("stride-run").catch(() => undefined);
    if (
      supportsBackgroundBuild &&
      (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))
    ) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  }

  async function persistPause(runId: string, at: number) {
    await updateData((data) =>
      data.activeRun?.id === runId
        ? { ...data, activeRun: pauseRun(data.activeRun, at) }
        : data,
    );
    clearStopped(runId);
  }

  async function recordingError(message: string, token?: SessionToken) {
    if (token && !gate.accepts(token)) return;
    await hydrateStore();
    // Recheck after the await: this callback may belong to a subscription already removed.
    if (token && !gate.accepts(token)) return;
    const run = getSnapshot().data.activeRun;
    if (!run || run.status !== "running" || (token && token.runId !== run.id))
      return;
    const at = markStopped(run);
    report({ message });
    await serialized(async () => {
      if (getSnapshot().data.activeRun?.id !== run.id) return;
      await stopNative().catch(() => undefined);
      try {
        await persistPause(run.id, at);
      } catch {
        report({
          message: `${message} GPS is stopped, but the paused state could not be saved. Free some storage, then retry.`,
        });
      }
    });
  }

  if (platform !== "web" && !TaskManager.isTaskDefined(TASK)) {
    TaskManager.defineTask<{ locations: LocationTypes.LocationObject[] }>(
      TASK,
      async ({ data, error }) => {
        await hydrateStore();
        const run = getSnapshot().data.activeRun;
        if (
          !run ||
          run.status !== "running" ||
          run.trackingMode !== "background"
        )
          return;
        if (error) {
          await recordingError(
            "Location recording stopped. Check your location permission before resuming.",
          );
          return;
        }
        if (data?.locations)
          await receive(data.locations, run.id).catch(() =>
            recordingError(
              "Your location could not be saved. Recording has stopped.",
            ),
          );
      },
    );
  }

  async function requestMode(): Promise<"foreground" | "background"> {
    if (!(await Location.hasServicesEnabledAsync()))
      throw new Error(
        "Turn on Location Services in iPhone Settings, then try again.",
      );
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted)
      throw new Error(
        "Location access is needed to record your route. Allow precise location in Settings, then try again.",
      );
    if (supportsBackgroundBuild && (await TaskManager.isAvailableAsync())) {
      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.granted) return "background";
      report({
        message:
          "Background permission is off. Keep Stride open; recording will pause if you leave or lock your phone.",
      });
    }
    return "foreground";
  }

  async function startNative(runId: string, mode: "foreground" | "background") {
    if (state.runId === runId && state.stoppedAt !== null)
      throw new Error(
        "Recording was interrupted before GPS started. Resume when you are ready.",
      );
    const token = gate.open(runId);
    const options: LocationTypes.LocationTaskOptions = {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 3,
      timeInterval: 2500,
      activityType: Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      deferredUpdatesDistance: 0,
      deferredUpdatesInterval: 0,
      foregroundService: {
        notificationTitle: "Stride is recording",
        notificationBody: "Your run is saved on this device.",
      },
    };
    if (mode === "background") {
      await Location.startLocationUpdatesAsync(TASK, options);
      if (!gate.accepts(token))
        throw new Error("Recording was interrupted while GPS was starting.");
    } else {
      const subscription = await Location.watchPositionAsync(
        options,
        (position) => {
          if (gate.accepts(token))
            void receive([position], runId, token).catch(() =>
              recordingError(
                "Your latest route point could not be saved. Recording has stopped.",
                token,
              ),
            );
        },
        (message) => {
          if (gate.accepts(token))
            void recordingError(`GPS stopped: ${message}`, token);
        },
      );
      if (!gate.accepts(token)) {
        subscription.remove();
        throw new Error("Recording was interrupted while GPS was starting.");
      }
      watcher = subscription;
      if (AppState.currentState === "background")
        throw new Error("Keep Stride open to record in Expo Go.");
      await activateKeepAwakeAsync("stride-run").catch(() => undefined);
    }
  }

  async function handleStartFailure(runId: string) {
    const run = getSnapshot().data.activeRun;
    if (!run || run.id !== runId) return;
    const at = markStopped(run);
    await stopNative().catch(() => undefined);
    try {
      await persistPause(runId, at);
    } catch {
      report({
        message:
          "GPS is stopped. Your run is saved up to the last successful save. Free some storage before resuming.",
      });
    }
  }

  function beginRun(kind: RunKind, intervalPlan?: IntervalPlan) {
    return serialized(async () => {
      await hydrateStore();
      if (getSnapshot().data.activeRun)
        throw new Error("Finish or discard your current run first.");
      report({ message: "", accuracy: null, stoppedAt: null, runId: null });
      const mode = await requestMode();
      const run = createRun({
        kind,
        intervalPlan,
        trackingMode: mode,
        now: now(),
      });
      await updateData((data) => {
        if (data.activeRun)
          throw new Error("You already have an active session.");
        return { ...data, activeRun: run };
      });
      try {
        await startNative(run.id, mode);
      } catch (error) {
        await handleStartFailure(run.id);
        throw error;
      }
    });
  }

  function pauseRecording(message = "") {
    const run = getSnapshot().data.activeRun;
    if (!run) return Promise.resolve();
    // Capture the user/lifecycle event time now, before queued work or JS suspension.
    const at = markStopped(run);
    if (message) report({ message });
    return serialized(async () => {
      if (getSnapshot().data.activeRun?.id !== run.id) return;
      await stopNative().catch(() =>
        report({
          message:
            "Recording is paused. Close and reopen Stride if the location indicator remains on.",
        }),
      );
      await persistPause(run.id, at);
    });
  }

  function resumeRecording() {
    const requestedRunId = getSnapshot().data.activeRun?.id;
    return serialized(async () => {
      let current = getSnapshot().data.activeRun;
      if (!current || current.id !== requestedRunId) return;
      if (
        current.status === "running" &&
        state.runId === current.id &&
        state.stoppedAt !== null
      ) {
        await persistPause(current.id, state.stoppedAt);
        current = getSnapshot().data.activeRun;
      }
      if (!current || current.status !== "paused") return;
      report({ message: "", accuracy: null });
      const mode = await requestMode();
      const runId = current.id;
      await updateData((data) =>
        data.activeRun?.id === runId
          ? {
              ...data,
              activeRun: {
                ...resumeRun(data.activeRun, now()),
                trackingMode: mode,
              },
            }
          : data,
      );
      clearStopped(runId);
      try {
        await startNative(runId, mode);
      } catch (error) {
        await handleStartFailure(runId);
        throw error;
      }
    });
  }

  function saveRunNotes(runId: string, notes: string): Promise<void> {
    return updateData((data) => updateRunNotes(data, runId, notes));
  }

  function finishRecording(notes: string): Promise<string | null> {
    const requested = getSnapshot().data.activeRun;
    if (!requested) return Promise.resolve(null);
    const at = markStopped(requested);
    return serialized(async () => {
      if (getSnapshot().data.activeRun?.id !== requested.id) return null;
      await stopNative().catch(() =>
        report({
          message:
            "Close and reopen Stride if the location indicator remains on.",
        }),
      );
      let result: string | null = null;
      await updateData((data) => {
        if (data.activeRun?.id !== requested.id) return data;
        const run = {
          ...finishRun(pauseRun(data.activeRun, at), now()),
          notes: notes.trim(),
        };
        result = run.id;
        return {
          ...data,
          activeRun: null,
          runs: [run, ...data.runs.filter((item) => item.id !== run.id)],
        };
      });
      clearStopped(requested.id);
      return result;
    });
  }

  function discardRecording() {
    const run = getSnapshot().data.activeRun;
    if (!run) return Promise.resolve();
    markStopped(run);
    return serialized(async () => {
      if (getSnapshot().data.activeRun?.id !== run.id) return;
      await stopNative().catch(() => undefined);
      await updateData((data) =>
        data.activeRun?.id === run.id ? { ...data, activeRun: null } : data,
      );
      clearStopped(run.id);
      report({ message: "", accuracy: null });
    });
  }

  let initialization: Promise<void> | null = null;
  let watchingLifecycle = false;
  function initializeTracking(): Promise<void> {
    if (initialization) return initialization;
    if (!watchingLifecycle) {
      watchingLifecycle = true;
      AppState.addEventListener("change", (next) => {
        if (next === "inactive" || next === "background") {
          const active = getSnapshot().data.activeRun;
          if (
            active?.status === "running" &&
            active.trackingMode === "foreground"
          ) {
            void pauseRecording(
              "Run paused when you left the app. Keep Stride open to record in Expo Go.",
            ).catch(() =>
              report({
                message:
                  "GPS stopped, but the paused state could not be saved. Free some storage before resuming.",
              }),
            );
          }
        }
      });
    }
    initialization = serialized(async () => {
      await hydrateStore();
      const run = getSnapshot().data.activeRun;
      if (run?.status === "running") {
        const registered =
          supportsBackgroundBuild &&
          run.trackingMode === "background" &&
          (await Location.hasStartedLocationUpdatesAsync(TASK).catch(
            () => false,
          ));
        if (
          registered &&
          run.lastAcceptedAt &&
          now() - run.lastAcceptedAt < 60_000
        ) {
          try {
            await startNative(run.id, "background");
          } catch {
            await handleStartFailure(run.id);
            report({
              message:
                "Your previous run has stopped. Resume when you are ready.",
            });
          }
        } else {
          const lastInterval = run.intervals.at(-1);
          const recoveredAt = Math.max(
            lastInterval?.start ?? run.startedAt,
            run.lastAcceptedAt ?? run.startedAt,
          );
          markStopped(run, recoveredAt);
          await stopNative().catch(() => undefined);
          await persistPause(run.id, recoveredAt);
          report({
            message:
              "Your unfinished run is saved and paused. Resume when you are ready.",
          });
        }
      } else await stopNative().catch(() => undefined);
    }).catch((error) => {
      initialization = null;
      throw error;
    });
    return initialization;
  }

  return {
    beginRun,
    pauseRecording,
    resumeRecording,
    finishRecording,
    discardRecording,
    saveRunNotes,
    initializeTracking,
    supportsBackgroundBuild,
    getTrackingSnapshot,
    subscribe,
  };
}
