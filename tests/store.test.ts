import assert from "node:assert/strict";
import test from "node:test";
import { appendPoint, createRun, finishRun } from "../src/domain/engine";
import {
  createStore,
  emptyData,
  STORAGE_KEY,
  type StorageAdapter,
} from "../src/data/storeCore";
import { parseBackup, utf8ByteLength } from "../src/data/validation";

function memory(initial: string | null = null) {
  let stored = initial;
  let failWrite = false;
  let writes = 0;
  const adapter: StorageAdapter = {
    async getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return stored;
    },
    async setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      if (failWrite) throw new Error("Disk full");
      stored = value;
      writes++;
    },
  };
  return {
    adapter,
    read: () => stored,
    writes: () => writes,
    fail: (value: boolean) => {
      failWrite = value;
    },
  };
}

test("new store is empty; persistent data survives a new store instance", async () => {
  const disk = memory();
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().data.runs.length, 0);
  await store.updateData((data) => ({
    ...data,
    settings: { ...data.settings, weeklyGoalKm: 40 },
  }));
  const reopened = createStore(disk.adapter);
  await reopened.hydrateStore();
  assert.equal(reopened.getSnapshot().data.settings.weeklyGoalKm, 40);
});

test("overlapping updates read the most recent committed snapshot", async () => {
  const disk = memory();
  const store = createStore(disk.adapter);
  await Promise.all(
    Array.from({ length: 30 }, () =>
      store.updateData((data) => ({
        ...data,
        settings: {
          ...data.settings,
          weeklyGoalKm: data.settings.weeklyGoalKm + 1,
        },
      })),
    ),
  );
  assert.equal(store.getSnapshot().data.settings.weeklyGoalKm, 50);
  assert.equal(disk.writes(), 30);
});

test("failed persistence keeps the prior snapshot and subsequent saves can retry", async () => {
  const disk = memory();
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  const original = store.getSnapshot().data;
  disk.fail(true);
  await assert.rejects(
    store.updateData((data) => ({
      ...data,
      settings: { ...data.settings, weeklyGoalKm: 50 },
    })),
    /Could not save/,
  );
  assert.equal(store.getSnapshot().data, original);
  assert.equal(disk.read(), null);
  assert.match(store.getSnapshot().error ?? "", /Could not save/);
  disk.fail(false);
  await store.updateData((data) => ({
    ...data,
    settings: { ...data.settings, weeklyGoalKm: 50 },
  }));
  assert.equal(store.getSnapshot().data.settings.weeklyGoalKm, 50);
  assert.equal(store.getSnapshot().error, null);
});

test("corrupt storage is preserved and writes are blocked until a valid backup restores it", async () => {
  const disk = memory("{broken");
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  assert.equal(store.getSnapshot().ready, true);
  assert.match(store.getSnapshot().error ?? "", /left untouched/);
  await assert.rejects(
    store.updateData((data) => ({ ...data })),
    /left untouched/,
  );
  assert.equal(disk.read(), "{broken");
  await assert.rejects(store.importData("{wrong"), /valid Stride JSON/);
  assert.equal(disk.read(), "{broken");
  await store.importData(JSON.stringify(emptyData()));
  assert.equal(store.getSnapshot().error, null);
  await store.updateData((data) => ({
    ...data,
    settings: { ...data.settings, weeklyGoalKm: 35 },
  }));
  assert.equal(store.getSnapshot().data.settings.weeklyGoalKm, 35);
});

test("unknown backup versions and malformed nested data never overwrite saved data", async () => {
  const disk = memory(JSON.stringify(emptyData()));
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  const before = disk.read();
  await assert.rejects(
    store.importData(JSON.stringify({ ...emptyData(), version: 2 })),
    /version/,
  );
  await assert.rejects(
    store.importData(
      JSON.stringify({
        ...emptyData(),
        settings: { distanceUnit: "yards", weightUnit: "kg", weeklyGoalKm: 20 },
      }),
    ),
    /distanceUnit/,
  );
  await assert.rejects(
    store.importData(JSON.stringify({ ...emptyData(), plans: [{ id: "a" }] })),
    /plans/,
  );
  assert.equal(disk.read(), before);
});

test("serial finish taps and a late GPS callback yield exactly one immutable completed run", async () => {
  const store = createStore(memory().adapter);
  await store.updateData((data) => ({
    ...data,
    activeRun: createRun({ now: 1000, id: "race" }),
  }));
  const finish = () =>
    store.updateData((data) =>
      data.activeRun
        ? {
            ...data,
            runs: [...data.runs, finishRun(data.activeRun, 5000)],
            activeRun: null,
          }
        : data,
    );
  const lateGPS = () =>
    store.updateData((data) =>
      data.activeRun
        ? {
            ...data,
            activeRun: appendPoint(data.activeRun, {
              latitude: 0,
              longitude: 0,
              accuracy: 5,
              timestamp: 6000,
            }),
          }
        : data,
    );
  await Promise.all([finish(), lateGPS(), finish()]);
  assert.equal(store.getSnapshot().data.runs.length, 1);
  assert.equal(store.getSnapshot().data.activeRun, null);
  assert.equal(store.getSnapshot().data.runs[0].points.length, 0);
});

test("import pauses an unfinished run at its last recorded fix and preserves workout draft", () => {
  let run = createRun({ now: 1000, id: "draft", trackingMode: "background" });
  run = appendPoint(run, {
    latitude: 0,
    longitude: 0,
    timestamp: 2000,
    accuracy: 5,
  });
  const data = emptyData();
  data.activeRun = run;
  data.activeWorkout = {
    id: "lift",
    planId: null,
    name: "Legs",
    startedAt: 1000,
    endedAt: null,
    weightUnit: "kg",
    exercises: [],
    notes: "",
    restEndsAt: 60_000,
  };
  const restored = parseBackup(JSON.stringify(data));
  assert.equal(restored.activeRun?.status, "paused");
  assert.equal(restored.activeRun?.intervals[0].end, 2000);
  assert.equal(restored.activeWorkout?.id, "lift");
  assert.equal(restored.activeWorkout?.restEndsAt, null);
});

test("restoring a backup refuses to overwrite a current session", async () => {
  const store = createStore(memory().adapter);
  await store.updateData((data) => ({
    ...data,
    activeRun: createRun({ now: 1000 }),
  }));
  await assert.rejects(
    store.importData(JSON.stringify(emptyData())),
    /Finish or discard/,
  );
  assert.ok(store.getSnapshot().data.activeRun);
});

test("hydration shares one in-flight read and subscription can unsubscribe", async () => {
  let reads = 0;
  const store = createStore({
    async getItem() {
      reads++;
      return null;
    },
    async setItem() {},
  });
  let changes = 0;
  const unsubscribe = store.subscribe(() => {
    changes++;
  });
  await Promise.all([store.hydrateStore(), store.hydrateStore()]);
  assert.equal(reads, 1);
  assert.equal(changes, 1);
  unsubscribe();
  await store.updateData((data) => ({
    ...data,
    settings: { ...data.settings, weeklyGoalKm: 30 },
  }));
  assert.equal(changes, 1);
});

test("snapshots are immutable so an accidental in-place edit cannot bypass persistence", async () => {
  const disk = memory();
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  const data = store.getSnapshot().data;
  assert.ok(Object.isFrozen(data));
  assert.ok(Object.isFrozen(data.settings));
  await assert.rejects(
    store.updateData((current) => {
      current.settings.weeklyGoalKm = 99;
      return current;
    }),
    TypeError,
  );
  assert.equal(store.getSnapshot().data.settings.weeklyGoalKm, 20);
  assert.equal(disk.read(), null);
});

test("backup byte size counts UTF-8 rather than JavaScript string length", () => {
  assert.equal(utf8ByteLength("abc"), 3);
  assert.equal(utf8ByteLength("é"), 2);
  assert.equal(utf8ByteLength("界"), 3);
  assert.equal(utf8ByteLength("🏃"), 4);
});

test("older version one storage gains empty calendars without losing training data", async () => {
  const {
    marathons: _marathons,
    calendarEntries: _calendarEntries,
    ...legacy
  } = emptyData();
  legacy.runs = [finishRun(createRun({ now: 1000, id: "saved-run" }), 3000)];
  legacy.settings.weeklyGoalKm = 65;
  const disk = memory(JSON.stringify(legacy));
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  assert.equal(store.getSnapshot().error, null);
  assert.equal(store.getSnapshot().data.runs[0].id, "saved-run");
  assert.equal(store.getSnapshot().data.settings.weeklyGoalKm, 65);
  assert.deepEqual(store.getSnapshot().data.marathons, []);
  assert.deepEqual(store.getSnapshot().data.calendarEntries, []);
  assert.deepEqual(parseBackup(JSON.stringify(legacy)).calendarEntries, []);
  assert.equal(disk.writes(), 0);
});

test("marathons and calendar entries survive save, reopen, and backup", async () => {
  const disk = memory();
  const store = createStore(disk.adapter);
  await store.updateData((data) => ({
    ...data,
    marathons: [
      {
        id: "race-one",
        name: "First marathon",
        location: "Chicago",
        date: "2027-10-10",
      },
      {
        id: "race-two",
        name: "Second marathon",
        location: "New York",
        date: "2027-11-07",
      },
    ],
    calendarEntries: [
      {
        id: "lifting",
        title: "Leg day",
        date: "2027-01-14",
        kind: "weightlifting",
        notes: "Squat 60 kg",
        completed: false,
      },
    ],
  }));
  const reopened = createStore(disk.adapter);
  await reopened.hydrateStore();
  assert.deepEqual(reopened.getSnapshot().data, store.getSnapshot().data);
  assert.deepEqual(parseBackup(store.exportData()), store.getSnapshot().data);
});

test("malformed calendar data cannot overwrite storage", async () => {
  const disk = memory(JSON.stringify(emptyData()));
  const store = createStore(disk.adapter);
  await store.hydrateStore();
  const before = disk.read();
  const marathon = {
    id: "race",
    name: "Marathon",
    location: "Chicago",
    date: "2027-10-10",
  };
  const entry = {
    id: "day",
    title: "Lift",
    date: "2027-02-28",
    kind: "weightlifting",
    notes: "",
    completed: false,
  };
  for (const change of [
    { marathons: null },
    { marathons: [{ ...marathon, date: "2027-02-29" }] },
    { marathons: [{ ...marathon, location: "" }] },
    { marathons: [marathon, marathon] },
    { calendarEntries: null },
    { calendarEntries: [{ ...entry, completed: "yes" }] },
    { calendarEntries: [{ ...entry, date: "2027-02-30" }] },
    { calendarEntries: [{ ...entry, kind: "unknown" }] },
    { calendarEntries: [entry, entry] },
  ]) {
    await assert.rejects(
      store.importData(JSON.stringify({ ...emptyData(), ...change })),
      /Invalid backup data/,
    );
    assert.equal(disk.read(), before);
  }
});
