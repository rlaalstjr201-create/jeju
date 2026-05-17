# ADR 0011: Kakao Login Required; No Guest Mode

Status: Accepted (2026-05-17)

## Context

The core value units — Shortlist and Trip — require persistent identity. A Shortlist belongs to a Traveller and persists across multiple Trips. A Trip's DayPlan is owned by the Traveller who created it. Without a stable identity, neither entity can be stored, retrieved, or protected.

Two identity models were considered: (a) authenticated-only from first use, or (b) a guest mode that allows anonymous browsing of recommendations, with an upgrade-to-account gate before saving.

The target user base is Korean mobile users. Kakao accounts have near-universal penetration in Korea (~50M active accounts). Kakao social login is a recognised pattern ("B6 — Familiar") — users encounter it in almost every Korean app.

`context.md` defines **Traveller** as "always an authenticated account holder (Kakao social login); no guest mode." This is the domain definition.

## Decision

All product features require an authenticated Kakao account. No guest mode. No anonymous session with later upgrade.

Authentication flow: `Authorization: Bearer <kakao_access_token>` header on every API request. `KakaoAuthAdapter` verifies the token and returns a `kakaoId`. `TravellerAuthService` resolves or creates the Traveller entity.

`Traveller.id` is the application's stable identifier. `kakao_id` is stored for ACL cross-referencing but is not exposed in domain code beyond the auth adapter.

## Consequences

**Positive:**
- Persistent identity from the first interaction: Shortlist items survive app close/reopen, device change, and across multiple Trips.
- Authorization model is simple: ownership check is `trip.travellerId === traveller.id` — no role system, no guest-to-auth upgrade path.
- B6 (Familiar): Korean users expect Kakao login; friction is lower than email/password registration.
- Security: no unowned data floating in anonymous sessions that need garbage collection.

**Negative:**
- Higher onboarding friction compared to browse-then-register. A user who just wants to look at recommendations must log in first.
- Kakao account dependency: users without a Kakao account (foreign travellers, non-smartphone users) cannot use the product.

**Risk:**
- Kakao OAuth2 access tokens have a ~2-hour TTL. Token refresh strategy is out of scope for v1 (handled client-side). The API returns 401 on expired tokens; clients must refresh and retry. This is a known limitation, not a design defect.
- If Kakao OAuth2 changes its API (rate limits, token format), authentication breaks for all users simultaneously. Mitigation: the `AuthProvider` port allows swapping to a different auth provider without changing use cases.

## Alternatives Considered

**Guest mode with anonymous Shortlist:** Rejected.
- Anonymous Shortlist requires either local storage (not persisted across devices) or server-side ephemeral storage (TTL management, garbage collection, identity upgrade on registration).
- Upgrade path complexity: merging anonymous data into a new Traveller account is error-prone and adds state machine complexity at odds with v1 scope.
- The core value proposition (persistent cross-trip Shortlist) is unavailable to anonymous users anyway — the upgrade gate is confusing.

**Email/password registration:** Rejected.
- B6 (Familiar): Korean users expect social login. An email/password form in a Kakao-ecosystem product feels out of place.
- Password management (reset, storage, hashing) is infrastructure overhead with no user-value payoff given Kakao's penetration.

**Multiple social login providers (Google, Naver, Apple):** Deferred to v2.
- Kakao covers the primary target (Korean domestic travellers). Foreign travellers are a v2 target.
- Multiple providers require provider-identity merging logic when the same person logs in with different providers. Out of v1 scope.
