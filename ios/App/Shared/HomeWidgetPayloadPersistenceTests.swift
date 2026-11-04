import Foundation

/// Executable checks for last-known-good countdown payload retention.
/// Not part of the app target. Run with swiftc (see the node persistence test).

private let releaseId = "11111111-1111-4111-8111-111111111111"
private let utc = TimeZone(secondsFromGMT: 0)!
private var failures = 0

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if condition() { return }
    failures += 1
    fputs("FAIL \(message)\n", stderr)
}

private func requireDate(_ iso: String) -> Date {
    guard let date = HomeWidgetPayloadLoader.parseISO8601(iso) else {
        fputs("FAIL unparseable date \(iso)\n", stderr)
        exit(1)
    }
    return date
}

private func envelopeJSON(
    mode: String = "listener",
    eligibility: String = "eligible_listener_release",
    releaseJSON: String? = nil,
    expiresAt: String
) -> String {
    let release = releaseJSON ?? """
    {
      "id": "\(releaseId)",
      "title": "Night Bus",
      "artistName": "artist-one",
      "artworkUrl": null,
      "releaseDate": "2026-09-01T00:00:00Z",
      "deepLink": "https://dubhub.uk/?release=\(releaseId)",
      "countdownLabel": "STALE STAMP",
      "isOutNow": false,
      "timingMode": "midnight",
      "releaseCalendarDate": "2026-09-01",
      "releaseAt": null
    }
    """
    return """
    {
      "schemaVersion": 2,
      "accountUserId": "user-a",
      "writtenAt": "2026-08-01T12:00:00Z",
      "artworkLocalFilename": null,
      "dto": {
        "mode": "\(mode)",
        "eligibility": "\(eligibility)",
        "release": \(release),
        "generatedAt": "2026-08-01T12:00:00Z",
        "expiresAt": "\(expiresAt)"
      }
    }
    """
}

private func liveMidnight(at iso: String) -> HomeWidgetCountdown.Result? {
    HomeWidgetCountdown.countdown(
        mode: .midnight,
        releaseCalendarDate: "2026-09-01",
        releaseAt: nil,
        now: requireDate(iso),
        timeZone: utc
    )
}

private func assertUpcomingRelease(_ isoNow: String, expectedLabel: String, _ name: String) {
    let load = HomeWidgetPayloadLoader.parse(
        jsonString: envelopeJSON(expiresAt: "2026-08-03T12:00:00Z"),
        now: requireDate(isoNow)
    )
    guard case .release(let envelope) = load else {
        expect(false, "\(name): expected release load, got \(load)")
        return
    }
    expect(envelope.dto.release?.id == releaseId, "\(name): release id")
    let live = liveMidnight(at: isoNow)
    expect(live?.label == expectedLabel, "\(name): label \(live?.label ?? "nil") != \(expectedLabel)")
    expect(live?.isOutNow == false, "\(name): not out now")
    expect(live?.isRetentionExpired == false, "\(name): retention still open")
    expect(live?.label != "STALE STAMP", "\(name): recomputes from the release date")
}

@main
enum HomeWidgetPayloadPersistenceTestMain {
    static func main() {
        defer {
            if failures > 0 {
                fputs("\(failures) failed\n", stderr)
                exit(1)
            }
            print("home widget payload persistence tests passed")
        }

        let expiresAt = "2026-08-03T12:00:00Z"

        assertUpcomingRelease("2026-08-02T12:00:00Z", expectedLabel: "30 days", "before 48h")
        assertUpcomingRelease("2026-08-03T12:00:01Z", expectedLabel: "29 days", "just after expiresAt")
        assertUpcomingRelease("2026-08-10T12:00:00Z", expectedLabel: "22 days", "seven days after expiresAt")

        let onReleaseDay = HomeWidgetPayloadLoader.parse(
            jsonString: envelopeJSON(expiresAt: expiresAt),
            now: requireDate("2026-09-01T00:00:00Z")
        )
        guard case .release = onReleaseDay else {
            expect(false, "release day: payload still valid")
            return
        }
        let outNow = liveMidnight(at: "2026-09-01T00:00:00Z")
        expect(outNow?.isOutNow == true, "release day: Out now")
        expect(outNow?.label == "Out now", "release day: label")
        expect(outNow?.isRetentionExpired == false, "release day: inside retention")

        let afterRetention = liveMidnight(at: "2026-09-02T00:00:00Z")
        expect(afterRetention?.isRetentionExpired == true, "release+24h: retention ended")
        expect(afterRetention?.isOutNow == false, "release+24h: no longer Out now")

        let exactReleaseAt = "2026-09-01T15:00:00Z"
        let exactJSON = envelopeJSON(
            releaseJSON: """
            {
              "id": "\(releaseId)",
              "title": "Night Bus",
              "artistName": "artist-one",
              "artworkUrl": null,
              "releaseDate": "2026-09-01T00:00:00Z",
              "deepLink": "https://dubhub.uk/?release=\(releaseId)",
              "countdownLabel": "STALE STAMP",
              "isOutNow": false,
              "timingMode": "exact",
              "releaseCalendarDate": "2026-09-01",
              "releaseAt": "\(exactReleaseAt)"
            }
            """,
            expiresAt: expiresAt
        )
        let exactLoad = HomeWidgetPayloadLoader.parse(
            jsonString: exactJSON,
            now: requireDate(exactReleaseAt)
        )
        guard case .release = exactLoad else {
            expect(false, "exact release instant: payload still valid after freshness")
            return
        }
        let exactOutNow = HomeWidgetCountdown.countdown(
            mode: .exact,
            releaseCalendarDate: "2026-09-01",
            releaseAt: requireDate(exactReleaseAt),
            now: requireDate(exactReleaseAt),
            timeZone: utc
        )
        expect(exactOutNow?.isOutNow == true, "exact release instant: Out now")
        expect(exactOutNow?.isRetentionExpired == false, "exact release instant: inside retention")
        let exactEnded = HomeWidgetCountdown.countdown(
            mode: .exact,
            releaseCalendarDate: "2026-09-01",
            releaseAt: requireDate(exactReleaseAt),
            now: requireDate("2026-09-02T15:00:00Z"),
            timeZone: utc
        )
        expect(exactEnded?.isRetentionExpired == true, "exact release+24h: retention ended")

        let suite = "home-widget-payload-persistence-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let missing = HomeWidgetPayloadLoader.loadFromAppGroup(
            defaults: defaults,
            now: requireDate("2026-08-10T12:00:00Z")
        )
        guard case .empty(let missingEligibility) = missing else {
            expect(false, "missing payload: expected empty, got \(missing)")
            return
        }
        expect(missingEligibility == nil, "missing payload: no eligibility")

        defaults.set(
            envelopeJSON(expiresAt: expiresAt),
            forKey: HomeWidgetAppGroup.payloadKey
        )
        let stored = HomeWidgetPayloadLoader.loadFromAppGroup(
            defaults: defaults,
            now: requireDate("2026-08-10T12:00:00Z")
        )
        guard case .release = stored else {
            expect(false, "stored stale payload still loads as release")
            return
        }
        defaults.removeObject(forKey: HomeWidgetAppGroup.payloadKey)
        let cleared = HomeWidgetPayloadLoader.loadFromAppGroup(
            defaults: defaults,
            now: requireDate("2026-08-10T12:00:00Z")
        )
        guard case .empty(let clearedEligibility) = cleared else {
            expect(false, "explicit clear: expected empty, got \(cleared)")
            return
        }
        expect(clearedEligibility == nil, "explicit clear: no eligibility")
        defaults.removePersistentDomain(forName: suite)

        let emptyStamp = """
        {
          "schemaVersion": 2,
          "accountUserId": "user-a",
          "writtenAt": "2026-08-01T12:00:00Z",
          "dto": {
            "mode": "empty",
            "eligibility": "no_listener_selection",
            "release": null,
            "generatedAt": "2026-08-01T12:00:00Z",
            "expiresAt": "\(expiresAt)"
          }
        }
        """
        let emptyLoad = HomeWidgetPayloadLoader.parse(
            jsonString: emptyStamp,
            now: requireDate("2026-08-10T12:00:00Z")
        )
        guard case .empty(let emptyEligibility) = emptyLoad else {
            expect(false, "stamped empty after freshness: expected empty, got \(emptyLoad)")
            return
        }
        expect(emptyEligibility == "no_listener_selection", "stamped empty keeps eligibility")

        expect(
            HomeWidgetPayloadLoader.parse(jsonString: "{", now: Date()) == .invalid,
            "corrupt payload is invalid"
        )
        expect(
            HomeWidgetPayloadLoader.parse(
                jsonString: envelopeJSON(expiresAt: "not-a-date"),
                now: Date()
            ) == .invalid,
            "unparseable expiresAt is structural invalidity"
        )

        let freshNow = requireDate("2026-08-01T12:00:00Z")
        let freshExpires = requireDate("2026-08-01T13:00:00Z")
        let releaseAt = requireDate("2026-08-01T18:00:00Z")
        let horizon = HomeWidgetCountdown.scheduleHorizon(
            mode: .exact,
            releaseCalendarDate: "2026-08-01",
            releaseAt: releaseAt,
            now: freshNow,
            timeZone: utc
        )
        let planned = HomeWidgetCountdown.timelineChangeDates(
            mode: .exact,
            releaseCalendarDate: "2026-08-01",
            releaseAt: releaseAt,
            now: freshNow,
            until: horizon,
            timeZone: utc
        )
        expect(planned.truncated == false, "short countdown is not truncated")
        expect(planned.dates.contains(releaseAt), "timeline includes the release instant after expiresAt")
        expect(
            planned.dates.contains(releaseAt.addingTimeInterval(24 * 3_600)),
            "timeline includes Out-now retention end"
        )
        let freshHint = HomeWidgetTimelinePolicy.reloadHint(
            truncated: planned.truncated,
            lastScheduledDate: planned.dates.last,
            payloadExpiresAt: freshExpires,
            now: freshNow
        )
        expect(freshHint == .after(freshExpires), "future expiresAt is a reload hint only")

        let staleNow = requireDate("2026-08-10T12:00:00Z")
        let staleExpires = requireDate(expiresAt)
        let longHorizon = HomeWidgetCountdown.scheduleHorizon(
            mode: .midnight,
            releaseCalendarDate: "2026-09-01",
            releaseAt: nil,
            now: requireDate("2026-08-01T12:00:00Z"),
            timeZone: utc
        )
        let longPlan = HomeWidgetCountdown.timelineChangeDates(
            mode: .midnight,
            releaseCalendarDate: "2026-09-01",
            releaseAt: nil,
            now: requireDate("2026-08-01T12:00:00Z"),
            until: longHorizon,
            timeZone: utc
        )
        expect(
            longPlan.dates.contains(where: { $0 > staleExpires }),
            "countdown entries continue after the 48h hint"
        )
        let reloaded = HomeWidgetPayloadLoader.parse(
            jsonString: envelopeJSON(expiresAt: expiresAt),
            now: staleNow
        )
        guard case .release = reloaded else {
            expect(false, "reload after expiresAt still reads the release")
            return
        }
        let reloadHint = HomeWidgetTimelinePolicy.reloadHint(
            truncated: false,
            lastScheduledDate: nil,
            payloadExpiresAt: staleExpires,
            now: staleNow
        )
        expect(reloadHint == .atEnd, "past expiresAt does not schedule a refresh card")
    }
}
