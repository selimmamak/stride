import type { UnitSystem } from "../types";
export const unitMeters = (unit: UnitSystem) =>
  unit === "mi" ? 1609.344 : 1000;
export const distanceLabel = (unit: UnitSystem) => unit;
export function formatDistance(meters: number, unit: UnitSystem) {
  return (Math.max(0, meters) / unitMeters(unit)).toFixed(2);
}
export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function formatPace(meters: number, ms: number, unit: UnitSystem) {
  if (meters < 10 || ms <= 0) return "-";
  const seconds = Math.round(ms / 1000 / (meters / unitMeters(unit)));
  if (!Number.isFinite(seconds)) return "-";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
