import UIKit

/// NATIVE-NAV-PROFILE-COMMUNITY-5: Community Profile head-only two-beat nod.
/// Generated frames are assigned only to the preferred platter Profile UIImageView;
/// Liquid Glass portal/lens may mirror that source. Shoulders stay identity every frame.
/// Canonical restore uses current role asset (`profileIconAssetName`).
///
/// Geometry from DubHubTabProfileListener.pdf (24×24, PDF y-up).
final class DubHubNativeTabBarProfileCommunityAnimator: NSObject {
    static let firstForwardDuration: TimeInterval = 0.160
    static let firstHoldDuration: TimeInterval = 0.050
    static let firstReturnDuration: TimeInterval = 0.140
    static let secondForwardDuration: TimeInterval = 0.120
    static let secondHoldDuration: TimeInterval = 0.040
    static let secondReturnDuration: TimeInterval = 0.130
    static let duration: TimeInterval =
        firstForwardDuration + firstHoldDuration + firstReturnDuration
        + secondForwardDuration + secondHoldDuration + secondReturnDuration

    /// First-nod peak (progress = 1).
    static let firstTopWidthDelta: CGFloat = 0.10
    static let firstLowerWidthDelta: CGFloat = -0.07
    static let firstHeightDelta: CGFloat = -0.10
    static let firstCenterYDownPt: CGFloat = 0.80

    /// Second nod is half strength via progress peak 0.5.
    static let secondNodPeakProgress: CGFloat = 0.5

    /// Transparent AA room around deformed head (artboard pt).
    static let headRasterPadding: CGFloat = 0.5

    private static let artboard: CGFloat = 24
    static let assetName = "DubHubTabProfileListener"
    private static weak var activeSession: DubHubNativeTabBarProfileCommunityAnimator?

    private weak var sourceImageView: UIImageView?
    private var fallbackTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var sessionTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var displayLink: CADisplayLink?
    private var animationStartMediaTime: CFTimeInterval = 0
    private var currentNodProgress: CGFloat = 0
    private var didFinish = false
    private var didSwapToGenerated = false
    private var restoreAssetName: String = assetName
    private var completion: (() -> Void)?

    // MARK: - Canonical geometry (PDF y-up)

    static let headCenterPDF = CGPoint(x: 12.0, y: 16.5387)
    static let headRadiusPDF: CGFloat = 4.5614
    /// Crown / bottom in PDF y-up.
    static let headTopPDF: CGFloat = 21.1
    static let headBottomPDF: CGFloat = 11.9773

    static let shouldersPolygon: [CGPoint] = [
        CGPoint(x: 8.5389, y: 11.2773), CGPoint(x: 15.4134, y: 11.2773), CGPoint(x: 16.7024, y: 10.9801),
        CGPoint(x: 17.2753, y: 10.6830), CGPoint(x: 18.1346, y: 10.0146), CGPoint(x: 18.6120, y: 9.3461),
        CGPoint(x: 18.8984, y: 8.3062), CGPoint(x: 18.8984, y: 3.7755), CGPoint(x: 18.3255, y: 3.4785),
        CGPoint(x: 16.5592, y: 2.9585), CGPoint(x: 14.4586, y: 2.5872), CGPoint(x: 10.0188, y: 2.5500),
        CGPoint(x: 7.9182, y: 2.8471), CGPoint(x: 6.0086, y: 3.3670), CGPoint(x: 5.1016, y: 3.7384),
        CGPoint(x: 5.1016, y: 8.3434), CGPoint(x: 5.2925, y: 9.1604), CGPoint(x: 5.6267, y: 9.7546),
        CGPoint(x: 6.2951, y: 10.4230), CGPoint(x: 7.0589, y: 10.8687), CGPoint(x: 7.8228, y: 11.1658),
        CGPoint(x: 8.3001, y: 11.2401), CGPoint(x: 8.5389, y: 11.2773),
    ]

    /// Sampled circle (PDF y-up), closed.
    static let headCirclePoints: [CGPoint] = {
        let n = 48
        var pts: [CGPoint] = []
        pts.reserveCapacity(n + 1)
        for i in 0..<n {
            let a = CGFloat(i) / CGFloat(n) * 2 * .pi
            pts.append(
                CGPoint(
                    x: headCenterPDF.x + headRadiusPDF * cos(a),
                    y: headCenterPDF.y + headRadiusPDF * sin(a)
                )
            )
        }
        if let first = pts.first {
            pts.append(first)
        }
        return pts
    }()

    // MARK: - Public API

    static func cancelAll(in host: UIView?, restoreAssetName: String = assetName) {
        _ = host
        activeSession?.cancelAndRestore(assetName: restoreAssetName)
        activeSession = nil
    }

    static func canonicalListenerImage() -> UIImage? {
        UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func canonicalProfileImage(assetName: String) -> UIImage? {
        UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func play(
        over imageView: UIImageView,
        fallbackTint: UIColor,
        completion: (() -> Void)? = nil
    ) {
        let roleAsset = DubHubNativeTabBarChrome.shared.profileIconAssetName
        cancelAll(in: nil, restoreAssetName: roleAsset)
        let session = DubHubNativeTabBarProfileCommunityAnimator()
        activeSession = session
        session.sourceImageView = imageView
        session.fallbackTint = fallbackTint
        session.sessionTint = session.resolvedTint(for: imageView)
        session.restoreAssetName = roleAsset
        session.completion = completion
        session.currentNodProgress = 0
        session.applyCurrentFrame()
        session.startDisplayLinkClock()
    }

    func cancelAndRestore(assetName: String) {
        restoreAssetName = assetName
        stopDisplayLink()
        restoreCanonicalImage()
        didFinish = true
        sourceImageView = nil
        if Self.activeSession === self {
            Self.activeSession = nil
        }
    }

    // MARK: - Timing / easing

    static func easeInOutUnit(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        if x < 0.5 {
            return 2 * x * x
        }
        let u = -2 * x + 2
        return 1 - (u * u) / 2
    }

    static func easeOutUnit(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        let u = 1 - x
        return 1 - u * u
    }

    /// Nod strength 0…1 (1 = first peak; 0.5 = second peak).
    /// Phases: forward / hold / return / forward / hold / return (seconds).
    static func nodProgress(elapsed: TimeInterval) -> CGFloat {
        let p1 = firstForwardDuration
        let p2 = p1 + firstHoldDuration
        let p3 = p2 + firstReturnDuration
        let p4 = p3 + secondForwardDuration
        let p5 = p4 + secondHoldDuration
        let p6 = p5 + secondReturnDuration
        if elapsed < p1 {
            return easeInOutUnit(CGFloat(elapsed / firstForwardDuration))
        }
        if elapsed < p2 {
            return 1
        }
        if elapsed < p3 {
            let u = CGFloat((elapsed - p2) / firstReturnDuration)
            return 1 - easeOutUnit(u)
        }
        if elapsed < p4 {
            let u = CGFloat((elapsed - p3) / secondForwardDuration)
            return secondNodPeakProgress * easeInOutUnit(u)
        }
        if elapsed < p5 {
            return secondNodPeakProgress
        }
        if elapsed < p6 {
            let u = CGFloat((elapsed - p5) / secondReturnDuration)
            return secondNodPeakProgress * (1 - easeOutUnit(u))
        }
        return 0
    }

    // MARK: - Deformation

    /// Smooth hermite between 0 and 1 (no hard midpoint seam).
    static func smoothstep(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        return x * x * (3 - 2 * x)
    }

    /// Asymmetric 2D perspective illusion (PDF y-up points).
    /// For progress p ∈ [0,1]:
    ///   topWidth  = 1 + firstTopWidthDelta * p
    ///   lowerWidth = 1 + firstLowerWidthDelta * p
    ///   heightScale = 1 + firstHeightDelta * p
    ///   dyPDF = −firstCenterYDownPt * p
    /// Per point: t = crown→bottom (0…1), w = lerp(top, lower, smoothstep(t)),
    ///   x' = cx + (x−cx)*w
    ///   y' = cy + (y−cy)*heightScale + dyPDF
    static func deformHeadPoint(_ point: CGPoint, progress: CGFloat) -> CGPoint {
        let p = min(max(progress, 0), 1)
        let topW = 1 + firstTopWidthDelta * p
        let lowerW = 1 + firstLowerWidthDelta * p
        let heightScale = 1 + firstHeightDelta * p
        let dyPDF = -firstCenterYDownPt * p
        let span = max(headTopPDF - headBottomPDF, 0.001)
        let tRaw = (headTopPDF - point.y) / span
        let t = smoothstep(tRaw)
        let widthScale = topW + (lowerW - topW) * t
        let cx = headCenterPDF.x
        let cy = headCenterPDF.y
        return CGPoint(
            x: cx + (point.x - cx) * widthScale,
            y: cy + (point.y - cy) * heightScale + dyPDF
        )
    }

    static func deformedHeadPoints(progress: CGFloat) -> [CGPoint] {
        headCirclePoints.map { deformHeadPoint($0, progress: progress) }
    }

    static func makePath(from points: [CGPoint]) -> UIBezierPath {
        let path = UIBezierPath()
        guard let first = points.first else { return path }
        path.move(to: first)
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        path.close()
        return path
    }

    // MARK: - Frame renderer

    static func renderCommunityFrame(
        nodProgress: CGFloat,
        tint: UIColor,
        displayScale: CGFloat
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = max(displayScale, 1)
        format.opaque = false
        format.preferredRange = .standard
        let size = CGSize(width: artboard, height: artboard)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let head = deformedHeadPoints(progress: nodProgress)
        _ = headRasterPadding
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            cg.translateBy(x: 0, y: artboard)
            cg.scaleBy(x: 1, y: -1)
            tint.setFill()
            // Shoulders: original Listener geometry, identity every frame.
            makePath(from: shouldersPolygon).fill()
            makePath(from: head).fill()
        }
        return image.withRenderingMode(.alwaysOriginal)
    }

    // MARK: - Session

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
        let frame = Self.renderCommunityFrame(
            nodProgress: currentNodProgress,
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
            imageView.image = Self.canonicalProfileImage(assetName: restoreAssetName)
        }
        didSwapToGenerated = false
    }

    private func abortDueToDetach() {
        guard !didFinish else { return }
        stopDisplayLink()
        restoreAssetName = DubHubNativeTabBarChrome.shared.profileIconAssetName
        restoreCanonicalImage()
        finish(silently: true)
    }

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

    @objc private func onDisplayLinkTick(_ link: CADisplayLink) {
        guard !didFinish else { return }
        let elapsed = CACurrentMediaTime() - animationStartMediaTime
        if elapsed >= Self.duration {
            currentNodProgress = 0
            applyCurrentFrame()
            stopDisplayLink()
            restoreAssetName = DubHubNativeTabBarChrome.shared.profileIconAssetName
            restoreCanonicalImage()
            finish(silently: false)
            return
        }
        currentNodProgress = Self.nodProgress(elapsed: elapsed)
        applyCurrentFrame()
    }

    private func finish(silently: Bool) {
        guard !didFinish else { return }
        didFinish = true
        sourceImageView = nil
        if Self.activeSession === self {
            Self.activeSession = nil
        }
        if !silently {
            completion?()
        }
        completion = nil
    }
}
