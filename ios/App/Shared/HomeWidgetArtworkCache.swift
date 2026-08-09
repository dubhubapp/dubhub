import Foundation
import UIKit

/// Downloads and caches a modest square JPEG into the App Group for WidgetKit.
/// Main app only — widget reads the file; it does not download.
enum HomeWidgetArtworkCache {
    /// Enough for systemSmall/systemMedium @3x without shipping full originals.
    static let maxPixelSize: CGFloat = 720
    static let jpegQuality: CGFloat = 0.82

    /// Removes all files under ReleaseCountdownArtwork/.
    @discardableResult
    static func clearAll() -> Bool {
        guard let directory = HomeWidgetAppGroup.artworkDirectoryURL() else { return false }
        let fm = FileManager.default
        if fm.fileExists(atPath: directory.path) {
            do {
                try fm.removeItem(at: directory)
            } catch {
                return false
            }
        }
        return true
    }

    /**
     Clears prior artwork, then optionally downloads + writes `active.jpg`.
     Download failure returns nil filename without throwing — caller still writes text payload.
     */
    static func replaceArtwork(
        fromRemoteUrlString urlString: String?,
        completion: @escaping (_ localFilename: String?) -> Void
    ) {
        clearAll()

        guard let raw = urlString?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme?.lowercased() == "https"
        else {
            completion(nil)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { data, response, _ in
            defer {
                // Ensure completion always on a consistent queue for plugin writes.
            }
            guard let data = data, !data.isEmpty else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            guard let jpeg = prepareSquareJPEG(from: data) else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let filename = writeActiveJPEG(jpeg)
            DispatchQueue.main.async { completion(filename) }
        }.resume()
    }

    static func prepareSquareJPEG(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let square = squareCroppedImage(image)
        let scaled = scaleImage(square, maxPixelSize: maxPixelSize)
        return scaled.jpegData(compressionQuality: jpegQuality)
    }

    private static func writeActiveJPEG(_ data: Data) -> String? {
        guard let directory = HomeWidgetAppGroup.artworkDirectoryURL() else { return nil }
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            let fileURL = directory.appendingPathComponent(
                HomeWidgetAppGroup.activeArtworkFilename,
                isDirectory: false
            )
            if fm.fileExists(atPath: fileURL.path) {
                try fm.removeItem(at: fileURL)
            }
            try data.write(to: fileURL, options: .atomic)
            return HomeWidgetAppGroup.activeArtworkFilename
        } catch {
            return nil
        }
    }

    private static func squareCroppedImage(_ image: UIImage) -> UIImage {
        let size = image.size
        guard size.width > 0, size.height > 0 else { return image }
        let side = min(size.width, size.height)
        let origin = CGPoint(x: (size.width - side) / 2, y: (size.height - side) / 2)
        let cropRect = CGRect(origin: origin, size: CGSize(width: side, height: side))
        guard let cg = image.cgImage?.cropping(to: cropRectInPixels(cropRect, image: image)) else {
            return image
        }
        return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation)
    }

    private static func cropRectInPixels(_ rect: CGRect, image: UIImage) -> CGRect {
        let scale = image.scale
        return CGRect(
            x: rect.origin.x * scale,
            y: rect.origin.y * scale,
            width: rect.size.width * scale,
            height: rect.size.height * scale
        )
    }

    private static func scaleImage(_ image: UIImage, maxPixelSize: CGFloat) -> UIImage {
        let pixelWidth = image.size.width * image.scale
        let pixelHeight = image.size.height * image.scale
        let longest = max(pixelWidth, pixelHeight)
        guard longest > maxPixelSize else { return image }
        let ratio = maxPixelSize / longest
        let newSize = CGSize(
            width: image.size.width * ratio,
            height: image.size.height * ratio
        )
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
