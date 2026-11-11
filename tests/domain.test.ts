import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPoint,
  createRun,
  elapsedMs,
  finishRun,
  getIntervalPhase,
  getSplits,
  haversineMeters,
  pauseRun,
  resumeRun,
} from "../src/domain/engine";
import type { IntervalPlan, Run } from "../src/types";

const start = 1_000_000;
const fix = (northMeters: number, seconds: number, accuracy = 5) => ({
  latitude: northMeters / 111_195,
  longitude: 0,
  timestamp: start + seconds * 1000,
  accuracy,
});
function route(distance = 120, step = 3): Run {
  let run = createRun({ now: start, id: "run" });
  for (let meters = 0; meters <= distance; meters += step)
    run = appendPoint(run, fix(meters, meters / 3));
  return run;
}

test("Haversine measures known equatorial distance and remains finite at antipodes", () => {
  assert.ok(
    Math.abs(
      haversineMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ) - 111_195,
    ) < 1,
  );
  assert.ok(
    Number.isFinite(
      haversineMeters(
        { latitude: 90, longitude: 180 },
        { latitude: -90, longitude: 0 },
      ),
    ),
  );
});

test("duplicate and out-of-order points do not change a run", () => {
  const run = route();
  assert.equal(appendPoint(run, fix(120, 40)), run);
  assert.equal(appendPoint(run, fix(120, 10)), run);
  assert.equal(appendPoint(run, fix(100, -1)), run);
});

test("invalid coordinates, unknown accuracy, weak fixes and impossible jumps are discarded", () => {
  const run = route(30);
  assert.equal(appendPoint(run, fix(60, 20, 100)), run);
  assert.equal(appendPoint(run, { ...fix(40, 15), latitude: NaN }), run);
  assert.equal(appendPoint(run, { ...fix(40, 15), latitude: 91 }), run);
  assert.equal(appendPoint(run, { ...fix(40, 15), accuracy: null }), run);
  assert.equal(appendPoint(run, fix(500, 11)), run);
  const recovered = appendPoint(run, fix(36, 12));
  assert.ok(Math.abs(recovered.distanceMeters - 36) < 0.1);
});

test("a stationary fix does not add GPS jitter to distance", () => {
  const run = appendPoint(createRun({ now: start }), fix(0, 0));
  assert.equal(appendPoint(run, fix(1, 1)), run);
});

test("pause excludes stopped time and moving during pause never joins route segments", () => {
  let run = route(30);
  run = pauseRun(run, start + 15_000);
  assert.equal(appendPoint(run, fix(500, 20)), run);
  run = resumeRun(run, start + 45_000);
  run = appendPoint(run, fix(500, 45));
  run = appendPoint(run, fix(530, 55));
  const completed = finishRun(run, start + 60_000);
  assert.equal(elapsedMs(completed), 30_000);
  assert.ok(Math.abs(completed.distanceMeters - 60) < 0.1);
  assert.equal(completed.points.at(-1)?.segment, 1);
  assert.equal(completed.points.at(-3)?.segment, 0);
});

test("signal gaps create a new segment without guessing the missing distance", () => {
  const previous = route(30);
  const anchored = appendPoint(previous, fix(500, 60));
  assert.equal(anchored.distanceMeters, previous.distanceMeters);
  assert.equal(anchored.segment, 1);
  const moving = appendPoint(anchored, fix(530, 70));
  assert.ok(Math.abs(moving.distanceMeters - 60) < 0.1);
});

test("elapsed time comes from timestamps and survives serialization", () => {
  let run = createRun({ now: start });
  run = pauseRun(run, start + 10_000);
  run = resumeRun(run, start + 20_000);
  const restored = JSON.parse(JSON.stringify(run)) as Run;
  assert.equal(elapsedMs(restored, start + 25_000), 15_000);
  assert.equal(elapsedMs(restored, start - 10_000), 0);
});

test("finish and pause are idempotent; late callbacks cannot mutate saved runs", () => {
  const run = route();
  const completed = finishRun(run, start + 45_000);
  assert.equal(finishRun(completed, start + 60_000), completed);
  assert.equal(appendPoint(completed, fix(150, 50)), completed);
  assert.equal(pauseRun(completed), completed);
  assert.equal(resumeRun(completed), completed);
  assert.equal(elapsedMs(completed, start + 100_000), 45_000);
});

test("interval transitions use active seconds and skip recovery after the final effort", () => {
  const plan: IntervalPlan = {
    warmupSeconds: 10,
    workSeconds: 20,
    restSeconds: 5,
    repeats: 2,
    cooldownSeconds: 10,
  };
  assert.deepEqual(getIntervalPhase(plan, 0), {
    label: "Warm up",
    remainingSeconds: 10,
    round: 0,
    totalRounds: 2,
    finished: false,
  });
  assert.equal(getIntervalPhase(plan, 10).label, "Run");
  assert.equal(getIntervalPhase(plan, 29.1).remainingSeconds, 1);
  assert.equal(getIntervalPhase(plan, 30).label, "Recover");
  assert.equal(getIntervalPhase(plan, 35).round, 2);
  assert.equal(getIntervalPhase(plan, 55).label, "Cool down");
  assert.equal(getIntervalPhase(plan, 65).finished, true);
  assert.equal(
    getIntervalPhase(
      { ...plan, warmupSeconds: 0, restSeconds: 0, cooldownSeconds: 0 },
      0,
    ).label,
    "Run",
  );
  assert.throws(() => getIntervalPhase({ ...plan, repeats: 0 }, 0), /invalid/);
});

test("splits interpolate kilometer boundaries and include the final partial split", () => {
  const run = finishRun(route(1500, 30), start + 500_000);
  const splits = getSplits(run);
  assert.equal(splits.length, 2);
  assert.ok(Math.abs(splits[0].distanceMeters - 1000) < 0.01);
  assert.ok(Math.abs(splits[1].distanceMeters - 500) < 0.1);
  assert.ok(Math.abs(splits[0].paceSecondsPerKm - 1000 / 3) < 0.01);
  assert.ok(
    Math.abs(
      splits.reduce((total, split) => total + split.durationMs, 0) - 500_000,
    ) < 1,
  );
});

test("splits exclude pause time and disconnected movement", () => {
  let run = route(600, 30);
  run = pauseRun(run, start + 200_000);
  run = resumeRun(run, start + 300_000);
  for (let meters = 1200; meters <= 1800; meters += 30)
    run = appendPoint(run, fix(meters, 300 + (meters - 1200) / 3));
  run = finishRun(run, start + 500_000);
  const splits = getSplits(run);
  assert.ok(
    Math.abs(
      splits.reduce((sum, split) => sum + split.distanceMeters, 0) - 1200,
    ) < 0.1,
  );
  assert.ok(
    Math.abs(
      splits.reduce((sum, split) => sum + split.durationMs, 0) - 400_000,
    ) < 1,
  );
});
