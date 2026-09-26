import Foundation
import Capacitor
import StoreKit
import UIKit

/**
 * In-app StoreKit review request. JS name: DubHubAppStoreReview.
 * iOS 16+ uses AppStore.requestReview(in:). iOS 15 uses SKStoreReviewController.requestReview(in:).
 */
@objc(DubHubAppStoreReviewPlugin)
public class DubHubAppStoreReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DubHubAppStoreReview"
    public let jsName = "DubHubAppStoreReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scene = self.bridge?.viewController?.view.window?.windowScene
                ?? Self.activeWindowScene()
            guard let scene else {
                call.reject("No UIWindowScene")
                return
            }
            NSLog("[DubHub Review] native request invoked")
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview(in: scene)
            }
            call.resolve(["invoked": true])
        }
    }

    private static func activeWindowScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    }
}
