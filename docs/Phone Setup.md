# Run Stride on your iPhone

Stride runs locally without an App Store listing or a Stride account.

## Try the interface

1. Install **Expo Go** on your iPhone.
2. Connect your Mac and iPhone to the same Wi-Fi.
3. In the project folder, with Node.js and pnpm installed, run:

   ```sh
   pnpm install
   pnpm exec expo start --go --lan
   ```

4. Scan the QR code with your iPhone Camera and open it in Expo Go.
5. Allow Precise Location when you start a run.

Expo Go can test the interface and record while the app stays open. It cannot load Stride's Apple Health module or provide this project's background location recording. [Expo native code limits](https://docs.expo.dev/workflow/customizing/)

If the QR code does not connect, check that both devices use the same network and Expo Go has Local Network permission. Keep the Mac awake and Terminal running. Some shared Wi-Fi networks block connections between devices.

## Install the local iPhone app

1. Install Xcode, open it, and finish installing its platform components.
2. Add your Apple Account in Xcode Settings. Connect your iPhone by cable, trust the Mac, and enable Developer Mode if prompted.
3. Run:

   ```sh
   pnpm ios:device
   ```

4. Select the connected iPhone. If signing needs setup, open the generated iOS workspace in Xcode and select your team under Signing & Capabilities.
5. Open Stride and allow the requested location permissions if you want GPS recording.

This builds locally. The development build still needs the Mac's development server. To include the JavaScript bundle and open Stride away from your Mac, use:

```sh
pnpm exec expo run:ios --device --configuration Release
```

No App Store submission is required. Apple's free Personal Team profiles expire after seven days, so rebuild and reinstall periodically. HealthKit is listed as supported for a free Apple Developer account. [Personal Team limits](https://developer.apple.com/help/account/basics/about-your-developer-account#enable-a-personal-team-in-xcode), [supported capabilities](https://developer.apple.com/help/account/reference/supported-capabilities-ios/)

## Add your activities

- **Today:** Start a GPS run, view weekly and monthly running statistics, or add a marathon countdown.
- **Calendar:** Tap a day and choose **Add run**. Enter its type, distance, duration, and notes. Save it as completed or planned.
- **Weightlifting:** From the selected day, choose **Add lifting**, then Push, Pull, or Legs/Abs. This is a simple calendar entry.
- **History:** Review completed runs and their details.

Planned runs do not count toward mileage. Marathon countdowns show calendar days until the race date, without assuming a start time.

## Import Apple Health runs

1. Use the locally installed iPhone build.
2. Open **Settings > Apple Health > Import runs**.
3. Tap **Import or refresh runs** and allow access to Workouts and Walking + Running Distance.
4. Check Calendar or History for imported runs.

Import reads running workouts only. It keeps the date, active duration, source, and available distance. It does not import GPS routes or write anything to Health. Refreshing the same Health identifier updates the existing run instead of adding another copy. Notes stay intact.

If no runs appear, check the workouts and Stride's permissions in the Health app. Apple does not tell an app whether read access was denied, and access can be limited to recent data. [Health permissions](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)

Runs without distance retain their time, but do not change mileage or average pace. Workouts deleted from Health are not automatically deleted from Stride. A run deleted only from Stride can return on the next import.

## Bring runs from WHOOP

In WHOOP, open **More > App Settings > Integrations > Apple Health** and connect. Allow WHOOP to share workouts. Once a running workout appears in Apple Health, import it in Stride. Available distance depends on what the source supplied. [WHOOP integration guide](https://support.whoop.com/s/article/Apple-Health-Integration?language=en_US)

Multiple devices or apps can write separate workouts for one run. Use one recording source if you want to avoid those duplicates. Stride deduplicates matching Health identifiers, not separate recordings.

## Keep records safe

Use **Settings > Export backup** and save a copy in **Files > On My iPhone**. Restoring a backup replaces the app's current data after confirmation. Finish or discard an active run first.

Deleting the app can remove its records. Expo Go, a native build, and the browser each have separate storage. Use backup export and restore to move records. Phone backups follow iPhone settings; Stride does not provide its own cloud sync.

## Device testing

The native build and Apple Health access have not yet been tested on a physical iPhone. Before relying on the app, import a known run and record a short route with the screen locked. Check the distance, duration, pause behavior, and reopening recovery.

Do not force-quit during recording. Background GPS depends on iOS and location permissions. [Expo background location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
