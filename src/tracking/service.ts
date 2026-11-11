import { AppState, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useSyncExternalStore } from "react";
import * as store from "../data/store";
import { createTrackingService } from "./controller";

// Instantiation at module scope registers the background task before Expo mounts any UI.
const service = createTrackingService({
  platform: Platform.OS,
  isExpoGo: isRunningInExpoGo(),
  appState: AppState,
  location: Location,
  taskManager: TaskManager,
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  store,
});
export const {
  beginRun,
  pauseRecording,
  resumeRecording,
  finishRecording,
  discardRecording,
  saveRunNotes,
  initializeTracking,
  supportsBackgroundBuild,
} = service;
export function useTracking() {
  return useSyncExternalStore(
    service.subscribe,
    service.getTrackingSnapshot,
    service.getTrackingSnapshot,
  );
}
