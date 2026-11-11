import type { AppData } from "../types";
import {
  BACKUP_MAX_BYTES,
  parseAppData,
  parseBackup,
  utf8ByteLength,
} from "./validation";

export const STORAGE_KEY = "@stride/training/v1";
export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
export type StoreSnapshot = {
  data: AppData;
  ready: boolean;
  error: string | null;
};

export function emptyData(): AppData {
  return {
    version: 1,
    runs: [],
    plans: [],
    workouts: [],
    marathons: [],
    calendarEntries: [],
    activeRun: null,
    activeWorkout: null,
    settings: { distanceUnit: "km", weightUnit: "kg", weeklyGoalKm: 20 },
  };
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/**
 * One versioned snapshot makes each save atomic at the storage-key boundary.
 * Mutations serialize and become visible only after persistence succeeds, so concurrent
 * GPS callbacks, set edits, and finish taps cannot overwrite one another.
 * Tradeoff: a save serializes historical routes too. A later SQLite migration can optimize
 * very large histories without changing the public store API.
 */
export function createStore(storage: StorageAdapter) {
  let snapshot: StoreSnapshot = {
    data: freeze(emptyData()),
    ready: false,
    error: null,
  };
  const listeners = new Set<() => void>();
  let hydration: Promise<void> | null = null;
  let queue = Promise.resolve();
  let blocked = false;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const getSnapshot = () => snapshot;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  function hydrateStore(): Promise<void> {
    if (hydration) return hydration;
    hydration = (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        const data =
          raw === null ? emptyData() : parseAppData(JSON.parse(raw) as unknown);
        snapshot = { data: freeze(data), ready: true, error: null };
      } catch {
        blocked = true;
        snapshot = {
          ...snapshot,
          ready: true,
          error:
            "Your saved data could not be opened. It has been left untouched. Restore a known-good backup in Settings.",
        };
      }
      notify();
    })();
    return hydration;
  }

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  }

  async function persist(data: AppData): Promise<void> {
    // Freeze before awaiting I/O: callers cannot change the object while it is being saved.
    freeze(data);
    try {
      const serialized = JSON.stringify(data);
      await storage.setItem(STORAGE_KEY, serialized);
    } catch {
      snapshot = {
        ...snapshot,
        error:
          "Could not save to this device. Your previous saved data is safe. Free some storage and try again.",
      };
      notify();
      throw new Error(snapshot.error ?? "Could not save data.");
    }
    snapshot = { data, ready: true, error: null };
    notify();
  }

  function updateData(mutator: (data: AppData) => AppData): Promise<void> {
    return enqueue(async () => {
      await hydrateStore();
      if (blocked)
        throw new Error(
          snapshot.error ??
            "Saved data needs recovery before changes can be made.",
        );
      const next = mutator(snapshot.data);
      if (next === snapshot.data) return;
      if (next.version !== 1)
        throw new Error("Unsupported training data version.");
      await persist(next);
    });
  }

  function exportData(): string {
    if (!snapshot.ready || blocked)
      throw new Error(snapshot.error ?? "Your saved data is still loading.");
    const json = JSON.stringify(snapshot.data, null, 2);
    if (utf8ByteLength(json) > BACKUP_MAX_BYTES)
      throw new Error(
        "This history exceeds the 64 MB backup limit. The data is still saved on your device.",
      );
    return json;
  }

  function importData(json: string): Promise<void> {
    // Validation happens before the serialized write. Invalid backups cannot overwrite data.
    let imported: AppData;
    try {
      imported = parseBackup(json);
    } catch (error) {
      return Promise.reject(error);
    }
    return enqueue(async () => {
      await hydrateStore();
      if (snapshot.data.activeRun) {
        throw new Error(
          "Finish or discard your current run before restoring a backup.",
        );
      }
      await persist(imported);
      blocked = false;
    });
  }

  return {
    getSnapshot,
    subscribe,
    hydrateStore,
    updateData,
    exportData,
    importData,
  };
}
