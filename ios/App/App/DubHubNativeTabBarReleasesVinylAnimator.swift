import UIKit

/// Single-source Releases vinyl roll-out session.
/// Generated frames are assigned only to the preferred platter glyph UIImageView;
/// Liquid Glass portal/lens may mirror that source. Canonical static restore always
/// uses `DubHubTabReleases` template — never a previously generated frame.
///
/// Sleeve is reconstructed at identity every frame. Vinyl alone translates/rotates
/// under a fixed artboard-space clip `x >= 13.55` so the sleeve window stays empty.
final class DubHubNativeTabBarReleasesVinylAnimator: NSObject {
    /// Total motion envelope (out + hold + return).
    static let duration: TimeInterval = 0.370
    static let outDuration: TimeInterval = 0.125
    static let holdDuration: TimeInterval = 0.100
    static let returnDuration: TimeInterval = 0.145

    /// Outward roll in 24pt source coordinates.
    static let outwardTranslationX: CGFloat = 3.25
    static let outwardTranslationY: CGFloat = 0
    /// Clockwise on screen; Core Graphics radians (Y-up PDF space after flip).
    static let outwardRotationRadians: CGFloat = -22 * .pi / 180

    /// Fixed screen-space / artboard-space vinyl visibility clip (does not move with vinyl).
    static let vinylClipMinX: CGFloat = 13.55

    /// Canonical artboard (sleeve + rest vinyl). Extra transparent width is appended on the RIGHT only.
    static let artboard: CGFloat = 24
    /// NATIVE-NAV-RELEASES-3: outer render width so outward vinyl (≈26.75) is not cropped.
    static let canvasWidth: CGFloat = 28
    static let canvasHeight: CGFloat = 24
    /// Transparent overflow appended to the right of the anchored 24×24 art.
    static let rightOverflow: CGFloat = canvasWidth - artboard

    private static let assetName = "DubHubTabReleases"
    private static weak var activeSession: DubHubNativeTabBarReleasesVinylAnimator?

    private weak var sourceImageView: UIImageView?
    private var fallbackTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var sessionTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var displayLink: CADisplayLink?
    private var animationStartMediaTime: CFTimeInterval = 0
    private var currentUnitProgress: CGFloat = 0
    private var didFinish = false
    private var didSwapToGenerated = false
    private var didPrepareHostOverflow = false
    private var completion: (() -> Void)?

    /// Saved Releases glyph host state restored on cancel/finish (no global tab-bar mutation).
    private struct HostOverflowSnapshot {
        var contentMode: UIView.ContentMode
        var clipsToBounds: Bool
        var masksToBounds: Bool
        var ancestorClipRestores: [(UIView, Bool, Bool)]
    }

    private var hostOverflowSnapshot: HostOverflowSnapshot?

    /// Cancels any in-flight Releases vinyl session (host arg kept for call-site compat).
    static func cancelAll(in host: UIView?) {
        _ = host
        activeSession?.cancelAndRestore()
        activeSession = nil
    }

    /// Canonical idle glyph — never restore from a generated frame.
    static func canonicalReleasesImage() -> UIImage? {
        UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func play(
        over imageView: UIImageView,
        fallbackTint: UIColor,
        completion: (() -> Void)? = nil
    ) {
        cancelAll(in: nil)
        let session = DubHubNativeTabBarReleasesVinylAnimator()
        activeSession = session
        session.sourceImageView = imageView
        session.fallbackTint = fallbackTint
        session.sessionTint = session.resolvedTint(for: imageView)
        session.completion = completion
        session.currentUnitProgress = 0
        // Overflow host before first frame so 28×24 rest art keeps 24pt optical scale.
        session.prepareHostForOverflow()
        // First generated frame at rest before the clock — no blank flash.
        session.applyCurrentFrame()
        session.startDisplayLinkClock()
    }

    func cancelAndRestore() {
        stopDisplayLink()
        restoreCanonicalImage()
        restoreHostOverflow()
        didFinish = true
        sourceImageView = nil
        if Self.activeSession === self {
            Self.activeSession = nil
        }
    }

    // MARK: - Geometry (PDF 24×24, y-up; renderer flips CTM)

    static let vinylCenter = CGPoint(x: 14.25, y: 12)
    static let vinylOuterRadius: CGFloat = 9.25
    static let vinylHoleRadius: CGFloat = 2.35
    static let vinylNubRadius: CGFloat = 0.5

    static let sleeveBounds = CGRect(x: 2.35, y: 2.75, width: 11.9, height: 18.5)
    static let sleeveCornerRadius: CGFloat = 1.85
    static let sleeveWindowCenter = CGPoint(x: 8.3, y: 12)
    static let sleeveWindowRadius: CGFloat = 2.15

    /// Cubic ease-in-out matching `UIView.AnimationCurve.easeInOut` feel.
    static func easeInOutUnit(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        if x < 0.5 {
            return 2 * x * x
        }
        let u = -2 * x + 2
        return 1 - (u * u) / 2
    }

    /// 0 = rest, 1 = full outward. Hold parks at 1; return eases back to 0.
    static func unitProgress(elapsed: TimeInterval) -> CGFloat {
        if elapsed < outDuration {
            return easeInOutUnit(CGFloat(elapsed / outDuration))
        }
        let afterOut = elapsed - outDuration
        if afterOut < holdDuration {
            return 1
        }
        let afterHold = afterOut - holdDuration
        if afterHold < returnDuration {
            return 1 - easeInOutUnit(CGFloat(afterHold / returnDuration))
        }
        return 0
    }

    static func translationX(unitProgress: CGFloat) -> CGFloat {
        outwardTranslationX * unitProgress
    }

    static func rotationRadians(unitProgress: CGFloat) -> CGFloat {
        outwardRotationRadians * unitProgress
    }

    // MARK: - Paths

    static func makeVinylEvenOddPath() -> UIBezierPath {
        let path = UIBezierPath(
            ovalIn: CGRect(
                x: vinylCenter.x - vinylOuterRadius,
                y: vinylCenter.y - vinylOuterRadius,
                width: vinylOuterRadius * 2,
                height: vinylOuterRadius * 2
            )
        )
        path.append(
            UIBezierPath(
                ovalIn: CGRect(
                    x: vinylCenter.x - vinylHoleRadius,
                    y: vinylCenter.y - vinylHoleRadius,
                    width: vinylHoleRadius * 2,
                    height: vinylHoleRadius * 2
                )
            )
        )
        for groove in makeGrooveCutoutPaths() {
            path.append(groove)
        }
        path.usesEvenOddFillRule = true
        return path
    }

    static func makeVinylNubPath() -> UIBezierPath {
        UIBezierPath(
            ovalIn: CGRect(
                x: vinylCenter.x - vinylNubRadius,
                y: vinylCenter.y - vinylNubRadius,
                width: vinylNubRadius * 2,
                height: vinylNubRadius * 2
            )
        )
    }

    /// Exact groove cutouts from `DubHubTabReleases.pdf` (PDF y-up coordinates).
    static func makeGrooveCutoutPaths() -> [UIBezierPath] {
        let g0 = UIBezierPath()
        g0.move(to: CGPoint(x: 16.82124, y: 18.24109))
        g0.addCurve(
            to: CGPoint(x: 20.89094, y: 13.20845),
            controlPoint1: CGPoint(x: 18.94606, y: 17.3657),
            controlPoint2: CGPoint(x: 20.47952, y: 15.4694)
        )
        g0.addCurve(
            to: CGPoint(x: 21.35609, y: 12.88652),
            controlPoint1: CGPoint(x: 20.9305, y: 12.9911),
            controlPoint2: CGPoint(x: 21.13875, y: 12.84697)
        )
        g0.addCurve(
            to: CGPoint(x: 21.67802, y: 13.35167),
            controlPoint1: CGPoint(x: 21.57344, y: 12.92607),
            controlPoint2: CGPoint(x: 21.71757, y: 13.13433)
        )
        g0.addCurve(
            to: CGPoint(x: 17.12598, y: 18.98078),
            controlPoint1: CGPoint(x: 21.21783, y: 15.88059),
            controlPoint2: CGPoint(x: 19.50263, y: 18.00163)
        )
        g0.addCurve(
            to: CGPoint(x: 16.60377, y: 18.7633),
            controlPoint1: CGPoint(x: 16.92172, y: 19.06493),
            controlPoint2: CGPoint(x: 16.68792, y: 18.96756)
        )
        g0.addCurve(
            to: CGPoint(x: 16.82124, y: 18.24109),
            controlPoint1: CGPoint(x: 16.51962, y: 18.55904),
            controlPoint2: CGPoint(x: 16.61698, y: 18.32524)
        )
        g0.close()

        let g1 = UIBezierPath()
        g1.move(to: CGPoint(x: 16.32604, y: 17.0391))
        g1.addCurve(
            to: CGPoint(x: 19.61195, y: 12.97571),
            controlPoint1: CGPoint(x: 18.04163, y: 16.3323),
            controlPoint2: CGPoint(x: 19.27976, y: 14.80122)
        )
        g1.addCurve(
            to: CGPoint(x: 20.0771, y: 12.65379),
            controlPoint1: CGPoint(x: 19.6515, y: 12.75837),
            controlPoint2: CGPoint(x: 19.85975, y: 12.61424)
        )
        g1.addCurve(
            to: CGPoint(x: 20.39902, y: 13.11893),
            controlPoint1: CGPoint(x: 20.29444, y: 12.69334),
            controlPoint2: CGPoint(x: 20.43857, y: 12.90159)
        )
        g1.addCurve(
            to: CGPoint(x: 16.63078, y: 17.77879),
            controlPoint1: CGPoint(x: 20.01808, y: 15.21241),
            controlPoint2: CGPoint(x: 18.5982, y: 16.96824)
        )
        g1.addCurve(
            to: CGPoint(x: 16.10857, y: 17.56132),
            controlPoint1: CGPoint(x: 16.42652, y: 17.86294),
            controlPoint2: CGPoint(x: 16.19272, y: 17.76557)
        )
        g1.addCurve(
            to: CGPoint(x: 16.32604, y: 17.0391),
            controlPoint1: CGPoint(x: 16.02442, y: 17.35706),
            controlPoint2: CGPoint(x: 16.12178, y: 17.12325)
        )
        g1.close()

        let g2 = UIBezierPath()
        g2.move(to: CGPoint(x: 15.83084, y: 15.83711))
        g2.addCurve(
            to: CGPoint(x: 18.33295, y: 12.74297),
            controlPoint1: CGPoint(x: 17.13721, y: 15.29891),
            controlPoint2: CGPoint(x: 18.08, y: 14.13304)
        )
        g2.addCurve(
            to: CGPoint(x: 18.7981, y: 12.42105),
            controlPoint1: CGPoint(x: 18.3725, y: 12.52563),
            controlPoint2: CGPoint(x: 18.58076, y: 12.3815)
        )
        g2.addCurve(
            to: CGPoint(x: 19.12003, y: 12.8862),
            controlPoint1: CGPoint(x: 19.01545, y: 12.4606),
            controlPoint2: CGPoint(x: 19.15958, y: 12.66885)
        )
        g2.addCurve(
            to: CGPoint(x: 16.13558, y: 16.5768),
            controlPoint1: CGPoint(x: 18.81832, y: 14.54423),
            controlPoint2: CGPoint(x: 17.69378, y: 15.93484)
        )
        g2.addCurve(
            to: CGPoint(x: 15.61337, y: 16.35933),
            controlPoint1: CGPoint(x: 15.93132, y: 16.66095),
            controlPoint2: CGPoint(x: 15.69752, y: 16.56359)
        )
        g2.addCurve(
            to: CGPoint(x: 15.83084, y: 15.83711),
            controlPoint1: CGPoint(x: 15.52921, y: 16.15507),
            controlPoint2: CGPoint(x: 15.62658, y: 15.92127)
        )
        g2.close()

        return [g0, g1, g2]
    }

    static func makeSleeveEvenOddPath() -> UIBezierPath {
        let path = UIBezierPath(
            roundedRect: sleeveBounds,
            cornerRadius: sleeveCornerRadius
        )
        path.append(
            UIBezierPath(
                ovalIn: CGRect(
                    x: sleeveWindowCenter.x - sleeveWindowRadius,
                    y: sleeveWindowCenter.y - sleeveWindowRadius,
                    width: sleeveWindowRadius * 2,
                    height: sleeveWindowRadius * 2
                )
            )
        )
        path.usesEvenOddFillRule = true
        return path
    }

    // MARK: - Frame renderer

    static func renderVinylFrame(
        unitProgress: CGFloat,
        tint: UIColor,
        displayScale: CGFloat
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = max(displayScale, 1)
        format.opaque = false
        format.preferredRange = .standard
        // 28×24: canonical 24×24 art anchored at (0,0); +4pt transparent overflow on the right.
        let size = CGSize(width: canvasWidth, height: canvasHeight)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let tx = translationX(unitProgress: unitProgress)
        let angle = rotationRadians(unitProgress: unitProgress)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            // PDF y-up space so audited path coordinates apply verbatim.
            cg.translateBy(x: 0, y: canvasHeight)
            cg.scaleBy(x: 1, y: -1)

            tint.setFill()

            // 1) Fixed artboard-space clip (does not ride the vinyl transform).
            //    Width spans into right overflow so outward vinyl is not canvas-cropped.
            cg.saveGState()
            cg.clip(to: CGRect(
                x: vinylClipMinX,
                y: 0,
                width: canvasWidth - vinylClipMinX,
                height: canvasHeight
            ))

            // 2) Rotate about translated vinyl centre, then draw rest-space vinyl.
            //    Point p maps to R*(p - restCenter) + restCenter + (tx, 0).
            cg.translateBy(x: vinylCenter.x + tx, y: vinylCenter.y)
            cg.rotate(by: angle)
            cg.translateBy(x: -vinylCenter.x, y: -vinylCenter.y)

            makeVinylEvenOddPath().fill()
            makeVinylNubPath().fill()
            cg.restoreGState()

            // 3) Static sleeve last — occludes opening; window stays empty.
            makeSleeveEvenOddPath().fill()
        }
        return image.withRenderingMode(.alwaysOriginal)
    }

    // MARK: - Host overflow (Releases glyph only)

    /// Left-align unscaled 28×24 frames and disable local clipping so the right overflow
    /// remains visible without shrinking the 24pt optical icon.
    private func prepareHostForOverflow() {
        guard !didPrepareHostOverflow, let imageView = sourceImageView else { return }
        var ancestorRestores: [(UIView, Bool, Bool)] = []
        // Only climb immediate non-bar ancestors; never touch UITabBar / Liquid Glass chrome.
        var node: UIView? = imageView.superview
        var depth = 0
        while let view = node, depth < 3 {
            if Self.isGlobalTabChrome(view) { break }
            let clipped = view.clipsToBounds || view.layer.masksToBounds
            if clipped {
                ancestorRestores.append((view, view.clipsToBounds, view.layer.masksToBounds))
                view.clipsToBounds = false
                view.layer.masksToBounds = false
            }
            node = view.superview
            depth += 1
        }
        hostOverflowSnapshot = HostOverflowSnapshot(
            contentMode: imageView.contentMode,
            clipsToBounds: imageView.clipsToBounds,
            masksToBounds: imageView.layer.masksToBounds,
            ancestorClipRestores: ancestorRestores
        )
        imageView.contentMode = .left
        imageView.clipsToBounds = false
        imageView.layer.masksToBounds = false
        didPrepareHostOverflow = true
    }

    private func restoreHostOverflow() {
        guard didPrepareHostOverflow else { return }
        if let imageView = sourceImageView, let snap = hostOverflowSnapshot {
            imageView.contentMode = snap.contentMode
            imageView.clipsToBounds = snap.clipsToBounds
            imageView.layer.masksToBounds = snap.masksToBounds
            for (view, clips, masks) in snap.ancestorClipRestores.reversed() {
                view.clipsToBounds = clips
                view.layer.masksToBounds = masks
            }
        }
        hostOverflowSnapshot = nil
        didPrepareHostOverflow = false
    }

    private static func isGlobalTabChrome(_ view: UIView) -> Bool {
        if view is UITabBar { return true }
        let name = NSStringFromClass(type(of: view))
        let blocked = [
            "UITabBar",
            "Platter",
            "LiquidLens",
            "Portal",
            "TabSelection",
            "DestOut",
            "ClearGlass",
            "GlassView",
        ]
        return blocked.contains { name.contains($0) }
    }

    // MARK: - Single source

    private func isSourceValid(_ imageView: UIImageView) -> Bool {
        imageView.window != nil && imageView.superview != nil
    }

    private func resolvedTint(for imageView: UIImageView) -> UIColor {
        imageView.tintColor
            ?? imageView.superview?.tintColor
            ?? fallbackTint
    }

    private func applyCurrentFrame() {
        guard let imageView = sourceImageView, isSourceValid(imageView) else {
            abortDueToDetach()
            return
        }
        let scale = imageView.traitCollection.displayScale > 0
            ? imageView.traitCollection.displayScale
            : UIScreen.main.scale
        let frame = Self.renderVinylFrame(
            unitProgress: currentUnitProgress,
            tint: sessionTint,
            displayScale: scale
        )
        imageView.image = frame
        didSwapToGenerated = true
    }

    private func restoreCanonicalImage() {
        guard didSwapToGenerated, let imageView = sourceImageView else {
            didSwapToGenerated = false
            return
        }
        if imageView.superview != nil || imageView.window != nil {
            imageView.image = Self.canonicalReleasesImage()
        }
        didSwapToGenerated = false
    }

    private func abortDueToDetach() {
        guard !didFinish else { return }
        stopDisplayLink()
        restoreCanonicalImage()
        restoreHostOverflow()
        finish(silently: true)
    }

    // MARK: - Deterministic clock

    private func startDisplayLinkClock() {
        stopDisplayLink()
        animationStartMediaTime = CACurrentMediaTime()
        let link = CADisplayLink(target: self, selector: #selector(onDisplayLinkTick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func onDisplayLinkTick() {
        guard let imageView = sourceImageView, isSourceValid(imageView) else {
            abortDueToDetach()
            return
        }
        let elapsed = CACurrentMediaTime() - animationStartMediaTime
        if elapsed >= Self.duration {
            currentUnitProgress = 0
            applyCurrentFrame()
            finish(silently: false)
            return
        }
        currentUnitProgress = Self.unitProgress(elapsed: elapsed)
        applyCurrentFrame()
    }

    private func finish(silently: Bool) {
        guard !didFinish else { return }
        didFinish = true
        stopDisplayLink()
        restoreCanonicalImage()
        restoreHostOverflow()
        sourceImageView = nil
        if Self.activeSession === self {
            Self.activeSession = nil
        }
        let done = completion
        completion = nil
        if !silently {
            done?()
        }
    }
}
