# ADR-0016: DevAuthProvider for Development-Mode Authentication Bypass

**Status:** Accepted  
**Date:** 2026-05-18

## Context

`KakaoAuthAdapter.verifyAccessToken()` makes a live HTTP call to `https://kapi.kakao.com/v2/user/me`. In development (Option A) and local smoke testing, a real Kakao access token is unavailable. This prevented starting an HTTP server for manual verification — every request returned 401 even with `KAKAO_REST_API_KEY=mock`, because that env var controls the OAuth token exchange flow, not the token verification call.

The `TravellerAuthService` wraps any `AuthProvider`; it does not know or care about Kakao. The composition root selects the concrete adapter. This is the natural seam for a dev-only alternative.

## Decision

Introduce `src/infrastructure/kakao/DevAuthProvider.ts` that implements `AuthProvider`:

- `verifyAccessToken(token)`:  
  - Token must equal `dev-<non-empty-id>`.  
  - Returns `{ kakaoId: id, connectedAt: <now ISO> }`.  
  - Throws `AuthError('Unauthorized', 'INVALID_TOKEN')` for empty token, missing `dev-` prefix, or `Bearer dev-` with empty id.
- `exchangeCode` and `refreshAccessToken` return stub empty `TokenPair` (dev-mode does not need OAuth code exchange).

The composition root (`src/index.ts`) branches on `NODE_ENV`:

```
NODE_ENV === 'development'  →  DevAuthProvider
otherwise                   →  KakaoAuthAdapter
```

`package.json` gains `"dev": "tsx watch src/index.ts"` and `"start": "node dist/index.js"`.

### Token convention

Any HTTP client in dev sends `Authorization: Bearer dev-<arbitrary-id>`. The same id always resolves to the same Traveller (via `TravellerAuthService` find-or-create). Using distinct ids produces distinct Travellers — convenient for multi-user local testing.

## Consequences

**+** Full HTTP server can run locally without Kakao credentials.  
**+** `TravellerAuthService` and all use cases are untouched — the seam already existed.  
**+** `DevAuthProvider` is independently unit-tested (6 cases, TDD red→green).  
**+** No production code path is affected: `DevAuthProvider` is never instantiated unless `NODE_ENV === 'development'`.  
**−** `dev-` prefix is a convention, not a cryptographic guarantee. Do not deploy with `NODE_ENV=development` in production.  
**Risk:** If `NODE_ENV` is accidentally `"development"` in a staging environment, real Kakao auth is bypassed. Mitigation: `NODE_ENV` is set explicitly in all deployment configs; default is `"production"` when unset (composition root falls through to `KakaoAuthAdapter`).

## Alternatives Considered

**Option A — `X-Dev-User-Id` header in all routes.**  
Why not: requires modifying `extractToken` and every route, leaking dev logic into the interface layer. The AuthProvider seam is cleaner.

**Option B — Seed a real Traveller + issue a hard-coded Kakao token.**  
Why not: impossible without a live Kakao account; tokens expire.

**Option C — Mock Kakao API with MSW in server process.**  
Why not: MSW is a test utility; running it in a dev server process is unconventional and adds startup complexity. The AuthProvider seam is simpler.
