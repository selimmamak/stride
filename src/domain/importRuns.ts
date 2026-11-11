import type { Run, RunKind } from "../types";
import { localDateKey, parseLocalDate } from "./calendar";

export type HealthRun = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters: number | null;
  sourceName: string;
};

export function runTitle(run: Run): string {
  if (run.source?.kind === "apple-health") return "Run";
  return run.kind === "interval"
    ? "Interval run"
    : run.kind === "long"
      ? "Long run"
      : "Easy run";
}

export function manualRun(input: {
  id: string;
  kind: RunKind;
  date: string;
  distanceMeters: number;
  durationMinutes: number;
  notes: string;
  now?: number;
}): Run {
  const date = parseLocalDate(input.date);
  const now = input.now ?? Date.now();
  if (!date || date.getTime() < 0 || !Number.isFinite(now))
    throw new Error("Choose a valid date from 1970 onward.");
  if (input.date > localDateKey(now))
    throw new Error(
      "A completed run cannot be in the future. Save it as planned instead.",
    );
  if (
    !input.id.trim() ||
    input.id.length > 200 ||
    !["easy", "long", "interval"].includes(input.kind)
  )
    throw new Error("Choose a valid run type.");
  if (
    !Number.isFinite(input.distanceMeters) ||
    input.distanceMeters <= 0 ||
    input.distanceMeters > 1_000_000
  )
    throw new Error(
      "Enter a distance greater than zero and no more than 1,000 km.",
    );
  if (
    !Number.isFinite(input.durationMinutes) ||
    input.durationMinutes <= 0 ||
    input.durationMinutes > 1440
  )
    throw new Error(
      "Enter a duration greater than zero and no more than 24 hours.",
    );
  if (input.notes.length > 10_000)
    throw new Error("Keep run notes under 10,000 characters.");
  const startedAt = date.getTime();
  const endedAt = startedAt + Math.round(input.durationMinutes * 60_000);
  if (endedAt - startedAt < 1000)
    throw new Error("Enter a duration of at least one second.");
  if (endedAt > now)
    throw new Error(
      "This duration extends beyond the current time. Check the date or duration.",
    );
  return {
    id: input.id,
    kind: input.kind,
    startedAt,
    endedAt,
    status: "completed",
    distanceMeters: input.distanceMeters,
    points: [],
    intervals: [{ start: startedAt, end: endedAt }],
    notes: input.notes.trim(),
    trackingMode: "foreground",
    lastAcceptedAt: null,
    segment: 0,
    source: { kind: "manual" },
  };
}

function validSample(sample: HealthRun): boolean {
  return (
    typeof sample.id === "string" &&
    sample.id.trim().length > 0 &&
    sample.id.length <= 180 &&
    Number.isFinite(sample.startedAt) &&
    sample.startedAt >= 0 &&
    Number.isFinite(new Date(sample.startedAt).getTime()) &&
    Number.isFinite(sample.endedAt) &&
    sample.endedAt >= sample.startedAt &&
    Number.isFinite(new Date(sample.endedAt).getTime()) &&
    Number.isFinite(sample.durationSeconds) &&
    sample.durationSeconds > 0 &&
    sample.durationSeconds * 1000 <= sample.endedAt - sample.startedAt + 1 &&
    (sample.distanceMeters === null ||
      (Number.isFinite(sample.distanceMeters) &&
        sample.distanceMeters >= 0 &&
        sample.distanceMeters <= Number.MAX_SAFE_INTEGER)) &&
    typeof sample.sourceName === "string" &&
    sample.sourceName.length <= 200
  );
}

function fromHealth(sample: HealthRun): Run {
  const unavailable =
    sample.distanceMeters === null || sample.distanceMeters === 0;
  return {
    id: `health-${sample.id}`,
    kind: "easy",
    startedAt: sample.startedAt,
    endedAt: sample.endedAt,
    status: "completed",
    distanceMeters: sample.distanceMeters ?? 0,
    distanceUnavailable: unavailable,
    points: [],
    intervals: [
      {
        start: sample.startedAt,
        end: Math.min(
          sample.endedAt,
          sample.startedAt + sample.durationSeconds * 1000,
        ),
      },
    ],
    notes: "",
    trackingMode: "foreground",
    lastAcceptedAt: null,
    segment: 0,
    source: {
      kind: "apple-health",
      externalId: sample.id,
      name: sample.sourceName.trim() || "Apple Health",
    },
  };
}

/** Import only supplied running workouts. Health IDs make repeated reads idempotent. */
export function importHealthRuns(
  existing: Run[],
  samples: HealthRun[],
): {
  runs: Run[];
  added: number;
  updated: number;
  skipped: number;
} {
  const runs = [...existing];
  const healthIndices = new Map<string, number>();
  const ids = new Set(existing.map((run) => run.id));
  runs.forEach((run, index) => {
    if (run.source?.kind === "apple-health" && run.source.externalId)
      healthIndices.set(run.source.externalId, index);
  });
  const seen = new Set<string>();
  let added = 0,
    updated = 0,
    skipped = 0;
  for (const sample of samples) {
    if (!sample || !validSample(sample) || seen.has(sample.id)) {
      skipped++;
      continue;
    }
    seen.add(sample.id);
    const imported = fromHealth(sample);
    const index = healthIndices.get(sample.id);
    if (index !== undefined) {
      const previous = runs[index];
      const next: Run = {
        ...imported,
        id: previous.id,
        kind: previous.kind,
        notes: previous.notes,
        ...(previous.intervalPlan
          ? { intervalPlan: previous.intervalPlan }
          : {}),
      };
      if (sameHealthValues(previous, next)) skipped++;
      else {
        runs[index] = next;
        updated++;
      }
    } else if (ids.has(imported.id)) {
      // A local identifier collision must never replace an unrelated run.
      skipped++;
    } else {
      healthIndices.set(sample.id, runs.length);
      ids.add(imported.id);
      runs.push(imported);
      added++;
    }
  }
  return { runs, added, updated, skipped };
}

function sameHealthValues(a: Run, b: Run): boolean {
  return (
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    a.status === b.status &&
    a.distanceMeters === b.distanceMeters &&
    !!a.distanceUnavailable === !!b.distanceUnavailable &&
    a.source?.name === b.source?.name &&
    a.intervals.length === b.intervals.length &&
    a.intervals.every(
      (interval, index) =>
        interval.start === b.intervals[index].start &&
        interval.end === b.intervals[index].end,
    )
  );
}
