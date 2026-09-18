import UIKit

/// Thin UITabBar subclass that exposes finger-down state so icon micro-animations
/// can wait for commit (touch end) while drag-across only updates system highlight.
final class DubHubNativeTabBar: UITabBar {
    var onInteractionEnded: (() -> Void)?
    /// PROFILE-NAV-BADGE-2A: re-anchor custom Profile unread badge after UIKit rebuilds tab buttons.
    var onDidLayoutSubviews: (() -> Void)?
    private(set) var isInteractionActive = false

    override func layoutSubviews() {
        super.layoutSubviews()
        onDidLayoutSubviews?()
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        // NATIVE-NAV-LEADERBOARD-6L / RELEASES-2 / PROFILE-NAV-5: surrender image ownership
        // before UIKit selection. Profile restore uses current role asset.
        DubHubNativeTabBarLeaderboardEQOverlay.cancelAll(in: nil)
        DubHubNativeTabBarReleasesVinylAnimator.cancelAll(in: nil)
        let profileAsset = DubHubNativeTabBarChrome.shared.profileIconAssetName
        DubHubNativeTabBarProfileArtistAnimator.cancelAll(
            in: nil,
            restoreAssetName: profileAsset
        )
        DubHubNativeTabBarProfileCommunityAnimator.cancelAll(
            in: nil,
            restoreAssetName: profileAsset
        )
        DubHubNativeTabBarIconAnimator.cancelHomeTransform()
        isInteractionActive = true
        super.touchesBegan(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        isInteractionActive = false
        onInteractionEnded?()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
        isInteractionActive = false
        onInteractionEnded?()
    }
}

/// NATIVE-NAV-PREMIUM-2B / RELEASES-2: committed-selection icon transforms
/// (Submit + Home + Releases). Does not touch labels, tint, geometry, or route timing.
enum DubHubNativeTabBarIconAnimator {
    static let submitDuration: TimeInterval = 0.20
    /// NATIVE-NAV-HOME-17: pause ↔ play cross-dissolve with start delay + longer hold.
    static let homeStartDelay: TimeInterval = 0.045
    static let homeCrossDissolveDuration: TimeInterval = 0.080
    static let homeHoldDuration: TimeInterval = 0.200
    /// Total ≈ 405ms (45 + 80 + 200 + 80).
    static let homeSemanticDuration: TimeInterval =
        homeStartDelay + homeCrossDissolveDuration + homeHoldDuration
        + homeCrossDissolveDuration
    static let homeCanonicalAssetName = "DubHubTabHome"
    static let homePlayingAssetName = "DubHubTabHomePlaying"
    /// Coalesce window when touch tracking is unavailable (fallback drag spam guard).
    static let coalesceDelay: TimeInterval = 0.05
    /// Cluster duplicate `_UITabButton` trees that share the same tab slot.
    private static let horizontalDedupeTolerance: CGFloat = 8
    /// Icon glyph size band inside a tab button (pt).
    private static let iconMinSide: CGFloat = 12
    private static let iconMaxSide: CGFloat = 48
    /// Invalidates deferred resolve/play work from older commits.
    private static var committedAnimationGeneration: UInt64 = 0
    /// In-flight Home semantic host (resolved UIImageView).
    private static weak var activeHomeImageView: UIImageView?
    /// Session id for sequential Home phases (stale completions ignored).
    private static var homeSessionGeneration: UInt64 = 0

    private static let homeTransitionOptions: UIView.AnimationOptions = [
        .transitionCrossDissolve,
        .allowUserInteraction,
        .beginFromCurrentState,
    ]

    /// Cancels in-flight Home semantic sequence and restores canonical glyph.
    static func cancelHomeTransform() {
        let imageView = activeHomeImageView
        activeHomeImageView = nil
        homeSessionGeneration &+= 1
        guard let imageView else { return }
        resetHome(imageView)
    }

    static func playCommittedSelection(
        tabId: String,
        item: UITabBarItem,
        in tabBar: UITabBar
    ) {
        // NATIVE-NAV-LEADERBOARD-6I / RELEASES-2 / PROFILE-NAV-5: terminate in-flight
        // glyph sessions before resolve/async. Must not depend on finding the newly selected glyph.
        DubHubNativeTabBarLeaderboardEQOverlay.cancelAll(in: nil)
        DubHubNativeTabBarReleasesVinylAnimator.cancelAll(in: nil)
        let profileAsset = DubHubNativeTabBarChrome.shared.profileIconAssetName
        DubHubNativeTabBarProfileArtistAnimator.cancelAll(
            in: nil,
            restoreAssetName: profileAsset
        )
        DubHubNativeTabBarProfileCommunityAnimator.cancelAll(
            in: nil,
            restoreAssetName: profileAsset
        )
        cancelHomeTransform()
        if UIAccessibility.isReduceMotionEnabled {
            return
        }
        committedAnimationGeneration &+= 1
        let generation = committedAnimationGeneration

        tabBar.layoutIfNeeded()
        if tabId == "leaderboard" {
            playLeaderboard(item: item, tabBar: tabBar, generation: generation)
            return
        }
        if tabId == "profile" {
            playProfile(item: item, tabBar: tabBar, generation: generation)
            return
        }
        if let imageView = resolveIconImageView(for: item, in: tabBar) {
            play(tabId: tabId, imageView: imageView, tabBar: tabBar, generation: generation)
            return
        }
        // One runloop retry if icon views were not ready synchronously.
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard let imageView = resolveIconImageView(for: item, in: tabBar) else {
                return
            }
            guard generation == committedAnimationGeneration else { return }
            play(tabId: tabId, imageView: imageView, tabBar: tabBar, generation: generation)
        }
    }

    private static func play(
        tabId: String,
        imageView: UIImageView,
        tabBar: UITabBar,
        generation: UInt64
    ) {
        switch tabId {
        case "submit":
            animateSubmit(imageView)
        case "home":
            animateHome(imageView, generation: generation)
        case "releases":
            animateReleases(imageView, tabBar: tabBar)
        default:
            return
        }
    }

    /// PROFILE-NAV-5 / COMMUNITY-3: Artist headphone bass OR Community head nod.
    private static func playProfile(
        item: UITabBarItem,
        tabBar: UITabBar,
        generation: UInt64
    ) {
        if DubHubNativeTabBarChrome.shared.isArtistProfileIconRole {
            if let imageView = resolveIconImageView(for: item, in: tabBar) {
                animateProfileArtist(imageView, tabBar: tabBar)
                return
            }
            DispatchQueue.main.async {
                guard generation == committedAnimationGeneration else { return }
                tabBar.layoutIfNeeded()
                guard DubHubNativeTabBarChrome.shared.isArtistProfileIconRole else { return }
                guard let imageView = resolveIconImageView(for: item, in: tabBar) else { return }
                guard generation == committedAnimationGeneration else { return }
                animateProfileArtist(imageView, tabBar: tabBar)
            }
            return
        }
        if let imageView = resolveIconImageView(for: item, in: tabBar) {
            animateProfileCommunity(imageView, tabBar: tabBar)
            return
        }
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard !DubHubNativeTabBarChrome.shared.isArtistProfileIconRole else { return }
            guard let imageView = resolveIconImageView(for: item, in: tabBar) else { return }
            guard generation == committedAnimationGeneration else { return }
            animateProfileCommunity(imageView, tabBar: tabBar)
        }
    }

    private static func animateProfileArtist(_ imageView: UIImageView, tabBar: UITabBar) {
        let tint = imageView.tintColor
            ?? imageView.superview?.tintColor
            ?? tabBar.tintColor
            ?? UIColor.white.withAlphaComponent(0.96)
        DubHubNativeTabBarProfileArtistAnimator.play(
            over: imageView,
            fallbackTint: tint
        )
    }

    private static func animateProfileCommunity(_ imageView: UIImageView, tabBar: UITabBar) {
        let tint = imageView.tintColor
            ?? imageView.superview?.tintColor
            ?? tabBar.tintColor
            ?? UIColor.white.withAlphaComponent(0.96)
        DubHubNativeTabBarProfileCommunityAnimator.play(
            over: imageView,
            fallbackTint: tint
        )
    }

    /// NATIVE-NAV-RELEASES-2: vinyl roll-out / roll-back on preferred platter glyph.
    private static func animateReleases(_ imageView: UIImageView, tabBar: UITabBar) {
        let tint = imageView.tintColor
            ?? imageView.superview?.tintColor
            ?? tabBar.tintColor
            ?? UIColor.white.withAlphaComponent(0.96)
        DubHubNativeTabBarReleasesVinylAnimator.play(
            over: imageView,
            fallbackTint: tint
        )
    }

    private static func canonicalHomeImage() -> UIImage? {
        UIImage(named: homeCanonicalAssetName)?.withRenderingMode(.alwaysTemplate)
    }

    private static func playingHomeImage() -> UIImage? {
        UIImage(named: homePlayingAssetName)?.withRenderingMode(.alwaysTemplate)
    }

    private static func resetHome(_ imageView: UIImageView) {
        imageView.layer.removeAllAnimations()
        imageView.transform = .identity
        UIView.performWithoutAnimation {
            if let image = canonicalHomeImage() {
                imageView.image = image
            }
        }
    }

    private static func isHomeSessionCurrent(
        _ generation: UInt64,
        imageView: UIImageView
    ) -> Bool {
        generation == homeSessionGeneration && activeHomeImageView === imageView
    }

    private static func crossDissolveHomeImage(
        _ imageView: UIImageView,
        to image: UIImage?,
        generation: UInt64,
        completion: @escaping () -> Void
    ) {
        guard let image else {
            completion()
            return
        }
        UIView.transition(
            with: imageView,
            duration: homeCrossDissolveDuration,
            options: homeTransitionOptions,
            animations: {
                imageView.transform = .identity
                imageView.image = image
            },
            completion: { _ in
                guard isHomeSessionCurrent(generation, imageView: imageView) else { return }
                imageView.transform = .identity
                completion()
            }
        )
    }

    /// NATIVE-NAV-HOME-17: delay → pause → play → hold → pause via cross-dissolve only.
    private static func animateHome(_ imageView: UIImageView, generation: UInt64) {
        resetHome(imageView)
        homeSessionGeneration = generation
        activeHomeImageView = imageView

        DispatchQueue.main.asyncAfter(deadline: .now() + homeStartDelay) {
            guard isHomeSessionCurrent(generation, imageView: imageView) else { return }
            crossDissolveHomeImage(
                imageView,
                to: playingHomeImage(),
                generation: generation
            ) {
                guard isHomeSessionCurrent(generation, imageView: imageView) else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + homeHoldDuration) {
                    guard isHomeSessionCurrent(generation, imageView: imageView) else { return }
                    crossDissolveHomeImage(
                        imageView,
                        to: canonicalHomeImage(),
                        generation: generation
                    ) {
                        guard isHomeSessionCurrent(generation, imageView: imageView) else { return }
                        resetHome(imageView)
                        activeHomeImageView = nil
                    }
                }
            }
        }
    }

    /// Leaderboard: single preferred (non-lens) platter glyph — portal may mirror it.
    private static func playLeaderboard(
        item: UITabBarItem,
        tabBar: UITabBar,
        generation: UInt64
    ) {
        if let imageView = resolveIconImageView(for: item, in: tabBar) {
            animateLeaderboard(imageView, tabBar: tabBar)
            return
        }
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard let imageView = resolveIconImageView(for: item, in: tabBar) else { return }
            guard generation == committedAnimationGeneration else { return }
            animateLeaderboard(imageView, tabBar: tabBar)
        }
    }

    private static func animateLeaderboard(_ imageView: UIImageView, tabBar: UITabBar) {
        let tint = imageView.tintColor
            ?? imageView.superview?.tintColor
            ?? tabBar.tintColor
            ?? UIColor.white.withAlphaComponent(0.96)
        DubHubNativeTabBarLeaderboardEQOverlay.play(
            over: imageView,
            fallbackTint: tint
        )
    }
    /// NATIVE-NAV-PREMIUM-2B-FIX: iOS 26 floating bar nests `_UITabButton` under
    /// `_UITabBarPlatterView` — never resolve from direct `tabBar.subviews` alone.
    static func resolveIconImageView(for item: UITabBarItem, in tabBar: UITabBar) -> UIImageView? {
        guard let items = tabBar.items,
              let index = items.firstIndex(of: item)
        else {
            return nil
        }
        let buttons = dedupedTabButtons(in: tabBar)
        guard index < buttons.count else {
            return nil
        }
        let image = preferredIconImageView(in: buttons[index])
        return image
    }

    /// Recursive descendants whose class name contains `TabButton` (e.g. `_UITabButton`),
    /// excluding labels / platter / lens / portal / selection chrome.
    static func collectTabButtonCandidates(in root: UIView) -> [UIView] {
        var found: [UIView] = []
        func walk(_ view: UIView) {
            if isTabItemButtonCandidate(view) {
                found.append(view)
            }
            for child in view.subviews {
                walk(child)
            }
        }
        walk(root)
        return found
    }

    static func isTabItemButtonCandidate(_ view: UIView) -> Bool {
        let name = NSStringFromClass(type(of: view))
        guard name.contains("TabButton") else { return false }
        if name.contains("Label") { return false }
        if isNonButtonChromeClassName(name) { return false }
        return true
    }

    private static func isNonButtonChromeClassName(_ name: String) -> Bool {
        let blocked = [
            "Platter",
            "LiquidLens",
            "Portal",
            "TabSelection",
            "SelectionView",
            "DestOut",
            "SDF",
            "ClearGlass",
            "GlassView",
        ]
        return blocked.contains { name.contains($0) }
    }

    /// Left→right unique tab slots after converting frames into `tabBar` space.
    static func dedupedTabButtons(in tabBar: UITabBar) -> [UIView] {
        let raw = collectTabButtonCandidates(in: tabBar)
        struct Slot {
            var midX: CGFloat
            var button: UIView
        }
        var slots: [Slot] = []
        for button in raw {
            guard isVisuallyPresent(button) else { continue }
            let frameInBar = button.convert(button.bounds, to: tabBar)
            guard frameInBar.width > 1, frameInBar.height > 1 else { continue }
            let midX = frameInBar.midX
            if let existingIndex = slots.firstIndex(where: {
                abs($0.midX - midX) <= horizontalDedupeTolerance
            }) {
                let current = slots[existingIndex].button
                if preferredDuplicate(button, over: current) {
                    slots[existingIndex] = Slot(midX: midX, button: button)
                }
            } else {
                slots.append(Slot(midX: midX, button: button))
            }
        }
        return slots.sorted { $0.midX < $1.midX }.map(\.button)
    }

    /// Prefer the normal item-layer copy over liquid-lens / portal duplicates.
    private static func preferredDuplicate(_ candidate: UIView, over existing: UIView) -> Bool {
        let candidateLens = isUnderLiquidCompositor(candidate)
        let existingLens = isUnderLiquidCompositor(existing)
        if candidateLens != existingLens {
            return !candidateLens
        }
        let candidateScore = visibilityScore(candidate)
        let existingScore = visibilityScore(existing)
        if candidateScore != existingScore {
            return candidateScore > existingScore
        }
        // Stable tie-break: keep existing.
        return false
    }

    private static func isUnderLiquidCompositor(_ view: UIView) -> Bool {
        var current: UIView? = view
        while let node = current {
            let name = NSStringFromClass(type(of: node))
            if name.contains("LiquidLens")
                || name.contains("Portal")
                || name.contains("DestOut")
                || name.contains("TabSelection")
            {
                return true
            }
            current = node.superview
        }
        return false
    }

    private static func isVisuallyPresent(_ view: UIView) -> Bool {
        !view.isHidden && view.alpha > 0.01 && view.window != nil
    }

    private static func visibilityScore(_ view: UIView) -> CGFloat {
        var score: CGFloat = 0
        if isVisuallyPresent(view) { score += 10 }
        if preferredIconImageView(in: view) != nil { score += 5 }
        if !isUnderLiquidCompositor(view) { score += 3 }
        score += view.alpha
        return score
    }

    /// Glyph `UIImageView` scoped to the resolved button only (not the whole platter).
    static func preferredIconImageView(in root: UIView) -> UIImageView? {
        var candidates: [UIImageView] = []
        func walk(_ view: UIView) {
            if let imageView = view as? UIImageView {
                candidates.append(imageView)
            }
            for child in view.subviews {
                walk(child)
            }
        }
        walk(root)
        let visible = candidates.filter { !$0.isHidden && $0.alpha > 0.01 }
        let iconSized = visible.filter { imageView in
            let width = max(imageView.bounds.width, imageView.frame.width)
            let height = max(imageView.bounds.height, imageView.frame.height)
            return width >= iconMinSide
                && height >= iconMinSide
                && width <= iconMaxSide
                && height <= iconMaxSide
        }
        let pool = iconSized.isEmpty ? visible : iconSized
        return pool.max { lhs, rhs in
            imageArea(lhs) < imageArea(rhs)
        }
    }

    private static func imageArea(_ imageView: UIImageView) -> CGFloat {
        max(
            imageView.bounds.width * imageView.bounds.height,
            imageView.frame.width * imageView.frame.height
        )
    }

    private static func prepare(_ imageView: UIImageView) {
        imageView.layer.removeAllAnimations()
        imageView.transform = .identity
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        imageView.layer.transform = CATransform3DIdentity
        CATransaction.commit()
    }

    private static func animateSubmit(_ imageView: UIImageView) {
        prepare(imageView)
        UIView.animate(
            withDuration: submitDuration,
            delay: 0,
            options: [.curveEaseInOut, .allowUserInteraction, .beginFromCurrentState]
        ) {
            imageView.transform = CGAffineTransform(rotationAngle: .pi)
        } completion: { _ in
            // Plus is 180°-symmetric; identity reset is visually continuous.
            imageView.transform = .identity
        }
    }

}
