import UIKit
import Capacitor
import AVFoundation
import CoreMedia
import CoreVideo
import CoreAudio
import UniformTypeIdentifiers

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(DubHubVideoEditorPlugin)
public class DubHubVideoEditorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DubHubVideoEditor"
    public let jsName = "DubHubVideoEditor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVideoInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trimVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateThumbnail", returnType: CAPPluginReturnPromise),
    ]

    private let implementation = DubHubVideoEditor()

    @objc func getVideoInfo(_ call: CAPPluginCall) {
        guard let sourceUri = call.getString("sourceUri"), !sourceUri.isEmpty else {
            call.reject("sourceUri is required")
            return
        }
        NSLog("[DubHub][NativeTrim] getVideoInfo called sourceUri=%@", sourceUri)
        implementation.getVideoInfo(sourceUri: sourceUri) { result in
            switch result {
            case .success(let payload):
                NSLog("[DubHub][NativeTrim] getVideoInfo done payload=%@", String(describing: payload))
                call.resolve(payload)
            case .failure(let error):
                NSLog("[DubHub][NativeTrim] getVideoInfo failed %@", error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func trimVideo(_ call: CAPPluginCall) {
        guard let sourceUri = call.getString("sourceUri"), !sourceUri.isEmpty else {
            call.reject("sourceUri is required")
            return
        }
        let startMs = call.getDouble("startMs") ?? -1
        let endMs = call.getDouble("endMs") ?? -1
        NSLog("[DubHub][NativeTrim] trimVideo called sourceUri=%@ startMs=%.0f endMs=%.0f", sourceUri, startMs, endMs)
        implementation.trimVideo(sourceUri: sourceUri, startMs: startMs, endMs: endMs) { result in
            switch result {
            case .success(let payload):
                NSLog("[DubHub][NativeTrim] trimVideo success payload=%@", String(describing: payload))
                call.resolve(payload)
            case .failure(let error):
                NSLog("[DubHub][NativeTrim] trimVideo failed %@", error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func generateThumbnail(_ call: CAPPluginCall) {
        guard let sourceUri = call.getString("sourceUri"), !sourceUri.isEmpty else {
            call.reject("sourceUri is required")
            return
        }
        let atMs = call.getDouble("atMs")
        NSLog("[DubHub][NativeTrim] generateThumbnail called sourceUri=%@", sourceUri)
        implementation.generateThumbnail(sourceUri: sourceUri, atMs: atMs) { result in
            switch result {
            case .success(let payload):
                NSLog("[DubHub][NativeTrim] generateThumbnail success payload=%@", String(describing: payload))
                call.resolve(payload)
            case .failure(let error):
                NSLog("[DubHub][NativeTrim] generateThumbnail failed %@", error.localizedDescription)
                call.reject(error.localizedDescription)
            }
        }
    }
}

enum DubHubVideoEditorError: LocalizedError {
    case invalidUri
    case sourceNotFound
    case unsupportedSource
    case invalidTrimWindow
    case clipTooShort
    case clipTooLong
    case noVideoTrack
    case exportSessionUnavailable
    case exportFailed(String)
    case thumbnailFailed

    var errorDescription: String? {
        switch self {
        case .invalidUri: return "Invalid source URI."
        case .sourceNotFound: return "Source video file not found."
        case .unsupportedSource: return "Unsupported source URI scheme."
        case .invalidTrimWindow: return "Invalid trim range: end must be greater than start."
        case .clipTooShort: return "Trimmed clip must be at least 3 seconds."
        case .clipTooLong: return "Trimmed clip must be at most 30 seconds."
        case .noVideoTrack: return "No video track found in source."
        case .exportSessionUnavailable: return "Could not create export session."
        case .exportFailed(let details): return "Video export failed: \(details)"
        case .thumbnailFailed: return "Failed to generate thumbnail."
        }
    }
}

final class DubHubVideoEditor {
    private let minClipMs: Double = 3000
    private let maxClipMs: Double = 30000
    /// Target ~2.2 Mbps average; encoder peaks typically stay near this on short clips.
    private let targetVideoBitrate = 2_200_000
    /// Keyframe every 2 seconds (interval duration, seconds).
    private let keyframeIntervalSeconds: Double = 2.0
    /// Longest edge cap (1080p-class); do not upscale smaller sources.
    private let maxOutputLongestEdge: CGFloat = 1920
    private let targetAudioBitrate = 160_000

    private func stagedError(_ stage: String, _ reason: String, _ sourceUri: String) -> Error {
        NSError(
            domain: "DubHubVideoEditor",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "[DubHub][NativeTrim][\(stage)] \(reason) sourceUri=\(sourceUri)"]
        )
    }

    /// First format description on the track (elements are `CMFormatDescription` at runtime; use `as!` to satisfy Swift/CFoo bridging).
    private func firstCMFormatDescription(from track: AVAssetTrack) -> CMFormatDescription? {
        guard let any = track.formatDescriptions.first else { return nil }
        return (any as! CMFormatDescription)
    }

    func getVideoInfo(
        sourceUri: String,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let url = try self.resolveSourceURL(sourceUri)
                NSLog("[DubHub][NativeTrim] getVideoInfo resolvedUrl=%@", url.absoluteString)
                guard FileManager.default.fileExists(atPath: url.path) else {
                    throw self.stagedError("getVideoInfo:fileExists", "source file missing", sourceUri)
                }
                let asset = AVURLAsset(url: url)
                NSLog("[DubHub][NativeTrim] getVideoInfo assetCreated durationMs=%d", Int((CMTimeGetSeconds(asset.duration) * 1000.0).rounded()))
                let payload = try self.buildInfoPayload(asset: asset, sourceUrl: url)
                completion(.success(payload))
            } catch {
                completion(.failure(error))
            }
        }
    }

    func trimVideo(
        sourceUri: String,
        startMs: Double,
        endMs: Double,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                if endMs <= startMs { throw DubHubVideoEditorError.invalidTrimWindow }
                let clipMs = endMs - startMs
                if clipMs < self.minClipMs { throw DubHubVideoEditorError.clipTooShort }
                if clipMs > self.maxClipMs { throw DubHubVideoEditorError.clipTooLong }

                let sourceUrl = try self.resolveSourceURL(sourceUri)
                NSLog("[DubHub][NativeTrim] trimVideo resolvedUrl=%@", sourceUrl.absoluteString)
                guard FileManager.default.fileExists(atPath: sourceUrl.path) else {
                    throw self.stagedError("trimVideo:fileExists", "source file missing", sourceUri)
                }
                NSLog("[DubHub][NativeTrim] trimVideo sourceExists=1")

                let asset = AVURLAsset(url: sourceUrl)
                let assetDurationMs = Int((CMTimeGetSeconds(asset.duration) * 1000.0).rounded())
                NSLog("[DubHub][NativeTrim] trimVideo assetCreated durationMs=%d", assetDurationMs)
                let videoTracks = asset.tracks(withMediaType: .video)
                NSLog("[DubHub][NativeTrim] trimVideo videoTrackCount=%d", videoTracks.count)
                guard !videoTracks.isEmpty else {
                    throw self.stagedError("trimVideo:tracks", "no video track found", sourceUri)
                }

                let rawTrimUrl = self.makeTempURL(ext: "mp4", prefix: "dubhub_trim_raw_")
                try? FileManager.default.removeItem(at: rawTrimUrl)
                NSLog("[DubHub][NativeTrim] trimVideo rawTrimOutputUrl=%@", rawTrimUrl.absoluteString)

                guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
                    throw self.stagedError("trimVideo:exportSession", "export session unavailable", sourceUri)
                }
                NSLog("[DubHub][NativeTrim] trimVideo rawTrimPreset=%@", AVAssetExportPresetPassthrough)
                session.outputURL = rawTrimUrl
                session.outputFileType = .mp4
                session.shouldOptimizeForNetworkUse = true

                let start = CMTime(seconds: startMs / 1000.0, preferredTimescale: 600)
                let duration = CMTime(seconds: clipMs / 1000.0, preferredTimescale: 600)
                session.timeRange = CMTimeRange(start: start, duration: duration)
                NSLog("[DubHub][NativeTrim] trimVideo timeRange start=%.3f duration=%.3f", start.seconds, duration.seconds)
                NSLog("[DubHub][NativeTrim] trimVideo export start")

                session.exportAsynchronously {
                    NSLog("[DubHub][NativeTrim] trimVideo export completion status=%ld error=%@", session.status.rawValue, session.error?.localizedDescription ?? "nil")
                    switch session.status {
                    case .completed:
                        do {
                            let exists = FileManager.default.fileExists(atPath: rawTrimUrl.path)
                            NSLog("[DubHub][NativeTrim] trimVideo rawTrimOutputExists=%d", exists ? 1 : 0)
                            if !exists {
                                throw self.stagedError("trimVideo:outputExists", "export completed but output file missing", sourceUri)
                            }
                            let rawOutSize = (try? rawTrimUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1
                            NSLog("[DubHub][NativeTrim] raw trim output size bytes=%d", rawOutSize)
                            self.compressTrimmedVideo(
                                rawTrimUrl: rawTrimUrl,
                                sourceUri: sourceUri
                            ) { compressResult in
                                switch compressResult {
                                case .success(let compressedUrl):
                                    do {
                                        let compressedSize = (try? compressedUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1
                                        NSLog("[DubHub][NativeTrim] compressed output size bytes=%d", compressedSize)
                                        NSLog("[DubHub][NativeTrim] final output selected for submission uri=%@", compressedUrl.absoluteString)
                                        let outAsset = AVURLAsset(url: compressedUrl)
                                        var payload = try self.buildInfoPayload(asset: outAsset, sourceUrl: compressedUrl)
                                        payload["outputUri"] = compressedUrl.absoluteString
                                        try? FileManager.default.removeItem(at: rawTrimUrl)
                                        completion(.success(payload))
                                    } catch {
                                        completion(.failure(error))
                                    }
                                case .failure(let error):
                                    completion(.failure(error))
                                }
                            }
                        } catch {
                            completion(.failure(error))
                        }
                    case .failed, .cancelled:
                        let reason = session.error?.localizedDescription ?? "unknown"
                        completion(.failure(self.stagedError("trimVideo:export", reason, sourceUri)))
                    default:
                        let reason = session.error?.localizedDescription ?? "unexpected export status"
                        completion(.failure(self.stagedError("trimVideo:exportStatus", reason, sourceUri)))
                    }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func compressTrimmedVideo(
        rawTrimUrl: URL,
        sourceUri: String,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        let trimmedAsset = AVURLAsset(url: rawTrimUrl)
        let compressedUrl = makeTempURL(ext: "mp4", prefix: "dubhub_trim_final_")
        try? FileManager.default.removeItem(at: compressedUrl)

        exportCompressedVideoWithAssetWriter(
            asset: trimmedAsset,
            outputURL: compressedUrl,
            sourceUri: sourceUri,
            completion: completion
        )
    }

    // MARK: - AVAssetWriter export (explicit H.264 + AAC)

    private func exportCompressedVideoWithAssetWriter(
        asset: AVAsset,
        outputURL: URL,
        sourceUri: String,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        try? FileManager.default.removeItem(at: outputURL)

        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            completion(.failure(stagedError("compress:noVideo", "no video track in trimmed asset", sourceUri)))
            return
        }

        let audioTrack = asset.tracks(withMediaType: .audio).first
        let (outW, outH, videoComposition) = buildScalingVideoComposition(videoTrack: videoTrack, asset: asset)
        let durationSeconds = max(0.001, CMTimeGetSeconds(asset.duration))

        let colorPropsLog = videoColorPropertiesForExport(videoTrack: videoTrack)
        // H.264 (avc1) does not support AVVideoColorPropertiesKey on AVAssetWriterInput; colour is best-effort via reader pixel format + encoder defaults.
        let videoSettings = makeVideoOutputSettings(
            width: outW,
            height: outH,
            frameRate: videoTrack.nominalFrameRate
        )

        let audioSettings: [String: Any]?
        var audioChannels: Int = 0
        var audioSampleRate: Double = 0
        if let aTrack = audioTrack {
            let asbd: AudioStreamBasicDescription? = {
                guard let desc = self.firstCMFormatDescription(from: aTrack) else { return nil }
                return CMAudioFormatDescriptionGetStreamBasicDescription(desc)?.pointee
            }()
            let ch = Int(asbd?.mChannelsPerFrame ?? 2)
            let rate = asbd?.mSampleRate ?? 48_000
            audioChannels = max(1, min(8, ch))
            audioSampleRate = (rate == 44_100 || rate == 48_000) ? rate : 48_000
            audioSettings = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVNumberOfChannelsKey: audioChannels,
                AVSampleRateKey: audioSampleRate,
                AVEncoderBitRateKey: targetAudioBitrate,
            ]
        } else {
            audioSettings = nil
            NSLog("[DubHub][NativeExport] no audio track in trimmed asset")
        }

        let fileSizeBefore = (try? outputURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1

        NSLog(
            "[DubHub][NativeExport] start outputUrl=%@ durationSec=%.3f bitrateVideo=%d bitrateAudio=%d resolution=%dx%d scaleComposition=%d colour=%@ fullRange=%d audioCh=%d audioRate=%.0f fileSizeBefore=%d",
            outputURL.lastPathComponent,
            durationSeconds,
            targetVideoBitrate,
            audioTrack != nil ? targetAudioBitrate : 0,
            outW,
            outH,
            videoComposition != nil ? 1 : 0,
            colorPropsLog.summary,
            colorPropsLog.fullRangeFromSource ? 1 : 0,
            audioChannels,
            audioSampleRate,
            fileSizeBefore
        )

        guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
            completion(.failure(stagedError("compress:writerCreate", "could not create AVAssetWriter", sourceUri)))
            return
        }
        writer.shouldOptimizeForNetworkUse = true

        let writerVideo = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        writerVideo.expectsMediaDataInRealTime = false
        guard writer.canAdd(writerVideo) else {
            completion(.failure(stagedError("compress:writerVideo", "cannot add video writer input", sourceUri)))
            return
        }
        writer.add(writerVideo)

        var writerAudio: AVAssetWriterInput?
        if let audioSettings = audioSettings {
            let w = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            w.expectsMediaDataInRealTime = false
            if writer.canAdd(w) {
                writer.add(w)
                writerAudio = w
            } else {
                NSLog("[DubHub][NativeExport] warning: cannot add audio writer input; exporting video only")
            }
        }

        guard let reader = try? AVAssetReader(asset: asset) else {
            completion(.failure(stagedError("compress:readerCreate", "could not create AVAssetReader", sourceUri)))
            return
        }

        let readerVideo: AVAssetReaderOutput
        if let videoComposition = videoComposition {
            let compositionOutput = AVAssetReaderVideoCompositionOutput(
                videoTracks: [videoTrack],
                videoSettings: readerVideoOutputSettings(fullRange: colorPropsLog.fullRangeFromSource)
            )
            compositionOutput.videoComposition = videoComposition
            compositionOutput.alwaysCopiesSampleData = false
            readerVideo = compositionOutput
        } else {
            readerVideo = AVAssetReaderTrackOutput(
                track: videoTrack,
                outputSettings: readerVideoOutputSettings(fullRange: colorPropsLog.fullRangeFromSource)
            )
            readerVideo.alwaysCopiesSampleData = false
        }
        guard reader.canAdd(readerVideo) else {
            completion(.failure(stagedError("compress:readerVideo", "cannot add video reader output", sourceUri)))
            return
        }
        reader.add(readerVideo)

        var readerAudio: AVAssetReaderTrackOutput?
        if let aTrack = audioTrack, writerAudio != nil {
            let out = AVAssetReaderTrackOutput(
                track: aTrack,
                outputSettings: [
                    AVFormatIDKey: kAudioFormatLinearPCM,
                    AVLinearPCMBitDepthKey: 16,
                    AVLinearPCMIsFloatKey: false,
                    AVLinearPCMIsBigEndianKey: false,
                ] as [String: Any]
            )
            out.alwaysCopiesSampleData = false
            if reader.canAdd(out) {
                reader.add(out)
                readerAudio = out
            }
        }

        guard writer.startWriting() else {
            let reason = writer.error?.localizedDescription ?? "unknown"
            completion(.failure(stagedError("compress:writerStart", reason, sourceUri)))
            return
        }

        guard reader.startReading() else {
            let reason = reader.error?.localizedDescription ?? "unknown"
            writer.cancelWriting()
            completion(.failure(stagedError("compress:readerStart", reason, sourceUri)))
            return
        }

        writer.startSession(atSourceTime: .zero)

        // Video and audio must pump on different serial queues; a single shared queue can deadlock
        // the muxer when both tracks need to make progress (writer stalls waiting on the other track).
        let videoQueue = DispatchQueue(label: "com.dubhub.nativeexport.video", qos: .userInitiated)
        let audioQueue = DispatchQueue(label: "com.dubhub.nativeexport.audio", qos: .userInitiated)
        let group = DispatchGroup()

        group.enter()
        pumpWriterInput(
            writerInput: writerVideo,
            readerOutput: readerVideo,
            reader: reader,
            queue: videoQueue
        ) {
            group.leave()
        }

        if let writerAudio = writerAudio, let readerAudio = readerAudio {
            group.enter()
            pumpWriterInput(
                writerInput: writerAudio,
                readerOutput: readerAudio,
                reader: reader,
                queue: audioQueue
            ) {
                group.leave()
            }
        }

        group.notify(queue: DispatchQueue.global(qos: .userInitiated)) {
            writer.finishWriting {
                if writer.status == .completed {
                    let size = (try? outputURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1
                    let estKbps = size > 0 ? Double(size * 8) / 1000.0 / durationSeconds : -1
                    NSLog(
                        "[DubHub][NativeExport] done durationSec=%.3f fileSizeBytes=%d avgBitrateEst=%.0f kbps colour=%@",
                        durationSeconds,
                        size,
                        estKbps,
                        colorPropsLog.summary
                    )
                    completion(.success(outputURL))
                } else {
                    try? FileManager.default.removeItem(at: outputURL)
                    let reason = writer.error?.localizedDescription ?? "writer finish failed"
                    NSLog("[DubHub][NativeExport] failed %@", reason)
                    completion(.failure(self.stagedError("compress:writerFinish", reason, sourceUri)))
                }
            }
        }
    }

    private struct VideoColorExportInfo {
        let summary: String
        let fullRangeFromSource: Bool
    }

    /// Source colour tags for logs only; H.264 writer does not accept AVVideoColorPropertiesKey (avc1).
    private func videoColorPropertiesForExport(videoTrack: AVAssetTrack) -> VideoColorExportInfo {
        var primOut = AVVideoColorPrimaries_ITU_R_709_2
        var xferOut = AVVideoTransferFunction_ITU_R_709_2
        var matrixOut = AVVideoYCbCrMatrix_ITU_R_709_2
        var fullRange = false
        if let desc = firstCMFormatDescription(from: videoTrack) {
            if let ext = CMFormatDescriptionGetExtensions(desc) as? [String: Any] {
                let frKey = kCMFormatDescriptionExtension_FullRangeVideo as String
                if let b = ext[frKey] as? Bool {
                    fullRange = b
                } else if let n = ext[frKey] as? NSNumber {
                    fullRange = n.boolValue
                } else if let s = ext[frKey] as? String {
                    fullRange = s == "1" || s.lowercased() == "true"
                }
                let prim = ext[kCMFormatDescriptionExtension_ColorPrimaries as String] as? String
                let xfer = ext[kCMFormatDescriptionExtension_TransferFunction as String] as? String
                let matrix = ext[kCMFormatDescriptionExtension_YCbCrMatrix as String] as? String
                NSLog(
                    "[DubHub][NativeExport] sourceColour prim=%@ xfer=%@ matrix=%@ fullRange=%d",
                    prim ?? "nil",
                    xfer ?? "nil",
                    matrix ?? "nil",
                    fullRange ? 1 : 0
                )
                if let p = prim, isSDRPrimaries(p) { primOut = p }
                if let t = xfer, isSDRTransfer(t) { xferOut = t }
                if let m = matrix, is709Matrix(m) { matrixOut = m }
            }
        }
        let summary = String(
            format: "prim=%@ xfer=%@ matrix=%@ sourceFullRange=%d",
            primOut,
            xferOut,
            matrixOut,
            fullRange ? 1 : 0
        )
        return VideoColorExportInfo(summary: summary, fullRangeFromSource: fullRange)
    }

    private func isSDRPrimaries(_ s: String) -> Bool {
        s == AVVideoColorPrimaries_ITU_R_709_2 || s == "bt709" || s == "BT.709"
    }

    private func isSDRTransfer(_ s: String) -> Bool {
        let lower = s.lowercased()
        return s == AVVideoTransferFunction_ITU_R_709_2
            || lower == "bt709"
            || s == "BT.709"
            || lower.contains("srgb")
            || s == (kCMFormatDescriptionTransferFunction_sRGB as String)
    }

    private func is709Matrix(_ s: String) -> Bool {
        s == AVVideoYCbCrMatrix_ITU_R_709_2 || s == "bt709" || s == "BT.709"
    }

    private func makeVideoOutputSettings(width: Int, height: Int, frameRate: Float) -> [String: Any] {
        let fps = (frameRate > 0 && frameRate.isFinite) ? frameRate : 30
        let keyframeFrames = max(30, Int((Double(fps) * keyframeIntervalSeconds).rounded()))

        let compression: [String: Any] = [
            AVVideoAverageBitRateKey: targetVideoBitrate,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: keyframeFrames,
            AVVideoMaxKeyFrameIntervalDurationKey: NSNumber(value: keyframeIntervalSeconds),
            AVVideoAllowFrameReorderingKey: true,
        ]

        return [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compression,
        ]
    }

    private func readerVideoOutputSettings(fullRange: Bool) -> [String: Any] {
        let fmt: OSType = fullRange
            ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        return [
            kCVPixelBufferPixelFormatTypeKey as String: fmt,
        ] as [String: Any]
    }

    /// Builds a composition that applies `layerTransform` into `renderWidth`×`renderHeight` (display-oriented pixels).
    private func makeVideoComposition(
        asset: AVAsset,
        videoTrack: AVAssetTrack,
        layerTransform: CGAffineTransform,
        renderWidth: Int,
        renderHeight: Int
    ) -> AVVideoComposition {
        let instruction = AVMutableVideoCompositionInstruction()
        instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)

        let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
        layer.setTransform(layerTransform, at: .zero)
        instruction.layerInstructions = [layer]

        let composition = AVMutableVideoComposition()
        composition.renderSize = CGSize(width: renderWidth, height: renderHeight)
        composition.instructions = [instruction]
        let nominal = videoTrack.nominalFrameRate
        let fpsBasis = (nominal > 0 && nominal.isFinite) ? Double(nominal) : 30
        let fpsForTimescale = Int32(max(1, min(60, lrint(fpsBasis))))
        composition.frameDuration = CMTime(value: 1, timescale: fpsForTimescale)
        return composition
    }

    /// Returns (width,height) even display dimensions and a composition whenever rotation and/or downscale must be baked in.
    ///
    /// When `preferredTransform` is non-identity (typical portrait iPhone clips stored as landscape + rotation),
    /// we must use `AVAssetReaderVideoCompositionOutput` — plain `AVAssetReaderTrackOutput` yields encoded-buffer
    /// orientation while the writer is configured for display size, which stretches or swaps the image.
    private func buildScalingVideoComposition(videoTrack: AVAssetTrack, asset: AVAsset) -> (Int, Int, AVVideoComposition?) {
        let natural = videoTrack.naturalSize
        let tx = videoTrack.preferredTransform
        let bounds = CGRect(origin: .zero, size: natural).applying(tx)
        let srcW = abs(bounds.width)
        let srcH = abs(bounds.height)
        guard srcW > 1, srcH > 1 else {
            let w = evenDimension(CGFloat(max(320, natural.width)))
            let h = evenDimension(CGFloat(max(240, natural.height)))
            return (w, h, nil)
        }

        let longest = max(srcW, srcH)
        let scale: CGFloat = longest > maxOutputLongestEdge ? (maxOutputLongestEdge / longest) : 1.0
        let targetW = evenDimension(srcW * scale)
        let targetH = evenDimension(srcH * scale)

        if scale >= 0.999 {
            if tx.isIdentity {
                return (targetW, targetH, nil)
            }
            let composition = makeVideoComposition(
                asset: asset,
                videoTrack: videoTrack,
                layerTransform: tx,
                renderWidth: targetW,
                renderHeight: targetH
            )
            return (targetW, targetH, composition)
        }

        let scaleT = CGAffineTransform(scaleX: scale, y: scale)
        let combined = scaleT.concatenating(tx)
        let composition = makeVideoComposition(
            asset: asset,
            videoTrack: videoTrack,
            layerTransform: combined,
            renderWidth: targetW,
            renderHeight: targetH
        )
        return (targetW, targetH, composition)
    }

    private func evenDimension(_ value: CGFloat) -> Int {
        let v = max(2, Int(value.rounded(.down)))
        return v & ~1
    }

    /// Pumps samples without `requestMediaDataWhenReady` (only one outstanding request is allowed per input; re-queueing is flaky across OS versions).
    private func pumpWriterInput(
        writerInput: AVAssetWriterInput,
        readerOutput: AVAssetReaderOutput,
        reader: AVAssetReader,
        queue: DispatchQueue,
        finished: @escaping () -> Void
    ) {
        let waitSleepSec = 0.002
        /// Avoid spinning forever if writer never becomes ready.
        let maxReadyWaits = 150_000
        queue.async {
            var readyWaits = 0
            while true {
                if reader.status == .failed || reader.status == .cancelled {
                    writerInput.markAsFinished()
                    finished()
                    return
                }
                while !writerInput.isReadyForMoreMediaData {
                    if reader.status == .failed || reader.status == .cancelled {
                        writerInput.markAsFinished()
                        finished()
                        return
                    }
                    readyWaits += 1
                    if readyWaits > maxReadyWaits {
                        reader.cancelReading()
                        writerInput.markAsFinished()
                        finished()
                        return
                    }
                    Thread.sleep(forTimeInterval: waitSleepSec)
                }
                readyWaits = 0
                while writerInput.isReadyForMoreMediaData {
                    guard let buffer = readerOutput.copyNextSampleBuffer() else {
                        writerInput.markAsFinished()
                        finished()
                        return
                    }
                    if !writerInput.append(buffer) {
                        reader.cancelReading()
                        writerInput.markAsFinished()
                        finished()
                        return
                    }
                }
            }
        }
    }

    func generateThumbnail(
        sourceUri: String,
        atMs: Double?,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let sourceUrl = try self.resolveSourceURL(sourceUri)
                guard FileManager.default.fileExists(atPath: sourceUrl.path) else {
                    throw DubHubVideoEditorError.sourceNotFound
                }
                let asset = AVURLAsset(url: sourceUrl)
                let generator = AVAssetImageGenerator(asset: asset)
                generator.appliesPreferredTrackTransform = true

                let targetMs = max(0, atMs ?? 120)
                let t = CMTime(seconds: targetMs / 1000.0, preferredTimescale: 600)
                let cg = try generator.copyCGImage(at: t, actualTime: nil)
                let image = UIImage(cgImage: cg)
                guard let jpegData = image.jpegData(compressionQuality: 0.86) else {
                    throw DubHubVideoEditorError.thumbnailFailed
                }
                let out = self.makeTempURL(ext: "jpg", prefix: "dubhub_thumb_")
                try jpegData.write(to: out, options: .atomic)
                completion(.success([
                    "thumbnailUri": out.absoluteString,
                    "width": Int(image.size.width),
                    "height": Int(image.size.height),
                ]))
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func resolveSourceURL(_ sourceUri: String) throws -> URL {
        guard let input = URL(string: sourceUri) else { throw DubHubVideoEditorError.invalidUri }
        if input.isFileURL {
            return input
        }

        if let scheme = input.scheme?.lowercased(), scheme == "http" || scheme == "https" || scheme == "capacitor" {
            let path = input.path
            if path.hasPrefix("/_capacitor_file_") {
                let fsPath = String(path.dropFirst("/_capacitor_file_".count))
                let decoded = fsPath.removingPercentEncoding ?? fsPath
                return URL(fileURLWithPath: decoded)
            }
        }

        throw DubHubVideoEditorError.unsupportedSource
    }

    private func makeTempURL(ext: String, prefix: String) -> URL {
        let name = "\(prefix)\(UUID().uuidString).\(ext)"
        return FileManager.default.temporaryDirectory.appendingPathComponent(name)
    }

    private func buildInfoPayload(asset: AVURLAsset, sourceUrl: URL) throws -> [String: Any] {
        let durationMs = Int((CMTimeGetSeconds(asset.duration) * 1000.0).rounded())
        let track = asset.tracks(withMediaType: .video).first
        let natural = track?.naturalSize ?? .zero
        let transform = track?.preferredTransform ?? .identity
        let transformed = natural.applying(transform)
        let width = Int(abs(transformed.width))
        let height = Int(abs(transformed.height))

        let fileSize: NSNumber? = try? sourceUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize as NSNumber?
        let mimeType: String? = {
            if #available(iOS 14.0, *) {
                let ext = sourceUrl.pathExtension
                if let utType = UTType(filenameExtension: ext), let preferred = utType.preferredMIMEType {
                    return preferred
                }
            }
            return nil
        }()

        return [
            "durationMs": max(0, durationMs),
            "width": max(0, width),
            "height": max(0, height),
            "fileSize": fileSize ?? NSNull(),
            "mimeType": mimeType ?? NSNull(),
        ]
    }
}

@objc(DubHubBridgeViewController)
class DubHubBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(DubHubVideoEditorPlugin())
        NSLog("[DubHub][NativeVideoEditor] plugin registered in DubHubBridgeViewController")
    }
}
