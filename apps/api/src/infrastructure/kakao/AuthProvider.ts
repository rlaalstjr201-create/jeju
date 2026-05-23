// Port interface for authentication — Kakao-agnostic at use-case level
export interface KakaoUserInfo {
  readonly kakaoId: string        // Kakao numeric user ID as string
  readonly connectedAt: string    // ISO timestamp from Kakao
}

export interface AuthProvider {
  // Verify a Kakao access token and return user info.
  // Throws AuthError on invalid/expired token.
  verifyAccessToken(accessToken: string): Promise<KakaoUserInfo>

  // Exchange a Kakao authorization code for access + refresh tokens.
  exchangeCode(code: string, redirectUri: string): Promise<TokenPair>

  // Refresh an access token using a refresh token.
  // Throws AuthError if refresh token is expired or invalid.
  refreshAccessToken(refreshToken: string): Promise<TokenPair>
}

export interface TokenPair {
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessTokenExpiresIn: number   // seconds
  readonly refreshTokenExpiresIn: number  // seconds
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'NETWORK_ERROR' | 'UNKNOWN'
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
