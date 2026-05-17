import Anthropic from '@anthropic-ai/sdk'
import { parseWithRegex } from './regexParser.js'
import type { ParseFreeTextPort, ParsedDateRange } from './ParseFreeTextPort.js'
import { CalendarDate } from '../../domain/shared/CalendarDate.js'

export class LLMParseFreeTextAdapter implements ParseFreeTextPort {
  private readonly client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? ''
    })
  }

  async parse(text: string): Promise<ParsedDateRange> {
    const today = CalendarDate.today()

    // 1. Try regex (fast path)
    const regexResult = parseWithRegex(text, today)
    if (regexResult !== null) return regexResult

    // 2. Try LLM
    try {
      const llmResult = await this.callLLM(text, today)
      if (llmResult !== null) return llmResult
    } catch {
      // fall through to default
    }

    // 3. D2 default: next Friday, 1박2일
    return this.buildDefault(today)
  }

  private async callLLM(text: string, today: CalendarDate): Promise<ParsedDateRange | null> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Extract travel dates from Korean text. Today is ${today.toISO()} (KST).
Respond ONLY with JSON: {"startDate":"YYYY-MM-DD","nights":N}
If unclear, use next Friday as startDate with 2 nights.
Text: ${text}`
      }]
    })

    const content = response.content[0]
    if (content?.type !== 'text') return null

    const match = content.text.match(/\{[^}]+\}/)
    if (!match) return null

    const jsonStr = match[0]
    if (jsonStr === undefined) return null

    const parsed = JSON.parse(jsonStr) as { startDate?: string; nights?: number }
    if (typeof parsed.startDate !== 'string' || typeof parsed.nights !== 'number') return null

    const startDate = CalendarDate.fromISO(parsed.startDate)
    const endDate = startDate.addDays(parsed.nights)
    return { startDate, endDate, isInferred: false, source: 'llm' }
  }

  private buildDefault(referenceDate: CalendarDate): ParsedDateRange {
    // Next Friday, 1박2일
    const startDate = nextFriday(referenceDate)
    const endDate = startDate.addDays(1)
    return { startDate, endDate, isInferred: true, source: 'default' }
  }
}

function nextFriday(from: CalendarDate): CalendarDate {
  const iso = from.toISO()
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() // 0=Sun, 5=Fri, 6=Sat
  const daysUntilFriday = dow <= 5 ? 5 - dow : 6  // Sat(6) → 6 days until next Fri
  return from.addDays(daysUntilFriday === 0 ? 7 : daysUntilFriday)
}
