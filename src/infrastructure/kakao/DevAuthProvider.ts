import { AuthError, type AuthProvider, type KakaoUserInfo, type TokenPair } from './AuthProvider.js';

export class DevAuthProvider implements AuthProvider {
  async verifyAccessToken(accessToken: string): Promise<KakaoUserInfo> {
    if (!accessToken.startsWith('dev-')) {
      throw new AuthError('Unauthorized', 'INVALID_TOKEN');
    }
    const id = accessToken.slice(4);
    if (!id) {
      throw new AuthError('dev- token requires a non-empty id', 'INVALID_TOKEN');
    }
    return { kakaoId: id, connectedAt: new Date().toISOString() };
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<TokenPair> {
    return { accessToken: '', refreshToken: '', accessTokenExpiresIn: 0, refreshTokenExpiresIn: 0 };
  }

  async refreshAccessToken(_refreshToken: string): Promise<TokenPair> {
    return { accessToken: '', refreshToken: '', accessTokenExpiresIn: 0, refreshTokenExpiresIn: 0 };
  }
}
