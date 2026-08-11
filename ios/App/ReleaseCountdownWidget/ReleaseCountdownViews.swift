import SwiftUI
import WidgetKit
import UIKit
import AppIntents

struct ReleaseCountdownEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: ReleaseCountdownEntry

    var body: some View {
        let tapURL = widgetTapURL(for: entry.state)
        let content = contentView(for: entry.state)

        Group {
            if #available(iOS 17.0, *) {
                content
                    .containerBackground(for: .widget) {
                        backgroundLayer(for: entry.state)
                    }
            } else {
                content
                    .background(backgroundLayer(for: entry.state))
            }
        }
        .overlay(alignment: .bottomTrailing) {
            // Medium release embeds D in the shared footer; avoid a second inset.
            if showsTrailingBrandOverlay {
                dubHubBrandMark
            }
        }
        .widgetURL(tapURL)
    }

    /// True when the trailing D mark is not already drawn inside medium release footer.
    private var showsTrailingBrandOverlay: Bool {
        if family == .systemSmall { return true }
        if case .release = entry.state { return false }
        return true
    }

    /// Bottom-corner Dub Hub `d` mark. Source PNG has an opaque black plate —
    /// `.screen` blend drops black so white 3D mark sits on artwork without editing the asset.
    private var dubHubBrandMark: some View {
        let side: CGFloat = family == .systemSmall ? 19 : 24
        return Image("DubHubD")
            .resizable()
            .scaledToFit()
            .frame(width: side, height: side)
            .opacity(0.88)
            .blendMode(.screen)
            .padding(.bottom, family == .systemSmall ? 0 : 3)
            .padding(.trailing, family == .systemSmall ? 0 : 3)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func contentView(for state: ReleaseCountdownDisplayState) -> some View {
        switch state {
        case let .release(
            title, artistName, artworkLocalPath, _, countdownLabel, isOutNow, announcementLabel, _, releaseDateLabel,
            pageIndex, pageCount, allowsPaging
        ):
            let presentedCountdown = HomeWidgetCountdown.presentLabel(
                countdownLabel,
                compactMinutesWithHours: family == .systemSmall
            )
            releaseContent(
                title: title,
                artistName: artistName,
                artwork: ReleaseCountdownArtworkImage.load(localPath: artworkLocalPath),
                countdownLabel: presentedCountdown,
                isOutNow: isOutNow,
                announcementLabel: announcementLabel,
                releaseDateLabel: releaseDateLabel,
                pageIndex: pageIndex,
                pageCount: pageCount,
                allowsPaging: allowsPaging
            )
            .accessibilityLabel(releaseAccessibilityLabel(
                title: title,
                artistName: artistName,
                countdownLabel: presentedCountdown,
                isOutNow: isOutNow,
                announcementLabel: announcementLabel,
                pageIndex: pageIndex,
                pageCount: pageCount,
                allowsPaging: allowsPaging
            ))
        case .empty:
            emptyContent(
                title: "Release Countdown",
                message: "Choose a release in Dub Hub."
            )
            .accessibilityLabel("Release Countdown. Open Dub Hub to choose a release.")
        case .refresh:
            emptyContent(
                title: "Release Countdown",
                message: "Open Dub Hub to refresh your Countdown."
            )
            .accessibilityLabel("Release Countdown. Open Dub Hub to refresh your Release Countdown.")
        }
    }

    private func widgetTapURL(for state: ReleaseCountdownDisplayState) -> URL {
        switch state {
        case let .release(_, _, _, _, _, _, _, deepLink, _, _, _, _):
            return deepLink
        case .empty, .refresh:
            return URL(string: "https://dubhub.uk/")!
        }
    }

    @ViewBuilder
    private func backgroundLayer(for state: ReleaseCountdownDisplayState) -> some View {
        switch state {
        case let .release(_, _, artworkLocalPath, _, _, _, _, _, _, _, _, _):
            artworkBackdrop(
                ReleaseCountdownArtworkImage.load(localPath: artworkLocalPath)
            )
        case .empty, .refresh:
            brandBackground
        }
    }

    @ViewBuilder
    private func artworkBackdrop(_ artwork: UIImage?) -> some View {
        if let artwork {
            ZStack {
                Image(uiImage: artwork)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .scaleEffect(1.12)
                    .blur(radius: 28)
                Color.black.opacity(0.55)
            }
        } else {
            brandBackground
        }
    }

    private var brandBackground: some View {
        LinearGradient(
            colors: [
                Color(red: 0.07, green: 0.08, blue: 0.16),
                Color(red: 0.04, green: 0.05, blue: 0.10),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    private func releaseContent(
        title: String,
        artistName: String,
        artwork: UIImage?,
        countdownLabel: String,
        isOutNow: Bool,
        announcementLabel: String?,
        releaseDateLabel: String?,
        pageIndex: Int,
        pageCount: Int,
        allowsPaging: Bool
    ) -> some View {
        switch family {
        case .systemSmall:
            smallReleaseContent(
                title: title,
                artistName: artistName,
                artwork: artwork,
                countdownLabel: countdownLabel,
                isOutNow: isOutNow,
                pageIndex: pageIndex,
                pageCount: pageCount,
                allowsPaging: allowsPaging
            )
        default:
            mediumReleaseContent(
                title: title,
                artistName: artistName,
                artwork: artwork,
                countdownLabel: countdownLabel,
                isOutNow: isOutNow,
                announcementLabel: announcementLabel,
                releaseDateLabel: releaseDateLabel,
                pageIndex: pageIndex,
                pageCount: pageCount,
                allowsPaging: allowsPaging
            )
        }
    }

    private func smallReleaseContent(
        title: String,
        artistName: String,
        artwork: UIImage?,
        countdownLabel: String,
        isOutNow: Bool,
        pageIndex: Int,
        pageCount: Int,
        allowsPaging: Bool
    ) -> some View {
        GeometryReader { geo in
            let usableWidth = max(geo.size.width - 16, 1)
            // Artwork is the focus; leave room for a tight text cluster underneath.
            let artworkSide = min(usableWidth * 0.58, geo.size.height * 0.56)
            let showPager = allowsPaging && pageCount > 1
            let canGoPrevious = HomeWidgetPaging.canGoPrevious(
                pageIndex: pageIndex,
                pageCount: pageCount
            )
            let canGoNext = HomeWidgetPaging.canGoNext(
                pageIndex: pageIndex,
                pageCount: pageCount
            )

            ZStack {
                // Approved centred hierarchy — structurally unchanged; arrows overlay edges.
                VStack(alignment: .center, spacing: 4) {
                    sharpArtwork(artwork, size: artworkSide)
                    VStack(alignment: .center, spacing: 1) {
                        Text(artistName)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(Color.white.opacity(0.78))
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                        Text(title)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                        Text(countdownLabel)
                            .font(.title2.weight(.bold))
                            .foregroundColor(countdownColor(isOutNow: isOutNow))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .center)

                // Outer-edge chevrons (iOS 17+). No page indicator on small.
                // Safe zones: ~8pt pad + margins beside centred artwork; 44pt hit
                // regions overlay edges only — unavailable directions omit the Button.
                if #available(iOS 17.0, *), showPager {
                    HStack(spacing: 0) {
                        if canGoPrevious {
                            edgePageButton(
                                systemName: "chevron.left",
                                intent: ReleaseCountdownPreviousIntent()
                            )
                            .accessibilityLabel("Previous release")
                        }
                        Spacer(minLength: 0)
                        if canGoNext {
                            edgePageButton(
                                systemName: "chevron.right",
                                intent: ReleaseCountdownNextIntent()
                            )
                            .accessibilityLabel("Next release")
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }

    private func mediumReleaseContent(
        title: String,
        artistName: String,
        artwork: UIImage?,
        countdownLabel: String,
        isOutNow: Bool,
        announcementLabel: String?,
        releaseDateLabel: String?,
        pageIndex: Int,
        pageCount: Int,
        allowsPaging: Bool
    ) -> some View {
        GeometryReader { geo in
            let pad: CGFloat = 10
            let showPager = allowsPaging && pageCount > 1
            let canGoPrevious = HomeWidgetPaging.canGoPrevious(
                pageIndex: pageIndex,
                pageCount: pageCount
            )
            let canGoNext = HomeWidgetPaging.canGoNext(
                pageIndex: pageIndex,
                pageCount: pageCount
            )
            let artistTopInkPull: CGFloat = {
                let pointSize = UIFont.preferredFont(forTextStyle: .caption1).pointSize
                let weighted = UIFont.systemFont(ofSize: pointSize, weight: .semibold)
                return max(0, weighted.ascender - weighted.capHeight)
            }()
            // "dub hub" has no descenders; pull layout box so glyph ink shares the
            // same bottom as the D asset (curve flush to PNG bottom, no internal pad).
            let brandInkBottomPull: CGFloat = {
                let pointSize = UIFont.preferredFont(forTextStyle: .caption2).pointSize
                let weighted = UIFont.systemFont(ofSize: pointSize, weight: .medium)
                return max(0, abs(weighted.descender))
            }()
            let brandMarkSide: CGFloat = 24
            let indicatorHeight: CGFloat = 2
            let footerHeight = brandMarkSide
            let usableHeight = max(geo.size.height - pad * 2 - footerHeight, 1)
            let artworkSide = min(usableHeight * 0.92, geo.size.width * 0.42)

            ZStack {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .top, spacing: 12) {
                        sharpArtwork(artwork, size: artworkSide)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(artistName)
                                .font(.caption.weight(.semibold))
                                .foregroundColor(Color.white.opacity(0.78))
                                .lineLimit(1)
                                .minimumScaleFactor(0.9)
                                .padding(.top, -artistTopInkPull)
                            Text(title)
                                .font(.headline.weight(.bold))
                                .foregroundColor(.white)
                                .lineLimit(2)
                                .minimumScaleFactor(0.9)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(countdownLabel)
                                .font(.title2.weight(.bold))
                                .foregroundColor(countdownColor(isOutNow: isOutNow))
                                .lineLimit(1)
                                .minimumScaleFactor(0.9)
                            if let announcementLabel {
                                Text(announcementLabel)
                                    .font(.caption2.weight(.medium))
                                    .foregroundColor(Color.white.opacity(0.55))
                                    .lineLimit(1)
                            }
                            if let releaseDateLabel {
                                Text(releaseDateLabel)
                                    .font(.caption2)
                                    .foregroundColor(Color.white.opacity(0.65))
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .frame(height: artworkSide, alignment: .topLeading)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                    // Shared bottom inset: dub hub + D bottom-aligned; indicator
                    // centred on the overall widget width (not the residual gap).
                    ZStack(alignment: .bottom) {
                        HStack(alignment: .bottom, spacing: 0) {
                            Text("dub hub")
                                .font(.caption2.weight(.medium))
                                .foregroundColor(Color.white.opacity(0.45))
                                .padding(.bottom, -brandInkBottomPull)
                            Spacer(minLength: 0)
                            Image("DubHubD")
                                .resizable()
                                .scaledToFit()
                                .frame(width: brandMarkSide, height: brandMarkSide)
                                .opacity(0.88)
                                .blendMode(.screen)
                                .accessibilityHidden(true)
                        }
                        if showPager {
                            pageIndicator(pageIndex: pageIndex, pageCount: pageCount)
                                .accessibilityHidden(true)
                                .padding(.bottom, (brandMarkSide - indicatorHeight) / 2)
                        }
                    }
                    .frame(height: footerHeight, alignment: .bottom)
                }
                .padding(pad)
                .frame(width: geo.size.width, height: geo.size.height, alignment: .center)

                // Outer-edge chevrons only when that direction is available (bounded).
                if #available(iOS 17.0, *), showPager {
                    HStack(spacing: 0) {
                        if canGoPrevious {
                            edgePageButton(systemName: "chevron.left", intent: ReleaseCountdownPreviousIntent())
                                .accessibilityLabel("Previous release")
                        }
                        Spacer(minLength: 0)
                        if canGoNext {
                            edgePageButton(systemName: "chevron.right", intent: ReleaseCountdownNextIntent())
                                .accessibilityLabel("Next release")
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }

    /// Subtle glyph inside an enlarged (~44pt) AppIntent hit region.
    /// Soft shadow keeps the glyph legible over light sharp artwork without a button plate.
    @available(iOS 17.0, *)
    private func edgePageButton<I: AppIntent>(
        systemName: String,
        intent: I
    ) -> some View {
        Button(intent: intent) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color.white.opacity(0.92))
                .shadow(color: Color.black.opacity(0.55), radius: 1.2, x: 0, y: 0.5)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func pageIndicator(pageIndex: Int, pageCount: Int) -> some View {
        // At the soft cap of 12, marks get tight on medium (~100pt+). Still render
        // deterministically; lowering the cap is a product decision, not silent.
        let spacing: CGFloat = pageCount >= 9 ? 3 : 4
        let inactiveWidth: CGFloat = pageCount >= 9 ? 4 : 6
        let activeWidth: CGFloat = pageCount >= 9 ? 8 : 10
        return HStack(spacing: spacing) {
            ForEach(0..<pageCount, id: \.self) { index in
                Capsule()
                    .fill(Color.white.opacity(index == pageIndex ? 0.92 : 0.38))
                    .frame(
                        width: index == pageIndex ? activeWidth : inactiveWidth,
                        height: 2
                    )
            }
        }
    }

    private func emptyContent(title: String, message: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            sharpArtwork(nil, size: family == .systemSmall ? 44 : 72)
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline.weight(.bold))
                    .foregroundColor(.white)
                Text(message)
                    .font(.caption)
                    .foregroundColor(Color.white.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                if family != .systemSmall {
                    Text("dub hub")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(Color.white.opacity(0.45))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(family == .systemSmall ? 12 : 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func sharpArtwork(_ image: UIImage?, size: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.36, weight: .medium))
                    .foregroundColor(Color.white.opacity(0.7))
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibility(hidden: true)
    }

    private func countdownColor(isOutNow: Bool) -> Color {
        if isOutNow {
            return Color(red: 0.45, green: 0.95, blue: 0.65)
        }
        return Color.white
    }

    private func releaseAccessibilityLabel(
        title: String,
        artistName: String,
        countdownLabel: String,
        isOutNow: Bool,
        announcementLabel: String?,
        pageIndex: Int,
        pageCount: Int,
        allowsPaging: Bool
    ) -> String {
        var base: String
        if isOutNow {
            base = "\(title) by \(artistName). Out now."
        } else if let announcementLabel {
            base = "\(title) by \(artistName). \(countdownLabel). \(announcementLabel)."
        } else {
            base = "\(title) by \(artistName). \(countdownLabel)."
        }
        if allowsPaging && pageCount > 1 {
            base += " Release \(pageIndex + 1) of \(pageCount)."
        }
        return base
    }
}

#if DEBUG
struct ReleaseCountdownEntryView_Previews: PreviewProvider {
    static var previews: some View {
        ReleaseCountdownEntryView(
            entry: ReleaseCountdownEntry(
                date: Date(),
                state: .release(
                    title: "Brand New Banger",
                    artistName: "Artist",
                    artworkLocalPath: nil,
                    artworkRemoteURL: nil,
                    countdownLabel: "83 days",
                    isOutNow: false,
                    announcementLabel: "Release announced",
                    deepLink: URL(string: "https://dubhub.uk/?release=demo")!,
                    releaseDateLabel: "Oct 31, 2026",
                    pageIndex: 1,
                    pageCount: 3,
                    allowsPaging: true
                )
            )
        )
        .previewContext(WidgetPreviewContext(family: .systemMedium))

        ReleaseCountdownEntryView(
            entry: ReleaseCountdownEntry(
                date: Date(),
                state: .release(
                    title: "Brand New Banger",
                    artistName: "Artist",
                    artworkLocalPath: nil,
                    artworkRemoteURL: nil,
                    countdownLabel: "83 days",
                    isOutNow: false,
                    announcementLabel: nil,
                    deepLink: URL(string: "https://dubhub.uk/?release=demo")!,
                    releaseDateLabel: nil,
                    pageIndex: 0,
                    pageCount: 1,
                    allowsPaging: false
                )
            )
        )
        .previewContext(WidgetPreviewContext(family: .systemSmall))

        ReleaseCountdownEntryView(entry: ReleaseCountdownEntry(date: Date(), state: .empty))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
#endif
