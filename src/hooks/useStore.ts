import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "../data/store";

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
