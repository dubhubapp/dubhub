import Foundation

/// Codable mirror of the Phase 1/2 stamped bridge payload + HomeWidgetPayload DTO.
/// Source of truth for field names: shared/home-widget.ts + client home-widget-bridge.ts
///
/// `artworkLocalFilename` is a client/native enrichment (App Group file basename).
/// It is not part of the server DTO. schemaVersion stays 1 (optional additive field).

struct HomeWidgetBridgeEnvelope: Codable, Equatable {
    let schemaVersion: Int
    let accountUserId: String
    let writtenAt: String
    let dto: HomeWidgetDto
    /// Basename under ReleaseCountdownArtwork/ (e.g. active.jpg). Optional.
    let artworkLocalFilename: String?
}

struct HomeWidgetDto: Codable, Equatable {
    let mode: String
    let eligibility: String
    let release: HomeWidgetReleaseDto?
    let generatedAt: String
    let expiresAt: String
}

struct HomeWidgetReleaseDto: Codable, Equatable {
    let id: String
    let title: String
    let artistName: String
    let artworkUrl: String?
    let releaseDate: String
    let deepLink: String
    let countdownLabel: String
    let isOutNow: Bool
}

enum HomeWidgetPayloadLoadResult: Equatable {
    case release(HomeWidgetBridgeEnvelope)
    case empty
    case expired
    case invalid
}

enum HomeWidgetPayloadLoader {
    static func loadFromAppGroup(
        defaults: UserDefaults? = HomeWidgetAppGroup.userDefaults(),
        now: Date = Date()
    ) -> HomeWidgetPayloadLoadResult {
        guard let defaults else { return .empty }
        guard let raw = defaults.string(forKey: HomeWidgetAppGroup.payloadKey), !raw.isEmpty else {
            return .empty
        }
        return parse(jsonString: raw, now: now)
    }

    static func parse(jsonString: String, now: Date = Date()) -> HomeWidgetPayloadLoadResult {
        guard let data = jsonString.data(using: .utf8) else { return .invalid }
        return parse(data: data, now: now)
    }

    static func parse(data: Data, now: Date = Date()) -> HomeWidgetPayloadLoadResult {
        let decoder = JSONDecoder()
        guard let envelope = try? decoder.decode(HomeWidgetBridgeEnvelope.self, from: data) else {
            return .invalid
        }
        guard envelope.schemaVersion == HomeWidgetAppGroup.supportedSchemaVersion else {
            return .invalid
        }
        guard !envelope.accountUserId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .invalid
        }
        guard parseISO8601(envelope.writtenAt) != nil else { return .invalid }
        guard let expiresAt = parseISO8601(envelope.dto.expiresAt) else { return .invalid }
        guard parseISO8601(envelope.dto.generatedAt) != nil else { return .invalid }

        if now >= expiresAt {
            return .expired
        }

        let mode = envelope.dto.mode
        if mode == "empty" || mode == "unavailable" {
            return .empty
        }

        if mode == "artist" || mode == "listener" {
            guard let release = envelope.dto.release else { return .invalid }
            guard validateRelease(release) else { return .invalid }
            return .release(envelope)
        }

        return .invalid
    }

    static func validateRelease(_ release: HomeWidgetReleaseDto) -> Bool {
        let id = release.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return false }
        guard parseISO8601(release.releaseDate) != nil else { return false }
        guard let url = URL(string: release.deepLink),
              url.scheme?.lowercased() == "https",
              release.deepLink.contains("?release=")
        else {
            return false
        }
        // Null artwork is allowed. Invalid non-empty artwork URLs are ignored at render time
        // (music.note fallback); they do not invalidate the release payload.
        guard !release.countdownLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        return true
    }

    static func parseISO8601(_ value: String) -> Date? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: trimmed) {
            return date
        }
        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]
        return basic.date(from: trimmed)
    }
}
