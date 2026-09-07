import UIKit

/// Single-source Leaderboard EQ session.
/// Generated frames are assigned only to the preferred platter glyph UIImageView;
/// Liquid Glass portal/lens may mirror that source. Canonical static restore always
/// uses `DubHubTabLeaderboard` template — never a previously generated frame.
final class DubHubNativeTabBarLeaderboardEQOverlay: NSObject {
    /// Total motion envelope (travel + dwell + return).
    static let duration: TimeInterval = 0.38
    static let travelDuration: TimeInterval = 0.160
    static let holdDuration: TimeInterval = 0.050
    static let returnDuration: TimeInterval = 0.170
    /// Optical inset from usable track ends in 24pt source coordinates.
    static let trackEndInsetArtboard: CGFloat = 0.65
    /// Outer shell corner radius from `DubHubTabLeaderboard.pdf` (not a stadium).
    static let shellCornerRadiusArtboard: CGFloat = 1.6

    private static let artboard: CGFloat = 24
    private static let assetName = "DubHubTabLeaderboard"
    private static weak var activeSession: DubHubNativeTabBarLeaderboardEQOverlay?

    private weak var sourceImageView: UIImageView?
    private var fallbackTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var artboardDeltas: [CGFloat] = []
    private var displayLink: CADisplayLink?
    private var animationStartMediaTime: CFTimeInterval = 0
    private var currentUnitProgress: CGFloat = 0
    private var didFinish = false
    private var didSwapToGenerated = false
    private var completion: (() -> Void)?

    /// Cancels any in-flight Leaderboard EQ session (host arg kept for call-site compat).
    static func cancelAll(in host: UIView?) {
        _ = host
        activeSession?.cancelAndRestore()
        activeSession = nil
    }

    /// Canonical idle glyph — never restore from a generated frame.
    static func canonicalLeaderboardImage() -> UIImage? {
        UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func play(
        over imageView: UIImageView,
        fallbackTint: UIColor,
        completion: (() -> Void)? = nil
    ) {
        cancelAll(in: nil)
        let session = DubHubNativeTabBarLeaderboardEQOverlay()
        activeSession = session
        session.sourceImageView = imageView
        session.fallbackTint = fallbackTint
        session.completion = completion
        session.artboardDeltas = Self.faderSpecs.map { spec in
            Self.knobDestinationDeltaYArtboard(
                track: spec.track,
                knob: spec.knob,
                towardTop: spec.direction == .towardTop
            )
        }
        session.currentUnitProgress = 0
        // First generated frame at rest before the clock — no blank flash.
        session.applyCurrentFrame()
        session.startDisplayLinkClock()
    }

    func cancelAndRestore() {
        stopDisplayLink()
        restoreCanonicalImage()
        didFinish = true
        sourceImageView = nil
        if Self.activeSession === self {
            Self.activeSession = nil
        }
    }

    // MARK: - Geometry (PDF 24×24, y-up → UIKit y-down)

    private enum TravelDirection {
        case towardTop
        case towardBottom
    }

    private struct FaderSpec {
        let shell: CGRect
        let track: CGRect
        let knob: CGRect
        let direction: TravelDirection
    }

    private static let faderSpecs: [FaderSpec] = [
        FaderSpec(
            shell: pdfRect(x0: 2.55, x1: 7.85, y0: 2.5, y1: 16.85),
            track: pdfRect(x0: 4.8, x1: 5.6, y0: 4.25, y1: 15.1),
            knob: pdfRect(x0: 3.4, x1: 7.0, y0: 9.987, y1: 11.227),
            direction: .towardTop
        ),
        FaderSpec(
            shell: pdfRect(x0: 8.85, x1: 14.15, y0: 2.5, y1: 21.0),
            track: pdfRect(x0: 11.1, x1: 11.9, y0: 4.25, y1: 19.25),
            knob: pdfRect(x0: 9.7, x1: 13.3, y0: 15.554, y1: 16.794),
            direction: .towardBottom
        ),
        FaderSpec(
            shell: pdfRect(x0: 15.15, x1: 20.45, y0: 2.5, y1: 13.2),
            track: pdfRect(x0: 17.4, x1: 18.2, y0: 4.25, y1: 11.45),
            knob: pdfRect(x0: 16.0, x1: 19.6, y0: 5.79, y1: 7.03),
            direction: .towardTop
        ),
    ]

    private static func pdfRect(x0: CGFloat, x1: CGFloat, y0: CGFloat, y1: CGFloat) -> CGRect {
        CGRect(
            x: x0,
            y: artboard - y1,
            width: x1 - x0,
            height: y1 - y0
        )
    }

    static func knobDestinationDeltaYArtboard(
        track: CGRect,
        knob: CGRect,
        towardTop: Bool
    ) -> CGFloat {
        let halfKnob = knob.height * 0.5
        let inset = trackEndInsetArtboard
        let minCenterY = track.minY + halfKnob + inset
        let maxCenterY = track.maxY - halfKnob - inset
        let restCenterY = knob.midY
        let destinationY = towardTop ? minCenterY : maxCenterY
        return destinationY - restCenterY
    }

    static var leftDestinationDeltaYArtboard: CGFloat {
        let spec = faderSpecs[0]
        return knobDestinationDeltaYArtboard(
            track: spec.track,
            knob: spec.knob,
            towardTop: true
        )
    }

    static var middleDestinationDeltaYArtboard: CGFloat {
        let spec = faderSpecs[1]
        return knobDestinationDeltaYArtboard(
            track: spec.track,
            knob: spec.knob,
            towardTop: false
        )
    }

    static var rightDestinationDeltaYArtboard: CGFloat {
        let spec = faderSpecs[2]
        return knobDestinationDeltaYArtboard(
            track: spec.track,
            knob: spec.knob,
            towardTop: true
        )
    }

    static func makeEvenOddFaderPath(
        shell: CGRect,
        track: CGRect,
        knob: CGRect,
        shellCornerRadius: CGFloat
    ) -> UIBezierPath {
        let path = UIBezierPath(
            roundedRect: shell,
            cornerRadius: shellCornerRadius
        )
        path.append(
            UIBezierPath(
                roundedRect: track,
                cornerRadius: track.width * 0.5
            )
        )
        path.append(
            UIBezierPath(
                roundedRect: knob,
                cornerRadius: knob.height * 0.5
            )
        )
        path.usesEvenOddFillRule = true
        return path
    }

    /// Cubic ease-in-out matching `UIView.AnimationCurve.easeInOut` feel.
    static func easeInOutUnit(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        if x < 0.5 {
            return 2 * x * x
        }
        let u = -2 * x + 2
        return 1 - (u * u) / 2
    }

    static func unitProgress(elapsed: TimeInterval) -> CGFloat {
        if elapsed < travelDuration {
            return easeInOutUnit(CGFloat(elapsed / travelDuration))
        }
        let afterTravel = elapsed - travelDuration
        if afterTravel < holdDuration {
            return 1
        }
        let afterHold = afterTravel - holdDuration
        if afterHold < returnDuration {
            return 1 - easeInOutUnit(CGFloat(afterHold / returnDuration))
        }
        return 0
    }

    // MARK: - Frame renderer

    static func renderEQFrame(
        unitProgress: CGFloat,
        artboardDeltas: [CGFloat],
        tint: UIColor,
        displayScale: CGFloat
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = max(displayScale, 1)
        format.opaque = false
        format.preferredRange = .standard
        let size = CGSize(width: artboard, height: artboard)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { _ in
            tint.setFill()
            for (index, spec) in faderSpecs.enumerated() {
                let delta = index < artboardDeltas.count ? artboardDeltas[index] : 0
                let knob = spec.knob.offsetBy(dx: 0, dy: delta * unitProgress)
                let path = makeEvenOddFaderPath(
                    shell: spec.shell,
                    track: spec.track,
                    knob: knob,
                    shellCornerRadius: shellCornerRadiusArtboard
                )
                path.fill()
            }
        }
        return image.withRenderingMode(.alwaysOriginal)
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
        let tint = resolvedTint(for: imageView)
        let scale = imageView.traitCollection.displayScale > 0
            ? imageView.traitCollection.displayScale
            : UIScreen.main.scale
        let frame = Self.renderEQFrame(
            unitProgress: currentUnitProgress,
            artboardDeltas: artboardDeltas,
            tint: tint,
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
        // Prefer canonical asset over any prior image pointer (may be generated).
        if imageView.superview != nil || imageView.window != nil {
            imageView.image = Self.canonicalLeaderboardImage()
        }
        didSwapToGenerated = false
    }

    private func abortDueToDetach() {
        guard !didFinish else { return }
        stopDisplayLink()
        restoreCanonicalImage()
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
