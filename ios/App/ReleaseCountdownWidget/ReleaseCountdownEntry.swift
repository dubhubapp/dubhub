import Foundation
import UIKit
import WidgetKit

enum ReleaseCountdownDisplayState: Equatable {
    case release(
        title: String,
        artistName: String,
        /// Absolute App Group file path for cached artwork (preferred).
        artworkLocalPath: String?,
        /// Remote HTTPS URL — secondary only; WidgetKit AsyncImage is unreliable.
        artworkRemoteURL: URL?,
        countdownLabel: String,
        isOutNow: Bool,
        /// Secondary decoration only; never replaces countdown / Out now.
        announcementLabel: String?,
        deepLink: URL,
        releaseDateLabel: String?,
        /// Listener multi-release paging (iOS 17 medium). Zero when hidden.
        pageIndex: Int,
        pageCount: Int,
        /// Artist mode never pages even if count > 1.
        allowsPaging: Bool
    )
    case empty
    case refresh
}

struct ReleaseCountdownEntry: TimelineEntry {
    let date: Date
    let state: ReleaseCountdownDisplayState
}

enum ReleaseCountdownEntryFactory {
    static func makeEntry(
        from load: HomeWidgetPayloadLoadResult,
        at date: Date
    ) -> ReleaseCountdownEntry {
        switch load {
        case .empty, .invalid:
            return ReleaseCountdownEntry(date: date, state: .empty)
        case .expired:
            return ReleaseCountdownEntry(date: date, state: .refresh)
        case .release(let envelope):
            guard let release = HomeWidgetPayloadLoader.resolveActiveRelease(in: envelope) else {
                return ReleaseCountdownEntry(date: date, state: .empty)
            }

            let countdown = resolveCountdown(release: release, at: date)
            if countdown.isRetentionExpired {
                // Native Out-now retention ended — show empty without waiting for app refresh.
                return ReleaseCountdownEntry(date: date, state: .empty)
            }

            let localPath = resolveArtworkLocalPath(
                releaseId: release.id,
                envelopeFilename: envelope.artworkLocalFilename
            )

            let remoteURL: URL? = {
                guard let raw = release.artworkUrl?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !raw.isEmpty,
                      let url = URL(string: raw),
                      url.scheme?.lowercased() == "https"
                else {
                    return nil
                }
                return url
            }()

            let deepLink = URL(string: release.deepLink) ?? URL(string: "https://dubhub.uk/")!
            let dateLabel = resolveDateLabel(release: release, at: date)
            let announcementLabel = resolveAnnouncementLabel(
                release: release,
                isOutNow: countdown.isOutNow,
                isRetentionExpired: countdown.isRetentionExpired,
                at: date
            )

            let collection = HomeWidgetPayloadLoader.listenerCollection(in: envelope)
            let pageCount = collection.count
            let pageIndex = max(0, collection.firstIndex(where: { $0.id == release.id }) ?? 0)
            let allowsPaging =
                envelope.dto.mode == "listener" && pageCount > 1

            return ReleaseCountdownEntry(
                date: date,
                state: .release(
                    title: release.title,
                    artistName: release.artistName,
                    artworkLocalPath: localPath,
                    artworkRemoteURL: remoteURL,
                    countdownLabel: countdown.label,
                    isOutNow: countdown.isOutNow,
                    announcementLabel: announcementLabel,
                    deepLink: deepLink,
                    releaseDateLabel: dateLabel,
                    pageIndex: pageIndex,
                    pageCount: pageCount,
                    allowsPaging: allowsPaging
                )
            )
        }
    }

    private static func resolveArtworkLocalPath(
        releaseId: String,
        envelopeFilename: String?
    ) -> String? {
        let candidates: [String?] = [
            HomeWidgetAppGroup.artworkFilename(forReleaseId: releaseId),
            envelopeFilename,
            HomeWidgetAppGroup.activeArtworkFilename,
        ]
        for name in candidates {
            guard let fileURL = HomeWidgetAppGroup.artworkFileURL(filename: name),
                  FileManager.default.fileExists(atPath: fileURL.path)
            else {
                continue
            }
            return fileURL.path
        }
        return nil
    }

    private static func resolveCountdown(
        release: HomeWidgetReleaseDto,
        at date: Date
    ) -> (label: String, isOutNow: Bool, isRetentionExpired: Bool) {
        let modeRaw = release.timingMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if modeRaw == "exact", let rawAt = release.releaseAt, let at = HomeWidgetPayloadLoader.parseISO8601(rawAt) {
            if let live = HomeWidgetCountdown.countdown(
                mode: .exact,
                releaseCalendarDate: release.releaseCalendarDate,
                releaseAt: at,
                now: date
            ) {
                return (live.label, live.isOutNow, live.isRetentionExpired)
            }
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

        if let ymd,
           let live = HomeWidgetCountdown.countdown(
               mode: .midnight,
               releaseCalendarDate: ymd,
               releaseAt: nil,
               now: date
           ) {
            return (live.label, live.isOutNow, live.isRetentionExpired)
        }

        if let releaseDate = HomeWidgetPayloadLoader.parseISO8601(release.releaseDate),
           let legacy = HomeWidgetCountdown.legacyUtcCountdownLabel(releaseDate: releaseDate, now: date) {
            return (legacy.label, legacy.isOutNow, false)
        }

        return (release.countdownLabel, release.isOutNow, false)
    }

    /// Announcement is secondary only; suppressed at/after release boundary (Out now)
    /// and when Out-now retention has expired.
    private static func resolveAnnouncementLabel(
        release: HomeWidgetReleaseDto,
        isOutNow: Bool,
        isRetentionExpired: Bool,
        at date: Date
    ) -> String? {
        if isOutNow || isRetentionExpired { return nil }
        guard let raw = release.releaseAnnouncedAt,
              let announcedAt = HomeWidgetPayloadLoader.parseISO8601(raw)
        else {
            return nil
        }
        let freshUntil = announcedAt.addingTimeInterval(HomeWidgetCountdown.outNowRetentionHours * 3_600)
        guard date >= announcedAt, date < freshUntil else { return nil }
        return "Release announced"
    }

    private static func resolveDateLabel(
        release: HomeWidgetReleaseDto,
        at date: Date
    ) -> String? {
        let modeRaw = release.timingMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if modeRaw == "exact",
           let rawAt = release.releaseAt,
           let releaseAt = HomeWidgetPayloadLoader.parseISO8601(rawAt) {
            let datePart = releaseAt.formatted(
                Date.FormatStyle()
                    .month(.abbreviated)
                    .day()
                    .locale(.current)
            )
            let timePart = releaseAt.formatted(
                Date.FormatStyle()
                    .hour()
                    .minute()
                    .locale(.current)
            )
            return "\(datePart) · \(timePart)"
        }

        let ymd: String? = {
            if let y = release.releaseCalendarDate?.trimmingCharacters(in: .whitespacesAndNewlines),
               !y.isEmpty {
                return y
            }
            return nil
        }()
        if let ymd,
           let start = HomeWidgetCountdown.startOfCalendarDate(
               ymd: ymd,
               timeZone: .autoupdatingCurrent
           ) {
            return start.formatted(
                Date.FormatStyle()
                    .month(.abbreviated)
                    .day()
                    .year()
                    .locale(.current)
            )
        }
        return nil
    }
}

enum ReleaseCountdownArtworkImage {
    /// Prefer local App Group file; never block the timeline on network.
    static func load(localPath: String?) -> UIImage? {
        guard let localPath, !localPath.isEmpty else { return nil }
        return UIImage(contentsOfFile: localPath)
    }
}
