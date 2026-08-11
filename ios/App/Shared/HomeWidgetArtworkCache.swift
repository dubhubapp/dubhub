import Foundation
import UIKit

/// Downloads and caches modest square JPEGs into the App Group for WidgetKit.
/// Main app only — widget reads files; it does not download.
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
     Sync artwork for the given release collection:
     - download missing / refresh by rewriting each release file
     - remove files for release ids no longer in the keep set
     - remove legacy `active.jpg`
     Completion returns the local filename for `activeReleaseId` when available.
     */
    static func syncArtwork(
        releases: [(id: String, artworkUrl: String?)],
        activeReleaseId: String?,
        completion: @escaping (_ activeLocalFilename: String?) -> Void
    ) {
        let keepIds = Set(
            releases
                .map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        )
        removeStaleArtwork(keepingReleaseIds: keepIds)

        guard !releases.isEmpty else {
            DispatchQueue.main.async { completion(nil) }
            return
        }

        let group = DispatchGroup()
        var filenames: [String: String] = [:]
        let lock = NSLock()

        for item in releases {
            let releaseId = item.id.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let filename = HomeWidgetAppGroup.artworkFilename(forReleaseId: releaseId) else {
                continue
            }
            group.enter()
            downloadAndWrite(
                fromRemoteUrlString: item.artworkUrl,
                filename: filename
            ) { wrote in
                if wrote {
                    lock.lock()
                    filenames[releaseId] = filename
                    lock.unlock()
                }
                group.leave()
            }
        }

        group.notify(queue: .main) {
            let active = activeReleaseId?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let active, let name = filenames[active] {
                completion(name)
            } else if let first = releases.first,
                      let name = filenames[first.id.trimmingCharacters(in: .whitespacesAndNewlines)] {
                completion(name)
            } else {
                completion(nil)
            }
        }
    }

    /**
     Clears prior artwork, then optionally downloads + writes `active.jpg`.
     Legacy single-release path — prefer `syncArtwork` for multi-release.
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

        downloadAndWrite(
            fromRemoteUrlString: urlString,
            filename: HomeWidgetAppGroup.activeArtworkFilename
        ) { wrote in
            DispatchQueue.main.async {
                completion(wrote ? HomeWidgetAppGroup.activeArtworkFilename : nil)
            }
        }
    }

    static func prepareSquareJPEG(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let square = squareCroppedImage(image)
        let scaled = scaleImage(square, maxPixelSize: maxPixelSize)
        return scaled.jpegData(compressionQuality: jpegQuality)
    }

    private static func removeStaleArtwork(keepingReleaseIds keepIds: Set<String>) {
        guard let directory = HomeWidgetAppGroup.artworkDirectoryURL() else { return }
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return
        }
        for file in files {
            let name = file.lastPathComponent
            if name == HomeWidgetAppGroup.activeArtworkFilename {
                try? fm.removeItem(at: file)
                continue
            }
            guard name.hasSuffix(".jpg") else {
                try? fm.removeItem(at: file)
                continue
            }
            let id = String(name.dropLast(4))
            if !keepIds.contains(id) {
                try? fm.removeItem(at: file)
            }
        }
    }

    private static func downloadAndWrite(
        fromRemoteUrlString urlString: String?,
        filename: String,
        completion: @escaping (_ wrote: Bool) -> Void
    ) {
        guard let raw = urlString?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme?.lowercased() == "https"
        else {
            completion(false)
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { data, response, _ in
            guard let data = data, !data.isEmpty else {
                completion(false)
                return
            }
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                completion(false)
                return
            }
            guard let jpeg = prepareSquareJPEG(from: data) else {
                completion(false)
                return
            }
            completion(writeJPEG(jpeg, filename: filename))
        }.resume()
    }

    private static func writeJPEG(_ data: Data, filename: String) -> Bool {
        guard let directory = HomeWidgetAppGroup.artworkDirectoryURL() else { return false }
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            let fileURL = directory.appendingPathComponent(filename, isDirectory: false)
            if fm.fileExists(atPath: fileURL.path) {
                try fm.removeItem(at: fileURL)
            }
            try data.write(to: fileURL, options: .atomic)
            return true
        } catch {
            return false
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
