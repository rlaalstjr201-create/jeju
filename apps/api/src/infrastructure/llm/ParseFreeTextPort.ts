import type { CalendarDate } from '../../domain/shared/CalendarDate.js'

export interface ParsedDateRange {
  readonly startDate: CalendarDate
  readonly endDate: CalendarDate
  readonly isInferred: boolean   // true if D2 default was used (B5 — UI shows banner)
  readonly source: 'regex' | 'llm' | 'default'
}

export interface ParseFreeTextPort {
  parse(text: string): Promise<ParsedDateRange>
}
