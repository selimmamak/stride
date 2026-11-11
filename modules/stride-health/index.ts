import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type HealthRun = {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters: number | null;
  sourceName: string;
};

type HealthModule = {
  isAvailable(): Promise<boolean>;
  requestReadAuthorization(): Promise<void>;
  getRunningWorkouts(
    startedAfter: number,
    endedBefore: number,
  ): Promise<HealthRun[]>;
};

const native =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<HealthModule>("StrideHealth")
    : null;

export function isHealthModuleAvailable(): boolean {
  return native !== null;
}

export async function isAvailable(): Promise<boolean> {
  return native ? native.isAvailable() : false;
}

function requireHealth(): HealthModule {
  if (!native) {
    throw new Error(
      "Apple Health needs a local iPhone build. It is not available in Expo Go or the browser.",
    );
  }
  return native;
}

/** Completion means the access sheet finished, not that read permission was granted. */
export async function requestReadAuthorization(): Promise<void> {
  await requireHealth().requestReadAuthorization();
}

export async function getRunningWorkouts(
  startedAfter: number,
  endedBefore: number,
): Promise<HealthRun[]> {
  if (
    !Number.isFinite(startedAfter) ||
    !Number.isFinite(endedBefore) ||
    startedAfter < 0 ||
    endedBefore <= startedAfter
  ) {
    throw new Error("Choose a valid date range for your runs.");
  }
  return requireHealth().getRunningWorkouts(startedAfter, endedBefore);
}
