import Foundation

/// Shared App Group + WidgetKit constants for Release Countdown.
/// Keep in sync with TypeScript bridge schemaVersion = 2 (legacy 1 still readable).
enum HomeWidgetAppGroup {
    static let suiteName = "group.uk.dubhub.app"
    /// Native UserDefaults key for the stamped JSON bridge payload.
    static let payloadKey = "releaseCountdownPayload"
    /// Device-local active page (AppIntent paging). Survives timeline reloads.
    static let activeReleaseIdKey = "releaseCountdownActiveReleaseId"
    static let widgetKind = "ReleaseCountdown"
    static let supportedSchemaVersion = 2
    static let legacySchemaVersion = 1
    /// Directory inside the App Group container for widget artwork files.
    static let artworkDirectoryName = "ReleaseCountdownArtwork"
    /// Legacy single active artwork filename (schema v1).
    static let activeArtworkFilename = "active.jpg"

    static func userDefaults() -> UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    static func containerURL() -> URL? {
        FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        )
    }

    static func artworkDirectoryURL() -> URL? {
        guard let container = containerURL() else { return nil }
        return container.appendingPathComponent(artworkDirectoryName, isDirectory: true)
    }

    /// Safe basename for a release id (`<uuid>.jpg`). Rejects path traversal.
    static func artworkFilename(forReleaseId releaseId: String) -> String? {
        let trimmed = releaseId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.contains("/"),
              !trimmed.contains(".."),
              trimmed.count <= 64
        else {
            return nil
        }
        return "\(trimmed).jpg"
    }

    /// Absolute file URL for a basename under ReleaseCountdownArtwork/. Rejects path traversal.
    static func artworkFileURL(filename: String?) -> URL? {
        guard let filename = filename?.trimmingCharacters(in: .whitespacesAndNewlines),
              !filename.isEmpty,
              !filename.contains("/"),
              !filename.contains(".."),
              let directory = artworkDirectoryURL()
        else {
            return nil
        }
        return directory.appendingPathComponent(filename, isDirectory: false)
    }

    static func readActiveReleaseId(
        defaults: UserDefaults? = HomeWidgetAppGroup.userDefaults()
    ) -> String? {
        guard let raw = defaults?.string(forKey: activeReleaseIdKey) else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    static func writeActiveReleaseId(
        _ releaseId: String?,
        defaults: UserDefaults? = HomeWidgetAppGroup.userDefaults()
    ) {
        guard let defaults else { return }
        let trimmed = releaseId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty {
            defaults.removeObject(forKey: activeReleaseIdKey)
        } else {
            defaults.set(trimmed, forKey: activeReleaseIdKey)
        }
    }
}
