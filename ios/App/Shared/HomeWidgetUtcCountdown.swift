import Foundation

/// Slice 4.1 widget countdown — mirrors shared/home-widget-countdown.ts.
/// Midnight: start of releaseCalendarDate in TimeZone.autoupdatingCurrent.
/// Exact: absolute releaseAt instant.
///
/// Sub-24h: floor hours; floor remaining minutes to nearest 5; omit minutes when 0.
/// Final hour: same 5-minute buckets, clamp minimum to 5 mins. Never "0 mins" / seconds.
/// Plural minute unit is "mins" except exactly "1 min".
///
/// File retained at HomeWidgetUtcCountdown.swift for Xcode project membership.
enum HomeWidgetCountdown {
    enum TimingMode: String {
        case midnight
        case exact
    }

    struct Result: Equatable {
        let label: String
        let isOutNow: Bool
        let boundary: Date
        let outNowUntil: Date
        let isRetentionExpired: Bool
        let nextLabelChange: Date?
    }

    /// Matches shared HOME_WIDGET_OUT_NOW_RETENTION_HOURS.
    static let outNowRetentionHours: TimeInterval = 24
    /// Matches shared HOME_WIDGET_TIMELINE_MAX_LABEL_ENTRIES (rolling final-24h subset).
    static let timelineMaxLabelEntries = 96

    private static let minute: TimeInterval = 60
    private static let hour: TimeInterval = 3_600
    private static var outNowRetention: TimeInterval { outNowRetentionHours * hour }

    static func parseYmd(_ value: String) -> DateComponents? {
        let parts = value.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]),
              let m = Int(parts[1]),
              let d = Int(parts[2]),
              m >= 1, m <= 12, d >= 1, d <= 31
        else {
            return nil
        }
        return DateComponents(year: y, month: m, day: d)
    }

    /// Start of civil YYYY-MM-DD in the given timezone (DST-safe Calendar).
    static func startOfCalendarDate(ymd: String, timeZone: TimeZone) -> Date? {
        guard let comps = parseYmd(ymd) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(from: DateComponents(
            calendar: calendar,
            timeZone: timeZone,
            year: comps.year,
            month: comps.month,
            day: comps.day,
            hour: 0,
            minute: 0,
            second: 0
        ))
    }

    static func resolveBoundary(
        mode: TimingMode,
        releaseCalendarDate: String?,
        releaseAt: Date?,
        timeZone: TimeZone
    ) -> Date? {
        switch mode {
        case .exact:
            return releaseAt
        case .midnight:
            guard let ymd = releaseCalendarDate else { return nil }
            return startOfCalendarDate(ymd: ymd, timeZone: timeZone)
        }
    }

    /// Round DOWN to nearest 5 minutes; clamp minimum pre-release to 5 mins.
    static func minuteUnitLabel(_ minutes: Int) -> String {
        minutes == 1 ? "1 min" : "\(minutes) mins"
    }

    static func finalHourLabel(remaining: TimeInterval) -> String {
        if remaining <= 0 { return "Out now" }
        let mins = remaining / minute
        if mins <= 5 { return minuteUnitLabel(5) }
        let bucket = Int(floor(mins / 5.0)) * 5
        return minuteUnitLabel(bucket)
    }

    /// Final-24h: hours = floor(totalMinutes/60); minutes = floor((%60)/5)*5; omit when 0.
    static func subDayLabel(remaining: TimeInterval) -> String {
        if remaining <= 0 { return "Out now" }
        let totalMinutes = Int(floor(remaining / minute))
        if totalMinutes < 60 {
            return finalHourLabel(remaining: remaining)
        }
        let hours = totalMinutes / 60
        let remMins = totalMinutes % 60
        let roundedMins = (remMins / 5) * 5
        let hourPart = hours == 1 ? "1 hour" : "\(hours) hours"
        if roundedMins == 0 { return hourPart }
        return "\(hourPart) \(minuteUnitLabel(roundedMins))"
    }

    /// Family presentation of a canonical countdown label.
    /// Compact (systemSmall): drop "mins" only when hours are already present.
    static func presentLabel(
        _ label: String,
        compactMinutesWithHours: Bool
    ) -> String {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard compactMinutesWithHours else { return trimmed }
        // "7 hours 55 mins" / "1 hour 5 mins" → drop trailing unit only.
        guard let regex = try? NSRegularExpression(
            pattern: #"^(\d+ hours?) (\d+) mins$"#,
            options: [.caseInsensitive]
        ) else {
            return trimmed
        }
        let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
        guard let match = regex.firstMatch(in: trimmed, options: [], range: range),
              match.numberOfRanges == 3,
              let hoursRange = Range(match.range(at: 1), in: trimmed),
              let minsRange = Range(match.range(at: 2), in: trimmed)
        else {
            return trimmed
        }
        return "\(trimmed[hoursRange]) \(trimmed[minsRange])"
    }

    private static func nextSubDayLabelChange(
        remaining: TimeInterval,
        boundary: Date,
        now: Date
    ) -> Date {
        let totalMinutes = Int(floor(remaining / minute))
        let floorNext = now.addingTimeInterval(minute)
        if totalMinutes < 60 {
            let mins = remaining / minute
            if mins <= 5 { return boundary }
            let bucket = Double(Int(floor(mins / 5.0)) * 5)
            let candidate = boundary.addingTimeInterval(-bucket * minute)
            return max(candidate, floorNext)
        }
        let hours = totalMinutes / 60
        let remMins = totalMinutes % 60
        let roundedMins = (remMins / 5) * 5
        let nextTotalMinutes = roundedMins == 0 ? hours * 60 - 1 : hours * 60 + roundedMins - 1
        let candidate = boundary.addingTimeInterval(-Double(nextTotalMinutes) * minute)
        return max(candidate, floorNext)
    }

    private static func wholeLocalDayDifference(
        from now: Date,
        toBoundaryYmd: String,
        timeZone: TimeZone
    ) -> Int? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let nowStart = calendar.startOfDay(for: now)
        guard let boundaryStart = startOfCalendarDate(ymd: toBoundaryYmd, timeZone: timeZone) else {
            return nil
        }
        return calendar.dateComponents([.day], from: nowStart, to: boundaryStart).day
    }

    static func ymd(for date: Date, timeZone: TimeZone) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        let y = c.year ?? 0
        let m = c.month ?? 0
        let d = c.day ?? 0
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    static func countdown(
        mode: TimingMode,
        releaseCalendarDate: String?,
        releaseAt: Date?,
        now: Date = Date(),
        timeZone: TimeZone = .autoupdatingCurrent
    ) -> Result? {
        guard let boundary = resolveBoundary(
            mode: mode,
            releaseCalendarDate: releaseCalendarDate,
            releaseAt: releaseAt,
            timeZone: timeZone
        ) else {
            return nil
        }

        let remaining = boundary.timeIntervalSince(now)
        let outNowUntil = boundary.addingTimeInterval(outNowRetention)
        if remaining <= 0 {
            let expired = now >= outNowUntil
            return Result(
                label: "Out now",
                isOutNow: !expired,
                boundary: boundary,
                outNowUntil: outNowUntil,
                isRetentionExpired: expired,
                nextLabelChange: expired ? nil : outNowUntil
            )
        }

        if remaining < 24 * hour {
            return Result(
                label: subDayLabel(remaining: remaining),
                isOutNow: false,
                boundary: boundary,
                outNowUntil: outNowUntil,
                isRetentionExpired: false,
                nextLabelChange: nextSubDayLabelChange(remaining: remaining, boundary: boundary, now: now)
            )
        }

        let boundaryYmd: String
        if mode == .midnight {
            guard let ymd = releaseCalendarDate?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !ymd.isEmpty
            else {
                return nil
            }
            boundaryYmd = ymd
        } else {
            boundaryYmd = ymd(for: boundary, timeZone: timeZone)
        }

        guard let dayDiff = wholeLocalDayDifference(
            from: now,
            toBoundaryYmd: boundaryYmd,
            timeZone: timeZone
        ) else {
            return nil
        }

        if dayDiff <= 0 {
            return Result(
                label: subDayLabel(remaining: remaining),
                isOutNow: false,
                boundary: boundary,
                outNowUntil: outNowUntil,
                isRetentionExpired: false,
                nextLabelChange: nextSubDayLabelChange(remaining: remaining, boundary: boundary, now: now)
            )
        }

        if dayDiff == 1 {
            let hoursStart = boundary.addingTimeInterval(-24 * hour)
            return Result(
                label: "Tomorrow",
                isOutNow: false,
                boundary: boundary,
                outNowUntil: outNowUntil,
                isRetentionExpired: false,
                nextLabelChange: max(hoursStart, now.addingTimeInterval(minute))
            )
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let nextMidnight = calendar.date(
            byAdding: .day,
            value: 1,
            to: calendar.startOfDay(for: now)
        )
        let hoursStart = boundary.addingTimeInterval(-24 * hour)
        var next = nextMidnight
        if hoursStart > now {
            if let n = next {
                next = min(n, hoursStart)
            } else {
                next = hoursStart
            }
        }

        return Result(
            label: "\(dayDiff) days",
            isOutNow: false,
            boundary: boundary,
            outNowUntil: outNowUntil,
            isRetentionExpired: false,
            nextLabelChange: next.map { max($0, now.addingTimeInterval(minute)) }
        )
    }

    struct TimelineDates {
        let dates: [Date]
        /// True when the rolling cap stopped before Out now / expiresAt.
        let truncated: Bool
    }

    /// Timeline change points until expiresAt (exclusive of expiry refresh entry).
    /// Caps at `timelineMaxLabelEntries` label transitions; caller should reload via `.after`.
    /// Also schedules Out-now retention end and optional announcement freshness expiry.
    static func timelineChangeDates(
        mode: TimingMode,
        releaseCalendarDate: String?,
        releaseAt: Date?,
        now: Date,
        expiresAt: Date,
        timeZone: TimeZone = .autoupdatingCurrent,
        announcementExpiresAt: Date? = nil
    ) -> TimelineDates {
        var dates: [Date] = [now]
        var cursor = now
        var guardCount = 0
        var truncated = false
        let maxEntries = timelineMaxLabelEntries

        while guardCount < maxEntries {
            guard let result = countdown(
                mode: mode,
                releaseCalendarDate: releaseCalendarDate,
                releaseAt: releaseAt,
                now: cursor,
                timeZone: timeZone
            ) else {
                break
            }
            if result.isRetentionExpired {
                break
            }
            if result.isOutNow {
                if result.boundary > now && result.boundary < expiresAt {
                    dates.append(result.boundary)
                }
                if result.outNowUntil > now && result.outNowUntil < expiresAt {
                    dates.append(result.outNowUntil)
                }
                break
            }
            guard let next = result.nextLabelChange, next > cursor else { break }
            if next >= expiresAt { break }
            dates.append(next)
            cursor = next
            guardCount += 1
            if guardCount >= maxEntries {
                // More buckets may remain before boundary — request a policy reload.
                if let more = countdown(
                    mode: mode,
                    releaseCalendarDate: releaseCalendarDate,
                    releaseAt: releaseAt,
                    now: cursor,
                    timeZone: timeZone
                ), !more.isOutNow, !more.isRetentionExpired,
                   let further = more.nextLabelChange, further < expiresAt {
                    truncated = true
                }
            }
        }

        if let announceEnd = announcementExpiresAt,
           announceEnd > now,
           announceEnd < expiresAt {
            dates.append(announceEnd)
        }

        var seen = Set<TimeInterval>()
        let unique = dates.filter { date in
            let key = (date.timeIntervalSinceReferenceDate * 10).rounded() / 10
            if seen.contains(key) { return false }
            seen.insert(key)
            return true
        }.sorted()
        return TimelineDates(dates: unique, truncated: truncated)
    }

    /// Legacy UTC calendar-day countdown for payloads missing Slice 4 timing fields.
    static func legacyUtcCountdownLabel(releaseDate: Date, now: Date = Date()) -> (label: String, isOutNow: Bool)? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let releaseDay = calendar.startOfDay(for: releaseDate)
        let currentDay = calendar.startOfDay(for: now)
        guard let days = calendar.dateComponents([.day], from: currentDay, to: releaseDay).day else {
            return nil
        }
        if days <= 0 { return ("Out now", true) }
        if days == 1 { return ("Tomorrow", false) }
        return ("\(days) days", false)
    }
}
