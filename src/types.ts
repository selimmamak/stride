export type RunKind = "easy" | "long" | "interval";
export type UnitSystem = "km" | "mi";
export type WeightUnit = "kg" | "lb";
export type IntervalPlan = {
  warmupSeconds: number;
  workSeconds: number;
  restSeconds: number;
  repeats: number;
  cooldownSeconds: number;
};
export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
  altitude?: number | null;
  segment: number;
};
export type RunInterval = { start: number; end: number | null };
export type RunSource = {
  kind: "manual" | "apple-health";
  externalId?: string;
  name?: string;
};
export type Run = {
  id: string;
  kind: RunKind;
  startedAt: number;
  endedAt: number | null;
  status: "running" | "paused" | "completed";
  distanceMeters: number;
  points: TrackPoint[];
  intervals: RunInterval[];
  intervalPlan?: IntervalPlan;
  notes: string;
  trackingMode: "foreground" | "background";
  lastAcceptedAt: number | null;
  segment: number;
  source?: RunSource;
  distanceUnavailable?: boolean;
};
export type PlanExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  restSeconds: number;
};
export type WorkoutPlan = {
  id: string;
  name: string;
  exercises: PlanExercise[];
  createdAt: number;
  updatedAt: number;
};
export type WorkoutSet = {
  id: string;
  reps: number;
  weight: number;
  completed: boolean;
};
export type WorkoutExercise = {
  id: string;
  name: string;
  restSeconds: number;
  sets: WorkoutSet[];
};
export type WorkoutSession = {
  id: string;
  planId: string | null;
  name: string;
  startedAt: number;
  endedAt: number | null;
  weightUnit: WeightUnit;
  exercises: WorkoutExercise[];
  notes: string;
  restEndsAt?: number | null;
};
export type Settings = {
  distanceUnit: UnitSystem;
  weightUnit: WeightUnit;
  weeklyGoalKm: number;
};
export type Marathon = {
  id: string;
  name: string;
  location: string;
  date: string;
};
export type CalendarEntry = {
  id: string;
  title: string;
  date: string;
  kind: RunKind | "weightlifting" | "rest";
  notes: string;
  completed: boolean;
  liftType?: "push" | "pull" | "legs";
  distanceMeters?: number;
  durationMinutes?: number;
};
export type AppData = {
  version: 1;
  runs: Run[];
  plans: WorkoutPlan[];
  workouts: WorkoutSession[];
  marathons: Marathon[];
  calendarEntries: CalendarEntry[];
  activeRun: Run | null;
  activeWorkout: WorkoutSession | null;
  settings: Settings;
};
