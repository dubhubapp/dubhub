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
                deepLink: URL(string: "https://dubhub.uk/")!,
                releaseDateLabel: nil
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
        let entries = Self.buildEntries(load: load, now: now)
        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }

    /// Builds current + UTC-midnight boundary entries until expiresAt (inclusive horizon).
    static func buildEntries(
        load: HomeWidgetPayloadLoadResult,
        now: Date
    ) -> [ReleaseCountdownEntry] {
        switch load {
        case .empty, .invalid:
            return [ReleaseCountdownEntryFactory.makeEntry(from: load, at: now)]
        case .expired:
            return [ReleaseCountdownEntryFactory.makeEntry(from: .expired, at: now)]
        case .release(let envelope):
            guard let expiresAt = HomeWidgetPayloadLoader.parseISO8601(envelope.dto.expiresAt) else {
                return [ReleaseCountdownEntryFactory.makeEntry(from: .invalid, at: now)]
            }
            var entries: [ReleaseCountdownEntry] = [
                ReleaseCountdownEntryFactory.makeEntry(from: load, at: now),
            ]
            var cursor = HomeWidgetUtcCountdown.nextUtcMidnight(after: now)
            var guardCount = 0
            while cursor < expiresAt && guardCount < 4 {
                entries.append(ReleaseCountdownEntryFactory.makeEntry(from: load, at: cursor))
                cursor = HomeWidgetUtcCountdown.nextUtcMidnight(after: cursor)
                guardCount += 1
            }
            // Final refresh entry at expiry so the widget stops showing stale entitlement content.
            if expiresAt > now {
                entries.append(ReleaseCountdownEntry(date: expiresAt, state: .refresh))
            }
            return entries
        }
    }
}
