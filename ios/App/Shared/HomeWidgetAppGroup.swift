import Foundation

/// Shared App Group + WidgetKit constants for Release Countdown.
/// Keep in sync with TypeScript bridge schemaVersion = 1.
enum HomeWidgetAppGroup {
    static let suiteName = "group.uk.dubhub.app"
    /// Native UserDefaults key for the stamped JSON bridge payload.
    static let payloadKey = "releaseCountdownPayload"
    static let widgetKind = "ReleaseCountdown"
    static let supportedSchemaVersion = 1
    /// Directory inside the App Group container for widget artwork files.
    static let artworkDirectoryName = "ReleaseCountdownArtwork"
    /// Single active artwork filename (launch: one Countdown selection).
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
}
