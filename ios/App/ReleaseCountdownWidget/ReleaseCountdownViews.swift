import SwiftUI
import WidgetKit
import UIKit

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
        .widgetURL(tapURL)
    }

    @ViewBuilder
    private func contentView(for state: ReleaseCountdownDisplayState) -> some View {
        switch state {
        case let .release(
            title, artistName, artworkLocalPath, _, countdownLabel, isOutNow, _, releaseDateLabel
        ):
            releaseContent(
                title: title,
                artistName: artistName,
                artwork: ReleaseCountdownArtworkImage.load(localPath: artworkLocalPath),
                countdownLabel: countdownLabel,
                isOutNow: isOutNow,
                releaseDateLabel: releaseDateLabel
            )
            .accessibilityLabel(releaseAccessibilityLabel(
                title: title,
                artistName: artistName,
                countdownLabel: countdownLabel,
                isOutNow: isOutNow
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
        case let .release(_, _, _, _, _, _, deepLink, _):
            return deepLink
        case .empty, .refresh:
            return URL(string: "https://dubhub.uk/")!
        }
    }

    @ViewBuilder
    private func backgroundLayer(for state: ReleaseCountdownDisplayState) -> some View {
        switch state {
        case let .release(_, _, artworkLocalPath, _, _, _, _, _):
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
        releaseDateLabel: String?
    ) -> some View {
        switch family {
        case .systemSmall:
            smallReleaseContent(
                title: title,
                artistName: artistName,
                artwork: artwork,
                countdownLabel: countdownLabel,
                isOutNow: isOutNow
            )
        default:
            mediumReleaseContent(
                title: title,
                artistName: artistName,
                artwork: artwork,
                countdownLabel: countdownLabel,
                isOutNow: isOutNow,
                releaseDateLabel: releaseDateLabel
            )
        }
    }

    private func smallReleaseContent(
        title: String,
        artistName: String,
        artwork: UIImage?,
        countdownLabel: String,
        isOutNow: Bool
    ) -> some View {
        GeometryReader { geo in
            let usableWidth = max(geo.size.width - 16, 1)
            // Artwork is the focus; leave room for a tight text cluster underneath.
            let artworkSide = min(usableWidth * 0.58, geo.size.height * 0.56)
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
        }
    }

    private func mediumReleaseContent(
        title: String,
        artistName: String,
        artwork: UIImage?,
        countdownLabel: String,
        isOutNow: Bool,
        releaseDateLabel: String?
    ) -> some View {
        GeometryReader { geo in
            let usableHeight = max(geo.size.height - 20, 1)
            // Artwork-led; text column fills the remaining width at full type size.
            let artworkSide = min(usableHeight * 0.88, geo.size.width * 0.42)
            HStack(alignment: .top, spacing: 12) {
                sharpArtwork(artwork, size: artworkSide)
                VStack(alignment: .leading, spacing: 2) {
                    Text(artistName)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color.white.opacity(0.78))
                        .lineLimit(1)
                        .minimumScaleFactor(0.9)
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
                        .padding(.top, 1)
                    if let releaseDateLabel {
                        Text(releaseDateLabel)
                            .font(.caption2)
                            .foregroundColor(Color.white.opacity(0.65))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Text("dub hub")
                        .font(.caption2.weight(.medium))
                        .foregroundColor(Color.white.opacity(0.45))
                }
                .frame(maxWidth: .infinity, minHeight: artworkSide, maxHeight: artworkSide, alignment: .topLeading)
            }
            .padding(10)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
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
        isOutNow: Bool
    ) -> String {
        if isOutNow {
            return "\(title) by \(artistName). Out now."
        }
        return "\(title) by \(artistName). \(countdownLabel)."
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
                    deepLink: URL(string: "https://dubhub.uk/?release=demo")!,
                    releaseDateLabel: "Oct 31, 2026"
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
                    deepLink: URL(string: "https://dubhub.uk/?release=demo")!,
                    releaseDateLabel: nil
                )
            )
        )
        .previewContext(WidgetPreviewContext(family: .systemSmall))

        ReleaseCountdownEntryView(entry: ReleaseCountdownEntry(date: Date(), state: .empty))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
#endif
