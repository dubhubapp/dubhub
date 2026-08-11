import Foundation
import Capacitor
import WidgetKit

/**
 * Capacitor bridge for Release Countdown App Group storage + WidgetKit reload.
 * JS name: HomeWidgetBridge
 *
 * On write: validates payload, caches artwork into the App Group (best-effort),
 * stores enriched JSON with artworkLocalFilename, persists activeReleaseId,
 * reloads timelines.
 */
@objc(HomeWidgetBridgePlugin)
public class HomeWidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HomeWidgetBridge"
    public let jsName = "HomeWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isHomeWidgetBridgeAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeHomeWidgetPayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearHomeWidgetPayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadHomeWidgetTimelines", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readActiveReleaseId", returnType: CAPPluginReturnPromise),
    ]

    @objc func isHomeWidgetBridgeAvailable(_ call: CAPPluginCall) {
        let available =
            HomeWidgetAppGroup.userDefaults() != nil
            && HomeWidgetAppGroup.containerURL() != nil
        call.resolve(["available": available])
    }

    @objc func writeHomeWidgetPayload(_ call: CAPPluginCall) {
        guard HomeWidgetAppGroup.userDefaults() != nil else {
            call.reject("App Group UserDefaults unavailable")
            return
        }
        guard var payload = call.getObject("payload") else {
            call.reject("payload is required")
            return
        }
        do {
            let data = try JSONSerialization.data(withJSONObject: payload, options: [])
            let load = HomeWidgetPayloadLoader.parse(data: data, now: Date())
            switch load {
            case .invalid:
                call.reject("Invalid home widget bridge payload")
                return
            case .empty, .expired, .release:
                break
            }

            let artworkItems = Self.extractArtworkItems(from: payload)
            let activeId = Self.extractActiveReleaseId(from: payload)

            HomeWidgetArtworkCache.syncArtwork(
                releases: artworkItems,
                activeReleaseId: activeId
            ) { filename in
                if let filename {
                    payload["artworkLocalFilename"] = filename
                } else {
                    payload["artworkLocalFilename"] = NSNull()
                }
                do {
                    let enriched = try JSONSerialization.data(withJSONObject: payload, options: [])
                    guard let json = String(data: enriched, encoding: .utf8) else {
                        call.reject("Failed to encode payload as UTF-8 JSON")
                        return
                    }
                    guard let defaults = HomeWidgetAppGroup.userDefaults() else {
                        call.reject("App Group UserDefaults unavailable")
                        return
                    }
                    defaults.set(json, forKey: HomeWidgetAppGroup.payloadKey)
                    // Stamped dto.activeReleaseId is authoritative after app refresh/select.
                    // Widget AppIntent paging updates the active key between refreshes;
                    // JS syncs that key → localStorage before the next fetch.
                    HomeWidgetAppGroup.writeActiveReleaseId(activeId, defaults: defaults)
                    self.reloadWidgetTimelines()
                    var result: [String: Any] = ["ok": true]
                    result["artworkLocalFilename"] = filename ?? NSNull()
                    result["activeReleaseId"] = activeId ?? NSNull()
                    call.resolve(result)
                } catch {
                    call.reject("Failed to serialise payload: \(error.localizedDescription)")
                }
            }
        } catch {
            call.reject("Failed to serialise payload: \(error.localizedDescription)")
        }
    }

    @objc func clearHomeWidgetPayload(_ call: CAPPluginCall) {
        guard let defaults = HomeWidgetAppGroup.userDefaults() else {
            call.reject("App Group UserDefaults unavailable")
            return
        }
        defaults.removeObject(forKey: HomeWidgetAppGroup.payloadKey)
        HomeWidgetAppGroup.writeActiveReleaseId(nil, defaults: defaults)
        HomeWidgetArtworkCache.clearAll()
        reloadWidgetTimelines()
        call.resolve(["ok": true])
    }

    @objc func reloadHomeWidgetTimelines(_ call: CAPPluginCall) {
        reloadWidgetTimelines()
        call.resolve(["ok": true])
    }

    @objc func readActiveReleaseId(_ call: CAPPluginCall) {
        let id = HomeWidgetAppGroup.readActiveReleaseId()
        call.resolve(["activeReleaseId": id ?? NSNull()])
    }

    private func reloadWidgetTimelines() {
        WidgetCenter.shared.reloadTimelines(ofKind: HomeWidgetAppGroup.widgetKind)
    }

    private static func extractActiveReleaseId(from payload: [String: Any]) -> String? {
        guard let dto = payload["dto"] as? [String: Any] else { return nil }
        if let active = dto["activeReleaseId"] as? String {
            let trimmed = active.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        if let release = dto["release"] as? [String: Any],
           let id = release["id"] as? String {
            let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return nil
    }

    private static func extractArtworkItems(
        from payload: [String: Any]
    ) -> [(id: String, artworkUrl: String?)] {
        guard let dto = payload["dto"] as? [String: Any] else { return [] }
        if let releases = dto["releases"] as? [[String: Any]], !releases.isEmpty {
            return releases.compactMap { item in
                guard let id = item["id"] as? String else { return nil }
                let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return nil }
                let url = item["artworkUrl"] as? String
                return (id: trimmed, artworkUrl: url)
            }
        }
        if let release = dto["release"] as? [String: Any],
           let id = release["id"] as? String {
            let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return [] }
            return [(id: trimmed, artworkUrl: release["artworkUrl"] as? String)]
        }
        return []
    }
}
