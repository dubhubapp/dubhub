import Foundation
import WidgetKit

struct ReleaseCountdownProvider: TimelineProvider {
    func placeholder(in context: Context) -> ReleaseCountdownEntry {
        ReleaseCountdownEntry(
            date: Date(),
            state: .release(
                title: "Release title",
                artistName: "Artist",
                artworkLocalPath: nil,
                artworkRemoteURL: nil,
                countdownLabel: "5 days",
                isOutNow: false,
                announcementLabel: nil,
                deepLink: URL(string: "https://dubhub.uk/")!,
                releaseDateLabel: nil,
                pageIndex: 0,
                pageCount: 1,
                allowsPaging: false
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ReleaseCountdownEntry) -> Void) {
        let load = HomeWidgetPayloadLoader.loadFromAppGroup()
        completion(ReleaseCountdownEntryFactory.makeEntry(from: load, at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ReleaseCountdownEntry>) -> Void) {
        let now = Date()
        let load = HomeWidgetPayloadLoader.loadFromAppGroup(now: now)
        let built = Self.buildTimeline(load: load, now: now)
        completion(built)
    }

    /// Builds entries at label-change boundaries until expiresAt, then a refresh entry.
    /// When the rolling 96-entry cap truncates final-24h buckets, reload via `.after`
    /// at the last scheduled entry (does not silently freeze mid-countdown).
    static func buildTimeline(
        load: HomeWidgetPayloadLoadResult,
        now: Date
    ) -> Timeline<ReleaseCountdownEntry> {
        switch load {
        case .empty, .invalid:
            return Timeline(
                entries: [ReleaseCountdownEntryFactory.makeEntry(from: load, at: now)],
                policy: .atEnd
            )
        case .expired:
            return Timeline(
                entries: [ReleaseCountdownEntryFactory.makeEntry(from: .expired, at: now)],
                policy: .atEnd
            )
        case .release(let envelope):
            guard let expiresAt = HomeWidgetPayloadLoader.parseISO8601(envelope.dto.expiresAt) else {
                return Timeline(
                    entries: [ReleaseCountdownEntryFactory.makeEntry(from: .invalid, at: now)],
                    policy: .atEnd
                )
            }
            guard let release = HomeWidgetPayloadLoader.resolveActiveRelease(in: envelope) else {
                return Timeline(
                    entries: [ReleaseCountdownEntryFactory.makeEntry(from: .empty, at: now)],
                    policy: .atEnd
                )
            }

            let planned = timelineDates(release: release, now: now, expiresAt: expiresAt)
            var entries = planned.dates.map { date in
                ReleaseCountdownEntryFactory.makeEntry(from: load, at: date)
            }
            if !planned.truncated, expiresAt > now {
                entries.append(ReleaseCountdownEntry(date: expiresAt, state: .refresh))
            }

            let policy: TimelineReloadPolicy
            if planned.truncated, let last = entries.last {
                // Reload when the rolling window ends so the next 5-minute buckets appear.
                policy = .after(last.date)
            } else {
                policy = .atEnd
            }
            return Timeline(entries: entries, policy: policy)
        }
    }

    /// Test / compatibility wrapper — entries only (policy discarded).
    static func buildEntries(
        load: HomeWidgetPayloadLoadResult,
        now: Date
    ) -> [ReleaseCountdownEntry] {
        buildTimeline(load: load, now: now).entries
    }

    private static func timelineDates(
        release: HomeWidgetReleaseDto,
        now: Date,
        expiresAt: Date
    ) -> HomeWidgetCountdown.TimelineDates {
        let modeRaw = release.timingMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if modeRaw == "exact",
           let rawAt = release.releaseAt,
           let at = HomeWidgetPayloadLoader.parseISO8601(rawAt) {
            let announcementExpiresAt = Self.announcementExpiryIfUseful(
                release: release,
                releaseBoundary: at,
                now: now
            )
            return HomeWidgetCountdown.timelineChangeDates(
                mode: .exact,
                releaseCalendarDate: release.releaseCalendarDate,
                releaseAt: at,
                now: now,
                expiresAt: expiresAt,
                announcementExpiresAt: announcementExpiresAt
            )
        }

        let ymd: String? = {
            if let y = release.releaseCalendarDate?.trimmingCharacters(in: .whitespacesAndNewlines),
               !y.isEmpty {
                return y
            }
            guard let releaseDate = HomeWidgetPayloadLoader.parseISO8601(release.releaseDate) else {
                return nil
            }
            var utc = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(secondsFromGMT: 0)!
            let c = utc.dateComponents([.year, .month, .day], from: releaseDate)
            return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        }()

        if let ymd {
            let boundary = HomeWidgetCountdown.startOfCalendarDate(
                ymd: ymd,
                timeZone: .autoupdatingCurrent
            )
            let announcementExpiresAt = Self.announcementExpiryIfUseful(
                release: release,
                releaseBoundary: boundary,
                now: now
            )
            return HomeWidgetCountdown.timelineChangeDates(
                mode: .midnight,
                releaseCalendarDate: ymd,
                releaseAt: nil,
                now: now,
                expiresAt: expiresAt,
                announcementExpiresAt: announcementExpiresAt
            )
        }

        // Legacy fallback: a few UTC midnights.
        var dates: [Date] = [now]
        var cursor = HomeWidgetCountdownLegacyNextUtc.midnight(after: now)
        var guardCount = 0
        while cursor < expiresAt && guardCount < 4 {
            dates.append(cursor)
            cursor = HomeWidgetCountdownLegacyNextUtc.midnight(after: cursor)
            guardCount += 1
        }
        return HomeWidgetCountdown.TimelineDates(dates: dates, truncated: false)
    }

    /// Schedule announcement decoration expiry only while still pre-boundary.
    private static func announcementExpiryIfUseful(
        release: HomeWidgetReleaseDto,
        releaseBoundary: Date?,
        now: Date
    ) -> Date? {
        guard let raw = release.releaseAnnouncedAt,
              let announced = HomeWidgetPayloadLoader.parseISO8601(raw)
        else {
            return nil
        }
        let end = announced.addingTimeInterval(HomeWidgetCountdown.outNowRetentionHours * 3_600)
        guard end > now else { return nil }
        if let boundary = releaseBoundary, end >= boundary {
            // Out now already suppresses decoration; no need for a separate entry.
            return nil
        }
        return end
    }
}

private enum HomeWidgetCountdownLegacyNextUtc {
    static func midnight(after now: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let start = calendar.startOfDay(for: now)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? now.addingTimeInterval(86_400)
    }
}
