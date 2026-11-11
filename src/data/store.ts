import AsyncStorage from "@react-native-async-storage/async-storage";
import { createStore } from "./storeCore";

const store = createStore(AsyncStorage);
export const {
  getSnapshot,
  subscribe,
  hydrateStore,
  updateData,
  exportData,
  importData,
} = store;
export function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 8)}`;
}
