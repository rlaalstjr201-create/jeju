# Codex Cross-Model Review — Jeju Core Flow

> Reviewer model: o4-mini (OpenAI Codex v0.128.0)
> Review date: 2026-05-17
> Commit reviewed: ddbd50b
> Prompt source: .codex-review-prompt.txt

---

## PASS

- **[Trip dateRange invariant / D2]** `Trip` constructor throws `InvalidDateRangeError` when `end.isBefore(start)`. Invariant lives in domain code, not just tests. ✓
- **[dayCount formula]** `end.diffDays(start) + 1` — inclusive, matches spec. ✓
- **[pin/unpin idempotent]** `Day.pin` guards with `.some()` before push; `Day.unpin` is noop if not found. ✓
- **[Shortlist.add idempotent]** Guards with `.contains()` before push. ✓
- **[ShortlistEmptyError / D1]** `ScheduleComposer.compose` throws at `spots.length === 0`. ✓
- **[SpotPreferences / D3]** Categorical distribution map, not embedding vector. Computed on demand, never persisted. ✓
- **[D4 — embedding not used in v1]** Warm-path query uses category weights, not vector similarity. ✓
- **[D5 — DayPlanRepository port+adapter]** Port and `PostgresDayPlanRepository` both exist. ✓
- **[SQL injection]** All queries parameterized. No string concatenation in SQL. ✓
- **[Shortlist independence invariant]** Pinning a Spot does not touch Shortlist state. ✓
- **[DayPlan save transactional]** `PostgresDayPlanRepository.save` wraps day_plans + days + pinned_spots in a single BEGIN/COMMIT. ✓
- **[Shortlist save transactional]** `PostgresShortlistRepository.save` wraps fetch + DELETE + upsert in a single BEGIN/COMMIT. ✓

---

## FINDINGS

### [MAJOR] Gap-fill writes shortlist and dayplan in separate transactions — partial failure leaves inconsistent state

**Location:** `src/application/core-flow/ComposeDayPlanService.ts` — gap-fill path (STEP 1 / STEP 3)

**Evidence:**
```
// STEP 1: save shortlist (with auto-fill flags)
await params.shortlistRepository.save(params.travellerId, updatedShortlist, autoFilledSpotIds);

// STEP 2: recompose with updated shortlist
const dayPlan = composer.compose(updatedShortlist, params.trip);

// STEP 3: save day plan
await params.dayPlanRepository.save(params.trip.id, dayPlan, autoFilledSpotIds);
```

**Risk:** If `dayPlanRepository.save` fails (DB connection drop, constraint violation, etc.), the shortlist already has auto-filled spots committed. On retry, `ScheduleComposer.compose` will use the now-larger shortlist, potentially producing a different `DayPlan` than the original gap-fill intended. The user's shortlist has spots they never explicitly added, with no associated dayplan.

**Fix direction:** Execute both saves inside a single cross-repository unit of work (shared `PoolClient`/transaction), or introduce a compensating transaction that rolls back the shortlist mutation on dayplan save failure.

---

### [MAJOR] ForbiddenError falls through to 500 in PATCH dayplan route

**Location:** `src/interface/api/routes/dayplan.ts` — `PATCH /api/v1/trips/:tripId/dayplan/days/:dayIndex/spots` error handler

**Evidence:**
```
// error mapping: SpotNotFoundError->404, DayNotFoundError->404, TripNotFoundError->404, other->500
// NOTE: ForbiddenError not caught here
```
`EditDayPlanUseCase` throws `ForbiddenError` when `trip.travellerId !== traveller.id`, but the route does not catch it. Any authenticated traveller passing another traveller's `tripId` receives a 500, leaking that the trip exists and triggering unintended server error logs.

**Fix direction:** Add `ForbiddenError → 403` to the catch block in `dayplan.ts`, identical to how `trips.ts` and `recommendations.ts` handle it.

---

### [MAJOR] EditDayPlanUseCase hardcodes `isAutoFilled: false` — loses DB flag on every edit

**Location:** `src/application/core-flow/EditDayPlanUseCase.ts:176`

**Evidence:**
```typescript
return { dayIndex: input.dayIndex, spots: day.pinnedSpots.map((s, i) => ({
  spotId: s.id, name: s.name, region: s.region, position: i, isAutoFilled: false
})) };
```
`updatePinnedSpots` also writes pinned_spots without an `is_auto_filled` flag. After any pin/unpin, the response always reports all spots as `isAutoFilled: false`, even if those spots were auto-filled during compose.

**Risk:** UI can no longer distinguish auto-filled spots from manually pinned ones after the first edit. The `is_auto_filled` metadata collected during gap-fill becomes invisible. This is a data accuracy bug affecting every user who edits a plan that went through gap-fill.

**Fix direction:** `PostgresDayPlanRepository.findByTripId` should read `is_auto_filled` from `pinned_spots` and expose it through the `Day`/`Spot` model. `EditDayPlanUseCase` should propagate the flag from the loaded domain object rather than hardcoding `false`.

---

### [MINOR] is_auto_filled flag is write-once — user cannot clear it by re-adding a spot

**Location:** `src/infrastructure/persistence/PostgresShortlistRepository.ts` — `save()` logic; `src/application/core-flow/UpdateShortlistUseCase.ts`

**Evidence:**
```
// is_auto_filled logic: existingMap.get(spot.id) ?? autoFilledSpotIds?.includes(spot.id) ?? false
// UpdateShortlistUseCase calls save() WITHOUT autoFilledSpotIds arg
```
When a spot already in the DB has `is_auto_filled=true` and the user manually removes then re-adds it, `UpdateShortlistUseCase` calls `save(travellerId, shortlist)` without `autoFilledSpotIds`. The repository reads the existing flag from `existingMap.get(spot.id)` — which was deleted on remove and recreated on add — but since the spot was deleted and re-inserted, `existingMap` after DELETE won't contain it, so it will resolve to `false` on re-add.

**Correction to the prompt description:** The flag _can_ be cleared on remove+add (because DELETE removes the row from existingMap). However, if the spot was never removed (e.g., user just calls add on an already-present auto-filled spot), `existingMap.get(spot.id)` returns `true` and the flag persists. This is an inconsistency: the flag semantics depend on whether the user removed-and-readded vs. just re-added.

**Fix direction:** Decide explicitly: is `is_auto_filled` meant to be sticky (informational, never cleared) or clearable on explicit user-add? Document the decision and add a test that proves the intended behavior both ways.

---

### [MINOR] Warm recommender returns only categories already in shortlist — may not eliminate empty days

**Location:** `src/infrastructure/recommender/PostgresRecommenderAdapter.ts` — warm path

**Evidence:**
```sql
WHERE is_active=true AND category = ANY($categories) ORDER BY weighted_score DESC LIMIT $limit
```
A shortlist with only `cafe` spots produces only cafe candidates. If all cafes are in the same region, region clustering assigns them to a single day, leaving other days empty even after gap-fill.

**Risk:** Gap-fill does not guarantee all days get at least one spot. The compose step may still return a DayPlan with empty days if region diversity is insufficient.

**Fix direction:** This is a product design gap, not a code bug. The spec does not guarantee all days are filled. Document the limitation. For production, consider a fallback to cold-start for categories outside the shortlist when the warm path yields insufficient regional diversity.

---

### [MINOR] Invalid `action` value silently defaults to `pin` — should return 400

**Location:** `src/interface/api/routes/dayplan.ts` — PATCH handler; `src/interface/api/routes/shortlist.ts` — PATCH handler

**Evidence:**
```
// action defaults to 'pin' if body.action is neither 'pin' nor 'unpin' (NO validation error returned)
```
A typo like `"action": "unPin"` silently pins the spot. API clients get no error feedback. Same issue exists in `shortlist.ts` for the `add`/`remove` action.

**Fix direction:** Validate `action` before calling the use case. Return 400 with a descriptive error if it is not an accepted value.

---

## ANSWERS TO SPECIFIC QUESTIONS

**Q1:** Real data integrity risk. If `dayPlanRepository.save` throws, the shortlist is already mutated with auto-filled spots that have no associated dayplan. On retry, the shortlist is now larger, producing a potentially different DayPlan. The shortlist also permanently contains spots the user did not add. **Severity: MAJOR** — requires cross-repository transaction or saga.

**Q2:** Yes. Hardcoding `false` is wrong. Spots that were auto-filled during compose should remain tagged as auto-filled in the edit response. The flag needs to round-trip through `findByTripId` and be carried on the `Spot`/`Day` model loaded from DB. **Severity: MAJOR** — UI data accuracy bug.

**Q3:** Not explicitly a domain invariant violation. The spec says auto-fill spots must be *added to Shortlist with isAutoFilled=true* — it does not say the flag must be clearable by user action. However, the current behavior is inconsistent (remove+readd clears it; re-add without remove preserves it). The intent should be documented and tested. **Severity: MINOR**.

**Q4:** Correctness gap, not a code bug. The spec says gap-fill uses the Recommender — it does not guarantee all days get filled. The warm path returning same-category spots is by design (D3). However, the emergent behavior (a single-category, single-region shortlist produces a DayPlan with unfilled days after gap-fill) is worth documenting as a known limitation. No code fix required; product decision required.

**Q5:** Yes — security and correctness issue. Authenticated traveller A accessing traveller B's tripId via the PATCH endpoint receives a 500 (unhandled ForbiddenError) instead of a 403. 500 leaks server error context, pollutes logs, and is incorrect REST semantics. **Severity: MAJOR** — one-line fix.

**Q6:** Yes — invalid action should return 400. Silent defaulting to `pin` creates a lie-by-omission API contract. Clients cannot rely on error feedback for input validation. Low complexity fix.

---

## TEST GAPS

- No test for gap-fill atomicity failure: shortlist saved, dayplan save fails — verify shortlist rollback behavior.
- No test asserting `isAutoFilled` round-trips correctly through `EditDayPlanUseCase` response after compose (currently impossible because flag is hardcoded `false`).
- No test for `ForbiddenError` → 500 regression in `PATCH /dayplan/days/:dayIndex/spots` — confirms the bug is untested.
- No test for `action: "INVALID"` → 400 in dayplan PATCH or shortlist PATCH routes.
- No test for `UpdateShortlistUseCase` re-add behavior: confirm whether is_auto_filled is cleared or preserved after remove+re-add vs. re-add without remove.
- No test covering gap-fill when warm recommender returns zero candidates (all recommendations already in shortlist) — verifies behavior when `fillCount === 0`.

---

## RESIDUAL RISKS

- **Concurrency:** Two concurrent compose requests for the same traveller could both pass the "empty days?" check, then both write different auto-filled spots to the shortlist and different dayplans. No optimistic lock or serialization guard exists.
- **LIMIT=12 in Recommender:** If `emptyDays.length > 12`, gap-fill will only partially fill even when warm candidates are diverse. The LIMIT is hardcoded and not parameterized by `emptyDays.length`.
- **Shortlist `spots` accessor:** `Shortlist` exposes `spots` as a public getter used by `ComposeDayPlanService`. If it returns the internal array by reference (not a copy), callers could mutate Shortlist state without going through `add`/`remove`. Needs inspection.
- **`updatePinnedSpots` does not track `is_auto_filled`:** Any spot manually pinned through EditDayPlan will always have `is_auto_filled=false` in `pinned_spots`, even if it was previously auto-filled. The two code paths (compose save vs. edit save) write different `is_auto_filled` values for the same logical state.

---

## VERDICT: BLOCKED

**3 MAJOR findings must be resolved before 8단계 (Architecture Improve):**

1. Gap-fill atomicity — shortlist + dayplan saves must be atomic (or compensated).
2. ForbiddenError → 500 in PATCH dayplan route — trivial fix, serious correctness gap.
3. `isAutoFilled: false` hardcoded in `EditDayPlanUseCase` — loses auto-fill context after first edit.

The 2 MINOR findings (is_auto_filled semantics, warm recommender limitation) can be resolved in 8단계 as part of architecture hardening.
