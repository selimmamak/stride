import assert from "node:assert/strict";
import test from "node:test";
import {
  daysUntil,
  localDateKey,
  monthGrid,
  parseLocalDate,
  summarizeRuns,
} from "../src/domain/calendar";
import {
  createRun,
  finishRun,
  pauseRun,
  resumeRun,
} from "../src/domain/engine";
import { formatPace } from "../src/lib/format";

process.env.TZ = "America/Chicago";

test("date-only values reject rollover dates and round-trip in local time", () => {
  for (const value of [
    "2027-02-29",
    "2028-02-30",
    "2027-04-31",
    "2027-00-10",
    "2027-13-10",
    "2027-11-00",
    "2027-1-01",
    "1899-12-31",
    "2201-01-01",
    "2027-01-01T00:00:00Z",
  ])
    assert.equal(parseLocalDate(value), null, value);
  const leapDay = parseLocalDate("2028-02-29");
  assert.ok(leapDay);
  assert.equal(leapDay.getHours(), 0);
  assert.equal(localDateKey(leapDay.getTime()), "2028-02-29");
  assert.equal(
    localDateKey(new Date(2027, 9, 10, 23, 59).getTime()),
    "2027-10-10",
  );
});

test("race countdown counts calendar days through daylight saving and race day", () => {
  const beforeSpring = new Date(2027, 2, 13, 23, 59).getTime();
  assert.equal(daysUntil("2027-03-15", beforeSpring), 2);
  const beforeFall = new Date(2027, 10, 6, 23, 59).getTime();
  assert.equal(daysUntil("2027-11-08", beforeFall), 2);
  assert.equal(
    daysUntil("2027-10-10", new Date(2027, 9, 10, 23, 59).getTime()),
    0,
  );
  assert.equal(
    daysUntil("2027-10-09", new Date(2027, 9, 10, 0, 1).getTime()),
    -1,
  );
  assert.throws(() => daysUntil("2027-02-30", beforeSpring), /valid date/);
});

test("month grids fill Monday-first weeks across leap days and year boundaries", () => {
  const january = monthGrid(2027, 0);
  assert.equal(january[0], "2026-12-28");
  assert.equal(january.at(-1), "2027-01-31");
  assert.equal(january.length % 7, 0);
  const february = monthGrid(2028, 1);
  assert.ok(february.includes("2028-02-29"));
  assert.equal(parseLocalDate(february[0])?.getDay(), 1);
  assert.equal(parseLocalDate(february.at(-1)!)?.getDay(), 0);
  const sixWeeks = monthGrid(2027, 4);
  assert.equal(sixWeeks.length, 42);
  assert.equal(new Set(sixWeeks).size, sixWeeks.length);
  assert.throws(() => monthGrid(2027, 12), /valid month/);
});

function completedRun(day: number, meters: number, minutes: number) {
  const start = new Date(2027, 10, day, 8).getTime();
  return {
    ...finishRun(
      createRun({ now: start, id: `run-${day}` }),
      start + minutes * 60_000,
    ),
    distanceMeters: meters,
  };
}

test("week and month stats use local boundaries, active time, and weighted pace", () => {
  const now = new Date(2027, 10, 10, 12).getTime();
  const longStart = new Date(2027, 10, 9, 8).getTime();
  let paused = createRun({ now: longStart, id: "paused-long" });
  paused = pauseRun(paused, longStart + 20 * 60_000);
  paused = resumeRun(paused, longStart + 30 * 60_000);
  const long = {
    ...finishRun(paused, longStart + 60 * 60_000),
    distanceMeters: 10_000,
  };
  const runs = [
    completedRun(8, 1000, 10),
    long,
    completedRun(7, 5000, 30),
    completedRun(11, 9000, 45),
    {
      ...completedRun(1, 2000, 10),
      startedAt: new Date(2027, 9, 31, 23).getTime(),
    },
    createRun({ now: now - 1000, id: "active" }),
  ];
  const week = summarizeRuns(runs, "week", now);
  assert.deepEqual(week, {
    distanceMeters: 11_000,
    durationMs: 60 * 60_000,
    count: 2,
  });
  assert.equal(formatPace(week.distanceMeters, week.durationMs, "km"), "5:27");
  assert.deepEqual(summarizeRuns(runs, "month", now), {
    distanceMeters: 16_000,
    durationMs: 90 * 60_000,
    count: 3,
  });
});

test("future completions and unfinished runs never enter summaries", () => {
  const now = new Date(2027, 10, 10, 12).getTime();
  const futureFinish = finishRun(createRun({ now: now - 1000 }), now + 1000);
  const paused = pauseRun(createRun({ now: now - 1000 }), now);
  assert.deepEqual(summarizeRuns([futureFinish, paused], "week", now), {
    distanceMeters: 0,
    durationMs: 0,
    count: 0,
  });
});
