# ADR-0013: resolveOwnedTrip Application Helper

**Status:** Accepted  
**Date:** 2026-05-17

## Context

Three use cases — `GetRecommendationsUseCase`, `ComposeDayPlanUseCase`, `EditDayPlanUseCase` — each began their `execute()` method with an identical 4-line guard:

```typescript
const traveller = await this.authService.authenticate(accessToken);
const trip = await this.tripRepository.findById(tripId);
if (!trip) throw new TripNotFoundError();
if (trip.travellerId !== traveller.id) throw new ForbiddenError();
```

This is the "trip ownership" invariant: a Traveller may only act on their own Trip. Duplication across three files means any change to the invariant (e.g., adding a `trip.phase` check, changing error types) must be made in three places, and any omission silently breaks one use case.

## Decision

Extract the guard into `src/application/helpers/resolveOwnedTrip.ts`:

```typescript
export async function resolveOwnedTrip(
  authService: AuthService,
  tripRepository: TripRepository,
  accessToken: string,
  tripId: string,
): Promise<{ traveller: Traveller; trip: Trip }> {
  const traveller = await authService.authenticate(accessToken);
  const trip = await tripRepository.findById(tripId);
  if (trip === undefined) throw new TripNotFoundError();
  if (trip.travellerId !== traveller.id) throw new ForbiddenError();
  return { traveller, trip };
}
```

The three use cases call `resolveOwnedTrip(...)` and destructure the result. The helper has its own unit tests covering the three cases (success, trip-not-found, wrong-owner).

## Consequences

**+** Single point of change for the ownership invariant — future additions (phase check, audit log) happen in one place.  
**+** Helper is independently testable: three focused unit tests with plain objects, no class scaffolding.  
**+** Callers are shorter and more expressive; `execute()` starts with the use-case-specific logic.  
**−** One more file in `application/helpers/`; callers must import it.  
**Risk:** None — behavior is identical to the inlined version; tests verify the three branches.

## Alternatives Considered

**Option A — Keep the guard inlined in each use case.**  
Why not: three-site duplication; a future ownership rule change (e.g., "allow admin override") requires touching every use case and risks inconsistency.

**Option B — Promote to a domain service.**  
Why not: the guard coordinates an AuthService call (application concern) with a TripRepository query (persistence port) — it is not a pure domain rule. Placing it in the domain layer would pull application ports into domain, inverting the dependency direction.

**Option C — Express as a Fastify middleware.**  
Why not: middleware is interface-layer infrastructure; it couples the ownership check to the HTTP delivery mechanism. The use cases would still need the guard when called from non-HTTP contexts (tests, CLI, other adapters).
