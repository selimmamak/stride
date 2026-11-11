import assert from "node:assert/strict";
import test from "node:test";
import type { LocationObject } from "expo-location";
import { createStore, emptyData } from "../src/data/storeCore";
import { appendPoint, createRun, elapsedMs } from "../src/domain/engine";
import { createTrackingService } from "../src/tracking/controller";
import { displayElapsedMs } from "../src/tracking/lifecycle";
import type { AppData } from "../src/types";

type Dependencies = Parameters<typeof createTrackingService>[0];
const START = 1_700_000_000_000;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function position(
  timestamp: number,
  latitude = 40,
  longitude = -88,
): LocationObject {
  return {
    timestamp,
    coords: {
      latitude,
      longitude,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
  };
}

function harness(
  options: {
    background?: boolean;
    initial?: AppData;
    registered?: boolean;
  } = {},
) {
  let time = START;
  let raw = options.initial ? JSON.stringify(options.initial) : null;
  let failWrite = false;
  const store = createStore({
    async getItem() {
      return raw;
    },
    async setItem(_key: string, value: string) {
      if (failWrite) throw new Error("Disk full");
      raw = value;
    },
  });
  const watchers: {
    point: (point: LocationObject) => void;
    error: (message: string) => void;
    removed: boolean;
  }[] = [];
  let lifecycle: ((state: string) => void) | undefined;
  let task:
    | ((event: {
        data?: { locations: LocationObject[] };
        error?: Error;
      }) => Promise<void>)
    | undefined;
  const native = {
    permission: true,
    backgroundPermission: true,
    services: true,
    watchFailure: false,
    startFailure: false,
    registered: options.registered ?? false,
    starts: 0,
    stops: 0,
    awake: false,
    lifecycleSubscriptions: 0,
  };
  const appState = {
    currentState: "active",
    addEventListener(_event: string, callback: (state: string) => void) {
      lifecycle = callback;
      native.lifecycleSubscriptions++;
      return {
        remove() {
          lifecycle = undefined;
        },
      };
    },
  };
  const service = createTrackingService({
    platform: "ios",
    isExpoGo: !options.background,
    now: () => time,
    store,
    appState: appState as unknown as Dependencies["appState"],
    location: {
      Accuracy: { BestForNavigation: 6 },
      ActivityType: { Fitness: 3 },
      async hasServicesEnabledAsync() {
        return native.services;
      },
      async requestForegroundPermissionsAsync() {
        return { granted: native.permission };
      },
      async requestBackgroundPermissionsAsync() {
        return { granted: native.backgroundPermission };
      },
      async watchPositionAsync(
        _options: unknown,
        point: (point: LocationObject) => void,
        error: (message: string) => void,
      ) {
        if (native.watchFailure) throw new Error("GPS unavailable");
        const watcher = { point, error, removed: false };
        watchers.push(watcher);
        return {
          remove() {
            watcher.removed = true;
          },
        };
      },
      async startLocationUpdatesAsync() {
        if (native.startFailure) throw new Error("Background unavailable");
        native.starts++;
        native.registered = true;
      },
      async hasStartedLocationUpdatesAsync() {
        return native.registered;
      },
      async stopLocationUpdatesAsync() {
        native.stops++;
        native.registered = false;
      },
    } as unknown as Dependencies["location"],
    taskManager: {
      isTaskDefined() {
        return false;
      },
      defineTask(_name: string, callback: typeof task) {
        task = callback;
      },
      async isAvailableAsync() {
        return !!options.background;
      },
    } as unknown as Dependencies["taskManager"],
    async activateKeepAwakeAsync() {
      native.awake = true;
    },
    async deactivateKeepAwake() {
      native.awake = false;
    },
  });
  return {
    service,
    store,
    native,
    watchers,
    setTime(value: number) {
      time = value;
    },
    failWrites(value: boolean) {
      failWrite = value;
    },
    saved: () => raw,
    background(state = "background") {
      appState.currentState = state;
      lifecycle?.(state);
    },
    async taskPoints(locations: LocationObject[]) {
      assert.ok(task);
      await task({ data: { locations } });
    },
  };
}

test("denied permission leaves no run, native subscription, or saved history", async () => {
  const h = harness();
  await h.service.initializeTracking();
  h.native.permission = false;
  await assert.rejects(h.service.beginRun("easy"), /Location access/);
  assert.equal(h.store.getSnapshot().data.activeRun, null);
  assert.equal(h.watchers.length, 0);
  assert.equal(h.service.getTrackingSnapshot().busy, false);
});

test("a preserved legacy lifting draft does not block run recording", async () => {
  const initial = emptyData();
  initial.activeWorkout = {
    id: "legacy-lift",
    planId: null,
    name: "Old session",
    startedAt: START,
    endedAt: null,
    weightUnit: "kg",
    exercises: [],
    notes: "Preserve this draft",
  };
  const h = harness({ initial });
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  assert.equal(h.store.getSnapshot().data.activeRun?.status, "running");
  assert.equal(
    h.store.getSnapshot().data.activeWorkout?.notes,
    "Preserve this draft",
  );
  await h.service.discardRecording();
});

test("a native start failure preserves a recoverable paused run and stops the clock", async () => {
  const h = harness();
  await h.service.initializeTracking();
  h.native.watchFailure = true;
  await assert.rejects(h.service.beginRun("long"), /GPS unavailable/);
  const run = h.store.getSnapshot().data.activeRun;
  assert.ok(run);
  assert.equal(run.status, "paused");
  assert.equal(elapsedMs(run, START + 60_000), 0);
  assert.equal(h.native.awake, false);
  h.native.watchFailure = false;
  h.setTime(START + 60_000);
  await h.service.resumeRecording();
  assert.equal(h.store.getSnapshot().data.activeRun?.id, run.id);
  assert.equal(h.store.getSnapshot().data.activeRun?.status, "running");
});

test("callbacks from a removed watcher cannot change or stop a resumed run", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  const old = h.watchers[0];
  old.point(position(START + 1000));
  await flush();
  h.setTime(START + 2000);
  await h.service.pauseRecording();
  h.setTime(START + 10_000);
  await h.service.resumeRecording();
  assert.equal(old.removed, true);
  old.point(position(START + 11_000, 40.001));
  old.error("Late subscription error");
  h.watchers[1].point(position(START + 11_000, 40.002));
  await flush();
  const run = h.store.getSnapshot().data.activeRun;
  assert.equal(run?.status, "running");
  assert.equal(run.points.length, 2);
  assert.equal(run.distanceMeters, 0);
  assert.equal(run.points[1].latitude, 40.002);
  assert.equal(h.service.getTrackingSnapshot().message, "");
});

test("failed pause persistence still stops GPS and a retry excludes stopped time", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  h.watchers[0].point(position(START + 1000));
  await flush();
  h.setTime(START + 5000);
  h.failWrites(true);
  await assert.rejects(h.service.pauseRecording(), /Could not save/);
  const original = h.store.getSnapshot().data.activeRun;
  assert.ok(original);
  assert.equal(original.status, "running");
  assert.equal(h.watchers[0].removed, true);
  assert.equal(h.native.awake, false);
  assert.equal(
    displayElapsedMs(
      original,
      START + 100_000,
      h.service.getTrackingSnapshot().stoppedAt,
    ),
    5000,
  );
  h.watchers[0].point(position(START + 6000, 40.0001));
  await flush();
  assert.equal(h.store.getSnapshot().data.activeRun, original);
  h.failWrites(false);
  h.setTime(START + 100_000);
  await h.service.resumeRecording();
  const resumed = h.store.getSnapshot().data.activeRun;
  assert.ok(resumed);
  assert.equal(resumed.intervals[0].end, START + 5000);
  assert.equal(resumed.intervals[1].start, START + 100_000);
  assert.equal(elapsedMs(resumed, START + 101_000), 6000);
});

test("duplicate finish requests and a late GPS delivery save exactly one session", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  const runId = h.store.getSnapshot().data.activeRun?.id;
  h.watchers[0].point(position(START + 1000));
  await flush();
  h.setTime(START + 5000);
  const first = h.service.finishRecording("  Felt good  ");
  h.watchers[0].point(position(START + 6000, 40.0001));
  const second = h.service.finishRecording("Duplicate");
  const results = await Promise.all([first, second]);
  await flush();
  assert.deepEqual(results, [runId, null]);
  assert.equal(h.store.getSnapshot().data.activeRun, null);
  const runs = h.store.getSnapshot().data.runs;
  assert.equal(runs.length, 1);
  assert.equal(runs[0].points.length, 1);
  assert.equal(runs[0].notes, "Felt good");
  assert.equal(elapsedMs(runs[0]), 5000);
});

test("failed finish retains the session and retry does not count the delay", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  h.setTime(START + 5000);
  h.failWrites(true);
  await assert.rejects(h.service.finishRecording("Keep me"), /Could not save/);
  assert.ok(h.store.getSnapshot().data.activeRun);
  assert.equal(h.store.getSnapshot().data.runs.length, 0);
  assert.equal(h.watchers[0].removed, true);
  h.failWrites(false);
  h.setTime(START + 100_000);
  await h.service.finishRecording("Keep me");
  assert.equal(h.store.getSnapshot().data.runs.length, 1);
  assert.equal(elapsedMs(h.store.getSnapshot().data.runs[0]), 5000);
});

test("foreground app suspension captures the event time before queued work resumes", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  h.setTime(START + 5000);
  h.background();
  h.setTime(START + 100_000);
  await flush();
  const run = h.store.getSnapshot().data.activeRun;
  assert.ok(run);
  assert.equal(run.status, "paused");
  assert.equal(elapsedMs(run), 5000);
  assert.equal(h.native.lifecycleSubscriptions, 1);
});

test("background task deliveries remain accepted after an app background event", async () => {
  const h = harness({ background: true });
  await h.service.initializeTracking();
  await h.service.beginRun("long");
  h.background();
  await h.taskPoints([position(START + 1000), position(START + 5000, 40.0001)]);
  const run = h.store.getSnapshot().data.activeRun;
  assert.ok(run);
  assert.equal(run.status, "running");
  assert.equal(run.trackingMode, "background");
  assert.ok(run.distanceMeters > 10);
  assert.equal(h.watchers.length, 0);
  h.setTime(START + 6000);
  await h.service.pauseRecording();
  await h.taskPoints([position(START + 7000, 40.0002)]);
  assert.equal(h.store.getSnapshot().data.activeRun?.points.length, 2);
  assert.equal(h.native.registered, false);
});

test("denied background permission falls back to foreground with an explicit notice", async () => {
  const h = harness({ background: true });
  await h.service.initializeTracking();
  h.native.backgroundPermission = false;
  await h.service.beginRun("easy");
  assert.equal(
    h.store.getSnapshot().data.activeRun?.trackingMode,
    "foreground",
  );
  assert.match(h.service.getTrackingSnapshot().message, /Keep Stride open/);
  assert.equal(h.watchers.length, 1);
});

test("reopening an interrupted foreground run pauses at its last reliable fix", async () => {
  let run = createRun({ now: START - 60_000, id: "recovered" });
  run = appendPoint(run, {
    latitude: 40,
    longitude: -88,
    accuracy: 5,
    timestamp: START - 50_000,
  });
  const initial = { ...emptyData(), activeRun: run };
  const h = harness({ initial });
  await h.service.initializeTracking();
  const recovered = h.store.getSnapshot().data.activeRun;
  assert.ok(recovered);
  assert.equal(recovered.status, "paused");
  assert.equal(elapsedMs(recovered), 10_000);
  assert.equal(h.watchers.length, 0);
  assert.match(h.service.getTrackingSnapshot().message, /unfinished run/);
});

test("a recent registered background run resumes its existing recording", async () => {
  let run = createRun({
    now: START - 60_000,
    id: "background",
    trackingMode: "background",
  });
  run = appendPoint(run, {
    latitude: 40,
    longitude: -88,
    accuracy: 5,
    timestamp: START - 10_000,
  });
  const h = harness({
    initial: { ...emptyData(), activeRun: run },
    background: true,
    registered: true,
  });
  await h.service.initializeTracking();
  assert.equal(h.store.getSnapshot().data.activeRun?.status, "running");
  assert.equal(h.native.starts, 1);
  assert.equal(h.native.stops, 0);
});

test("paused notes survive reopening and a late edit cannot affect the next run", async () => {
  const h = harness();
  await h.service.initializeTracking();
  await h.service.beginRun("easy");
  const id = h.store.getSnapshot().data.activeRun?.id;
  assert.ok(id);
  h.setTime(START + 5000);
  await h.service.pauseRecording();
  await h.service.saveRunNotes(id, "A calm morning.");
  const reopened = createStore({
    async getItem() {
      return h.saved();
    },
    async setItem() {},
  });
  await reopened.hydrateStore();
  assert.equal(reopened.getSnapshot().data.activeRun?.notes, "A calm morning.");
  assert.equal(
    displayElapsedMs(reopened.getSnapshot().data.activeRun!, START),
    5000,
  );
  await h.service.finishRecording("A calm morning.");
  h.setTime(START + 10_000);
  await h.service.beginRun("long");
  await h.service.saveRunNotes(id, "Stale text");
  assert.equal(h.store.getSnapshot().data.activeRun?.notes, "");
  assert.equal(h.store.getSnapshot().data.runs[0].notes, "A calm morning.");
});
