import AppIntents
import Foundation
import WidgetKit

/// iOS 17+ interactive paging for listener multi-release Countdown.
/// Does not open the main app.
@available(iOS 17.0, *)
struct ReleaseCountdownPreviousIntent: AppIntent {
    static var title: LocalizedStringResource = "Previous release"
    static var description = IntentDescription("Show the previous Saved release in Release Countdown.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        ReleaseCountdownPaging.apply(direction: .previous)
        return .result()
    }
}

@available(iOS 17.0, *)
struct ReleaseCountdownNextIntent: AppIntent {
    static var title: LocalizedStringResource = "Next release"
    static var description = IntentDescription("Show the next Saved release in Release Countdown.")
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        ReleaseCountdownPaging.apply(direction: .next)
        return .result()
    }
}

enum ReleaseCountdownPaging {
    static func apply(direction: HomeWidgetPaging.Direction) {
        let load = HomeWidgetPayloadLoader.loadFromAppGroup()
        guard case .release(let envelope) = load else { return }
        // Artist mode stays single/automatic — ignore paging.
        guard envelope.dto.mode == "listener" else { return }

        let collection = HomeWidgetPayloadLoader.listenerCollection(in: envelope)
        guard collection.count > 1 else { return }

        let current =
            HomeWidgetAppGroup.readActiveReleaseId()
            ?? envelope.dto.activeReleaseId
            ?? envelope.dto.release?.id
        let ids = collection.map(\.id)
        guard let nextId = HomeWidgetPaging.page(
            releaseIds: ids,
            activeReleaseId: current,
            direction: direction
        ) else {
            return
        }
        HomeWidgetAppGroup.writeActiveReleaseId(nextId)
        WidgetCenter.shared.reloadTimelines(ofKind: HomeWidgetAppGroup.widgetKind)
    }
}
