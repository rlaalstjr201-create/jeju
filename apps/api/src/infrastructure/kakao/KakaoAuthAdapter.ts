import axios, { type AxiosInstance, isAxiosError } from 'axios'
import {
  type AuthProvider,
  type KakaoUserInfo,
  type TokenPair,
  AuthError,
} from './AuthProvider.js'

const KAUTH_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
const KAPI_USER_ME_URL = 'https://kapi.kakao.com/v2/user/me'

interface KakaoTokenResponse {
  access_token: string
  refresh_token?: string   // may be absent in refresh-token response
  expires_in: number
  refresh_token_expires_in: number
}

interface KakaoUserMeResponse {
  id: number
  connected_at: string
}

interface KakaoErrorResponse {
  error: string
  error_description: string
  error_code?: string
}

export class KakaoAuthAdapter implements AuthProvider {
  private readonly http: AxiosInstance

  constructor(
    private readonly config: {
      clientId: string        // KAKAO_REST_API_KEY
      clientSecret: string    // KAKAO_CLIENT_SECRET
    },
    httpClient?: AxiosInstance,
  ) {
    this.http = httpClient ?? axios.create()
  }

  async verifyAccessToken(accessToken: string): Promise<KakaoUserInfo> {
    try {
      const response = await this.http.get<KakaoUserMeResponse>(KAPI_USER_ME_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = response.data
      return {
        kakaoId: String(data.id),
        connectedAt: data.connected_at,
      }
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response == null) {
          throw new AuthError(err.message, 'NETWORK_ERROR')
        }
        const status = err.response.status
        const body = err.response.data as KakaoErrorResponse | undefined
        if (status === 401) {
          throw new AuthError('Expired token', 'EXPIRED_TOKEN')
        }
        const msg = body?.error_description ?? body?.error ?? `Kakao error ${status}`
        throw new AuthError(msg, 'INVALID_TOKEN')
      }
      if (err instanceof AuthError) throw err
      throw new AuthError(String(err), 'UNKNOWN')
    }
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenPair> {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: redirectUri,
      })
      const response = await this.http.post<KakaoTokenResponse>(
        KAUTH_TOKEN_URL,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      return toTokenPair(response.data)
    } catch (err) {
      throw wrapKakaoError(err)
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      })
      const response = await this.http.post<KakaoTokenResponse>(
        KAUTH_TOKEN_URL,
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      )
      // Kakao may omit refresh_token in refresh response — reuse old one if absent
      return toTokenPair(response.data, refreshToken)
    } catch (err) {
      throw wrapKakaoError(err)
    }
  }
}

function toTokenPair(data: KakaoTokenResponse, fallbackRefreshToken?: string): TokenPair {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? fallbackRefreshToken ?? '',
    accessTokenExpiresIn: data.expires_in,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  }
}

function wrapKakaoError(err: unknown): AuthError {
  if (err instanceof AuthError) return err
  if (isAxiosError(err)) {
    if (err.response == null) {
      return new AuthError(err.message, 'NETWORK_ERROR')
    }
    const status = err.response.status
    const body = err.response.data as KakaoErrorResponse | undefined
    const msg = body?.error_description ?? body?.error ?? `Kakao error ${status}`
    if (status === 401) return new AuthError(msg, 'EXPIRED_TOKEN')
    return new AuthError(msg, 'INVALID_TOKEN')
  }
  return new AuthError(String(err), 'UNKNOWN')
}
