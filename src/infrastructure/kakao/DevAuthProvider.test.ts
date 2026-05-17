import { describe, it, expect } from 'vitest';
import { DevAuthProvider } from './DevAuthProvider.js';
import { AuthError } from './AuthProvider.js';

describe('DevAuthProvider', () => {
  it('dev-<id> token returns KakaoUserInfo with that id as kakaoId', async () => {
    const provider = new DevAuthProvider();
    const result = await provider.verifyAccessToken('dev-alice');
    expect(result.kakaoId).toBe('alice');
    expect(result.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('calling the same token twice returns same kakaoId (idempotent)', async () => {
    const provider = new DevAuthProvider();
    const r1 = await provider.verifyAccessToken('dev-bob');
    const r2 = await provider.verifyAccessToken('dev-bob');
    expect(r1.kakaoId).toBe('bob');
    expect(r2.kakaoId).toBe('bob');
  });

  it('empty token (no Authorization header) throws AuthError', async () => {
    const provider = new DevAuthProvider();
    await expect(provider.verifyAccessToken('')).rejects.toBeInstanceOf(AuthError);
  });

  it('raw token without Bearer prefix (no dev- prefix) throws AuthError', async () => {
    const provider = new DevAuthProvider();
    await expect(provider.verifyAccessToken('raw-token')).rejects.toBeInstanceOf(AuthError);
  });

  it('token with Bearer stripped but no dev- prefix throws AuthError', async () => {
    const provider = new DevAuthProvider();
    // extractToken strips "Bearer " → "not-a-dev-token"
    await expect(provider.verifyAccessToken('not-a-dev-token')).rejects.toBeInstanceOf(AuthError);
  });

  it('dev- prefix with empty id throws AuthError with INVALID_TOKEN code', async () => {
    const provider = new DevAuthProvider();
    // "Bearer dev-" → extractToken → "dev-" → id is ""
    const err = await provider.verifyAccessToken('dev-').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe('INVALID_TOKEN');
  });
});
