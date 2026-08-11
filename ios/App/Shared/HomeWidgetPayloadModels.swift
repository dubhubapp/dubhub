import Foundation

/// Codable mirror of the stamped bridge payload + HomeWidgetPayload DTO.
/// Source of truth: shared/home-widget.ts + client home-widget-bridge.ts
///
/// schemaVersion 2 adds optional listener `releases` + `activeReleaseId`.
/// schemaVersion 1 single-release envelopes remain readable.

struct HomeWidgetBridgeEnvelope: Codable, Equatable {
    let schemaVersion: Int
    let accountUserId: String
    let writtenAt: String
    let dto: HomeWidgetDto
    /// Basename under ReleaseCountdownArtwork/ for the active release (compat).
    let artworkLocalFilename: String?
}

struct HomeWidgetDto: Codable, Equatable {
    let mode: String
    let eligibility: String
    let release: HomeWidgetReleaseDto?
    /// Listener multi-release collection (chronological). Absent in artist/empty.
    let releases: [HomeWidgetReleaseDto]?
    let activeReleaseId: String?
    let generatedAt: String
    let expiresAt: String
}

struct HomeWidgetReleaseDto: Codable, Equatable {
    let id: String
    let title: String
    let artistName: String
    let artworkUrl: String?
    /// Legacy ISO of release_date — compatibility only.
    let releaseDate: String
    let deepLink: String
    let countdownLabel: String
    let isOutNow: Bool
    /// Slice 4 — optional for older stamped payloads.
    let timingMode: String?
    let releaseCalendarDate: String?
    let releaseAt: String?
    /// Slice 5 — optional sticky announcement timestamp.
    let releaseAnnouncedAt: String?
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
        let version = envelope.schemaVersion
        guard version == HomeWidgetAppGroup.supportedSchemaVersion
            || version == HomeWidgetAppGroup.legacySchemaVersion
        else {
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
            if let releases = envelope.dto.releases {
                guard !releases.isEmpty else { return .invalid }
                for item in releases {
                    guard validateRelease(item) else { return .invalid }
                }
                guard releases.contains(where: { $0.id == release.id }) else {
                    return .invalid
                }
            }
            return .release(envelope)
        }

        return .invalid
    }

    /// Resolve the release currently shown: App Group active id → dto.activeReleaseId → dto.release.
    static func resolveActiveRelease(
        in envelope: HomeWidgetBridgeEnvelope,
        defaults: UserDefaults? = HomeWidgetAppGroup.userDefaults()
    ) -> HomeWidgetReleaseDto? {
        let collection = listenerCollection(in: envelope)
        let preferred =
            HomeWidgetAppGroup.readActiveReleaseId(defaults: defaults)
            ?? envelope.dto.activeReleaseId
            ?? envelope.dto.release?.id

        if let preferred,
           let match = collection.first(where: { $0.id == preferred }) {
            return match
        }
        return collection.first ?? envelope.dto.release
    }

    static func listenerCollection(
        in envelope: HomeWidgetBridgeEnvelope
    ) -> [HomeWidgetReleaseDto] {
        if let releases = envelope.dto.releases, !releases.isEmpty {
            return releases
        }
        if let release = envelope.dto.release {
            return [release]
        }
        return []
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
        guard !release.countdownLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }
        if let mode = release.timingMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            if mode == "exact" {
                guard let raw = release.releaseAt, parseISO8601(raw) != nil else {
                    return false
                }
            } else if mode == "midnight" {
                if let ymd = release.releaseCalendarDate?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !ymd.isEmpty {
                    // ok
                } else {
                    // Fall back to extracting from releaseDate later; still valid.
                }
            }
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

enum HomeWidgetPaging {
    enum Direction {
        case next
        case previous
    }

    /// Bounded paging within a release id list. Returns nil at edges / single item.
    static func page(
        releaseIds: [String],
        activeReleaseId: String?,
        direction: Direction
    ) -> String? {
        let ids = releaseIds
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard ids.count > 1 else { return nil }

        let active = activeReleaseId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let index = active.isEmpty ? 0 : (ids.firstIndex(of: active) ?? 0)
        switch direction {
        case .next:
            guard index < ids.count - 1 else { return nil }
            return ids[index + 1]
        case .previous:
            guard index > 0 else { return nil }
            return ids[index - 1]
        }
    }

    static func canGoPrevious(pageIndex: Int, pageCount: Int) -> Bool {
        pageCount > 1 && pageIndex > 0
    }

    static func canGoNext(pageIndex: Int, pageCount: Int) -> Bool {
        pageCount > 1 && pageIndex < pageCount - 1
    }
}
