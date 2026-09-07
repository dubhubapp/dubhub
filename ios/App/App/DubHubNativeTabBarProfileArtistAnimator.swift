import UIKit

/// PROFILE-NAV-5: Artist Profile headphone bass-expansion session.
/// Generated frames are assigned only to the preferred platter Profile UIImageView;
/// Liquid Glass portal/lens may mirror that source. Canonical static restore always
/// uses DubHubTabProfileArtist (or Community asset when role changed mid-session).
///
/// Geometry traced from current DubHubTabProfileArtist.pdf (24x24, PDF y-up).
final class DubHubNativeTabBarProfileArtistAnimator: NSObject {
    static let outDuration: TimeInterval = 0.110
    static let holdDuration: TimeInterval = 0.090
    static let returnDuration: TimeInterval = 0.130
    static let duration: TimeInterval = outDuration + holdDuration + returnDuration

    /// Outward earcup translation at full expansion (artboard pt).
    static let earcupOutwardOffset: CGFloat = 1.0
    /// Peak headband lift at full expansion (artboard pt).
    static let headbandLift: CGFloat = 0.25
    /// Y above which headband points receive progressive lift.
    static let headbandLiftStartY: CGFloat = 18.0

    private static let artboard: CGFloat = 24
    static let artistAssetName = "DubHubTabProfileArtist"
    static let communityAssetName = "DubHubTabProfileListener"
    private static weak var activeSession: DubHubNativeTabBarProfileArtistAnimator?

    private weak var sourceImageView: UIImageView?
    private var fallbackTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var sessionTint: UIColor = UIColor.white.withAlphaComponent(0.96)
    private var displayLink: CADisplayLink?
    private var animationStartMediaTime: CFTimeInterval = 0
    private var currentUnitProgress: CGFloat = 0
    private var didFinish = false
    private var didSwapToGenerated = false
    private var restoreAssetName: String = artistAssetName
    private var completion: (() -> Void)?

    // MARK: - Canonical geometry (from DubHubTabProfileArtist.pdf)

    static let headPolygon: [CGPoint] = [
        CGPoint(x: 9.3526, y: 17.5720), CGPoint(x: 9.3652, y: 17.6812), CGPoint(x: 9.4031, y: 17.7893),
        CGPoint(x: 9.4657, y: 17.8954), CGPoint(x: 9.5525, y: 17.9984), CGPoint(x: 9.6626, y: 18.0972),
        CGPoint(x: 9.7951, y: 18.1910), CGPoint(x: 9.9486, y: 18.2788), CGPoint(x: 10.1216, y: 18.3599),
        CGPoint(x: 10.3126, y: 18.4333), CGPoint(x: 10.5195, y: 18.4983), CGPoint(x: 10.7406, y: 18.5546),
        CGPoint(x: 10.9735, y: 18.6013), CGPoint(x: 11.2161, y: 18.6381), CGPoint(x: 11.4661, y: 18.6647),
        CGPoint(x: 11.7209, y: 18.6807), CGPoint(x: 11.9783, y: 18.6861), CGPoint(x: 12.2357, y: 18.6807),
        CGPoint(x: 12.4905, y: 18.6647), CGPoint(x: 12.7405, y: 18.6381), CGPoint(x: 12.9831, y: 18.6013),
        CGPoint(x: 13.2160, y: 18.5546), CGPoint(x: 13.4371, y: 18.4983), CGPoint(x: 13.6440, y: 18.4333),
        CGPoint(x: 13.8350, y: 18.3599), CGPoint(x: 14.0080, y: 18.2788), CGPoint(x: 14.1615, y: 18.1910),
        CGPoint(x: 14.2940, y: 18.0972), CGPoint(x: 14.4041, y: 17.9984), CGPoint(x: 14.4909, y: 17.8954),
        CGPoint(x: 14.5535, y: 17.7893), CGPoint(x: 14.5914, y: 17.6812), CGPoint(x: 14.6040, y: 17.5720),
        CGPoint(x: 14.6040, y: 13.1155), CGPoint(x: 14.5914, y: 13.0027), CGPoint(x: 14.5535, y: 12.8909),
        CGPoint(x: 14.4909, y: 12.7814), CGPoint(x: 14.4041, y: 12.6749), CGPoint(x: 14.2940, y: 12.5728),
        CGPoint(x: 14.1615, y: 12.4759), CGPoint(x: 14.0080, y: 12.3852), CGPoint(x: 13.8350, y: 12.3015),
        CGPoint(x: 13.6440, y: 12.2256), CGPoint(x: 13.4371, y: 12.1582), CGPoint(x: 13.2160, y: 12.1002),
        CGPoint(x: 12.9831, y: 12.0519), CGPoint(x: 12.7405, y: 12.0138), CGPoint(x: 12.4905, y: 11.9864),
        CGPoint(x: 12.2357, y: 11.9698), CGPoint(x: 11.9783, y: 11.9643), CGPoint(x: 11.7209, y: 11.9698),
        CGPoint(x: 11.4661, y: 11.9864), CGPoint(x: 11.2161, y: 12.0138), CGPoint(x: 10.9735, y: 12.0519),
        CGPoint(x: 10.7406, y: 12.1002), CGPoint(x: 10.5195, y: 12.1582), CGPoint(x: 10.3126, y: 12.2256),
        CGPoint(x: 10.1216, y: 12.3015), CGPoint(x: 9.9486, y: 12.3852), CGPoint(x: 9.7951, y: 12.4759),
        CGPoint(x: 9.6626, y: 12.5728), CGPoint(x: 9.5525, y: 12.6749), CGPoint(x: 9.4657, y: 12.7814),
        CGPoint(x: 9.4031, y: 12.8909), CGPoint(x: 9.3652, y: 13.0027), CGPoint(x: 9.3526, y: 13.1155),
        CGPoint(x: 9.3526, y: 17.5720), CGPoint(x: 9.3526, y: 17.5720)
    ]

    static let leftEarcupPolygon: [CGPoint] = [
        CGPoint(x: 8.8101, y: 15.8637), CGPoint(x: 8.7999, y: 15.4928), CGPoint(x: 8.7694, y: 15.1283),
        CGPoint(x: 8.7193, y: 14.7765), CGPoint(x: 8.6502, y: 14.4432), CGPoint(x: 8.5635, y: 14.1342),
        CGPoint(x: 8.4605, y: 13.8548), CGPoint(x: 8.3432, y: 13.6098), CGPoint(x: 8.2134, y: 13.4033),
        CGPoint(x: 8.0733, y: 13.2389), CGPoint(x: 7.9255, y: 13.1194), CGPoint(x: 7.7724, y: 13.0470),
        CGPoint(x: 7.6166, y: 13.0227), CGPoint(x: 7.4608, y: 13.0470), CGPoint(x: 7.3077, y: 13.1194),
        CGPoint(x: 7.1599, y: 13.2389), CGPoint(x: 7.0198, y: 13.4033), CGPoint(x: 6.8900, y: 13.6098),
        CGPoint(x: 6.7727, y: 13.8548), CGPoint(x: 6.6697, y: 14.1342), CGPoint(x: 6.5830, y: 14.4432),
        CGPoint(x: 6.5139, y: 14.7765), CGPoint(x: 6.4638, y: 15.1283), CGPoint(x: 6.4333, y: 15.4928),
        CGPoint(x: 6.4231, y: 15.8637), CGPoint(x: 6.4333, y: 16.2345), CGPoint(x: 6.4638, y: 16.5990),
        CGPoint(x: 6.5139, y: 16.9508), CGPoint(x: 6.5830, y: 17.2842), CGPoint(x: 6.6697, y: 17.5931),
        CGPoint(x: 6.7727, y: 17.8726), CGPoint(x: 6.8900, y: 18.1176), CGPoint(x: 7.0198, y: 18.3241),
        CGPoint(x: 7.1599, y: 18.4884), CGPoint(x: 7.3077, y: 18.6079), CGPoint(x: 7.4608, y: 18.6804),
        CGPoint(x: 7.6166, y: 18.7047), CGPoint(x: 7.7724, y: 18.6804), CGPoint(x: 7.9255, y: 18.6079),
        CGPoint(x: 8.0733, y: 18.4884), CGPoint(x: 8.2134, y: 18.3241), CGPoint(x: 8.3432, y: 18.1176),
        CGPoint(x: 8.4605, y: 17.8726), CGPoint(x: 8.5635, y: 17.5931), CGPoint(x: 8.6502, y: 17.2842),
        CGPoint(x: 8.7193, y: 16.9508), CGPoint(x: 8.7694, y: 16.5990), CGPoint(x: 8.7999, y: 16.2345),
        CGPoint(x: 8.8101, y: 15.8637)
    ]

    static let rightEarcupPolygon: [CGPoint] = [
        CGPoint(x: 17.5118, y: 15.8637), CGPoint(x: 17.5016, y: 15.4928), CGPoint(x: 17.4711, y: 15.1283),
        CGPoint(x: 17.4210, y: 14.7765), CGPoint(x: 17.3519, y: 14.4432), CGPoint(x: 17.2652, y: 14.1342),
        CGPoint(x: 17.1622, y: 13.8548), CGPoint(x: 17.0449, y: 13.6098), CGPoint(x: 16.9151, y: 13.4033),
        CGPoint(x: 16.7750, y: 13.2389), CGPoint(x: 16.6272, y: 13.1194), CGPoint(x: 16.4741, y: 13.0470),
        CGPoint(x: 16.3183, y: 13.0227), CGPoint(x: 16.1625, y: 13.0470), CGPoint(x: 16.0094, y: 13.1194),
        CGPoint(x: 15.8616, y: 13.2389), CGPoint(x: 15.7216, y: 13.4033), CGPoint(x: 15.5917, y: 13.6098),
        CGPoint(x: 15.4744, y: 13.8548), CGPoint(x: 15.3714, y: 14.1342), CGPoint(x: 15.2847, y: 14.4432),
        CGPoint(x: 15.2156, y: 14.7765), CGPoint(x: 15.1655, y: 15.1283), CGPoint(x: 15.1350, y: 15.4928),
        CGPoint(x: 15.1248, y: 15.8637), CGPoint(x: 15.1350, y: 16.2345), CGPoint(x: 15.1655, y: 16.5990),
        CGPoint(x: 15.2156, y: 16.9508), CGPoint(x: 15.2847, y: 17.2842), CGPoint(x: 15.3714, y: 17.5931),
        CGPoint(x: 15.4744, y: 17.8726), CGPoint(x: 15.5917, y: 18.1176), CGPoint(x: 15.7216, y: 18.3241),
        CGPoint(x: 15.8616, y: 18.4884), CGPoint(x: 16.0094, y: 18.6079), CGPoint(x: 16.1625, y: 18.6804),
        CGPoint(x: 16.3183, y: 18.7047), CGPoint(x: 16.4741, y: 18.6804), CGPoint(x: 16.6272, y: 18.6079),
        CGPoint(x: 16.7750, y: 18.4884), CGPoint(x: 16.9151, y: 18.3241), CGPoint(x: 17.0449, y: 18.1176),
        CGPoint(x: 17.1622, y: 17.8726), CGPoint(x: 17.2652, y: 17.5931), CGPoint(x: 17.3519, y: 17.2842),
        CGPoint(x: 17.4210, y: 16.9508), CGPoint(x: 17.4711, y: 16.5990), CGPoint(x: 17.5016, y: 16.2345),
        CGPoint(x: 17.5118, y: 15.8637)
    ]

    static let headbandPolygon: [CGPoint] = [
        CGPoint(x: 7.5949, y: 18.4633), CGPoint(x: 7.6084, y: 18.6702), CGPoint(x: 7.6489, y: 18.8757),
        CGPoint(x: 7.7160, y: 19.0787), CGPoint(x: 7.8094, y: 19.2781), CGPoint(x: 7.9286, y: 19.4723),
        CGPoint(x: 8.0727, y: 19.6603), CGPoint(x: 8.2408, y: 19.8409), CGPoint(x: 8.4321, y: 20.0131),
        CGPoint(x: 8.6451, y: 20.1757), CGPoint(x: 8.8788, y: 20.3278), CGPoint(x: 9.1315, y: 20.4683),
        CGPoint(x: 9.4018, y: 20.5965), CGPoint(x: 9.6880, y: 20.7114), CGPoint(x: 9.9883, y: 20.8125),
        CGPoint(x: 10.3008, y: 20.8993), CGPoint(x: 10.6238, y: 20.9710), CGPoint(x: 10.9550, y: 21.0272),
        CGPoint(x: 11.2926, y: 21.0676), CGPoint(x: 11.6344, y: 21.0919), CGPoint(x: 11.9783, y: 21.1000),
        CGPoint(x: 12.3222, y: 21.0919), CGPoint(x: 12.6640, y: 21.0676), CGPoint(x: 13.0016, y: 21.0272),
        CGPoint(x: 13.3328, y: 20.9710), CGPoint(x: 13.6558, y: 20.8993), CGPoint(x: 13.9683, y: 20.8125),
        CGPoint(x: 14.2686, y: 20.7114), CGPoint(x: 14.5548, y: 20.5965), CGPoint(x: 14.8251, y: 20.4683),
        CGPoint(x: 15.0778, y: 20.3278), CGPoint(x: 15.3115, y: 20.1757), CGPoint(x: 15.5245, y: 20.0131),
        CGPoint(x: 15.7158, y: 19.8409), CGPoint(x: 15.8839, y: 19.6603), CGPoint(x: 16.0280, y: 19.4723),
        CGPoint(x: 16.1472, y: 19.2781), CGPoint(x: 16.2406, y: 19.0787), CGPoint(x: 16.3077, y: 18.8757),
        CGPoint(x: 16.3482, y: 18.6702), CGPoint(x: 16.3617, y: 18.4633), CGPoint(x: 15.4069, y: 18.4633),
        CGPoint(x: 15.3963, y: 18.6206), CGPoint(x: 15.3647, y: 18.7770), CGPoint(x: 15.3122, y: 18.9314),
        CGPoint(x: 15.2391, y: 19.0829), CGPoint(x: 15.1459, y: 19.2307), CGPoint(x: 15.0332, y: 19.3737),
        CGPoint(x: 14.9017, y: 19.5111), CGPoint(x: 14.7521, y: 19.6420), CGPoint(x: 14.5854, y: 19.7657),
        CGPoint(x: 14.4027, y: 19.8813), CGPoint(x: 14.2050, y: 19.9882), CGPoint(x: 13.9936, y: 20.0857),
        CGPoint(x: 13.7697, y: 20.1731), CGPoint(x: 13.5349, y: 20.2502), CGPoint(x: 13.2904, y: 20.3161),
        CGPoint(x: 13.0378, y: 20.3705), CGPoint(x: 12.7787, y: 20.4132), CGPoint(x: 12.5147, y: 20.4439),
        CGPoint(x: 12.2473, y: 20.4625), CGPoint(x: 11.9783, y: 20.4687), CGPoint(x: 11.7093, y: 20.4625),
        CGPoint(x: 11.4419, y: 20.4439), CGPoint(x: 11.1779, y: 20.4132), CGPoint(x: 10.9188, y: 20.3705),
        CGPoint(x: 10.6662, y: 20.3161), CGPoint(x: 10.4217, y: 20.2502), CGPoint(x: 10.1869, y: 20.1731),
        CGPoint(x: 9.9630, y: 20.0857), CGPoint(x: 9.7516, y: 19.9882), CGPoint(x: 9.5539, y: 19.8813),
        CGPoint(x: 9.3712, y: 19.7657), CGPoint(x: 9.2045, y: 19.6420), CGPoint(x: 9.0549, y: 19.5111),
        CGPoint(x: 8.9234, y: 19.3737), CGPoint(x: 8.8107, y: 19.2307), CGPoint(x: 8.7175, y: 19.0829),
        CGPoint(x: 8.6444, y: 18.9314), CGPoint(x: 8.5919, y: 18.7770), CGPoint(x: 8.5603, y: 18.6206),
        CGPoint(x: 8.5497, y: 18.4633), CGPoint(x: 7.5949, y: 18.4633)
    ]

    static let shouldersPolygon: [CGPoint] = [
        CGPoint(x: 8.5389, y: 11.2773), CGPoint(x: 15.4134, y: 11.2773), CGPoint(x: 16.7024, y: 10.9801),
        CGPoint(x: 17.2753, y: 10.6830), CGPoint(x: 18.1346, y: 10.0146), CGPoint(x: 18.6120, y: 9.3461),
        CGPoint(x: 18.8984, y: 8.3062), CGPoint(x: 18.8984, y: 3.7755), CGPoint(x: 18.3255, y: 3.4785),
        CGPoint(x: 16.5592, y: 2.9585), CGPoint(x: 14.4586, y: 2.5872), CGPoint(x: 10.0188, y: 2.5500),
        CGPoint(x: 7.9182, y: 2.8471), CGPoint(x: 6.0086, y: 3.3670), CGPoint(x: 5.1016, y: 3.7384),
        CGPoint(x: 5.1016, y: 8.3434), CGPoint(x: 5.2925, y: 9.1604), CGPoint(x: 5.6267, y: 9.7546),
        CGPoint(x: 6.2951, y: 10.4230), CGPoint(x: 7.0589, y: 10.8687), CGPoint(x: 7.8228, y: 11.1658),
        CGPoint(x: 8.3001, y: 11.2401), CGPoint(x: 8.5389, y: 11.2773)
    ]

    // MARK: - Public API

    static func cancelAll(in host: UIView?, restoreAssetName: String = artistAssetName) {
        _ = host
        activeSession?.cancelAndRestore(assetName: restoreAssetName)
        activeSession = nil
    }

    static func canonicalArtistProfileImage() -> UIImage? {
        UIImage(named: artistAssetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func canonicalProfileImage(assetName: String) -> UIImage? {
        UIImage(named: assetName)?.withRenderingMode(.alwaysTemplate)
    }

    static func play(
        over imageView: UIImageView,
        fallbackTint: UIColor,
        completion: (() -> Void)? = nil
    ) {
        cancelAll(in: nil, restoreAssetName: artistAssetName)
        let session = DubHubNativeTabBarProfileArtistAnimator()
        activeSession = session
        session.sourceImageView = imageView
        session.fallbackTint = fallbackTint
        session.sessionTint = session.resolvedTint(for: imageView)
        session.restoreAssetName = artistAssetName
        session.completion = completion
        session.currentUnitProgress = 0
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

    // MARK: - Timing

    static func easeInOutUnit(_ t: CGFloat) -> CGFloat {
        let x = min(max(t, 0), 1)
        if x < 0.5 {
            return 2 * x * x
        }
        let u = -2 * x + 2
        return 1 - (u * u) / 2
    }

    /// 0 = rest, 1 = full headphone expansion.
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

    // MARK: - Deformation

    static func translated(_ points: [CGPoint], dx: CGFloat, dy: CGFloat) -> [CGPoint] {
        points.map { CGPoint(x: $0.x + dx, y: $0.y + dy) }
    }

    static func deformedHeadband(_ points: [CGPoint], progress: CGFloat) -> [CGPoint] {
        let out = earcupOutwardOffset * progress
        let lift = headbandLift * progress
        let peakY = points.map { $0.y }.max() ?? headbandLiftStartY
        let liftSpan = max(peakY - headbandLiftStartY, 0.001)
        let midX: CGFloat = 12
        return points.map { p in
            let side: CGFloat
            if p.x < midX {
                side = -out
            } else if p.x > midX {
                side = out
            } else {
                side = 0
            }
            let liftFactor = max(0, min(1, (p.y - headbandLiftStartY) / liftSpan))
            return CGPoint(x: p.x + side, y: p.y + lift * liftFactor)
        }
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

    static func renderArtistFrame(
        unitProgress: CGFloat,
        tint: UIColor,
        displayScale: CGFloat
    ) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = max(displayScale, 1)
        format.opaque = false
        format.preferredRange = .standard
        let size = CGSize(width: artboard, height: artboard)
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let dx = earcupOutwardOffset * unitProgress
        let leftCups = translated(leftEarcupPolygon, dx: -dx, dy: 0)
        let rightCups = translated(rightEarcupPolygon, dx: dx, dy: 0)
        let band = deformedHeadband(headbandPolygon, progress: unitProgress)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            cg.translateBy(x: 0, y: artboard)
            cg.scaleBy(x: 1, y: -1)
            tint.setFill()
            makePath(from: headPolygon).fill()
            makePath(from: leftCups).fill()
            makePath(from: rightCups).fill()
            makePath(from: band).fill()
            makePath(from: shouldersPolygon).fill()
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
        let frame = Self.renderArtistFrame(
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
            imageView.image = Self.canonicalProfileImage(assetName: restoreAssetName)
        }
        didSwapToGenerated = false
    }

    private func abortDueToDetach() {
        guard !didFinish else { return }
        stopDisplayLink()
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
            currentUnitProgress = 0
            applyCurrentFrame()
            stopDisplayLink()
            restoreCanonicalImage()
            finish(silently: false)
            return
        }
        currentUnitProgress = Self.unitProgress(elapsed: elapsed)
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
