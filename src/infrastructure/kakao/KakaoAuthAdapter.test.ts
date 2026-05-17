import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import axios from 'axios'
import { KakaoAuthAdapter } from './KakaoAuthAdapter.js'
import { AuthError } from './AuthProvider.js'

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const USER_ME_URL = 'https://kapi.kakao.com/v2/user/me'
const TOKEN_URL = 'https://kauth.kakao.com/oauth/token'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(): KakaoAuthAdapter {
  return new KakaoAuthAdapter(
    { clientId: 'test_client_id', clientSecret: 'test_client_secret' },
    axios.create(),
  )
}

const VALID_USER_RESPONSE = {
  id: 123456789,
  connected_at: '2024-01-15T10:00:00Z',
}

const VALID_TOKEN_RESPONSE = {
  access_token: 'new_access_token',
  refresh_token: 'new_refresh_token',
  expires_in: 21599,
  refresh_token_expires_in: 5183999,
}

// ---------------------------------------------------------------------------
// verifyAccessToken
// ---------------------------------------------------------------------------

describe('KakaoAuthAdapter.verifyAccessToken', () => {
  it('valid token → returns correct KakaoUserInfo', async () => {
    server.use(
      http.get(USER_ME_URL, () => HttpResponse.json(VALID_USER_RESPONSE)),
    )

    const adapter = makeAdapter()
    const info = await adapter.verifyAccessToken('valid_token')

    expect(info.kakaoId).toBe('123456789')
    expect(info.connectedAt).toBe('2024-01-15T10:00:00Z')
  })

  it('401 response → throws AuthError with EXPIRED_TOKEN', async () => {
    server.use(
      http.get(USER_ME_URL, () =>
        HttpResponse.json(
          { error: 'KOE401', error_description: 'Expired token' },
          { status: 401 },
        ),
      ),
    )

    const adapter = makeAdapter()
    await expect(adapter.verifyAccessToken('expired_token')).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthError && e.code === 'EXPIRED_TOKEN',
    )
  })

  it('400 response → throws AuthError with INVALID_TOKEN', async () => {
    server.use(
      http.get(USER_ME_URL, () =>
        HttpResponse.json(
          { error: 'KOE400', error_description: 'Invalid token' },
          { status: 400 },
        ),
      ),
    )

    const adapter = makeAdapter()
    await expect(adapter.verifyAccessToken('bad_token')).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthError && e.code === 'INVALID_TOKEN',
    )
  })

  it('network error → throws AuthError with NETWORK_ERROR', async () => {
    server.use(
      http.get(USER_ME_URL, () => HttpResponse.error()),
    )

    const adapter = makeAdapter()
    await expect(adapter.verifyAccessToken('any_token')).rejects.toSatisfy(
      (e: unknown) => e instanceof AuthError && e.code === 'NETWORK_ERROR',
    )
  })
})

// ---------------------------------------------------------------------------
// exchangeCode
// ---------------------------------------------------------------------------

describe('KakaoAuthAdapter.exchangeCode', () => {
  it('valid code → returns TokenPair with all 4 fields', async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json(VALID_TOKEN_RESPONSE)),
    )

    const adapter = makeAdapter()
    const pair = await adapter.exchangeCode('auth_code', 'https://example.com/callback')

    expect(pair.accessToken).toBe('new_access_token')
    expect(pair.refreshToken).toBe('new_refresh_token')
    expect(pair.accessTokenExpiresIn).toBe(21599)
    expect(pair.refreshTokenExpiresIn).toBe(5183999)
  })

  it('Kakao error response → throws AuthError', async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Authorization code not found' },
          { status: 400 },
        ),
      ),
    )

    const adapter = makeAdapter()
    await expect(
      adapter.exchangeCode('bad_code', 'https://example.com/callback'),
    ).rejects.toBeInstanceOf(AuthError)
  })
})

// ---------------------------------------------------------------------------
// refreshAccessToken
// ---------------------------------------------------------------------------

describe('KakaoAuthAdapter.refreshAccessToken', () => {
  it('valid refresh token → returns new TokenPair', async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json(VALID_TOKEN_RESPONSE)),
    )

    const adapter = makeAdapter()
    const pair = await adapter.refreshAccessToken('valid_refresh_token')

    expect(pair.accessToken).toBe('new_access_token')
    expect(pair.refreshToken).toBe('new_refresh_token')
    expect(pair.accessTokenExpiresIn).toBe(21599)
    expect(pair.refreshTokenExpiresIn).toBe(5183999)
  })

  it('expired refresh token (Kakao error) → throws AuthError', async () => {
    server.use(
      http.post(TOKEN_URL, () =>
        HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Refresh token expired' },
          { status: 400 },
        ),
      ),
    )

    const adapter = makeAdapter()
    await expect(
      adapter.refreshAccessToken('expired_refresh_token'),
    ).rejects.toBeInstanceOf(AuthError)
  })
})
