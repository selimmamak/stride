# Talking about Stride

## The project in thirty seconds

Stride is a personal iPhone running log with a simple daily calendar. It records GPS runs, accepts manual run details, imports running workouts from Apple Health, and shows weekly and monthly progress. Marathon countdowns and basic Push, Pull, or Legs/Abs calendar entries keep the interface focused. Records stay on the phone.

## A short demo

1. Open Today and explain distance, average pace, and marathon countdowns.
2. Select a calendar day. Add a completed run with distance and duration, then show the updated totals.
3. Add a future planned run and show that it does not change recorded mileage.
4. Add a Push, Pull, or Legs/Abs entry.
5. In a native iPhone build, import a known Health run twice to demonstrate identifier-based deduplication.
6. Reopen the app and export a backup to demonstrate persistence and portability.

## Engineering decisions

- **GPS filtering:** Accuracy, speed, and timestamp checks reject unreliable fixes. Pause and resume keep route segments separate.
- **Timekeeping:** Recorded intervals measure active duration independently of screen updates.
- **Local dates:** Calendar dates and countdowns avoid UTC parsing shifts and daylight saving errors.
- **Weighted pace:** Total active time divided by distance gives the period's average pace. Planned runs and missing-distance imports do not distort it.
- **Native integration:** A small Swift Expo module reads running workouts from HealthKit. JavaScript handles validation and durable import.
- **Idempotent imports:** Health identifiers prevent repeat imports. Separate recordings from different devices remain separate, avoiding guesses that could merge distinct runs.
- **Durable storage:** Serialized writes prevent concurrent updates from overwriting each other. Failed writes preserve the last saved state.
- **Migration:** Versioned backup validation retains older records as the interface changes.

## Tradeoffs and validation

Local storage avoids a server and account system, but users must maintain backups. A single JSON snapshot simplifies recovery while making writes more expensive as route history grows. SQLite is a reasonable later improvement.

Automated tests cover calculations, imports, date boundaries, validation, state transitions, and storage failures. JavaScript bundle checks do not prove native compilation or physical-device behavior. Health permissions and background GPS still need real iPhone testing.

For a resume, describe only features and measurements you can explain and demonstrate. Useful future measurements include distance against a known route, battery use, large-history startup time, and interruption recovery.
