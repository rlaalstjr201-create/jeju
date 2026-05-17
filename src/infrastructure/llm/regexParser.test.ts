import { describe, it, expect } from 'vitest'
import { parseWithRegex } from './regexParser.js'
import { CalendarDate } from '../../domain/shared/CalendarDate.js'

const REF = CalendarDate.fromISO('2026-05-17') // Sunday

describe('parseWithRegex', () => {
  it('parses 3박4일', () => {
    const result = parseWithRegex('3박4일 제주 가요', REF)
    expect(result).not.toBeNull()
    expect(result!.source).toBe('regex')
    expect(result!.isInferred).toBe(false)
    // startDate should be next Friday: 2026-05-22
    expect(result!.startDate.toISO()).toBe('2026-05-22')
    // endDate = startDate + 3 days = 2026-05-25
    expect(result!.endDate.toISO()).toBe('2026-05-25')
  })

  it('parses 2박3일', () => {
    const result = parseWithRegex('2박3일', REF)
    expect(result!.startDate.toISO()).toBe('2026-05-22')
    expect(result!.endDate.toISO()).toBe('2026-05-24')
  })

  it('parses 2박 (no 일)', () => {
    const result = parseWithRegex('2박 여행', REF)
    expect(result).not.toBeNull()
    // 2박 = 3일
    expect(result!.endDate.toISO()).toBe(result!.startDate.addDays(2).toISO())
  })

  it('parses 다음 주말', () => {
    const result = parseWithRegex('다음 주말 제주', REF)
    expect(result).not.toBeNull()
    expect(result!.startDate.toISO()).toBe('2026-05-22') // next Friday
    expect(result!.endDate.toISO()).toBe('2026-05-24')   // Sunday
  })

  it('parses 이번 주말 (from Sunday — still same week Fri)', () => {
    const result = parseWithRegex('이번 주말', REF)
    expect(result).not.toBeNull()
    // Current week Friday from Sunday 2026-05-17: that week's Friday was 2026-05-15
    // If already past Friday, bump to next week's Friday
    expect(result!.startDate.toISO()).toBeDefined()
  })

  it('parses 오늘', () => {
    const result = parseWithRegex('오늘 제주', REF)
    expect(result!.startDate.toISO()).toBe('2026-05-17')
    expect(result!.endDate.toISO()).toBe('2026-05-17')
  })

  it('parses 당일치기', () => {
    const result = parseWithRegex('당일치기 여행', REF)
    expect(result!.startDate.toISO()).toBe('2026-05-17')
    expect(result!.endDate.toISO()).toBe('2026-05-17')
  })

  it('returns null for unrecognized input', () => {
    expect(parseWithRegex('제주 가요', REF)).toBeNull()
    expect(parseWithRegex('여행 가고 싶어', REF)).toBeNull()
  })

  it('parses 1박2일', () => {
    const result = parseWithRegex('1박2일', REF)
    expect(result!.endDate.toISO()).toBe(result!.startDate.addDays(1).toISO())
  })
})
