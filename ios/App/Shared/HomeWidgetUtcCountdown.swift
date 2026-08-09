import Foundation

/// Native UTC calendar-day countdown mirroring server/home-widget-domain.ts.
/// Do not use device-local calendar days or Europe/London release-day rules.
enum HomeWidgetUtcCountdown {
    /// Whole UTC calendar days from `now` until `releaseDate` (release − now).
    /// Negative or zero → Out now.
    static func wholeUtcCalendarDayDifference(releaseDate: Date, now: Date) -> Int? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let releaseDay = calendar.startOfDay(for: releaseDate)
        let currentDay = calendar.startOfDay(for: now)
        let comps = calendar.dateComponents([.day], from: currentDay, to: releaseDay)
        return comps.day
    }

    static func countdownLabel(releaseDate: Date, now: Date = Date()) -> (label: String, isOutNow: Bool)? {
        guard let days = wholeUtcCalendarDayDifference(releaseDate: releaseDate, now: now) else {
            return nil
        }
        if days <= 0 {
            return ("Out now", true)
        }
        if days == 1 {
            return ("Tomorrow", false)
        }
        return ("\(days) days", false)
    }

    /// Next UTC midnight strictly after `now`.
    static func nextUtcMidnight(after now: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let start = calendar.startOfDay(for: now)
        return calendar.date(byAdding: .day, value: 1, to: start) ?? now.addingTimeInterval(86_400)
    }
}
