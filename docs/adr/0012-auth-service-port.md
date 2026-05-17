# ADR-0012: AuthService Port in the Application Layer

**Status:** Accepted  
**Date:** 2026-05-17

## Context

All use cases that require a logged-in Traveller (GetRecommendations, ComposeDayPlan, EditDayPlan, UpdateShortlist, CreateTrip) call `authenticate(accessToken)` to resolve the caller's identity. The concrete implementation — `TravellerAuthService` — lives in `src/infrastructure/kakao/` because it talks to the Kakao OAuth API.

Before this ADR, use cases imported `TravellerAuthService` directly from the infrastructure layer. This violates the dependency rule: application layer modules may only depend on domain and other application-layer abstractions; they must not import infrastructure modules.

The violation had two concrete costs:
1. Any use-case unit test that wanted to stub authentication had to mock a Kakao-specific class, coupling tests to infrastructure naming.
2. Swapping the auth provider (e.g., adding email login or a test-doubles provider) required touching every use case.

## Decision

Extract an `AuthService` interface in `src/application/ports/AuthService.ts`:

```typescript
import type { Traveller } from '../../domain/traveller/Traveller.js';
export interface AuthService {
  authenticate(accessToken: string): Promise<Traveller>;
}
```

`TravellerAuthService` is updated to `implements AuthService`. All use cases depend solely on the port; the concrete adapter is wired at the composition root.

## Consequences

**+** Dependency rule satisfied: application layer imports no infrastructure symbols.  
**+** Use-case unit tests can inject a plain object `{ authenticate: vi.fn() }` — no Kakao SDK import.  
**+** Adding a second auth provider (email, Apple) requires only a new adapter; use cases are unchanged.  
**−** One extra file (`AuthService.ts`); small maintenance surface.  
**Risk:** None — `TravellerAuthService` already satisfies the interface structurally; `implements` keyword is declaration only.

## Alternatives Considered

**Option A — Keep importing TravellerAuthService directly.**  
Why not: layer violation persists; test isolation requires mocking infrastructure internals; any auth provider change cascades to all use cases.

**Option B — Put AuthService in the domain layer.**  
Why not: authentication is an application-level concern (session resolution, token validation). The domain knows what a `Traveller` is, but not how to verify an OAuth token. Placing it in domain would pull auth semantics into the pure business logic layer.
