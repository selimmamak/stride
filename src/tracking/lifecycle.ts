import { elapsedMs, pauseRun } from "../domain/engine";
import type { AppData, Run } from "../types";

export type SessionToken = { runId: string; generation: number };

/** Native callbacks can outlive remove(). A new subscription always gets a new generation. */
export class SessionGate {
  private generation = 0;
  private active: SessionToken | null = null;
  open(runId: string): SessionToken {
    const token = { runId, generation: ++this.generation };
    this.active = token;
    return token;
  }
  close(): void {
    this.generation++;
    this.active = null;
  }
  accepts(token: SessionToken): boolean {
    return (
      this.active?.runId === token.runId &&
      this.active.generation === token.generation
    );
  }
}

export function displayElapsedMs(
  run: Run,
  now: number,
  stoppedAt: number | null = null,
): number {
  if (stoppedAt !== null) return elapsedMs(pauseRun(run, stoppedAt));
  if (run.status !== "running") return elapsedMs(run);
  return elapsedMs(run, now);
}

export function updateRunNotes(
  data: AppData,
  runId: string,
  notes: string,
): AppData {
  if (
    !data.activeRun ||
    data.activeRun.id !== runId ||
    data.activeRun.notes === notes
  )
    return data;
  if (notes.length > 10_000)
    throw new Error("Run notes must be 10,000 characters or fewer.");
  return { ...data, activeRun: { ...data.activeRun, notes } };
}
