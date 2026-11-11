# Stride

A simple iPhone running log with a daily calendar. Record runs, add them manually, or import them from Apple Health. Your records stay on your phone.

<img src="docs/Interface%20Preview.jpg" width="300" alt="Stride Today screen" />
<img src="docs/Calendar%20Preview.jpg" width="300" alt="Stride Calendar screen" />

## Features

- Easy, long, and interval runs with GPS distance, pace, time, routes, and splits.
- Weekly and monthly distance and average pace, plus a weekly goal.
- Multiple marathon countdowns with a race name, date, and location.
- Tap a calendar day to add a run with its type, distance, duration, and notes.
- Save future runs as planned. Completed runs count toward running totals.
- Simple weightlifting entries: Push, Pull, or Legs/Abs.
- Read-only Apple Health imports for running workouts.
- Kilometers or miles, local storage, and JSON backup export and restore.

The three tabs are Today, Calendar, and History. The calendar stays inside Stride. Weightlifting is a calendar entry only, with no exercise plans or set logging.

## Run locally

Install Node.js 22 or later and pnpm, then run:

```sh
pnpm install
pnpm start
```

Open the QR code in **Expo Go** on an iPhone connected to the same Wi-Fi. This is useful for trying the interface and foreground GPS recording. Apple Health and screen-locked recording require a local native build.

With Xcode installed and an iPhone connected:

```sh
pnpm ios:device
```

For a standalone local build that includes its JavaScript bundle:

```sh
pnpm exec expo run:ios --device --configuration Release
```

No App Store submission is needed. See [Phone Setup](docs/Phone%20Setup.md) for signing, permissions, and backups.

## Apple Health and WHOOP

In the installed iPhone app, open **Settings > Apple Health > Import runs**. Import or refresh to read running workouts that Health makes available. Stride imports dates, active duration, source, and distance when present. GPS routes are not imported.

Repeated imports match the same Health workout by its identifier. Two devices can still create separate Health workouts for one run. Missing distance is shown as unavailable and does not affect mileage or average pace. Import is manual and read-only; Stride does not write to Health or mirror Health deletions.

WHOOP can share workouts with Apple Health. Enable that connection in WHOOP, then import accessible running workouts into Stride. This uses Health on the phone rather than a direct WHOOP account connection. [WHOOP setup](https://support.whoop.com/s/article/Apple-Health-Integration?language=en_US)

## Development

```sh
pnpm web          # Browser preview with separate storage
pnpm check        # Type checking, lint, and tests
pnpm bundle:ios   # Verify the iOS JavaScript bundle
```

The HealthKit module is in `modules/stride-health`. Its config plugin adds the HealthKit entitlement and read permission message. Native changes require rebuilding the iPhone app. [Expo local modules](https://docs.expo.dev/modules/get-started/)

## Engineering notes

- GPS accuracy, timestamp, and speed checks filter unreliable fixes. Pauses and long signal gaps separate route segments.
- Elapsed time comes from timestamp intervals rather than display timer ticks.
- Weekly totals start on Monday. Average pace uses total active duration divided by total distance, not the mean of each run's pace.
- Date-only calendar entries and marathon countdowns use local calendar days across daylight saving changes.
- Serialized local writes become visible only after persistence succeeds. Backups are validated before replacement, and older records remain compatible.
- A single versioned JSON snapshot keeps recovery simple. Each save also serializes historical routes, so large histories would benefit from a later SQLite migration.

There is no Stride account, server, analytics, or automatic cloud sync. Device backups follow iPhone settings. Native map backgrounds may contact the map provider.

## Current limits

Native iPhone compilation, Health permissions, and real-device GPS behavior still need device testing. JavaScript bundle checks and automated tests do not replace that testing.

Expo Go pauses recording when it goes into the background. A native build supports background location, but force-quitting or denied permissions can interrupt it. Test a short outdoor run before relying on it for a long one.

Deleting the app can remove its records. Export backups to Files. Expo Go, the native app, and the browser have separate storage.

See [Recruiter Notes](docs/Recruiter%20Notes.md) for a short demo and engineering discussion.
