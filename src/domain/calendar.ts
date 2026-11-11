import type { Run } from "../types";
import { elapsedMs } from "./engine";

const DAY_MS = 86_400_000;

/** Store date-only plans as local calendar dates, never as UTC timestamps. */
export function localDateKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid date.");
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (
    year < 1900 ||
    year > 2200 ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31
  )
    return null;
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  )
    return null;
  return date;
}

function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

/** Calendar days keep race-day countdowns stable across daylight saving changes. */
export function daysUntil(value: string, now = Date.now()): number {
  const date = parseLocalDate(value);
  const today = new Date(now);
  if (!date || !Number.isFinite(today.getTime()))
    throw new Error("Choose a valid date.");
  return dayNumber(date) - dayNumber(today);
}

/** Month is zero-based. Include adjacent days to fill whole Monday-first weeks. */
export function monthGrid(year: number, month: number): string[] {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  )
    throw new Error("Choose a valid month.");
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const count =
    Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) =>
    localDateKey(new Date(year, month, 1 - offset + index).getTime()),
  );
}

export type RunSummary = {
  distanceMeters: number;
  durationMs: number;
  count: number;
};

/** Average pace is total active time divided by total distance, not a mean of run paces. */
export function summarizeRuns(
  runs: Run[],
  period: "week" | "month",
  now = Date.now(),
): RunSummary {
  const start = new Date(now);
  if (!Number.isFinite(start.getTime()))
    throw new Error("Choose a valid date.");
  start.setHours(0, 0, 0, 0);
  if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else start.setDate(1);
  return runs.reduce<RunSummary>(
    (summary, run) => {
      if (
        run.status !== "completed" ||
        run.endedAt === null ||
        run.startedAt < start.getTime() ||
        run.startedAt > now ||
        run.endedAt > now
      )
        return summary;
      return {
        distanceMeters:
          summary.distanceMeters +
          (run.distanceUnavailable ? 0 : run.distanceMeters),
        durationMs:
          summary.durationMs +
          (run.distanceUnavailable ? 0 : elapsedMs(run, run.endedAt)),
        count: summary.count + 1,
      };
    },
    { distanceMeters: 0, durationMs: 0, count: 0 },
  );
}
