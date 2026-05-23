import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { LLMParseFreeTextAdapter } from './LLMParseFreeTextAdapter.js'

const server = setupServer()
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function mockAnthropicResponse(text: string) {
  server.use(
    http.post('https://api.anthropic.com/v1/messages', () =>
      HttpResponse.json({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 }
      })
    )
  )
}

describe('LLMParseFreeTextAdapter', () => {
  it('uses regex path for 3박4일 — LLM never called', async () => {
    // No msw handler set — if LLM is called, it will throw
    const adapter = new LLMParseFreeTextAdapter('test-key')
    const result = await adapter.parse('3박4일 제주 가요')
    expect(result.source).toBe('regex')
  })

  it('falls through to LLM for unrecognized input', async () => {
    mockAnthropicResponse('{"startDate":"2026-05-22","nights":2}')
    const adapter = new LLMParseFreeTextAdapter('test-key')
    const result = await adapter.parse('이번 주에 제주 갈 예정')
    expect(result.source).toBe('llm')
    expect(result.isInferred).toBe(false)
    expect(result.startDate.toISO()).toBe('2026-05-22')
    expect(result.endDate.toISO()).toBe('2026-05-24')
  })

  it('uses default when LLM returns invalid JSON', async () => {
    mockAnthropicResponse('I cannot determine the dates.')
    const adapter = new LLMParseFreeTextAdapter('test-key')
    const result = await adapter.parse('언젠가 가고 싶어')
    expect(result.source).toBe('default')
    expect(result.isInferred).toBe(true)
  })

  it('uses default when LLM API errors', async () => {
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ error: { message: 'server error' } }, { status: 500 })
      )
    )
    const adapter = new LLMParseFreeTextAdapter('test-key')
    const result = await adapter.parse('제주 가고 싶어요')
    expect(result.source).toBe('default')
    expect(result.isInferred).toBe(true)
  })

  it('default result is 1박2일 (endDate = startDate + 1)', async () => {
    mockAnthropicResponse('no json here')
    const adapter = new LLMParseFreeTextAdapter('test-key')
    const result = await adapter.parse('미정')
    expect(result.source).toBe('default')
    expect(result.endDate.toISO()).toBe(result.startDate.addDays(1).toISO())
  })
})
