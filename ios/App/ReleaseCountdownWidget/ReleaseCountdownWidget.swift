import WidgetKit
import SwiftUI

struct ReleaseCountdownWidget: Widget {
    let kind: String = HomeWidgetAppGroup.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ReleaseCountdownProvider()) { entry in
            ReleaseCountdownEntryView(entry: entry)
        }
        .configurationDisplayName("Release Countdown")
        .description("Count down to a saved Dub Hub release on your Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
