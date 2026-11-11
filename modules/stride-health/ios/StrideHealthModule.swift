import ExpoModulesCore
import HealthKit

public final class StrideHealthModule: Module {
  private let healthStore = HKHealthStore()

  public func definition() -> ModuleDefinition {
    Name("StrideHealth")

    AsyncFunction("isAvailable") {
      HKHealthStore.isHealthDataAvailable()
    }

    AsyncFunction("requestReadAuthorization") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject("HEALTH_UNAVAILABLE", "Apple Health is not available on this device.")
        return
      }
      let readTypes: Set<HKObjectType> = [
        HKObjectType.workoutType(),
        HKQuantityType(.distanceWalkingRunning)
      ]
      self.healthStore.requestAuthorization(toShare: [], read: readTypes) { completed, error in
        if let error {
          promise.reject(error)
        } else if completed {
          // HealthKit does not disclose whether read access was granted.
          promise.resolve()
        } else {
          promise.reject("HEALTH_AUTHORIZATION_INCOMPLETE", "Apple Health access could not be requested. Please try again.")
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("getRunningWorkouts") { (startedAfter: Double, endedBefore: Double, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.reject("HEALTH_UNAVAILABLE", "Apple Health is not available on this device.")
        return
      }
      guard startedAfter.isFinite, endedBefore.isFinite,
            startedAfter >= 0, endedBefore > startedAfter else {
        promise.reject("HEALTH_INVALID_DATES", "Choose a valid date range for your runs.")
        return
      }
      let start = Date(timeIntervalSince1970: startedAfter / 1000)
      let end = min(Date(timeIntervalSince1970: endedBefore / 1000), Date())
      guard start < end else {
        promise.resolve([] as [[String: Any]])
        return
      }
      let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
        HKQuery.predicateForWorkouts(with: .running),
        HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate, .strictEndDate])
      ])
      let query = HKSampleQuery(
        sampleType: HKObjectType.workoutType(),
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
      ) { _, samples, error in
        if let error {
          promise.reject(error)
          return
        }
        let runs: [[String: Any]] = (samples as? [HKWorkout] ?? []).map { workout in
          let distanceType = HKQuantityType(.distanceWalkingRunning)
          let quantity = workout.statistics(for: distanceType)?.sumQuantity() ?? workout.totalDistance
          let distance = quantity?.doubleValue(for: .meter())
          return [
            "id": workout.uuid.uuidString,
            "startedAt": workout.startDate.timeIntervalSince1970 * 1000,
            "endedAt": workout.endDate.timeIntervalSince1970 * 1000,
            "durationSeconds": workout.duration,
            "distanceMeters": distance.map { $0 as Any } ?? NSNull(),
            "sourceName": workout.sourceRevision.source.name
          ]
        }
        promise.resolve(runs)
      }
      self.healthStore.execute(query)
    }
  }
}
