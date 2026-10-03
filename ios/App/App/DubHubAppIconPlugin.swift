import Foundation
import Capacitor
import UIKit

/**
 * Alternate app icons. JS name: DubHubAppIcon.
 * Knows bundled icon names and the active icon only. No entitlement checks.
 */
@objc(DubHubAppIconPlugin)
public class DubHubAppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DubHubAppIcon"
    public let jsName = "DubHubAppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAppIconState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAlternateIcon", returnType: CAPPluginReturnPromise),
    ]

    /// Must match ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES. Not the primary AppIcon set.
    private static let bundledAlternateNames: Set<String> = [
        "DubHubIconLight",
        "DubHubIconOG",
        "DubHubIconOGDark",
        "DubHubIconClean",
        "DubHubIconCleanDark",
        "DubHubIconBlue",
        "DubHubIconWordmark",
    ]

    @objc func getAppIconState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(Self.currentState())
        }
    }

    @objc func setAlternateIcon(_ call: CAPPluginCall) {
        let requested: String?
        switch Self.requestedName(from: call) {
        case .failure(let message):
            call.reject(message)
            return
        case .success(let name):
            requested = name
        }

        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else {
                call.reject("Alternate app icons are not supported")
                return
            }
            app.setAlternateIconName(requested) { error in
                DispatchQueue.main.async {
                    if let error {
                        let nsError = error as NSError
                        NSLog(
                            "[DubHub][AppIcon] setAlternateIcon failed domain=%@ code=%ld %@",
                            nsError.domain,
                            nsError.code,
                            error.localizedDescription
                        )
                        call.reject(
                            error.localizedDescription,
                            "\(nsError.domain) \(nsError.code)",
                            error
                        )
                        return
                    }
                    call.resolve(Self.currentState())
                }
            }
        }
    }

    private static func currentState() -> [String: Any] {
        let app = UIApplication.shared
        var state: [String: Any] = [
            "supportsAlternateIcons": app.supportsAlternateIcons,
        ]
        if let name = app.alternateIconName {
            state["alternateIconName"] = name
        } else {
            state["alternateIconName"] = NSNull()
        }
        return state
    }

    private enum NameRequest {
        case success(String?)
        case failure(String)
    }

    /// `name: null` restores the primary icon. Any other string must be a bundled alternate.
    private static func requestedName(from call: CAPPluginCall) -> NameRequest {
        guard call.options.keys.contains("name") else {
            return .failure("Missing icon name")
        }
        let value = call.options["name"]
        if value == nil || value is NSNull {
            return .success(nil)
        }
        guard let name = value as? String else {
            return .failure("Invalid icon name")
        }
        guard bundledAlternateNames.contains(name) else {
            return .failure("Unknown alternate icon name")
        }
        return .success(name)
    }
}
