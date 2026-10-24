import UIKit

/// Thin UITabBar subclass that exposes finger-down state so icon micro-animations
/// can wait for commit (touch end) while drag-across only updates system highlight.
///
/// IOS18-NAV-FALLBACK: on iOS 26+ this class does not paint a background.
/// System Liquid Glass (`_UITabBarPlatterView`) stays authoritative.
/// Earlier systems hide the legacy `_UIBarBackground` and show a rounded
/// material behind the tab controls only. The bar frame is unchanged.
final class DubHubNativeTabBar: UITabBar {
    var onInteractionEnded: (() -> Void)?
    /// PROFILE-NAV-BADGE-2D: rebind Profile unread badge if UIKit rebuilds the glyph host.
    var onDidLayoutSubviews: (() -> Void)?
    private(set) var isInteractionActive = false
    /// Pre-iOS 26 floating surface. Never created on iOS 26+.
    private var legacyFloatingSurface: UIVisualEffectView?
    /// Pre-iOS 26 selected-icon bubble. Never created on iOS 26+.
    private var legacySelectionBubble: UIVisualEffectView?
    /// Coalesces bubble placement until UIKit finishes the current layout pass.
    private var legacySelectionBubblePlacement: DispatchWorkItem?
    /// False after hide/first show so the bubble appears in place instead of sliding.
    private var legacySelectionBubbleHasSettledFrame = false
    private var legacySelectionBubbleTarget: CGRect = .zero
    /// Holds the chrome material part-way toward clear. Retained so the blur does not snap back.
    private var legacySurfaceFade: UIViewPropertyAnimator?
    private var isLayingOutLegacySurface = false
    private static let legacySelectionSlideDuration: TimeInterval = 0.24
    /// How far systemChromeMaterial moves toward no effect. 0 keeps it unchanged.
    private static let legacySurfaceClearFraction: CGFloat = 0.34

    override func layoutSubviews() {
        super.layoutSubviews()
        if !isLayingOutLegacySurface {
            isLayingOutLegacySurface = true
            layoutLegacyFloatingSurfaceIfNeeded()
            layoutLegacySelectionBubbleIfNeeded()
            isLayingOutLegacySurface = false
        }
        onDidLayoutSubviews?()
        DubHubNativeTabBarIconSwapOverlay.syncActiveCovers()
    }


    /// iOS 26+ returns immediately. No appearance object, no fallback view.
    private func layoutLegacyFloatingSurfaceIfNeeded() {
        if #available(iOS 26.0, *) {
            return
        }
        suppressLegacyTabBarBackground()
        let surface = ensureLegacyFloatingSurface()
        guard let band = legacyFloatingBand(), band.width > 1, band.height > 1 else {
            surface.isHidden = true
            return
        }
        surface.isHidden = false
        surface.frame = band
        surface.layer.cornerRadius = band.height * 0.5
        let scale = traitCollection.displayScale > 0 ? traitCollection.displayScale : 1
        surface.layer.borderWidth = 1 / scale
        surface.layer.borderColor = UIColor.separator.withAlphaComponent(0.6)
            .resolvedColor(with: traitCollection).cgColor
        if surface.superview === self, subviews.first !== surface {
            sendSubviewToBack(surface)
        }
    }

    /// One capsule behind the selected icon. iOS 26+ returns before any view is created.
    /// Placement is deferred so a mid-layout UITabBarButton frame cannot pin the bubble
    /// to the button origin. Routing and icon animation are not delayed.
    private func layoutLegacySelectionBubbleIfNeeded() {
        if #available(iOS 26.0, *) {
            return
        }
        legacySelectionBubblePlacement?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.applyLegacySelectionBubble()
        }
        legacySelectionBubblePlacement = work
        DispatchQueue.main.async(execute: work)
    }

    private func applyLegacySelectionBubble() {
        if #available(iOS 26.0, *) {
            return
        }
        guard let item = selectedItem,
              let icon = DubHubNativeTabBarIconAnimator.resolveIconImageView(
                for: item,
                in: self,
                requireWindow: false
              )
        else {
            legacySelectionBubble?.isHidden = true
            legacySelectionBubbleHasSettledFrame = false
            return
        }
        let iconFrame = icon.convert(icon.bounds, to: self)
        guard iconFrame.width > 12, iconFrame.height > 12, iconFrame.minX > 8, iconFrame.minY > 4 else {
            return
        }
        let bubble = ensureLegacySelectionBubble()
        let width = min(iconFrame.width + 16, 48)
        let height = min(iconFrame.height + 10, 40)
        var next = CGRect(
            x: iconFrame.midX - width / 2,
            y: iconFrame.midY - height / 2,
            width: width,
            height: height
        )
        if let band = legacyFloatingBand(), band.width > 1, band.height > 1 {
            next = legacyBubbleFrame(next, within: band)
        }
        bubble.layer.cornerRadius = next.height * 0.5
        let scale = traitCollection.displayScale > 0 ? traitCollection.displayScale : 1
        bubble.layer.borderWidth = 1 / scale
        bubble.layer.borderColor = UIColor.separator.withAlphaComponent(0.6)
            .resolvedColor(with: traitCollection).cgColor
        bubble.isHidden = false
        if let surface = legacyFloatingSurface, surface.superview === self {
            if bubble.superview !== self || subviews.firstIndex(of: bubble) != (subviews.firstIndex(of: surface) ?? 0) + 1 {
                insertSubview(bubble, aboveSubview: surface)
            }
        } else if bubble.superview !== self {
            insertSubview(bubble, at: 0)
        }
        placeLegacySelectionBubble(bubble, at: next)
    }

    /// Keeps the bubble's own curve inside the outer pill. The bounding box is wider
    /// than the capsule, so the limit is sampled along the bubble outline.
    /// Shifts only as far as that curve requires.
    private func legacyBubbleFrame(_ proposed: CGRect, within band: CGRect) -> CGRect {
        let bandRadius = band.height * 0.5
        func curveInset(at y: CGFloat) -> CGFloat {
            let dy = min(abs(y - band.midY), bandRadius)
            return bandRadius - sqrt(max(0, bandRadius * bandRadius - dy * dy))
        }
        var frame = proposed
        let bubbleRadius = min(frame.width, frame.height) * 0.5
        let pad: CGFloat = 2
        var shiftRight: CGFloat = 0
        var shiftLeft: CGFloat = 0
        var dy = -bubbleRadius
        while dy <= bubbleRadius {
            let y = frame.midY + dy
            let reach = sqrt(max(0, bubbleRadius * bubbleRadius - dy * dy))
            let minX = band.minX + curveInset(at: y) + pad
            let maxX = band.maxX - curveInset(at: y) - pad
            shiftRight = max(shiftRight, minX - (frame.midX - reach))
            shiftLeft = max(shiftLeft, (frame.midX + reach) - maxX)
            dy += 2
        }
        if shiftRight > 0, shiftLeft > 0 {
            let available = max(band.width - (curveInset(at: frame.midY) + pad) * 2, 1)
            frame.size.width = min(frame.width, available)
            frame.origin.x = band.midX - frame.size.width / 2
        } else if shiftRight > 0 {
            frame.origin.x += shiftRight
        } else if shiftLeft > 0 {
            frame.origin.x -= shiftLeft
        }
        let minY = band.minY + pad
        let maxY = band.maxY - pad - frame.height
        if maxY >= minY {
            frame.origin.y = min(max(frame.origin.y, minY), maxY)
        }
        return frame
    }

    private func placeLegacySelectionBubble(_ bubble: UIVisualEffectView, at next: CGRect) {
        let barHidden = isHidden || alpha < 0.01 || window == nil
            || (superview.map { frame.minY >= $0.bounds.height - 1 } ?? true)
        let sliding = bubble.layer.animation(forKey: "position") != nil
            || bubble.layer.animation(forKey: "bounds") != nil
        if sliding, legacyFramesMatch(next, legacySelectionBubbleTarget) {
            return
        }
        let canSlide = legacySelectionBubbleHasSettledFrame
            && !barHidden
            && bubble.bounds.width > 1
            && bubble.window != nil
        legacySelectionBubbleTarget = next
        guard canSlide, !legacyFramesMatch(bubble.frame, next) || sliding else {
            bubble.layer.removeAllAnimations()
            bubble.frame = next
            legacySelectionBubbleHasSettledFrame = !barHidden
            return
        }
        let presented = bubble.layer.presentation()?.frame ?? bubble.frame
        bubble.layer.removeAllAnimations()
        bubble.frame = presented
        UIView.animate(
            withDuration: Self.legacySelectionSlideDuration,
            delay: 0,
            options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction]
        ) {
            bubble.frame = next
        }
    }

    private func legacyFramesMatch(_ lhs: CGRect, _ rhs: CGRect) -> Bool {
        abs(lhs.minX - rhs.minX) < 0.5
            && abs(lhs.minY - rhs.minY) < 0.5
            && abs(lhs.width - rhs.width) < 0.5
            && abs(lhs.height - rhs.height) < 0.5
    }

    private func ensureLegacySelectionBubble() -> UIVisualEffectView {
        if let legacySelectionBubble {
            return legacySelectionBubble
        }
        let created = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        created.isUserInteractionEnabled = false
        created.clipsToBounds = true
        created.layer.cornerCurve = .continuous
        created.contentView.backgroundColor = UIColor.tertiarySystemFill
        created.accessibilityIdentifier = "dubhub.nativeTabBar.legacySelectionBubble"
        created.isAccessibilityElement = false
        created.accessibilityElementsHidden = true
        legacySelectionBubble = created
        return created
    }

    private func ensureLegacyFloatingSurface() -> UIVisualEffectView {
        let surface: UIVisualEffectView
        if let legacyFloatingSurface {
            surface = legacyFloatingSurface
        } else {
            let created = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
            created.isUserInteractionEnabled = false
            created.clipsToBounds = true
            created.layer.cornerCurve = .continuous
            created.accessibilityIdentifier = "dubhub.nativeTabBar.legacyFloatingSurface"
            created.isAccessibilityElement = false
            created.accessibilityElementsHidden = true
            legacyFloatingSurface = created
            surface = created
            backgroundColor = .clear
            softenLegacySurface(created)
        }
        if surface.superview !== self {
            insertSubview(surface, at: 0)
        }
        return surface
    }

    /// Keeps systemChromeMaterial, pulled part-way toward clear so the feed reads through.
    private func softenLegacySurface(_ surface: UIVisualEffectView) {
        let fade = UIViewPropertyAnimator(duration: 1, curve: .linear) {
            surface.effect = nil
        }
        fade.startAnimation()
        fade.pauseAnimation()
        fade.fractionComplete = Self.legacySurfaceClearFraction
        legacySurfaceFade = fade
    }

    /// Stop the pre-iOS 26 `_UIBarBackground` from filling this inset frame,
    /// including the home-indicator band. Does not run on iOS 26.
    private func suppressLegacyTabBarBackground() {
        func walk(_ view: UIView) {
            if view === legacyFloatingSurface || view === legacySelectionBubble { return }
            let name = NSStringFromClass(type(of: view))
            if name.contains("BarBackground") {
                view.isHidden = true
                view.alpha = 0
                return
            }
            if DubHubNativeTabBarIconAnimator.isTabItemButtonCandidate(view) {
                return
            }
            for child in view.subviews {
                walk(child)
            }
        }
        for child in subviews {
            walk(child)
        }
    }

    /// Visible control band inside the existing frame.
    /// Home-indicator phones: `safeAreaInsets.bottom` is the indicator region
    /// already included in `sizeThatFits`, so the material stops above it.
    /// If that inset is missing, follow the glyph cluster instead of rounding
    /// the full bar bounds down to the screen edge.
    private func legacyFloatingBand() -> CGRect? {
        let width = bounds.width
        guard width > 1, bounds.height > 1 else { return nil }
        let safeBottom = safeAreaInsets.bottom
        if safeBottom > 0.5 {
            let height = bounds.height - safeBottom
            guard height > 1 else { return nil }
            return CGRect(x: 0, y: 0, width: width, height: height)
        }
        guard let cluster = legacyControlCluster() else { return nil }
        let leftover = bounds.height - cluster.maxY
        if leftover > 12 {
            return CGRect(x: 0, y: 0, width: width, height: max(cluster.maxY, 1))
        }
        return bounds
    }

    /// Glyph union plus room for the system label. Width stays the bar width.
    private func legacyControlCluster() -> CGRect? {
        let buttons = DubHubNativeTabBarIconAnimator.dedupedTabButtons(in: self, requireWindow: false)
        var union: CGRect?
        for button in buttons {
            guard let icon = DubHubNativeTabBarIconAnimator.preferredIconImageView(in: button) else { continue }
            let frame = icon.convert(icon.bounds, to: self)
            guard frame.width > 1, frame.height > 1 else { continue }
            union = union.map { $0.union(frame) } ?? frame
        }
        guard let icons = union else { return nil }
        let topPad: CGFloat = 6
        let belowGlyph: CGFloat = 18
        let y = max(0, icons.minY - topPad)
        var height = icons.height + topPad + belowGlyph
        if y + height > bounds.height {
            height = bounds.height - y
        }
        guard height > 1 else { return nil }
        return CGRect(x: 0, y: y, width: bounds.width, height: height)
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

/// Pre-iOS 26 image-swap host.
/// Legacy `UITabBarSwappableImageView` ignores direct image replacement.
/// iOS 26+ returns the resolved icon and never creates a view.
enum DubHubNativeTabBarIconSwapOverlay {
    private final class Cover {
        weak var native: UIImageView?
        let overlay: UIImageView
        let savedAlpha: CGFloat
        var liftedBadges: [UIView] = []

        init(native: UIImageView, overlay: UIImageView, savedAlpha: CGFloat) {
            self.native = native
            self.overlay = overlay
            self.savedAlpha = savedAlpha
        }
    }

    private static var coversByOverlay: [ObjectIdentifier: Cover] = [:]
    private static var overlayIDByNative: [ObjectIdentifier: ObjectIdentifier] = [:]

    /// View that should receive image-swap frames. iOS 26+ is `native` itself.
    static func begin(over native: UIImageView) -> UIImageView {
        if #available(iOS 26.0, *) {
            return native
        }
        endCovering(native)
        guard let parent = native.superview, native.window != nil else {
            return native
        }
        let overlay = UIImageView(image: native.image)
        overlay.frame = native.frame
        overlay.contentMode = native.contentMode
        overlay.tintColor = inheritedTint(of: native)
        overlay.clipsToBounds = native.clipsToBounds
        overlay.isUserInteractionEnabled = false
        overlay.isAccessibilityElement = false
        overlay.accessibilityElementsHidden = true
        overlay.backgroundColor = .clear
        parent.insertSubview(overlay, aboveSubview: native)
        let cover = Cover(native: native, overlay: overlay, savedAlpha: native.alpha)
        coversByOverlay[ObjectIdentifier(overlay)] = cover
        overlayIDByNative[ObjectIdentifier(native)] = ObjectIdentifier(overlay)
        native.alpha = 0
        sync(cover)
        return overlay
    }

    /// Keeps a pre-iOS 26 overlay aligned with its native icon. No-op on iOS 26+.
    static func holdInPlace(_ animatedView: UIImageView) {
        if #available(iOS 26.0, *) { return }
        guard let cover = coversByOverlay[ObjectIdentifier(animatedView)] else { return }
        sync(cover)
    }

    /// Re-aligns every active pre-iOS 26 overlay after UIKit layout. No-op on iOS 26+.
    static func syncActiveCovers() {
        if #available(iOS 26.0, *) { return }
        for cover in coversByOverlay.values {
            sync(cover)
        }
    }

    static func isAnimationOverlay(_ view: UIView) -> Bool {
        coversByOverlay[ObjectIdentifier(view)] != nil
    }

    static func isCoveredNative(_ view: UIView) -> Bool {
        overlayIDByNative[ObjectIdentifier(view)] != nil
    }

    /// Restores the native icon and removes the overlay. No-op on iOS 26+ and on the native view.
    static func end(_ animatedView: UIImageView) {
        if #available(iOS 26.0, *) { return }
        let key = ObjectIdentifier(animatedView)
        if let cover = coversByOverlay.removeValue(forKey: key) {
            restore(cover)
            return
        }
        endCovering(animatedView)
    }

    private static func endCovering(_ native: UIImageView) {
        guard let overlayID = overlayIDByNative[ObjectIdentifier(native)],
              let cover = coversByOverlay.removeValue(forKey: overlayID) else { return }
        restore(cover)
    }

    private static func sync(_ cover: Cover) {
        guard let native = cover.native,
              let parent = native.superview,
              cover.overlay.superview === parent else { return }
        cover.overlay.frame = native.frame
        if native.alpha != 0 {
            native.alpha = 0
        }
        for child in native.subviews where isProfileBadge(child) {
            let frame = native.convert(child.frame, to: parent)
            parent.insertSubview(child, aboveSubview: cover.overlay)
            child.frame = frame
            if !cover.liftedBadges.contains(where: { $0 === child }) {
                cover.liftedBadges.append(child)
            }
        }
    }

    private static func restore(_ cover: Cover) {
        let overlayID = ObjectIdentifier(cover.overlay)
        if let native = cover.native {
            overlayIDByNative.removeValue(forKey: ObjectIdentifier(native))
            for badge in cover.liftedBadges where badge.superview !== native {
                let frame = badge.superview?.convert(badge.frame, to: native) ?? badge.frame
                native.addSubview(badge)
                badge.frame = frame
            }
            cover.liftedBadges.removeAll()
            native.alpha = cover.savedAlpha
        } else {
            overlayIDByNative = overlayIDByNative.filter { $0.value != overlayID }
            cover.liftedBadges.removeAll()
        }
        cover.overlay.removeFromSuperview()
    }

    private static func isProfileBadge(_ view: UIView) -> Bool {
        NSStringFromClass(type(of: view)).contains("DubHubNativeProfileUnreadBadgeView")
    }

    private static func inheritedTint(of view: UIView) -> UIColor? {
        if let tint = view.tintColor { return tint }
        var node = view.superview
        while let current = node {
            if let tint = current.tintColor { return tint }
            node = current.superview
        }
        return nil
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
        DubHubNativeTabBarIconSwapOverlay.end(imageView)
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
        if let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) {
            play(tabId: tabId, imageView: imageView, tabBar: tabBar, generation: generation)
            return
        }
        // One runloop retry if icon views were not ready synchronously.
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) else {
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
            if let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) {
                animateProfileArtist(imageView, tabBar: tabBar)
                return
            }
            DispatchQueue.main.async {
                guard generation == committedAnimationGeneration else { return }
                tabBar.layoutIfNeeded()
                guard DubHubNativeTabBarChrome.shared.isArtistProfileIconRole else {
                    return
                }
                guard let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) else {
                    return
                }
                guard generation == committedAnimationGeneration else { return }
                animateProfileArtist(imageView, tabBar: tabBar)
            }
            return
        }
        if let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) {
            animateProfileCommunity(imageView, tabBar: tabBar)
            return
        }
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard !DubHubNativeTabBarChrome.shared.isArtistProfileIconRole else {
                return
            }
            guard let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) else {
                return
            }
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
        DubHubNativeTabBarIconSwapOverlay.holdInPlace(imageView)
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
        let animated = DubHubNativeTabBarIconSwapOverlay.begin(over: imageView)
        resetHome(animated)
        homeSessionGeneration = generation
        activeHomeImageView = animated

        DispatchQueue.main.asyncAfter(deadline: .now() + homeStartDelay) {
            guard isHomeSessionCurrent(generation, imageView: animated) else {
                DubHubNativeTabBarIconSwapOverlay.end(animated)
                return
            }
            crossDissolveHomeImage(
                animated,
                to: playingHomeImage(),
                generation: generation
            ) {
                guard isHomeSessionCurrent(generation, imageView: animated) else {
                    DubHubNativeTabBarIconSwapOverlay.end(animated)
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + homeHoldDuration) {
                    guard isHomeSessionCurrent(generation, imageView: animated) else {
                        DubHubNativeTabBarIconSwapOverlay.end(animated)
                        return
                    }
                    crossDissolveHomeImage(
                        animated,
                        to: canonicalHomeImage(),
                        generation: generation
                    ) {
                        guard isHomeSessionCurrent(generation, imageView: animated) else {
                            DubHubNativeTabBarIconSwapOverlay.end(animated)
                            return
                        }
                        resetHome(animated)
                        activeHomeImageView = nil
                        DubHubNativeTabBarIconSwapOverlay.end(animated)
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
        if let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) {
            animateLeaderboard(imageView, tabBar: tabBar)
            return
        }
        DispatchQueue.main.async {
            guard generation == committedAnimationGeneration else { return }
            tabBar.layoutIfNeeded()
            guard let imageView = resolveIconImageViewForCommittedAnimation(for: item, in: tabBar) else {
                return
            }
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
        resolveIconImageView(for: item, in: tabBar, requireWindow: true)
    }

    /// PROFILE-NAV-BADGE-2E: badge bind may run before tab buttons join a window / before selection.
    static func resolveIconImageView(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> UIImageView? {
        guard let button = resolveTabButton(for: item, in: tabBar, requireWindow: requireWindow) else {
            return nil
        }
        let imageView = preferredIconImageView(in: button)
        return imageView
    }

    /// Animation-only resolve. Same picker as `resolveIconImageView`.
    private static func resolveIconImageViewForCommittedAnimation(
        for item: UITabBarItem,
        in tabBar: UITabBar
    ) -> UIImageView? {
        return resolveIconImageView(for: item, in: tabBar)
    }

    /// PROFILE-NAV-BADGE-2C/2E: stable tab-slot host (does not morph with glyph selection anim).
    static func resolveTabButton(for item: UITabBarItem, in tabBar: UITabBar) -> UIView? {
        resolveTabButton(for: item, in: tabBar, requireWindow: true)
    }

    static func resolveTabButton(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> UIView? {
        guard let items = tabBar.items,
              let index = items.firstIndex(of: item)
        else {
            return nil
        }
        let buttons = dedupedTabButtons(in: tabBar, requireWindow: requireWindow)
        guard index < buttons.count else {
            return nil
        }
        return buttons[index]
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
        // iOS 26 `_UITabButton` matches TabButton. Pre-iOS 26 also accepts
        // `UITabBarButton` (TabBarButton). Labels and chrome stay excluded.
        let matchesButton: Bool
        if #available(iOS 26.0, *) {
            matchesButton = name.contains("TabButton")
        } else {
            matchesButton = name.contains("TabButton") || name.contains("TabBarButton")
        }
        guard matchesButton else { return false }
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
        dedupedTabButtons(in: tabBar, requireWindow: true)
    }

    static func dedupedTabButtons(in tabBar: UITabBar, requireWindow: Bool) -> [UIView] {
        let raw = collectTabButtonCandidates(in: tabBar)
        struct Slot {
            var midX: CGFloat
            var button: UIView
        }
        var slots: [Slot] = []
        for button in raw {
            guard isPresentForResolve(button, requireWindow: requireWindow) else { continue }
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

    /// PROFILE-NAV-BADGE-2H: SelectedContent / DestOut / liquid-lens trees that mask inactive overlays.
    static func isUnderSelectedOrMaskedTabTree(_ view: UIView) -> Bool {
        if isUnderLiquidCompositor(view) { return true }
        var current: UIView? = view
        while let node = current {
            let name = NSStringFromClass(type(of: node))
            if name.contains("SelectedContent")
                || name.contains("SelectionView")
                || name.contains("FloatingTab")
            {
                return true
            }
            current = node.superview
        }
        return false
    }

    /// PROFILE-NAV-BADGE-2H: inactive ContentView Profile `_UITabButton` host.
    static func resolveBadgeTabButton(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> UIView? {
        let group = collectTabButtonDuplicates(for: item, in: tabBar, requireWindow: requireWindow)
        guard !group.isEmpty else { return nil }
        if let preferred = group
            .filter({ !isUnderSelectedOrMaskedTabTree($0) })
            .max(by: { visibilityScore($0) < visibilityScore($1) })
        {
            return preferred
        }
        return group.max(by: { visibilityScore($0) < visibilityScore($1) })
    }

    /// PROFILE-NAV-BADGE-2H: SelectedContent Profile `_UITabButton`.
    static func resolveSelectedTreeTabButton(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> UIView? {
        let group = collectTabButtonDuplicates(for: item, in: tabBar, requireWindow: requireWindow)
        if let preferred = group
            .filter({ isUnderSelectedOrMaskedTabTree($0) })
            .max(by: { visibilityScore($0) < visibilityScore($1) })
        {
            return preferred
        }
        return nil
    }

    /// PROFILE-NAV-BADGE-2H: glyph host inside the selected Profile tree (smooth-follow).
    static func resolveSelectedBadgeIconImageView(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> UIImageView? {
        if let button = resolveSelectedTreeTabButton(
            for: item,
            in: tabBar,
            requireWindow: requireWindow
        ),
           let imageView = preferredIconImageView(in: button)
        {
            return imageView
        }
        // Fallback: default icon resolve only if it already sits under selected/masked tree.
        if let imageView = resolveIconImageView(
            for: item,
            in: tabBar,
            requireWindow: requireWindow
        ),
           isUnderSelectedOrMaskedTabTree(imageView)
        {
            return imageView
        }
        return nil
    }

    /// All TabButton duplicates for a tab index (dual Liquid Glass trees).
    static func collectTabButtonDuplicates(
        for item: UITabBarItem,
        in tabBar: UITabBar,
        requireWindow: Bool
    ) -> [UIView] {
        guard let items = tabBar.items,
              let index = items.firstIndex(of: item)
        else {
            return []
        }
        let raw = collectTabButtonCandidates(in: tabBar)
        var slots: [(midX: CGFloat, buttons: [UIView])] = []
        for button in raw {
            guard isPresentForResolve(button, requireWindow: requireWindow) else { continue }
            let frameInBar = button.convert(button.bounds, to: tabBar)
            guard frameInBar.width > 1, frameInBar.height > 1 else { continue }
            let midX = frameInBar.midX
            if let existingIndex = slots.firstIndex(where: {
                abs($0.midX - midX) <= horizontalDedupeTolerance
            }) {
                slots[existingIndex].buttons.append(button)
            } else {
                slots.append((midX: midX, buttons: [button]))
            }
        }
        let ordered = slots.sorted { $0.midX < $1.midX }
        guard index < ordered.count else { return [] }
        return ordered[index].buttons
    }

    private static func isVisuallyPresent(_ view: UIView) -> Bool {
        isPresentForResolve(view, requireWindow: true)
    }

    /// PROFILE-NAV-BADGE-2E: allow pre-window / pre-selection resolve for badge bind only.
    private static func isPresentForResolve(_ view: UIView, requireWindow: Bool) -> Bool {
        guard !view.isHidden, view.alpha > 0.01 else { return false }
        if requireWindow { return view.window != nil }
        return true
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
        let visible = candidates.filter { imageView in
            if DubHubNativeTabBarIconSwapOverlay.isAnimationOverlay(imageView) { return false }
            if DubHubNativeTabBarIconSwapOverlay.isCoveredNative(imageView) { return true }
            return !imageView.isHidden && imageView.alpha > 0.01
        }
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
