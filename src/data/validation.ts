import type {
  AppData,
  CalendarEntry,
  IntervalPlan,
  Marathon,
  PlanExercise,
  Run,
  RunSource,
  Settings,
  TrackPoint,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutSession,
  WorkoutSet,
} from "../types";
import { pauseRun, validIntervalPlan } from "../domain/engine";
import { parseLocalDate } from "../domain/calendar";

export const BACKUP_MAX_BYTES = 64 * 1024 * 1024;
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function fail(path: string): never {
  throw new Error(`Invalid backup data: ${path}.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return fail(path);
  return value as Record<string, unknown>;
}
function text(
  value: unknown,
  path: string,
  max = 10_000,
  allowEmpty = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    return fail(path);
  return value;
}
function numeric(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    return fail(path);
  return value;
}
function integer(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const result = numeric(value, path, min, max);
  if (!Number.isInteger(result)) return fail(path);
  return result;
}
function nullableNumber(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  return value === null ? null : numeric(value, path, min, max);
}
function list<T>(
  value: unknown,
  path: string,
  parser: (item: unknown, path: string) => T,
  max = 100_000,
): T[] {
  if (!Array.isArray(value) || value.length > max) return fail(path);
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}
function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    return fail(path);
  return value as T;
}
function uniqueIds(values: { id: string }[], path: string) {
  if (new Set(values.map((item) => item.id)).size !== values.length)
    fail(`${path} contains duplicate IDs`);
}
function parseIntervalPlan(value: unknown, path: string): IntervalPlan {
  const item = object(value, path);
  const result: IntervalPlan = {
    warmupSeconds: numeric(
      item.warmupSeconds,
      `${path}.warmupSeconds`,
      0,
      7200,
    ),
    workSeconds: numeric(item.workSeconds, `${path}.workSeconds`, 0, 7200),
    restSeconds: numeric(item.restSeconds, `${path}.restSeconds`, 0, 7200),
    repeats: integer(item.repeats, `${path}.repeats`, 1, 100),
    cooldownSeconds: numeric(
      item.cooldownSeconds,
      `${path}.cooldownSeconds`,
      0,
      7200,
    ),
  };
  if (!validIntervalPlan(result)) fail(path);
  return result;
}
function parsePoint(value: unknown, path: string): TrackPoint {
  const item = object(value, path);
  return {
    latitude: numeric(item.latitude, `${path}.latitude`, -90, 90),
    longitude: numeric(item.longitude, `${path}.longitude`, -180, 180),
    timestamp: numeric(item.timestamp, `${path}.timestamp`),
    accuracy: nullableNumber(item.accuracy, `${path}.accuracy`),
    altitude:
      item.altitude == null
        ? null
        : numeric(item.altitude, `${path}.altitude`, -20_000, 100_000),
    segment: integer(item.segment, `${path}.segment`),
  };
}
function parseRun(value: unknown, path: string): Run {
  const item = object(value, path);
  const result: Run = {
    id: text(item.id, `${path}.id`, 200, false),
    kind: choice(item.kind, ["easy", "long", "interval"], `${path}.kind`),
    startedAt: numeric(item.startedAt, `${path}.startedAt`),
    endedAt: nullableNumber(item.endedAt, `${path}.endedAt`),
    status: choice(
      item.status,
      ["running", "paused", "completed"],
      `${path}.status`,
    ),
    distanceMeters: numeric(item.distanceMeters, `${path}.distanceMeters`),
    points: list(item.points, `${path}.points`, parsePoint, 500_000),
    intervals: list(
      item.intervals,
      `${path}.intervals`,
      (entry, intervalPath) => {
        const interval = object(entry, intervalPath);
        return {
          start: numeric(interval.start, `${intervalPath}.start`),
          end: nullableNumber(interval.end, `${intervalPath}.end`),
        };
      },
    ),
    notes: text(item.notes, `${path}.notes`),
    trackingMode: choice(
      item.trackingMode,
      ["foreground", "background"],
      `${path}.trackingMode`,
    ),
    lastAcceptedAt: nullableNumber(
      item.lastAcceptedAt,
      `${path}.lastAcceptedAt`,
    ),
    segment: integer(item.segment, `${path}.segment`),
    ...(item.source !== undefined
      ? { source: parseRunSource(item.source, `${path}.source`) }
      : {}),
    ...(item.distanceUnavailable !== undefined
      ? {
          distanceUnavailable: boolean(
            item.distanceUnavailable,
            `${path}.distanceUnavailable`,
          ),
        }
      : {}),
    ...(item.intervalPlan !== undefined
      ? {
          intervalPlan: parseIntervalPlan(
            item.intervalPlan,
            `${path}.intervalPlan`,
          ),
        }
      : {}),
  };
  if (result.distanceUnavailable && result.distanceMeters !== 0)
    fail(`${path}.unavailable distance must be zero`);
  if (!result.intervals.length) fail(`${path}.intervals is empty`);
  if ((result.status === "completed") !== (result.endedAt !== null))
    fail(`${path}.status and end time do not agree`);
  if (result.endedAt !== null && result.endedAt < result.startedAt)
    fail(`${path}.endedAt precedes its start`);
  let previousEnd = result.startedAt;
  result.intervals.forEach((interval, index) => {
    if (
      interval.start < previousEnd ||
      (interval.end !== null && interval.end < interval.start)
    )
      fail(`${path}.intervals are out of order`);
    if (
      interval.end === null &&
      (index !== result.intervals.length - 1 || result.status !== "running")
    )
      fail(`${path}.intervals contains an unexpected open interval`);
    if (
      result.endedAt !== null &&
      (interval.end ?? interval.start) > result.endedAt
    )
      fail(`${path}.intervals ends after run`);
    previousEnd = interval.end ?? interval.start;
  });
  if (
    result.status === "running" &&
    result.intervals[result.intervals.length - 1].end !== null
  )
    fail(`${path}.running interval is closed`);
  let previousTime = result.startedAt - 1;
  let previousSegment = 0;
  for (const point of result.points) {
    if (
      point.timestamp <= previousTime ||
      point.timestamp < result.startedAt ||
      (result.endedAt !== null && point.timestamp > result.endedAt) ||
      point.segment < previousSegment ||
      point.segment > result.segment
    )
      fail(`${path}.points are out of order`);
    previousTime = point.timestamp;
    previousSegment = point.segment;
  }
  if (
    result.lastAcceptedAt !==
    (result.points[result.points.length - 1]?.timestamp ?? null)
  )
    fail(`${path}.lastAcceptedAt does not match route`);
  return result;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path);
  return value;
}
function parseRunSource(value: unknown, path: string): RunSource {
  const item = object(value, path);
  const kind = choice(item.kind, ["manual", "apple-health"], `${path}.kind`);
  if (kind === "manual" && item.externalId !== undefined)
    fail(`${path}.externalId`);
  return {
    kind,
    ...(kind === "apple-health"
      ? { externalId: text(item.externalId, `${path}.externalId`, 180, false) }
      : {}),
    ...(item.name !== undefined
      ? { name: text(item.name, `${path}.name`, 200, false) }
      : {}),
  };
}
function parsePlanExercise(value: unknown, path: string): PlanExercise {
  const item = object(value, path);
  return {
    id: text(item.id, `${path}.id`, 200, false),
    name: text(item.name, `${path}.name`, 200, false),
    sets: integer(item.sets, `${path}.sets`, 1, 100),
    reps: integer(item.reps, `${path}.reps`, 1, 1000),
    weight: numeric(item.weight, `${path}.weight`, 0, 100_000),
    restSeconds: integer(item.restSeconds, `${path}.restSeconds`, 0, 7200),
  };
}
function parsePlan(value: unknown, path: string): WorkoutPlan {
  const item = object(value, path);
  const result = {
    id: text(item.id, `${path}.id`, 200, false),
    name: text(item.name, `${path}.name`, 200, false),
    exercises: list(
      item.exercises,
      `${path}.exercises`,
      parsePlanExercise,
      100,
    ),
    createdAt: numeric(item.createdAt, `${path}.createdAt`),
    updatedAt: numeric(item.updatedAt, `${path}.updatedAt`),
  };
  if (!result.exercises.length) fail(`${path}.exercises is empty`);
  if (result.updatedAt < result.createdAt)
    fail(`${path}.updatedAt precedes creation`);
  uniqueIds(result.exercises, `${path}.exercises`);
  return result;
}
function parseSet(value: unknown, path: string): WorkoutSet {
  const item = object(value, path);
  if (typeof item.completed !== "boolean") fail(`${path}.completed`);
  return {
    id: text(item.id, `${path}.id`, 200, false),
    reps: integer(item.reps, `${path}.reps`, 0, 1000),
    weight: numeric(item.weight, `${path}.weight`, 0, 100_000),
    completed: item.completed,
  };
}
function parseWorkoutExercise(value: unknown, path: string): WorkoutExercise {
  const item = object(value, path);
  const result = {
    id: text(item.id, `${path}.id`, 200, false),
    name: text(item.name, `${path}.name`, 200, false),
    restSeconds: integer(item.restSeconds, `${path}.restSeconds`, 0, 7200),
    sets: list(item.sets, `${path}.sets`, parseSet, 100),
  };
  uniqueIds(result.sets, `${path}.sets`);
  return result;
}
function parseWorkout(value: unknown, path: string): WorkoutSession {
  const item = object(value, path);
  const result: WorkoutSession = {
    id: text(item.id, `${path}.id`, 200, false),
    planId:
      item.planId === null
        ? null
        : text(item.planId, `${path}.planId`, 200, false),
    name: text(item.name, `${path}.name`, 200, false),
    startedAt: numeric(item.startedAt, `${path}.startedAt`),
    endedAt: nullableNumber(item.endedAt, `${path}.endedAt`),
    weightUnit: choice(item.weightUnit, ["kg", "lb"], `${path}.weightUnit`),
    exercises: list(
      item.exercises,
      `${path}.exercises`,
      parseWorkoutExercise,
      100,
    ),
    notes: text(item.notes, `${path}.notes`),
    ...(item.restEndsAt !== undefined
      ? { restEndsAt: nullableNumber(item.restEndsAt, `${path}.restEndsAt`) }
      : {}),
  };
  if (result.endedAt !== null && result.endedAt < result.startedAt)
    fail(`${path}.endedAt precedes its start`);
  uniqueIds(result.exercises, `${path}.exercises`);
  return result;
}
function parseSettings(value: unknown): Settings {
  const item = object(value, "settings");
  return {
    distanceUnit: choice(
      item.distanceUnit,
      ["km", "mi"],
      "settings.distanceUnit",
    ),
    weightUnit: choice(item.weightUnit, ["kg", "lb"], "settings.weightUnit"),
    weeklyGoalKm: numeric(item.weeklyGoalKm, "settings.weeklyGoalKm", 1, 2000),
  };
}

function calendarDate(value: unknown, path: string): string {
  const date = text(value, path, 10, false);
  if (!parseLocalDate(date)) fail(path);
  return date;
}

function parseMarathon(value: unknown, path: string): Marathon {
  const item = object(value, path);
  return {
    id: text(item.id, `${path}.id`, 200, false),
    name: text(item.name, `${path}.name`, 200, false),
    location: text(item.location, `${path}.location`, 200, false),
    date: calendarDate(item.date, `${path}.date`),
  };
}

function parseCalendarEntry(value: unknown, path: string): CalendarEntry {
  const item = object(value, path);
  if (typeof item.completed !== "boolean") fail(`${path}.completed`);
  return {
    id: text(item.id, `${path}.id`, 200, false),
    title: text(item.title, `${path}.title`, 200, false),
    date: calendarDate(item.date, `${path}.date`),
    kind: choice(
      item.kind,
      ["easy", "long", "interval", "weightlifting", "rest"],
      `${path}.kind`,
    ),
    notes: text(item.notes, `${path}.notes`),
    completed: item.completed,
    ...(item.liftType !== undefined
      ? {
          liftType: choice<NonNullable<CalendarEntry["liftType"]>>(
            item.liftType,
            ["push", "pull", "legs"],
            `${path}.liftType`,
          ),
        }
      : {}),
    ...(item.distanceMeters !== undefined
      ? {
          distanceMeters: numeric(
            item.distanceMeters,
            `${path}.distanceMeters`,
            0,
            1_000_000,
          ),
        }
      : {}),
    ...(item.durationMinutes !== undefined
      ? {
          durationMinutes: numeric(
            item.durationMinutes,
            `${path}.durationMinutes`,
            0,
            1440,
          ),
        }
      : {}),
  };
}

/** Parse every supported field; unknown properties cannot enter application state. */
export function parseAppData(value: unknown): AppData {
  const item = object(value, "root");
  if (item.version !== 1) fail("unsupported version (expected 1)");
  const result: AppData = {
    version: 1,
    runs: list(item.runs, "runs", parseRun),
    plans: list(item.plans, "plans", parsePlan, 10_000),
    workouts: list(item.workouts, "workouts", parseWorkout),
    marathons:
      item.marathons === undefined
        ? []
        : list(item.marathons, "marathons", parseMarathon, 10_000),
    calendarEntries:
      item.calendarEntries === undefined
        ? []
        : list(item.calendarEntries, "calendarEntries", parseCalendarEntry),
    activeRun:
      item.activeRun === null ? null : parseRun(item.activeRun, "activeRun"),
    activeWorkout:
      item.activeWorkout === null
        ? null
        : parseWorkout(item.activeWorkout, "activeWorkout"),
    settings: parseSettings(item.settings),
  };
  uniqueIds(result.runs, "runs");
  uniqueIds(
    result.runs
      .filter((run) => run.source?.kind === "apple-health")
      .map((run) => ({ id: run.source!.externalId! })),
    "Apple Health runs",
  );
  uniqueIds(result.plans, "plans");
  uniqueIds(result.workouts, "workouts");
  uniqueIds(result.marathons, "marathons");
  uniqueIds(result.calendarEntries, "calendarEntries");
  if (result.runs.some((run) => run.status !== "completed"))
    fail("history contains unfinished runs");
  if (result.workouts.some((workout) => workout.endedAt === null))
    fail("history contains unfinished workouts");
  if (result.activeRun?.status === "completed")
    fail("activeRun is already completed");
  if (result.activeWorkout?.endedAt != null)
    fail("activeWorkout is already completed");
  if (
    result.activeRun &&
    result.runs.some((run) => run.id === result.activeRun?.id)
  )
    fail("activeRun is also in history");
  if (
    result.activeWorkout &&
    result.workouts.some((workout) => workout.id === result.activeWorkout?.id)
  )
    fail("activeWorkout is also in history");
  return result;
}

export function parseBackup(json: string): AppData {
  if (utf8ByteLength(json) > BACKUP_MAX_BYTES)
    throw new Error("This backup exceeds the 64 MB import limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Choose a valid Stride JSON backup.");
  }
  const result = parseAppData(parsed);
  if (result.activeRun?.status === "running") {
    const run = result.activeRun;
    const lastInterval = run.intervals[run.intervals.length - 1];
    result.activeRun = pauseRun(
      run,
      Math.max(run.lastAcceptedAt ?? run.startedAt, lastInterval.start),
    );
  }
  if (result.activeWorkout)
    result.activeWorkout = { ...result.activeWorkout, restEndsAt: null };
  return result;
}
