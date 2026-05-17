# Architecture Review — Core Flow

**Date:** 2026-05-17
**Reviewer:** improve-codebase-architecture skill (8단계)
**Base commit:** e80e423 (Codex BLOCKER fix)
**Scope:** `src/` 전체 + ADR 참조

---

## Findings

Seven friction points were identified by codebase exploration. All are refactors — no behaviour changes except #6 (is_auto_filled semantics).

### #1 — Application error types scattered across use case files (APPLIED)

**Files:** `GetRecommendationsUseCase.ts`, `UpdateShortlistUseCase.ts`, `EditDayPlanUseCase.ts`

`TripNotFoundError` and `ForbiddenError` were defined in `GetRecommendationsUseCase.ts` but imported by unrelated files: `trips.ts`, `dayplan.ts`, `recommendations.ts`. `SpotNotFoundError` was in `UpdateShortlistUseCase.ts`; `DayNotFoundError` in `EditDayPlanUseCase.ts`. Routes were cross-importing use case files to reach error types.

**Fix:** `src/application/errors.ts` — all application-layer errors in one file. Routes and use cases import from `errors.ts` only.

---

### #2 — Authenticate + trip-ownership guard duplicated in 3 use cases (APPLIED)

**Files:** `GetRecommendationsUseCase.ts:55–60`, `ComposeDayPlanUseCase.ts:48–52`, `EditDayPlanUseCase.ts:46–50`

Identical 4-line pattern repeated: `authenticate → findById → TripNotFoundError → ForbiddenError`. No single place to change ownership logic.

**Fix:** `src/application/helpers/resolveOwnedTrip.ts` — extracted shared helper. 3 use cases now call a single function. Unit-tested independently.

**ADR:** [ADR-0013](adr/0013-resolve-owned-trip-helper.md)

---

### #3 — Application layer imports TravellerAuthService from infrastructure (APPLIED)

**Files:** All 5 use cases — `import type { TravellerAuthService } from '../../infrastructure/kakao/TravellerAuthService.js'`

Layer direction violation: application layer directly references `infrastructure/kakao/`. Any change to auth infrastructure requires touching all use cases. `context.md` specifies Kakao as ACL-layer concern only.

**Fix:** `src/application/ports/AuthService.ts` — port interface with `authenticate(accessToken): Promise<Traveller>`. `TravellerAuthService` implements `AuthService`. All use cases depend on the port only.

**ADR:** [ADR-0012](adr/0012-auth-service-port.md)

---

### #4 — ParseFreeTextPort defined in infrastructure layer (APPLIED)

**Files:** `src/infrastructure/llm/ParseFreeTextPort.ts`

Port interface defined alongside its adapter. `CreateTripUseCase` (application layer) had to reach into `infrastructure/llm/` to import the type. Inconsistent with `TransactionManager.ts` which correctly lives in `application/ports/`.

**Fix:** Moved to `src/application/ports/ParseFreeTextPort.ts`. `LLMParseFreeTextAdapter` now imports from application layer (correct direction).

---

### #5 — extractToken duplicated; auth errors missing in 2 routes (APPLIED)

**Files:** `trips.ts`, `shortlist.ts`, `recommendations.ts`, `dayplan.ts`

`extractToken` copied to all 4 route files. Auth error (`UnauthorizedError → 401`) handled only in `trips.ts` — calling PATCH /shortlist or PATCH /dayplan with an expired token returned 500.

**Fix:** `src/interface/api/routes/_shared.ts` — exports `extractToken` and `mapErrorToReply`. All routes use shared helpers. `UnauthorizedError → 401` now covered universally.

---

### #6 — is_auto_filled semantics undecided (APPLIED)

**Files:** `src/infrastructure/persistence/PostgresShortlistRepository.ts`

Codex MINOR: the flag's sticky vs. clearable behaviour was undocumented, and the ON CONFLICT clause could overwrite `true` with `false` under certain conditions.

**Decision:** Sticky (see [ADR-0014](adr/0014-is-auto-filled-sticky-semantics.md)). Once `is_auto_filled = true` is written to a shortlist row, it is preserved by the DB via `GREATEST(shortlist_spots.is_auto_filled, EXCLUDED.is_auto_filled)` in the ON CONFLICT clause. Cross-call delete+re-add is a known v1 limitation (documented in ADR-0014).

**Fix:** Changed ON CONFLICT clause. Added 3 integration tests covering within-call stickiness, day pin preservation, and manual-add default.

**context.md updated:** B5 entry clarified with sticky flag behaviour.

---

### #7 — Warm recommender single-category limitation undocumented (DOCUMENTED)

**Files:** `src/infrastructure/recommender/PostgresRecommenderAdapter.ts:116`

`WHERE category = ANY($categories)` — warm path only returns Spots matching the Shortlist's categories. Single-category Shortlists may produce empty Days after gap-fill if all candidates cluster in one region.

**Decision:** v1 accept (see [ADR-0015](adr/0015-warm-recommender-category-limitation.md)). Single-category single-region Shortlist is an edge case for Tagalong users. Empty Days remain editable (B5). Cold-start fallback considered for v2.

**Fix:** Code comment added to `PostgresRecommenderAdapter.ts` warm path. No behaviour change.

---

## Applied Changes

| # | Type | Files | Tests Δ |
|---|------|-------|---------|
| #4 | Move port | `ParseFreeTextPort.ts` → `application/ports/` | 0 |
| #1 | Extract module | `application/errors.ts` (new) | 0 |
| #3 | Extract port | `application/ports/AuthService.ts` (new) | 0 |
| #2 | Extract helper | `application/helpers/resolveOwnedTrip.ts` (new) | +3 |
| #5 | Extract helpers | `interface/api/routes/_shared.ts` (new) | 0 |
| #6 | Behaviour fix | `PostgresShortlistRepository.ts` ON CONFLICT | +3 |
| #7 | Documentation | `PostgresRecommenderAdapter.ts` comment | 0 |

---

## Not Applied / Deferred

None — all 7 candidates applied.

---

## Residual Notes

- **Concurrency (Codex residual):** Two concurrent `compose()` calls for the same Traveller can produce conflicting DayPlans. No optimistic lock in v1. Acceptable for Tagalong scale; v2 candidate.
- **Recommender LIMIT=12 hardcoded:** Gap-fill will only partially fill Days for trips longer than 12 days. `PostgresRecommenderAdapter` constructor accepts `limit` but gap-fill doesn't parameterise by `emptyDays.length`. Documented in ADR-0015.
- **Action validation (Codex MINOR):** `body.action` silently defaults to `pin`/`add` if invalid. `_shared.ts` does not address this — out of scope for this refactor round (no behaviour change rule). v2 input validation layer candidate.
