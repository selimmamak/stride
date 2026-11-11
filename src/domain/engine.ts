import type { IntervalPlan, Run, RunKind, TrackPoint } from "../types";

/** Canonical quantities are meters and milliseconds; display units never change stored runs. */
export const GPS_MAX_ACCURACY_METERS = 35;
export const GPS_MAX_SPEED_METERS_PER_SECOND = 12;
export const GPS_GAP_MS = 30_000;
const EARTH_RADIUS_METERS = 6_371_008.8;

type Coordinate = { latitude: number; longitude: number };
type PointInput = Omit<TrackPoint, "segment">;

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) *
      Math.cos(b.latitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, value))))
  );
}

export function validIntervalPlan(plan: IntervalPlan): boolean {
  return (
    Number.isInteger(plan.repeats) &&
    plan.repeats >= 1 &&
    plan.repeats <= 100 &&
    [plan.warmupSeconds, plan.restSeconds, plan.cooldownSeconds].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 7200,
    ) &&
    Number.isFinite(plan.workSeconds) &&
    plan.workSeconds > 0 &&
    plan.workSeconds <= 7200
  );
}

export function createRun(
  options: {
    kind?: RunKind;
    intervalPlan?: IntervalPlan;
    trackingMode?: "foreground" | "background";
    now?: number;
    id?: string;
  } = {},
): Run {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now) || now < 0)
    throw new Error("Run start time is invalid.");
  if (options.intervalPlan && !validIntervalPlan(options.intervalPlan)) {
    throw new Error("Choose valid interval durations and repetitions.");
  }
  return {
    id:
      options.id ??
      `run-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    kind: options.kind ?? "easy",
    startedAt: now,
    endedAt: null,
    status: "running",
    distanceMeters: 0,
    points: [],
    intervals: [{ start: now, end: null }],
    ...(options.intervalPlan
      ? { intervalPlan: { ...options.intervalPlan } }
      : {}),
    notes: "",
    trackingMode: options.trackingMode ?? "foreground",
    lastAcceptedAt: null,
    segment: 0,
  };
}

/** Accept only usable, chronologically ordered GPS fixes. Never invent distance across gaps. */
export function appendPoint(run: Run, point: PointInput): Run {
  if (run.status !== "running") return run;
  const openInterval = run.intervals[run.intervals.length - 1];
  if (!openInterval || openInterval.end !== null) return run;
  if (
    !Number.isFinite(point.latitude) ||
    Math.abs(point.latitude) > 90 ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.longitude) > 180 ||
    !Number.isFinite(point.timestamp) ||
    point.timestamp < openInterval.start ||
    (run.lastAcceptedAt !== null && point.timestamp <= run.lastAcceptedAt) ||
    point.accuracy === null ||
    !Number.isFinite(point.accuracy) ||
    point.accuracy < 0 ||
    point.accuracy > GPS_MAX_ACCURACY_METERS
  )
    return run;

  const previous = run.points[run.points.length - 1];
  let segment = run.segment;
  let distance = 0;
  if (previous && previous.segment === segment) {
    const gapMs = point.timestamp - previous.timestamp;
    if (gapMs > GPS_GAP_MS) {
      // A fix after a long signal outage becomes a fresh anchor, not a straight-line shortcut.
      segment += 1;
    } else {
      distance = haversineMeters(previous, point);
      if (distance / (gapMs / 1000) > GPS_MAX_SPEED_METERS_PER_SECOND)
        return run;
      // Tiny changes are usually stationary GPS drift. Keep the last reliable anchor.
      if (distance < 2) return run;
    }
  }
  const accepted: TrackPoint = {
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp,
    accuracy: point.accuracy,
    altitude:
      point.altitude != null && Number.isFinite(point.altitude)
        ? point.altitude
        : null,
    segment,
  };
  return {
    ...run,
    points: [...run.points, accepted],
    distanceMeters: run.distanceMeters + distance,
    lastAcceptedAt: point.timestamp,
    segment,
  };
}

function safeTransitionTime(run: Run, now: number): number {
  if (!Number.isFinite(now)) throw new Error("Run time is invalid.");
  const lastInterval = run.intervals[run.intervals.length - 1];
  return Math.max(
    now,
    run.startedAt,
    lastInterval?.start ?? 0,
    lastInterval?.end ?? 0,
    run.lastAcceptedAt ?? 0,
  );
}

export function pauseRun(run: Run, now = Date.now()): Run {
  if (run.status !== "running") return run;
  const time = safeTransitionTime(run, now);
  return {
    ...run,
    status: "paused",
    intervals: run.intervals.map((interval) =>
      interval.end === null ? { ...interval, end: time } : interval,
    ),
  };
}

export function resumeRun(run: Run, now = Date.now()): Run {
  if (run.status !== "paused") return run;
  return {
    ...run,
    status: "running",
    segment: run.segment + 1,
    intervals: [
      ...run.intervals,
      { start: safeTransitionTime(run, now), end: null },
    ],
  };
}

export function finishRun(run: Run, now = Date.now()): Run {
  if (run.status === "completed") return run;
  const time = safeTransitionTime(run, now);
  return { ...pauseRun(run, time), status: "completed", endedAt: time };
}

export function elapsedMs(run: Run, now = Date.now()): number {
  const until = Math.min(
    Number.isFinite(now) ? now : run.startedAt,
    run.endedAt ?? Infinity,
  );
  return run.intervals.reduce(
    (sum, interval) =>
      sum +
      Math.max(0, Math.min(interval.end ?? until, until) - interval.start),
    0,
  );
}

export type IntervalPhase = {
  label: string;
  remainingSeconds: number;
  round: number;
  totalRounds: number;
  finished: boolean;
};

/** Recovery occurs between repetitions; the last effort transitions directly to cooldown. */
export function getIntervalPhase(
  plan: IntervalPlan,
  elapsedSeconds: number,
): IntervalPhase {
  if (!validIntervalPlan(plan)) throw new Error("Interval plan is invalid.");
  let remaining = Math.max(
    0,
    Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
  );
  const phases: { label: string; seconds: number; round: number }[] = [
    { label: "Warm up", seconds: plan.warmupSeconds, round: 0 },
  ];
  for (let round = 1; round <= plan.repeats; round++) {
    phases.push({ label: "Run", seconds: plan.workSeconds, round });
    if (round < plan.repeats)
      phases.push({ label: "Recover", seconds: plan.restSeconds, round });
  }
  phases.push({
    label: "Cool down",
    seconds: plan.cooldownSeconds,
    round: plan.repeats,
  });
  for (const phase of phases) {
    if (remaining < phase.seconds) {
      return {
        label: phase.label,
        remainingSeconds: Math.ceil(phase.seconds - remaining),
        round: phase.round,
        totalRounds: plan.repeats,
        finished: false,
      };
    }
    remaining -= phase.seconds;
  }
  return {
    label: "Complete",
    remainingSeconds: 0,
    round: plan.repeats,
    totalRounds: plan.repeats,
    finished: true,
  };
}

export type RunSplit = {
  index: number;
  distanceMeters: number;
  durationMs: number;
  paceSecondsPerKm: number;
};

/** Interpolate split crossings between recorded fixes, excluding time spent paused. */
export function getSplits(run: Run, unitMeters = 1000): RunSplit[] {
  if (!Number.isFinite(unitMeters) || unitMeters < 1)
    throw new Error("Split distance must be at least one meter.");
  const splits: RunSplit[] = [];
  let covered = 0;
  let lastSplitElapsed = 0;
  let nextBoundary = unitMeters;
  for (let index = 1; index < run.points.length; index++) {
    const previous = run.points[index - 1];
    const point = run.points[index];
    if (point.segment !== previous.segment) continue;
    const distance = haversineMeters(previous, point);
    if (distance <= 0) continue;
    while (covered + distance >= nextBoundary) {
      const fraction = (nextBoundary - covered) / distance;
      const crossing =
        previous.timestamp + (point.timestamp - previous.timestamp) * fraction;
      const crossingElapsed = elapsedMs(run, crossing);
      const durationMs = Math.max(0, crossingElapsed - lastSplitElapsed);
      splits.push({
        index: splits.length + 1,
        distanceMeters: unitMeters,
        durationMs,
        paceSecondsPerKm: durationMs / unitMeters,
      });
      lastSplitElapsed = crossingElapsed;
      nextBoundary += unitMeters;
    }
    covered += distance;
  }
  const remainder = covered - splits.length * unitMeters;
  if (remainder > 0.01) {
    const endElapsed = elapsedMs(
      run,
      run.endedAt ?? run.lastAcceptedAt ?? run.startedAt,
    );
    const durationMs = Math.max(0, endElapsed - lastSplitElapsed);
    splits.push({
      index: splits.length + 1,
      distanceMeters: remainder,
      durationMs,
      paceSecondsPerKm: durationMs / remainder,
    });
  }
  return splits;
}
