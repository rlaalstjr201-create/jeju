import { describe, it, expect, vi } from 'vitest'
import { TravellerAuthService } from './TravellerAuthService.js'
import { AuthError, type KakaoUserInfo } from './AuthProvider.js'
import type { AuthProvider } from './AuthProvider.js'
import type { TravellerRepository } from '../../domain/ports/TravellerRepository.js'
import type { Traveller } from '../../domain/traveller/Traveller.js'
import { CalendarDate } from '../../domain/shared/CalendarDate.js'

// ---------------------------------------------------------------------------
// In-memory TravellerRepository mock
// ---------------------------------------------------------------------------

function makeInMemoryRepo(initial: Traveller[] = []): TravellerRepository {
  const store = new Map<string, Traveller>(initial.map(t => [t.id, t]))

  return {
    async findById(id: string): Promise<Traveller | undefined> {
      return store.get(id)
    },
    async findByKakaoId(kakaoId: string): Promise<Traveller | undefined> {
      for (const t of store.values()) {
        if (t.kakaoId === kakaoId) return t
      }
      return undefined
    },
    async save(traveller: Traveller): Promise<void> {
      store.set(traveller.id, traveller)
    },
  }
}

// ---------------------------------------------------------------------------
// AuthProvider mock factory
// ---------------------------------------------------------------------------

function makeAuthProvider(result: KakaoUserInfo | AuthError): AuthProvider {
  return {
    verifyAccessToken: vi.fn(async () => {
      if (result instanceof AuthError) throw result
      return result
    }),
    exchangeCode: vi.fn(async () => {
      throw new Error('not implemented in this test')
    }),
    refreshAccessToken: vi.fn(async () => {
      throw new Error('not implemented in this test')
    }),
  }
}

const KAKAO_INFO: KakaoUserInfo = {
  kakaoId: '999111222',
  connectedAt: '2025-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TravellerAuthService.authenticate', () => {
  it('token valid, Traveller exists → returns existing Traveller (no new create)', async () => {
    const existing: Traveller = {
      id: 'existing-uuid',
      kakaoId: KAKAO_INFO.kakaoId,
      createdAt: CalendarDate.fromISO('2025-01-01'),
    }
    const repo = makeInMemoryRepo([existing])
    const saveSpy = vi.spyOn(repo, 'save')

    const service = new TravellerAuthService(makeAuthProvider(KAKAO_INFO), repo)
    const result = await service.authenticate('valid_token')

    expect(result).toStrictEqual(existing)
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('token valid, Traveller not found → creates and returns new Traveller', async () => {
    const repo = makeInMemoryRepo([])
    const saveSpy = vi.spyOn(repo, 'save')

    const service = new TravellerAuthService(makeAuthProvider(KAKAO_INFO), repo)
    const result = await service.authenticate('valid_token')

    // Should have a generated UUID-format id
    expect(result.kakaoId).toBe(KAKAO_INFO.kakaoId)
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
    // createdAt should be a CalendarDate
    expect(result.createdAt).toBeInstanceOf(CalendarDate)
    // Repository.save should have been called once with the new traveller
    expect(saveSpy).toHaveBeenCalledOnce()
    expect(saveSpy).toHaveBeenCalledWith(result)

    // The new traveller should be findable in the repo
    const stored = await repo.findByKakaoId(KAKAO_INFO.kakaoId)
    expect(stored).toStrictEqual(result)
  })

  it('token invalid → propagates AuthError', async () => {
    const authError = new AuthError('Expired token', 'EXPIRED_TOKEN')
    const repo = makeInMemoryRepo([])

    const service = new TravellerAuthService(makeAuthProvider(authError), repo)
    await expect(service.authenticate('bad_token')).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthError && e.code === 'EXPIRED_TOKEN',
    )
  })
})
