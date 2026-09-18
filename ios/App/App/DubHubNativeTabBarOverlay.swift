import UIKit
import WebKit
import Capacitor

/// Native-navigation feature flag for LG-NAV-*.
///
/// DEBUG: missing key defaults ON. Explicit `true` / `false` in UserDefaults is respected.
/// Non-DEBUG: missing key remains OFF (current production-safe behaviour).
enum DubHubNativeNavigationFlag {
    static let userDefaultsKey = "dubhub.nativeNavigation.enabled"

    static var isEnabled: Bool {
        let defaults = UserDefaults.standard
#if DEBUG
        if defaults.object(forKey: userDefaultsKey) == nil {
            return true
        }
#endif
        return defaults.bool(forKey: userDefaultsKey)
    }
}

/// Capacitor bridge for native tab presentation. React owns routes; Swift only shows IDs.
@objc(DubHubNativeNavigationPlugin)
public class DubHubNativeNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DubHubNativeNavigation"
    public let jsName = "DubHubNativeNavigation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPresentationState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getGeometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSelectedTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNavigationVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNavigationCovered", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTabs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setProfileIconRole", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setProfileBadgeCount", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        DubHubNativeTabBarChrome.shared.bind(plugin: self)
    }

    @objc func getPresentationState(_ call: CAPPluginCall) {
        call.resolve([
            "enabled": DubHubNativeNavigationFlag.isEnabled,
        ])
    }

    @objc func getGeometry(_ call: CAPPluginCall) {
        DubHubNativeTabBarChrome.shared.geometry { payload in
            call.resolve(payload)
        }
    }

    @objc func setSelectedTab(_ call: CAPPluginCall) {
        let raw = call.getString("tab")
        Self.logIncoming("setSelectedTab")
        DubHubNativeTabBarChrome.shared.setSelectedTab(raw) {
            call.resolve()
        }
    }

    @objc func setNavigationVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? false
        Self.logIncoming("setNavigationVisible")
        DubHubNativeTabBarChrome.shared.setReactVisible(visible) {
            call.resolve()
        }
    }

    @objc func setNavigationCovered(_ call: CAPPluginCall) {
        let covered = call.getBool("covered") ?? false
        Self.logIncoming("setNavigationCovered")
        DubHubNativeTabBarChrome.shared.setReactCovered(covered) {
            call.resolve()
        }
    }

    @objc func setTabs(_ call: CAPPluginCall) {
        let tabs = (call.getArray("tabs") ?? []).compactMap { $0 as? String }
        Self.logIncoming("setTabs")
        DubHubNativeTabBarChrome.shared.setTabs(tabs) {
            call.resolve()
        }
    }

    /// PROFILE-NAV-2: Profile glyph role from account_type (community | artist).
    @objc func setProfileIconRole(_ call: CAPPluginCall) {
        let role = call.getString("role")
        Self.logIncoming("setProfileIconRole")
        DubHubNativeTabBarChrome.shared.setProfileIconRole(role) {
            call.resolve()
        }
    }

    /// PROFILE-NAV-BADGE-1: Profile unread badge from React nav-feed count (≤0 clears).
    @objc func setProfileBadgeCount(_ call: CAPPluginCall) {
        let count = call.getInt("count") ?? Int(call.getDouble("count") ?? 0)
        Self.logIncoming("setProfileBadgeCount")
        DubHubNativeTabBarChrome.shared.setProfileBadgeCount(count) {
            call.resolve()
        }
    }

    private static func logIncoming(_ method: String) {
        #if DEBUG
        NSLog(
            "[DubHub][LG-NAV-3A] %@ received thread=%@ isMain=%d",
            method,
            Thread.current.name ?? Thread.current.description,
            Thread.isMainThread ? 1 : 0
        )
        #endif
    }
}

/// Standalone `UITabBar` sibling overlay. No UITabBarController, no extra WKWebViews, no WebView resize.
enum DubHubNativeTabBarOverlay {
    static func installOverlayIfNeeded(on bridgeController: CAPBridgeViewController) {
        DubHubNativeTabBarChrome.shared.install(on: bridgeController)
    }

    static func layoutIfNeeded(on bridgeController: CAPBridgeViewController) {
        DubHubNativeTabBarChrome.shared.layout(on: bridgeController)
    }
}

final class DubHubNativeTabBarChrome: NSObject, UITabBarDelegate {
    static let shared = DubHubNativeTabBarChrome()

    private let overlayTag = 0x4C474E31
    private weak var plugin: CAPPlugin?
    private weak var hostController: CAPBridgeViewController?
    private var tabBar: UITabBar?
    private var reactVisible = false
    private var reactCovered = false
    private var tabIds: [String] = ["home", "leaderboard", "submit", "releases", "profile"]
    /// PROFILE-NAV-2: account_type-driven Profile glyph. Defaults to community until JS syncs.
    private var profileIconRole: String = "community"
    /// PROFILE-NAV-BADGE-1: React-driven unread count (custom overlay chrome in 2A).
    private var profileBadgeCount: Int = 0
    /// PROFILE-NAV-BADGE-2A: single reusable custom badge; never accumulate duplicates.
    private weak var profileUnreadBadgeView: DubHubNativeProfileUnreadBadgeView?
    private static let profileUnreadBadgeTag = 0x4E424447

    /// PROFILE-NAV-5: read by icon animator / touch cancel without exposing mutation.
    var isArtistProfileIconRole: Bool { profileIconRole == "artist" }

    var profileIconAssetName: String {
        profileIconRole == "artist"
            ? DubHubNativeTabBarProfileArtistAnimator.artistAssetName
            : DubHubNativeTabBarProfileArtistAnimator.communityAssetName
    }
    private var applyingSelection = false
    private var selectedTabId: String?
    private var tagToTabId: [Int: String] = [:]
    /// Cover and uncover share this duration (UIKit default `UIView.animate` 0.2s).
    /// EaseOut: cover disappears quickly under the sheet; uncover becomes readable immediately.
    private static let coverRevealDuration: TimeInterval = 0.2
    /// Floor for React layout exclusion, and physical inset when there is no home indicator.
    private static let minimumBottomInset: CGFloat = 8
    /// LG-NAV-5C3: UITabBar `sizeThatFits` on home-indicator phones already
    /// includes the 34pt home-indicator region (runtime: 83 = 49 + 34).
    /// Pinning the frame to the screen bottom matches UIKit. A non-zero
    /// physical inset double-counts that region and lifts the glass into the scrub.
    /// Devices with no home indicator keep the 8pt breathing margin.
    private static let homeIndicatorPhysicalInset: CGFloat = 0
    private var opacityAnimator: UIViewPropertyAnimator?
    private var opacityAnimatorTarget: CGFloat?
    /// Pending icon micro-animation (animation-only; route events already fired).
    private var pendingIconAnimationTabId: String?
    private var pendingIconAnimationItem: UITabBarItem?
    private var iconAnimationCoalesceWork: DispatchWorkItem?

    func bind(plugin: CAPPlugin) {
        self.plugin = plugin
    }

    func install(on bridgeController: CAPBridgeViewController) {
        runOnMain { [weak self] in
            self?.installOnMain(bridgeController)
        }
    }

    func layout(on bridgeController: CAPBridgeViewController) {
        runOnMain { [weak self] in
            guard let self, let host = bridgeController.view, let tabBar = self.tabBar else { return }
            self.assertMain("layout")
            self.position(tabBar, in: host, layoutPresent: self.isLayoutPresent)
            self.applyVisualCover(tabBar)
        }
    }

    func setReactVisible(_ visible: Bool, completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            self.reactVisible = visible
            if !visible {
                self.reactCovered = false
            }
            if let controller = self.hostController {
                self.applyPresentation(on: controller)
                self.syncDocumentFlag(on: controller)
            }
            completion?()
        }
    }

    func setReactCovered(_ covered: Bool, completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            self.reactCovered = covered
            // Cover/uncover is presentation-only. Do not remasure, park, or
            // toggle isHidden — those rebuild iOS 26 glass and flash on reveal.
            if let tabBar = self.tabBar {
                self.applyVisualCover(tabBar)
            }
            completion?()
        }
    }

    func setSelectedTab(_ raw: String?, completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            self.selectedTabId = self.normalizedTabId(raw)
            self.applySelectedItem()
            completion?()
        }
    }

    func setTabs(_ tabs: [String], completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            let next = tabs.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            if !next.isEmpty {
                self.tabIds = next
            }
            self.applyPendingItems(reason: "setTabs")
            self.applySelectedItem()
            if let controller = self.hostController {
                self.layoutOnMain(controller)
            }
            completion?()
        }
    }

    /// PROFILE-NAV-2: update Profile glyph from account_type role without rebuilding the bar.
    func setProfileIconRole(_ raw: String?, completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            let next = Self.normalizedProfileIconRole(raw)
            guard self.profileIconRole != next else {
                completion?()
                return
            }
            // PROFILE-NAV-5: cancel bass session and restore the *incoming* role asset
            // (never leave Artist frames after switching to community).
            let restoreName = next == "artist"
                ? DubHubNativeTabBarProfileArtistAnimator.artistAssetName
                : DubHubNativeTabBarProfileArtistAnimator.communityAssetName
            DubHubNativeTabBarProfileArtistAnimator.cancelAll(
                in: nil,
                restoreAssetName: restoreName
            )
            DubHubNativeTabBarProfileCommunityAnimator.cancelAll(
                in: nil,
                restoreAssetName: restoreName
            )
            self.profileIconRole = next
            self.applyProfileItemImageOnly()
            // PROFILE-NAV-BADGE-2A: role swap must not drop custom badge.
            self.applyProfileItemBadgeOnly()
            completion?()
        }
    }

    /// PROFILE-NAV-BADGE-1: push-only unread badge; ≤0 clears. Does not touch routing/selection.
    func setProfileBadgeCount(_ count: Int, completion: (() -> Void)? = nil) {
        runOnMain { [weak self] in
            guard let self else {
                completion?()
                return
            }
            let next = max(0, count)
            guard self.profileBadgeCount != next else {
                completion?()
                return
            }
            self.profileBadgeCount = next
            self.applyProfileItemBadgeOnly()
            completion?()
        }
    }

    private static func normalizedProfileIconRole(_ raw: String?) -> String {
        let trimmed = (raw ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return trimmed == "artist" ? "artist" : "community"
    }

    /// Matches React `formatNotificationBadgeCount` (99+).
    private static func formattedProfileBadgeValue(_ count: Int) -> String? {
        if count <= 0 { return nil }
        if count > 99 { return "99+" }
        return String(count)
    }

    /// Swap only the Profile UITabBarItem image; preserve selection, tint, labels, routing.
    private func applyProfileItemImageOnly() {
        assertMain("applyProfileItemImageOnly")
        guard let tabBar, let items = tabBar.items else { return }
        guard let profileIndex = tabIds.firstIndex(of: "profile"),
              profileIndex < items.count
        else {
            return
        }
        let item = items[profileIndex]
        let image = tabImage(id: "profile", symbol: "person")
        item.image = image
        item.selectedImage = nil
    }

    /// PROFILE-NAV-BADGE-2A: clear system badgeValue; draw icon-anchored custom overlay.
    private func applyProfileItemBadgeOnly() {
        assertMain("applyProfileItemBadgeOnly")
        guard let tabBar else { return }
        clearSystemProfileBadgeValue(on: tabBar)
        syncCustomProfileUnreadBadge(in: tabBar)
    }

    private func clearSystemProfileBadgeValue(on tabBar: UITabBar) {
        guard let items = tabBar.items,
              let profileIndex = tabIds.firstIndex(of: "profile"),
              profileIndex < items.count
        else {
            return
        }
        let item = items[profileIndex]
        item.badgeValue = nil
        if let text = Self.formattedProfileBadgeValue(profileBadgeCount) {
            item.accessibilityValue = "\(text) unread"
        } else {
            item.accessibilityValue = nil
        }
    }

    private func syncCustomProfileUnreadBadge(in tabBar: UITabBar) {
        for subview in tabBar.subviews where subview.tag == Self.profileUnreadBadgeTag {
            if subview !== profileUnreadBadgeView {
                subview.removeFromSuperview()
            }
        }

        guard let text = Self.formattedProfileBadgeValue(profileBadgeCount) else {
            profileUnreadBadgeView?.removeFromSuperview()
            profileUnreadBadgeView = nil
            return
        }

        let badge: DubHubNativeProfileUnreadBadgeView
        if let existing = profileUnreadBadgeView, existing.superview === tabBar {
            badge = existing
        } else {
            profileUnreadBadgeView?.removeFromSuperview()
            badge = DubHubNativeProfileUnreadBadgeView()
            badge.tag = Self.profileUnreadBadgeTag
            badge.isAccessibilityElement = false
            badge.isUserInteractionEnabled = false
            tabBar.addSubview(badge)
            profileUnreadBadgeView = badge
        }

        badge.setCountText(text)
        badge.isHidden = false
        repositionCustomProfileUnreadBadge(badge, in: tabBar)
    }

    private func repositionCustomProfileUnreadBadge(
        _ badge: DubHubNativeProfileUnreadBadgeView,
        in tabBar: UITabBar
    ) {
        guard profileBadgeCount > 0 else {
            badge.isHidden = true
            return
        }
        guard let items = tabBar.items,
              let profileIndex = tabIds.firstIndex(of: "profile"),
              profileIndex < items.count,
              let iconView = DubHubNativeTabBarIconAnimator.resolveIconImageView(
                for: items[profileIndex],
                in: tabBar
              )
        else {
            // Icon host not ready yet; layoutSubviews will retry. Do not fall back to system badge.
            badge.isHidden = true
            return
        }

        let size = badge.preferredBadgeSize()
        let iconInBar = iconView.convert(iconView.bounds, to: tabBar)
        // PROFILE-NAV-BADGE-2B: ~58% horizontal overlap; ~35% of height above icon top.
        // (2A's 1/3 / 2/3 sat too far right and too high.)
        let horizontalOverlap: CGFloat = 0.58
        let heightAboveIcon: CGFloat = 0.35
        let origin = CGPoint(
            x: iconInBar.maxX - size.width * horizontalOverlap,
            y: iconInBar.minY - size.height * heightAboveIcon
        )
        let nextFrame = CGRect(origin: origin, size: size)
        if !badge.frame.equalTo(nextFrame) {
            badge.frame = nextFrame
        }
        badge.isHidden = false
        tabBar.bringSubviewToFront(badge)
    }

    /// Layout-safe rebind without recreating the view when count is unchanged.
    private func repositionExistingCustomProfileBadgeIfNeeded() {
        guard let tabBar,
              let badge = profileUnreadBadgeView,
              badge.superview === tabBar,
              profileBadgeCount > 0
        else {
            return
        }
        clearSystemProfileBadgeValue(on: tabBar)
        repositionCustomProfileUnreadBadge(badge, in: tabBar)
    }

    private var isLayoutPresent: Bool {
        DubHubNativeNavigationFlag.isEnabled && reactVisible
    }

    private var isVisuallyShown: Bool {
        isLayoutPresent && !reactCovered
    }

    private func installOnMain(_ bridgeController: CAPBridgeViewController) {
        assertMain("install")
        hostController = bridgeController
        guard let host = bridgeController.view else { return }

        let bar: DubHubNativeTabBar
        if let existing = host.viewWithTag(overlayTag) as? DubHubNativeTabBar {
            bar = existing
        } else {
            if let legacy = host.viewWithTag(overlayTag) as? UITabBar {
                legacy.removeFromSuperview()
            }
            let beforeCreate = snapshot(bridgeController)
            bar = makeTabBar()
            host.addSubview(bar)
            logDiagnostics(
                bridgeController: bridgeController,
                tabBar: bar,
                before: beforeCreate,
                after: snapshot(bridgeController),
                note: "installed"
            )
        }
        tabBar = bar
        bindIconAnimationInteraction(on: bar)
        applyPendingItems(reason: "install")
        applySelectedItem()
        applyPresentation(on: bridgeController)
        syncDocumentFlag(on: bridgeController)
    }

    private func layoutOnMain(_ bridgeController: CAPBridgeViewController) {
        guard let host = bridgeController.view, let tabBar else { return }
        position(tabBar, in: host, layoutPresent: isLayoutPresent)
        applyVisualCover(tabBar)
    }

    private func makeTabBar() -> DubHubNativeTabBar {
        assertMain("makeTabBar")
        let tabBar = DubHubNativeTabBar()
        tabBar.tag = overlayTag
        tabBar.delegate = self
        tabBar.isHidden = true
        tabBar.alpha = 1
        tabBar.isUserInteractionEnabled = false
        tabBar.translatesAutoresizingMaskIntoConstraints = true
        tabBar.autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
        tabBar.accessibilityIdentifier = "dubhub.nativeTabBar.lgNav3"
        // NATIVE-NAV-PREMIUM-2A: neutral selected/unselected tints only.
        // Do not construct a custom tab-bar appearance object (preserves system glass/platter).
        tabBar.tintColor = UIColor.white.withAlphaComponent(0.96)
        tabBar.unselectedItemTintColor = UIColor.white.withAlphaComponent(0.50)
        // PROFILE-NAV-BADGE-2A: custom icon-anchored badge; keep system badgeValue cleared.
        tabBar.onDidLayoutSubviews = { [weak self] in
            self?.repositionExistingCustomProfileBadgeIfNeeded()
        }
        bindIconAnimationInteraction(on: tabBar)
        return tabBar
    }

    private func bindIconAnimationInteraction(on tabBar: DubHubNativeTabBar) {
        tabBar.onInteractionEnded = { [weak self] in
            self?.flushPendingIconAnimation()
        }
    }

    /// Animation-only queue: updates pending tab during drag; plays once on commit.
    private func requestCommittedIconAnimation(tabId: String, item: UITabBarItem) {
        pendingIconAnimationTabId = tabId
        pendingIconAnimationItem = item
        iconAnimationCoalesceWork?.cancel()
        if let nativeBar = tabBar as? DubHubNativeTabBar, nativeBar.isInteractionActive {
            return
        }
        let work = DispatchWorkItem { [weak self] in
            self?.flushPendingIconAnimation()
        }
        iconAnimationCoalesceWork = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + DubHubNativeTabBarIconAnimator.coalesceDelay,
            execute: work
        )
    }

    private func flushPendingIconAnimation() {
        iconAnimationCoalesceWork?.cancel()
        iconAnimationCoalesceWork = nil
        guard let tabId = pendingIconAnimationTabId,
              let item = pendingIconAnimationItem,
              let tabBar
        else {
            return
        }
        pendingIconAnimationTabId = nil
        pendingIconAnimationItem = nil
        DubHubNativeTabBarIconAnimator.playCommittedSelection(
            tabId: tabId,
            item: item,
            in: tabBar
        )
    }

    private func applyPendingItems(reason: String) {
        assertMain("rebuildItems")
        guard let tabBar else {
            #if DEBUG
            NSLog("[DubHub][LG-NAV-3A] %@ deferred; overlay not installed yet", reason)
            #endif
            return
        }
        #if DEBUG
        NSLog(
            "[DubHub][LG-NAV-3A] apply items reason=%@ threadIsMain=%d tabBarExists=1 count=%d",
            reason,
            Thread.isMainThread ? 1 : 0,
            tabIds.count
        )
        #endif
        var items: [UITabBarItem] = []
        var map: [Int: String] = [:]
        for (index, id) in tabIds.enumerated() {
            guard let item = makeItem(id: id, tag: index) else { continue }
            items.append(item)
            map[index] = id
        }
        tagToTabId = map
        tabBar.items = items
        // PROFILE-NAV-BADGE-1: items are rebuilt from scratch — reapply stored badge.
        applyProfileItemBadgeOnly()
    }

    private func applySelectedItem() {
        assertMain("setSelectedItem")
        guard let tabBar else { return }
        applyingSelection = true
        defer { applyingSelection = false }
        if let selectedTabId, let item = tabBar.items?.first(where: { tagToTabId[$0.tag] == selectedTabId }) {
            tabBar.selectedItem = item
        } else {
            tabBar.selectedItem = nil
        }
    }

    private func makeItem(id: String, tag: Int) -> UITabBarItem? {
        assertMain("makeItem")
        let title: String
        let symbol: String
        switch id {
        case "home":
            title = "Home"
            symbol = "house"
        case "leaderboard":
            title = "Leaderboard"
            symbol = "trophy"
        case "submit":
            title = "Submit"
            symbol = "plus"
        case "releases":
            title = "Releases"
            symbol = "calendar"
        case "profile":
            title = "Profile"
            symbol = "person"
        case "moderator":
            title = "Moderate"
            symbol = "shield"
        default:
            return nil
        }
        let item = UITabBarItem(title: title, image: tabImage(id: id, symbol: symbol), tag: tag)
        item.accessibilityLabel = title
        item.accessibilityIdentifier = "dubhub.nativeTab.\(id)"
        return item
    }

    /// Custom template PDFs. Missing assets fall back to SF so a tab is never dropped.
    /// PROFILE-NAV-2: Profile glyph follows profileIconRole (account_type), default community.
    private func tabImage(id: String, symbol: String) -> UIImage? {
        let assetName: String?
        switch id {
        case "home":
            assetName = "DubHubTabHome"
        case "leaderboard":
            assetName = "DubHubTabLeaderboard"
        case "submit":
            assetName = "DubHubTabSubmit"
        case "releases":
            assetName = "DubHubTabReleases"
        case "profile":
            assetName = profileIconRole == "artist"
                ? "DubHubTabProfileArtist"
                : "DubHubTabProfileListener"
        case "moderator":
            assetName = "DubHubTabModerator"
        default:
            assetName = nil
        }
        if let assetName, let custom = UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate) {
            return custom
        }
        return UIImage(systemName: symbol)
    }

    private func applyPresentation(on bridgeController: CAPBridgeViewController) {
        assertMain("applyPresentation")
        guard let host = bridgeController.view, let tabBar else { return }
        let before = snapshot(bridgeController)
        let layoutPresent = isLayoutPresent
        let visuallyShown = isVisuallyShown
        position(tabBar, in: host, layoutPresent: layoutPresent)
        applyVisualCover(tabBar)
        logDiagnostics(
            bridgeController: bridgeController,
            tabBar: tabBar,
            before: before,
            after: snapshot(bridgeController),
            note: visuallyShown ? "presented-visible" : (layoutPresent ? "presented-covered" : "presented-hidden")
        )
    }

    /// Sheet cover: keep the bar mounted and laid out. `isHidden` is reserved for
    /// true unavailability. Cover/uncover share one opacity animator (0.2s easeOut).
    /// Interaction is disabled as soon as cover starts, not when alpha reaches 0.
    private func applyVisualCover(_ tabBar: UITabBar) {
        assertMain("applyVisualCover")
        let layoutPresent = isLayoutPresent
        let visuallyShown = isVisuallyShown
        tabBar.isHidden = !layoutPresent
        if !layoutPresent {
            stopOpacityAnimator()
            tabBar.alpha = 1
            tabBar.isUserInteractionEnabled = false
            tabBar.accessibilityElementsHidden = true
        } else if !visuallyShown {
            tabBar.isUserInteractionEnabled = false
            tabBar.accessibilityElementsHidden = true
            animateTabBarOpacity(tabBar, to: 0)
        } else {
            tabBar.accessibilityElementsHidden = false
            tabBar.isUserInteractionEnabled = true
            animateTabBarOpacity(tabBar, to: 1)
        }
        #if DEBUG
        NSLog(
            "[DubHub][LG-NAV-5B6] cover=%d layoutPresent=%d visuallyShown=%d isHidden=%d alpha=%.2f interaction=%d opacityTarget=%@ frame=%@",
            reactCovered ? 1 : 0,
            layoutPresent ? 1 : 0,
            visuallyShown ? 1 : 0,
            tabBar.isHidden ? 1 : 0,
            tabBar.alpha,
            tabBar.isUserInteractionEnabled ? 1 : 0,
            opacityAnimatorTarget.map { String(format: "%.2f", $0) } ?? "nil",
            NSCoder.string(for: tabBar.frame)
        )
        #endif
    }

    private func presentedAlpha(of tabBar: UITabBar) -> CGFloat {
        CGFloat((tabBar.layer.presentation() ?? tabBar.layer).opacity)
    }

    private func stopOpacityAnimator() {
        opacityAnimatorTarget = nil
        guard let animator = opacityAnimator else { return }
        opacityAnimator = nil
        animator.stopAnimation(true)
    }

    /// Fade to `target` from the live presentation alpha. One animator only; no queue.
    private func animateTabBarOpacity(_ tabBar: UITabBar, to target: CGFloat) {
        if opacityAnimator != nil, opacityAnimatorTarget == target {
            return
        }
        let current = presentedAlpha(of: tabBar)
        stopOpacityAnimator()
        tabBar.alpha = current
        if abs(current - target) < 0.01 {
            tabBar.alpha = target
            return
        }
        let animator = UIViewPropertyAnimator(
            duration: Self.coverRevealDuration,
            curve: .easeOut
        ) {
            tabBar.alpha = target
        }
        animator.addCompletion { [weak self] position in
            guard let self else { return }
            if self.opacityAnimator === animator {
                self.opacityAnimator = nil
                self.opacityAnimatorTarget = nil
            }
            if position == .end {
                tabBar.alpha = target
            }
        }
        opacityAnimator = animator
        opacityAnimatorTarget = target
        animator.startAnimation()
    }

    private func position(_ tabBar: UITabBar, in host: UIView, layoutPresent: Bool) {
        assertMain("position")
        if !layoutPresent {
            tabBar.frame = CGRect(
                x: 0,
                y: host.bounds.height,
                width: max(host.bounds.width, 1),
                height: 49
            )
            emitGeometry(host: host, tabBar: tabBar, layoutPresent: false)
            return
        }
        let sideInset: CGFloat = 16
        let availableWidth = max(host.bounds.width - sideInset * 2, 1)
        let hostSafeBottom = host.safeAreaInsets.bottom
        let proposed = CGSize(width: availableWidth, height: UIView.layoutFittingExpandedSize.height)
        // Measure against an unconstrained height so a previously capped/parked
        // frame cannot poison sizeThatFits. Skip that bounds dance when the bar
        // is already in its floating frame (cover/uncover must not relayout).
        let parked = tabBar.frame.minY >= host.bounds.height - 1
        if parked {
            tabBar.bounds = CGRect(x: 0, y: 0, width: availableWidth, height: 120)
            tabBar.layoutIfNeeded()
        }
        let rawFit = tabBar.sizeThatFits(proposed)
        let fittedHeight = max(rawFit.height, 49)
        // LG-NAV-5C: physical placement and React control exclusion are
        // intentionally different. Do not derive exclusion from frame.minY.
        // layoutBottomInset stays at today's full safe-area so Home scrub /
        // metadata stay put. Physical inset is 0 when a home indicator is
        // present (fitted height already includes it); 8pt otherwise.
        let layoutBottomInset = max(hostSafeBottom, Self.minimumBottomInset)
        let placementBottomInset = hostSafeBottom > 0 ? Self.homeIndicatorPhysicalInset : Self.minimumBottomInset
        let dest = CGRect(
            x: sideInset,
            y: host.bounds.height - placementBottomInset - fittedHeight,
            width: availableWidth,
            height: fittedHeight
        )
        if !tabBar.frame.equalTo(dest) {
            tabBar.frame = dest
        }
        #if DEBUG
        let exclusion = fittedHeight + layoutBottomInset
        let impliedScrubBottom = host.bounds.height - exclusion
        NSLog(
            "[DubHub][LG-NAV-5C3] proposedWidth=%.1f sizeThatFits=(%.1f, %.1f) usedHeight=%.1f frame=%@ bounds=%@ hostHeight=%.1f hostSafeBottom=%.1f layoutBottomInset=%.1f placementBottomInset=%.1f minY=%.1f maxY=%.1f exclusion=%.1f layoutGap=%.1f impliedScrubBottom=%.1f scrubToBarGap=%.1f itemCount=%d",
            availableWidth,
            rawFit.width,
            rawFit.height,
            fittedHeight,
            NSCoder.string(for: tabBar.frame),
            NSCoder.string(for: tabBar.bounds),
            host.bounds.height,
            hostSafeBottom,
            layoutBottomInset,
            placementBottomInset,
            dest.minY,
            dest.maxY,
            exclusion,
            layoutBottomInset - placementBottomInset,
            impliedScrubBottom,
            dest.minY - impliedScrubBottom,
            tabBar.items?.count ?? 0
        )
        #endif
        emitGeometry(host: host, tabBar: tabBar, layoutPresent: true)
        // PROFILE-NAV-BADGE-2A: floating frame may move icon hosts — re-anchor.
        repositionExistingCustomProfileBadgeIfNeeded()
    }

    func geometry(completion: @escaping ([String: Any]) -> Void) {
        runOnMain { [weak self] in
            guard let self, let host = self.hostController?.view, let tabBar = self.tabBar else {
                completion([
                    "height": 0,
                    "bottomInset": 0,
                    "exclusion": 0,
                    "visible": false,
                    "covered": false,
                ])
                return
            }
            completion(self.geometryPayload(host: host, tabBar: tabBar, layoutPresent: self.isLayoutPresent))
        }
    }

    private func emitGeometry(host: UIView, tabBar: UITabBar, layoutPresent: Bool) {
        plugin?.notifyListeners("geometry", data: geometryPayload(host: host, tabBar: tabBar, layoutPresent: layoutPresent))
    }

    /// LG-NAV-5C: `bottomInset` is the physical gap under the bar (diagnostic).
    /// `exclusion` is the React control inset (`fittedHeight + layoutBottomInset`)
    /// and must not follow the physical inset. Do not collapse this back
    /// to `host.height - tabBar.frame.minY`.
    private func geometryPayload(host: UIView, tabBar: UITabBar, layoutPresent: Bool) -> [String: Any] {
        let layoutBottomInset = max(host.safeAreaInsets.bottom, Self.minimumBottomInset)
        let exclusion = layoutPresent ? tabBar.frame.height + layoutBottomInset : 0
        let bottomInset = layoutPresent ? max(host.bounds.height - tabBar.frame.maxY, 0) : 0
        return [
            "height": layoutPresent ? tabBar.frame.height : 0,
            "bottomInset": bottomInset,
            "exclusion": exclusion,
            "visible": layoutPresent,
            "covered": layoutPresent && reactCovered,
        ]
    }

    private func syncDocumentFlag(on bridgeController: CAPBridgeViewController) {
        assertMain("evaluateJavaScript")
        let value = DubHubNativeNavigationFlag.isEnabled ? "on" : "off"
        let js = """
        (function(){
          var el = document.documentElement;
          if (!el) return;
          el.setAttribute('data-dubhub-native-nav', '\(value)');
        })();
        """
        bridgeController.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private func normalizedTabId(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        if applyingSelection { return }
        if !isVisuallyShown { return }
        guard let tab = tagToTabId[item.tag] else { return }
        let event = (tab == selectedTabId) ? "reselectTab" : "selectTab"
        selectedTabId = tab
        var payload: [String: Any] = ["tab": tab]
        #if DEBUG
        let t = CACurrentMediaTime()
        payload["t"] = t
        NSLog("[DubHub][LG-NAV-5A] didSelect event=%@ tab=%@ t=%.6f", event, tab, t)
        #endif
        // Route event first — do not await icon animation.
        plugin?.notifyListeners(event, data: payload)
        // NATIVE-NAV-PREMIUM-2B: icon micro-anim (Submit/Home); reselect included.
        // Drag-across: pending tab updates while finger is down; one flush on release.
        requestCommittedIconAnimation(tabId: tab, item: item)
    }

    private func runOnMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func assertMain(_ label: String) {
        #if DEBUG
        if !Thread.isMainThread {
            NSLog("[DubHub][LG-NAV-3A] ERROR %@ off main thread=%@", label, Thread.current.description)
            assertionFailure("[DubHub][LG-NAV-3A] UIKit mutation for \(label) must run on main")
        }
        #endif
    }

    private struct GeometrySnapshot {
        let bridgeBounds: CGRect
        let webViewFrame: CGRect
        let webViewBounds: CGRect
        let safeAreaInsets: UIEdgeInsets
        let additionalSafeAreaInsets: UIEdgeInsets
        let webViewCountInBridge: Int
        let webViewCountInWindow: Int
        let bridgeType: String
    }

    private func snapshot(_ bridgeController: CAPBridgeViewController) -> GeometrySnapshot {
        let host = bridgeController.view
        let web = bridgeController.webView
        return GeometrySnapshot(
            bridgeBounds: host?.bounds ?? .null,
            webViewFrame: web?.frame ?? .null,
            webViewBounds: web?.bounds ?? .null,
            safeAreaInsets: host?.safeAreaInsets ?? .zero,
            additionalSafeAreaInsets: bridgeController.additionalSafeAreaInsets,
            webViewCountInBridge: countWKWebViews(in: host),
            webViewCountInWindow: countWKWebViews(in: bridgeController.view.window),
            bridgeType: String(describing: type(of: bridgeController))
        )
    }

    private func countWKWebViews(in root: UIView?) -> Int {
        guard let root else { return 0 }
        var count = 0
        var stack: [UIView] = [root]
        while let view = stack.popLast() {
            if view is WKWebView { count += 1 }
            stack.append(contentsOf: view.subviews)
        }
        return count
    }

    private func logDiagnostics(
        bridgeController: CAPBridgeViewController,
        tabBar: UITabBar,
        before: GeometrySnapshot?,
        after: GeometrySnapshot,
        note: String
    ) {
        #if !DEBUG
        guard DubHubNativeNavigationFlag.isEnabled else { return }
        #endif

        let flag = DubHubNativeNavigationFlag.isEnabled
        NSLog(
            "[DubHub][LG-NAV-3] flag=%@ key=%@ note=%@ bridge=%@ tabBarHidden=%d tabBarUserInteraction=%d reactVisible=%d reactCovered=%d",
            flag ? "ON" : "OFF",
            DubHubNativeNavigationFlag.userDefaultsKey,
            note,
            after.bridgeType,
            tabBar.isHidden ? 1 : 0,
            tabBar.isUserInteractionEnabled ? 1 : 0,
            reactVisible ? 1 : 0,
            reactCovered ? 1 : 0
        )
        NSLog(
            "[DubHub][LG-NAV-3] webViewCount bridge=%d window=%d capacitorWebViewNil=%d",
            after.webViewCountInBridge,
            after.webViewCountInWindow,
            bridgeController.webView == nil ? 1 : 0
        )

        if let before {
            let frameSame = before.webViewFrame == after.webViewFrame
            let boundsSame = before.webViewBounds == after.webViewBounds
            let bridgeSame = before.bridgeBounds == after.bridgeBounds
            let safeSame = before.safeAreaInsets == after.safeAreaInsets
            let additionalSame = before.additionalSafeAreaInsets == after.additionalSafeAreaInsets
            NSLog(
                "[DubHub][LG-NAV-3] geometry unchanged webFrame=%d webBounds=%d bridgeBounds=%d safeArea=%d additionalSafeArea=%d",
                frameSame ? 1 : 0,
                boundsSame ? 1 : 0,
                bridgeSame ? 1 : 0,
                safeSame ? 1 : 0,
                additionalSame ? 1 : 0
            )
            if !(frameSame && boundsSame && bridgeSame && safeSame && additionalSame) {
                NSLog("[DubHub][LG-NAV-3] ERROR geometry changed after native tab-bar presentation; do not compensate in Home/CSS")
            }
        }
    }
}

/// PROFILE-NAV-BADGE-2A/2B: compact icon-anchored unread chip for the native Profile tab.
/// 16pt height; vertically centered digits; ~58% glyph overlap (2B position polish).
private final class DubHubNativeProfileUnreadBadgeView: UIView {
    /// One-digit diameter / multi-digit height (system-like; 1C's 20pt was too large).
    private static let badgeHeight: CGFloat = 16
    private static let horizontalPadding: CGFloat = 5
    private static let fillColor = UIColor.systemRed
    /// Cap width so "99+" stays compact.
    private static let maxWidth: CGFloat = 28

    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        clipsToBounds = true
        backgroundColor = Self.fillColor

        label.font = UIFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 1
        label.baselineAdjustment = .alignCenters
        label.lineBreakMode = .byClipping
        // Fixed-height chip: center the glyph box so ascenders/descenders never clip.
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: centerXAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 2),
            label.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -2),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    func setCountText(_ text: String) {
        label.text = text
        let size = preferredBadgeSize()
        bounds = CGRect(origin: .zero, size: size)
        layer.cornerRadius = size.height * 0.5
        setNeedsLayout()
        layoutIfNeeded()
    }

    func preferredBadgeSize() -> CGSize {
        let text = label.text ?? ""
        let attributes: [NSAttributedString.Key: Any] = [
            .font: label.font as Any,
        ]
        let textWidth = (text as NSString).size(withAttributes: attributes).width
        let width = min(
            Self.maxWidth,
            max(Self.badgeHeight, ceil(textWidth) + Self.horizontalPadding * 2)
        )
        return CGSize(width: width, height: Self.badgeHeight)
    }
}
