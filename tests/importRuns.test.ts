import assert from "node:assert/strict";
import test from "node:test";
import { createStore, emptyData } from "../src/data/storeCore";
import { parseAppData, parseBackup } from "../src/data/validation";
import { localDateKey, summarizeRuns } from "../src/domain/calendar";
import { elapsedMs } from "../src/domain/engine";
import {
  importHealthRuns,
  manualRun,
  runTitle,
  type HealthRun,
} from "../src/domain/importRuns";
import { formatPace } from "../src/lib/format";

process.env.TZ = "America/Chicago";
const today = new Date(2026, 10, 10, 20).getTime();
const sample: HealthRun = {
  id: "sample-1",
  startedAt: new Date(2026, 10, 10, 8).getTime(),
  endedAt: new Date(2026, 10, 10, 9).getTime(),
  durationSeconds: 3000,
  distanceMeters: 10_000,
  sourceName: "Test watch",
};

test("manual completed runs preserve local date, actual duration, and distance", () => {
  const run = manualRun({
    id: "manual",
    kind: "long",
    date: "2026-11-10",
    distanceMeters: 10_000,
    durationMinutes: 55.5,
    notes: " steady ",
    now: today,
  });
  assert.equal(run.status, "completed");
  assert.equal(run.source?.kind, "manual");
  assert.equal(localDateKey(run.startedAt), "2026-11-10");
  assert.equal(elapsedMs(run), 55.5 * 60_000);
  assert.equal(run.notes, "steady");
  assert.equal(runTitle(run), "Long run");
  const result = summarizeRuns([run], "week", today);
  assert.equal(result.distanceMeters, 10_000);
  assert.equal(
    formatPace(result.distanceMeters, result.durationMs, "km"),
    "5:33",
  );
  const data = emptyData();
  data.runs = [run];
  assert.deepEqual(parseBackup(JSON.stringify(data)).runs, [run]);
});

test("manual run validation rejects future, impossible, and non-finite inputs", () => {
  const base = {
    id: "manual",
    kind: "easy" as const,
    date: "2026-11-10",
    distanceMeters: 5000,
    durationMinutes: 30,
    notes: "",
    now: today,
  };
  for (const patch of [
    { date: "2026-02-30" },
    { date: "2026-11-11" },
    { date: "1900-01-01" },
    { distanceMeters: 0 },
    { distanceMeters: NaN },
    { distanceMeters: Infinity },
    { durationMinutes: 0 },
    { durationMinutes: NaN },
    { durationMinutes: 1441 },
    { durationMinutes: 0.00001 },
    { durationMinutes: 30, now: new Date(2026, 10, 10, 0, 10).getTime() },
  ])
    assert.throws(() => manualRun({ ...base, ...patch }));
});

test("Health imports use active duration, stable IDs, and generic run labels", () => {
  const first = importHealthRuns([], [sample]);
  assert.equal(first.added, 1);
  assert.equal(first.runs[0].id, "health-sample-1");
  assert.equal(first.runs[0].source?.externalId, sample.id);
  assert.equal(elapsedMs(first.runs[0]), 50 * 60_000);
  assert.equal(first.runs[0].endedAt, sample.endedAt);
  assert.equal(runTitle(first.runs[0]), "Run");
  assert.deepEqual(first.runs[0].points, []);
  const again = importHealthRuns(first.runs, [sample, sample]);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
  assert.equal(again.skipped, 2);
  assert.equal(again.runs[0], first.runs[0]);
});

test("Health resync survives backup order changes and preserves personal notes", () => {
  const first = importHealthRuns([], [sample]);
  const data = emptyData();
  data.runs = first.runs;
  data.runs[0].notes = "Felt good";
  data.runs[0].kind = "long";
  const reopened = parseBackup(JSON.stringify(data));
  const unchanged = importHealthRuns(reopened.runs, [sample]);
  assert.equal(unchanged.updated, 0);
  const changed = importHealthRuns(reopened.runs, [
    { ...sample, distanceMeters: 10_200 },
  ]);
  assert.equal(changed.updated, 1);
  assert.equal(changed.runs[0].distanceMeters, 10_200);
  assert.equal(changed.runs[0].notes, "Felt good");
  assert.equal(changed.runs[0].kind, "long");
  assert.equal(reopened.runs[0].distanceMeters, 10_000);
});

test("missing Health distance is retained without inflating average pace", () => {
  const imported = importHealthRuns(
    [],
    [
      sample,
      { ...sample, id: "no-distance", distanceMeters: null },
      { ...sample, id: "zero-distance", distanceMeters: 0 },
    ],
  );
  assert.equal(imported.runs[1].distanceUnavailable, true);
  assert.equal(imported.runs[2].distanceUnavailable, true);
  assert.equal(elapsedMs(imported.runs[1]), 50 * 60_000);
  const summary = summarizeRuns(imported.runs, "week", today);
  assert.deepEqual(summary, {
    distanceMeters: 10_000,
    durationMs: 50 * 60_000,
    count: 3,
  });
  assert.equal(
    formatPace(summary.distanceMeters, summary.durationMs, "km"),
    "5:00",
  );
});

test("malformed Health samples and local ID collisions never replace local runs", () => {
  const local = manualRun({
    id: "health-sample-1",
    kind: "easy",
    date: "2026-11-10",
    distanceMeters: 5000,
    durationMinutes: 30,
    notes: "Keep",
    now: today,
  });
  const samples = [
    sample,
    { ...sample, id: "bad-duration", durationSeconds: 3601 },
    { ...sample, id: "bad-distance", distanceMeters: -1 },
    { ...sample, id: "non-finite", startedAt: NaN },
    { ...sample, id: "impossible-date", startedAt: 1e20, endedAt: 1e20 + 1e9 },
  ];
  const result = importHealthRuns([local], samples);
  assert.deepEqual(result.runs, [local]);
  assert.equal(result.skipped, samples.length);
});

test("calendar run details, lifting tags, and Health metadata survive backups", () => {
  const data = emptyData();
  data.runs = importHealthRuns([], [sample]).runs;
  data.calendarEntries = [
    {
      id: "planned",
      title: "Tempo",
      date: "2026-11-12",
      kind: "interval",
      notes: "",
      completed: false,
      distanceMeters: 8000,
      durationMinutes: 40,
    },
    {
      id: "lift",
      title: "Legs/Abs",
      date: "2026-11-13",
      kind: "weightlifting",
      notes: "",
      completed: false,
      liftType: "legs",
    },
  ];
  const restored = parseBackup(JSON.stringify(data));
  assert.deepEqual(restored.calendarEntries, data.calendarEntries);
  assert.deepEqual(restored.runs[0].source, data.runs[0].source);
  assert.throws(
    () =>
      parseAppData({
        ...data,
        runs: [{ ...data.runs[0], source: { kind: "apple-health" } }],
      }),
    /externalId/,
  );
  assert.throws(
    () =>
      parseAppData({
        ...data,
        runs: [data.runs[0], { ...data.runs[0], id: "duplicate-source" }],
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      parseAppData({
        ...data,
        calendarEntries: [{ ...data.calendarEntries[1], liftType: "other" }],
      }),
    /liftType/,
  );
});

test("legacy lifting drafts remain preserved but do not block backup restoration", async () => {
  const legacy = emptyData();
  legacy.activeWorkout = {
    id: "legacy",
    planId: null,
    name: "Old draft",
    startedAt: today,
    endedAt: null,
    weightUnit: "kg",
    exercises: [],
    notes: "",
    restEndsAt: null,
  };
  let saved = JSON.stringify(legacy);
  const store = createStore({
    async getItem() {
      return saved;
    },
    async setItem(_key, value) {
      saved = value;
    },
  });
  await store.hydrateStore();
  assert.equal(store.getSnapshot().data.activeWorkout?.id, "legacy");
  await store.importData(JSON.stringify(legacy));
  assert.equal(store.getSnapshot().data.activeWorkout?.id, "legacy");
});
