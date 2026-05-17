import { CalendarDate } from '../../domain/shared/CalendarDate.js'
import type { ParsedDateRange } from './ParseFreeTextPort.js'

// Returns the next Friday strictly after `from` (if `from` IS Friday, returns the following Friday).
function nextFridayFrom(from: CalendarDate): CalendarDate {
  const parts = from.toISO().split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() // 0=Sun, 5=Fri, 6=Sat
  // If today IS Friday (5), next occurrence is 7 days away.
  // Otherwise: days until next Friday
  const daysUntil = dow < 5 ? 5 - dow : (dow === 5 ? 7 : 6)
  return from.addDays(daysUntil)
}

// Returns the Friday of the current JS week (Sun-Sat).
// If that Friday is today or in the future, return it; otherwise advance 7 days.
function currentWeekFriday(from: CalendarDate): CalendarDate {
  const parts = from.toISO().split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() // 0=Sun … 6=Sat
  // JS week: Sun(0) Mon(1) Tue(2) Wed(3) Thu(4) Fri(5) Sat(6)
  let offset: number
  if (dow === 6) {
    // Saturday: this week's Friday was yesterday
    offset = -1
  } else {
    // Sunday through Friday: offset = 5 - dow (0 when already Friday)
    offset = 5 - dow
  }
  // If past Friday, bump to next week
  if (offset < 0) {
    offset += 7
  }
  return from.addDays(offset)
}

export function parseWithRegex(
  text: string,
  referenceDate: CalendarDate
): ParsedDateRange | null {
  // Pattern 1: N박M일
  const nightsDaysMatch = text.match(/(\d+)박(\d+)일/)
  if (nightsDaysMatch !== null) {
    const daysStr = nightsDaysMatch[2]
    if (daysStr === undefined) return null
    const days = Number(daysStr)
    const startDate = nextFridayFrom(referenceDate)
    const endDate = startDate.addDays(days - 1)
    return { startDate, endDate, isInferred: false, source: 'regex' }
  }

  // Pattern 2: N박 (no 일)
  const nightsOnlyMatch = text.match(/(\d+)박(?![일\d])/)
  if (nightsOnlyMatch !== null) {
    const nightsStr = nightsOnlyMatch[1]
    if (nightsStr === undefined) return null
    const nights = Number(nightsStr)
    const days = nights + 1
    const startDate = nextFridayFrom(referenceDate)
    const endDate = startDate.addDays(days - 1)
    return { startDate, endDate, isInferred: false, source: 'regex' }
  }

  // Pattern 3: N일 (no 박) — lookbehind to avoid matching N일 in N박M일
  const daysOnlyMatch = text.match(/(?<!박)(\d+)일/)
  if (daysOnlyMatch !== null) {
    const daysStr = daysOnlyMatch[1]
    if (daysStr === undefined) return null
    const days = Number(daysStr)
    const startDate = nextFridayFrom(referenceDate)
    const endDate = startDate.addDays(days - 1)
    return { startDate, endDate, isInferred: false, source: 'regex' }
  }

  // Pattern 4: 이번 주말 — current week Fri-Sun
  if (/이번\s*주말/.test(text)) {
    const friday = currentWeekFriday(referenceDate)
    const sunday = friday.addDays(2)
    return { startDate: friday, endDate: sunday, isInferred: false, source: 'regex' }
  }

  // Pattern 5: 다음 주말 — the very next upcoming Friday-Sunday
  // (from Sunday, the "next weekend" is this coming Friday)
  if (/다음\s*주말/.test(text)) {
    const friday = nextFridayFrom(referenceDate)
    const sunday = friday.addDays(2)
    return { startDate: friday, endDate: sunday, isInferred: false, source: 'regex' }
  }

  // Pattern 6: 오늘 or 당일치기
  if (/오늘|당일치기/.test(text)) {
    return { startDate: referenceDate, endDate: referenceDate, isInferred: false, source: 'regex' }
  }

  return null
}
