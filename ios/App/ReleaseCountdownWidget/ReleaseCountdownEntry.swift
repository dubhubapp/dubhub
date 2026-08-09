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
        deepLink: URL,
        releaseDateLabel: String?
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
            guard let release = envelope.dto.release else {
                return ReleaseCountdownEntry(date: date, state: .empty)
            }
            let releaseDate = HomeWidgetPayloadLoader.parseISO8601(release.releaseDate)
            let countdown: (label: String, isOutNow: Bool)
            if let releaseDate,
               let computed = HomeWidgetUtcCountdown.countdownLabel(releaseDate: releaseDate, now: date) {
                countdown = computed
            } else {
                countdown = (release.countdownLabel, release.isOutNow)
            }

            let localPath: String? = {
                guard let fileURL = HomeWidgetAppGroup.artworkFileURL(
                    filename: envelope.artworkLocalFilename
                ) else {
                    return nil
                }
                guard FileManager.default.fileExists(atPath: fileURL.path) else {
                    return nil
                }
                return fileURL.path
            }()

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
            let dateLabel: String? = {
                guard let releaseDate else { return nil }
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = TimeZone(secondsFromGMT: 0)
                formatter.dateFormat = "MMM d, yyyy"
                return formatter.string(from: releaseDate)
            }()
            return ReleaseCountdownEntry(
                date: date,
                state: .release(
                    title: release.title,
                    artistName: release.artistName,
                    artworkLocalPath: localPath,
                    artworkRemoteURL: remoteURL,
                    countdownLabel: countdown.label,
                    isOutNow: countdown.isOutNow,
                    deepLink: deepLink,
                    releaseDateLabel: dateLabel
                )
            )
        }
    }
}

enum ReleaseCountdownArtworkImage {
    /// Prefer local App Group file; never block the timeline on network.
    static func load(localPath: String?) -> UIImage? {
        guard let localPath, !localPath.isEmpty else { return nil }
        return UIImage(contentsOfFile: localPath)
    }
}
