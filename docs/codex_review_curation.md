# Codex Review — Curation Pipeline (c5ed559)

**Reviewer model:** claude-opus-4-7
**Date:** 2026-05-18
**Files reviewed:** 71 (33 new, 38 modified)

## Decision Compliance (9 decisions)

| # | Decision | Status | Evidence / Gap |
|---|---------|--------|---------------|
| D2 | CalibrationProfile per-trip | ✅ | `migrations/011_up_calibration_profiles.sql:3` — `trip_id UUID PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE`. `CalibrationProfileRepository` keyed on `tripId`. No traveller reference anywhere. |
| D3 | `withNegativeIntent()` removed | ✅ | `CalibrationProfile.ts` has only `default()`, `fromUserInput()`, `popularRatio`, `toJSON()`. No negative-intent parsing in any read file. |
| D5 | No offset, limit=8 per section | ❌ | **Violated.** `RecommendationResult` defines max 8 nowhere. `GetRecommendationsUseCase.ts:13-18` still accepts `offset` in input; line 83 calls `.slice(input.offset, input.offset + input.limit)` for curatedPicks (offset honored), line 88 uses `.slice(0, input.limit)` for popularSpots (offset ignored — inconsistent). No constant enforces `limit=8`; default comes from the route (`recommendations.ts` not in review set) and `PostgresRecommenderAdapter` constructor default `limit = 12`. Decision says "no offset, limit=8 per section" — neither is enforced. |
| A1 | reject = soft-delete (status='rejected'), not DELETE | ✅ | `RejectCandidateUseCase.ts:33,40` saves `{...candidate, status:'rejected'}`. No `DELETE` SQL in `PostgresCurationCandidateRepository`. |
| A2 | Admin routes `/api/v1/admin/curation/` prefix | ✅ | `admin-curation.ts:7,34,59,74,98` all under `/api/v1/admin/curation/`. (But no auth/RBAC actually enforced — see CRITICAL-1.) |
| A3 | SpotRepository has existsByKakaoPlaceId / findExistingKakaoPlaceIds / deactivate | ✅ | `SpotRepository.ts:11-13`; all three implemented in `PostgresSpotRepository.ts:143-166`. |
| CM-1 | TrendDiscoveryPort separate from TrendDataSourcePort; TrendCandidate has no spotId | ✅ | `TrendDiscoveryPort.ts` → `TrendCandidate` (no `spotId`). `TrendDataSourcePort.ts` → `TrendSignal` (has `spotId`). Separate interfaces. `DatalabVisitkoreaAdapter` implements both, which is allowed (one source, two roles). |
| CM-2 | EnrichCandidateUseCase uses KakaoLocalApiPort; ApproveCandidateUseCase throws if enrichedAt null | ⚠️ | Partially. `EnrichCandidateUseCase.ts:46` uses `kakaoLocalApi.fetchPlaceDetails`. `ApproveCandidateUseCase.ts:55-57` throws `ApproveError('NotEnriched')` if `enrichedAt === null`. **However** the only `KakaoLocalApiPort` implementation (`KakaoLocalPlaceAdapter`) is a stub returning `null` always — so in the wired app every enrich call throws `EnrichmentError`, making approve unreachable end-to-end. Decision logic is present but the feature is non-functional as wired. |
| T1 | approved→rejected: spotRepo.deactivate(kakaoPlaceId) in a transaction | ❌ | **Violated.** `RejectCandidateUseCase.ts:38-41` calls `spotRepo.deactivate()` then `candidateRepo.save()` as two separate awaits with **no transaction**. No `TransactionManager` is injected into this use case (constructor takes only `candidateRepo`, `spotRepo`). The cascade is not atomic. |

## Findings

### CRITICAL

**C1 — Admin curation endpoints have zero authentication/authorization.**
`admin-curation.ts:8,35,60,75,99` call `extractToken(req)` and assign to `_token` (underscore-prefixed = deliberately unused). The token is never validated and no role check exists. Any unauthenticated caller can discover, enrich (burning Anthropic + Kakao API budget), approve (inject arbitrary Spots into production recommendations), and reject (deactivate live Spots). Decision A2 was about *route prefix* for RBAC separation — the prefix exists but the actual RBAC does not. This is a publicly writable curation pipeline.

**C2 — approved→rejected cascade is not transactional (violates T1 + stated domain rule).**
`RejectCandidateUseCase.ts:38-41`:
```ts
if (candidate.status === 'approved') {
  await this.spotRepo.deactivate(candidate.kakaoPlaceId);
  await this.candidateRepo.save({ ...candidate, status: 'rejected' });
}
```
Two separate writes, no `TransactionManager`. If the process dies (or the second query fails) between the two awaits, the Spot is deactivated but the candidate stays `approved` — an inconsistent state that the system has no path to repair (re-rejecting an already-`approved` candidate would re-run, but if it's stuck the curator sees it as approved while the spot is gone). The review brief explicitly requires `spotRepo.deactivate` inside a DB transaction; `ComposeDayPlanService.ts:83` shows the codebase already has a `TransactionManager` pattern that should have been used here. The test `RejectCandidateUseCase.test.ts:64-77` asserts both calls happen but cannot detect the missing atomicity.

**C3 — ApproveCandidateUseCase: spot creation + candidate status update are not transactional, and the idempotency logic is broken.**
`ApproveCandidateUseCase.ts:84-90`:
```ts
await this.spotRepo.save(spot);
const existingSpot = await this.spotRepo.findById(spot.id);   // looks up by the NEW random uuid
const finalSpotId = existingSpot?.id ?? spotId;
await this.candidateRepo.save({ ...candidate, status: 'approved' });
```
Two problems:
1. **Non-atomic**: `spotRepo.save` then `candidateRepo.save` with no transaction. Crash between them → Spot exists but candidate still `pending` (a curator re-approves → second Spot row attempt; `ON CONFLICT (kakao_place_id)` saves it from a true duplicate, but the candidate/spot pair can still desync).
2. **Broken idempotency lookup**: The comment claims "Get the actual spotId (may differ if kakaoPlaceId already exists — idempotent)" but `findById(spot.id)` queries by the freshly generated `crypto.randomUUID()`, never by `kakaoPlaceId`. `PostgresSpotRepository.save` does `ON CONFLICT (kakao_place_id) DO UPDATE` — so when the place already exists, the row keeps its **original** id, and `findById(newUuid)` returns `undefined`. `finalSpotId` then falls back to `spotId` (the new uuid) which does **not** exist in the DB. The returned `spotId` is a phantom. The intended dedup-by-kakaoPlaceId behavior does not work; a `findByKakaoPlaceId` method would be required and does not exist on the port.

### MAJOR

**M1 — No input validation on admin/calibration request bodies.**
`admin-curation.ts:77-80` reads `body.curationScore: number` and passes it straight through. There is no range check (brief specifies 1–100; `Spot.curationScore` is `SMALLINT` so a value >32767 or a string from JSON would fail at the DB layer with a 500, and negative/zero scores are silently accepted). `calibration.ts:10` reads `body.curatedRatio` with no validation at the edge — it only fails inside `CalibrationProfile.fromUserInput` which throws a plain `Error`, and `mapErrorToReply` has no branch for it, so an out-of-range ratio returns **500 INTERNAL_SERVER_ERROR** instead of 400. `body.limit` in `discover` is unbounded (a caller can request `limit: 1000000`). No body is type-checked; all use `req.body as {...}` casts.

**M2 — `CalibrationProfile.toJSON()` is dead code.**
`CalibrationProfile.ts:20-26`. Not referenced anywhere (`AdjustCalibrationUseCase` and `GetRecommendationsUseCase` build their own response objects from `.curatedRatio`/`.popularRatio`). Tested in `CalibrationProfile.test.ts:41-47` but never used in production paths. Either wire it into the response mappers or delete it.

**M3 — `existsByKakaoPlaceId` is dead code on both repositories.**
`SpotRepository.ts:11` and `CurationCandidateRepository.ts:9`. Grep shows the only non-test, non-plan references are the interface declarations and the implementations themselves. `DiscoverCandidatesUseCase.ts:48-51` correctly uses the batch `findExistingKakaoPlaceIds` (good — N+1 avoided, brief requirement satisfied). The singular `existsByKakaoPlaceId` is never called by any use case. Dead surface area on a domain port; remove it or it will rot.

**M4 — LLM enricher produces a `priceRange` value the domain and DB reject.**
`AnthropicLLMEnricherAdapter.ts:29` prompt instructs the model to return `"free|budget|mid|high|null"`. But `PriceRange` (`src/domain/shared/PriceRange.ts`) is `'free'|'budget'|'mid'|'premium'` and `migrations/003_up_spots.sql:7` has `CHECK (price_range IN ('free','budget','mid','premium'))`. If the LLM returns `"high"` (as instructed), `EnrichCandidateUseCase` stores it on the candidate, then `ApproveCandidateUseCase.ts:74` casts `candidate.priceRange` to `PriceRange` and `PostgresSpotRepository.save` throws a CHECK-constraint violation → approve returns 500. The prompt is wrong; it must say `premium`, not `high`. There is also no validation that the LLM-returned string is a valid `PriceRange` — the `as PriceRange` cast at `ApproveCandidateUseCase.ts:74` is unsound.

**M5 — Concurrency: simultaneous approves of the same candidate create duplicate Spots / lost updates.**
No optimistic locking or status guard at the DB level. Two curators both pass `candidate.status !== 'pending'` check (`ApproveCandidateUseCase.ts:50`) because both read `pending` before either writes. Both call `spotRepo.save` — the `ON CONFLICT (kakao_place_id)` collapses to one row (lucky), but both then write `status:'approved'` to the candidate (idempotent here). The worse case is approve-vs-reject racing: approve reads `pending`, reject reads `pending`, reject writes `rejected`, approve writes `approved` + creates Spot → a `rejected` candidate with a live Spot, or vice versa. The status transition is not enforced with a conditional `UPDATE ... WHERE status = 'pending'`; it's a read-modify-write with a TOCTOU window.

**M6 — `findByStatus` ordering depends on `created_at` but `ListCandidatesUseCase` is the only caller and rejected candidates are never filtered from discovery re-checks correctly… acceptable, but soft-deleted (rejected) candidates remain matchable by `findExistingKakaoPlaceIds`.**
`DiscoverCandidatesUseCase.ts:50` treats any row in `curation_candidates` (including `rejected`) as an existing duplicate to skip. That means once a place is rejected it can never be re-discovered even if it later becomes worth curating. This may be intended (suppression) but it is undocumented and there is no way to "un-reject" — combined with C2's non-atomic cascade it is a one-way trap. Flagging as a design gap to confirm against the spec.

### MINOR

**m1 — `RecommendationResult` interface does not carry `calibration`, contradicting the brief's stated contract.**
Brief says `GetRecommendationsUseCase` must return `{ curatedPicks, popularSpots, calibration }`. The use case output (`GetRecommendationsUseCase.ts:31-43`) does include `calibration`, so the API contract is met. But the **domain** `RecommendationResult` (`RecommendationResult.ts:3-6`) only has `curatedPicks`/`popularSpots`. The calibration is bolted on in the application layer by reading the repo separately (`GetRecommendationsUseCase.ts:62-64,91-94`). This is a layering smell, not a bug — noting it because the brief framed calibration as part of the recommendation result.

**m2 — `SyncSpotScoresUseCase` consecutive-failure alerting is non-functional.**
`SyncSpotScoresUseCase.ts:50,77-81`: `consecutiveFailureMap` is always set to `1` per run (`set(source.sourceName, 1)`), then checked `if (failures >= 3)` — it can never reach 3 within a single execution. Real consecutive-failure tracking would need to read the prior `consecutive_failures` from `trend_sources` and increment. Also it always passes hard-coded `1` to `trendSourceRepo.updateStatus(...,'failure',1)` (`:53`), so the persisted `consecutive_failures` column never grows past 1. The `>= 3` alert is dead.

**m3 — `findById` after `deactivate` cannot find the spot (consistency footgun).**
`PostgresSpotRepository.ts:49-56` `findById` filters `AND is_active = true`. After `deactivate`, any code calling `findById` for that spot gets `undefined`. `ApproveCandidateUseCase.ts:87` relies on `findById` right after a `save` (which sets `is_active=true`), so it's fine there, but the asymmetry (save then read-back through an `is_active` filter) is fragile and contributed to the C3 phantom-id bug.

**m4 — `SyncSpotScoresUseCase` selects "active spots" via `findTopByCurationScore(10000)`.**
`SyncSpotScoresUseCase.ts:25`. Misusing a "top by curation score" query (hard cap 10000) as "list all active spots". If the catalog ever exceeds 10000 active spots, score sync silently skips the tail. There is no `findAllActive` method; semantics are overloaded.

**m5 — `DiscoverCandidatesUseCase` reads `DISCOVER_THRESHOLD` from `process.env` inside `execute`.**
`DiscoverCandidatesUseCase.ts:25`. Env read on every invocation, untyped `parseInt` (NaN if misconfigured → `c.trendSignal >= NaN` is always false → silently discovers nothing). Configuration should be injected, and NaN should fail loudly.

**m6 — `EnrichCandidateUseCase` writes `enrichedAt` as a date-only string (`slice(0,10)`).**
`EnrichCandidateUseCase.ts:56`, also `DiscoverCandidatesUseCase.ts:59`. `discoveredAt`/`enrichedAt` lose time-of-day. Migration columns are `DATE` so this is internally consistent, but it means two enrich runs on the same day are indistinguishable for audit/debugging.

### NIT

**n1 — Duplicated `CandidateNotFoundError` class.** Defined independently in `EnrichCandidateUseCase.ts:5`, `ApproveCandidateUseCase.ts:5`, and `RejectCandidateUseCase.ts:4`. Three separate error classes with the same name/shape; `instanceof` checks won't be cross-compatible and `mapErrorToReply` handles none of them (so a missing candidate → 500, not 404).

**n2 — `mapErrorToReply` has no branch for curation errors.** `CandidateNotFoundError`, `InvalidStatusError`, `ApproveError`, `EnrichmentError` all fall through to the generic `return reply.status(500)`. A not-found candidate or an invalid-status transition returns 500 instead of 404/409. (`_shared.ts:38-46`.)

**n3 — `console.log` used for alerts and cost tracking.** `SyncSpotScoresUseCase.ts:79` (`[ALERT]`) and `AnthropicLLMEnricherAdapter.ts:62`. Fastify logger is available (`server.ts:14`); raw `console.log` bypasses structured logging.

**n4 — `DatalabVisitkoreaAdapter` / `KakaoMapRatingAdapter` / `KakaoLocalPlaceAdapter` are stubs.** All return `[]` or `null` with TODO comments. Not a defect per se (pre-integration), but it means the entire pipeline is non-functional end-to-end today: discover returns 0, enrich always throws, approve unreachable. Worth stating plainly so it isn't mistaken for a working feature.

**n5 — `PostgresSpotRepository.updateScores` loops one `UPDATE` per row.** `:172-178`. N round-trips, no batching/transaction. For `SyncSpotScoresUseCase` over thousands of spots this is slow and non-atomic (partial update on failure). The brief's N+1 concern was about discovery (handled) but this write path has the same shape.

**n6 — `migrations/012` inserts `kakao-map-rating` but `index.ts` wires `[datalabAdapter, ijtoAdapter]` only.** `index.ts:118-120` constructs `DiscoverCandidatesUseCase` with `datalab` and `jeju-tourism-bigdata`; `KakaoMapRatingAdapter` is imported nowhere in `index.ts` (not in reviewed wiring). The trend_sources seed row `kakao-map-rating` will never be updated. Minor drift between migration seed and DI wiring.

## Test Gap Summary

- **EnrichCandidateUseCase** — no test file. Untested: Kakao-null → `EnrichmentError`, candidate-not-found, the `enrichedAt`/lat/lng/thumbnail write-back. Given C3/M4 hinge on enrichment correctness, this is a real gap.
- **SyncSpotScoresUseCase** — no test file. Untested: partial source failure, dryRun, score averaging math, the (broken) consecutive-failure alert (m2). Gap.
- **ListCandidatesUseCase** — no test file. Thin pass-through, low risk; acceptable to skip but note it's the only path exercising `findByStatus` pagination.
- **GetRecommendationsUseCase** — not in the provided set; could not verify the `limit=8`/no-offset contract (D5) is tested. Given D5 appears violated in code, a test asserting section size ≤ 8 and offset rejection is needed.
- **ApproveCandidateUseCase.test.ts** — does not assert the saved Spot has `curationScore`/`curationComment`/`isActive`. It only checks `spotRepo.save` was called once and status became `approved`. The brief's domain rule ("must save Spot with curationScore, curationComment, isActive=true") is not test-enforced. Note `isActive` is not even a field on the `Spot` domain interface (`Spot.ts`) — it's injected as a literal `true` in `PostgresSpotRepository.save` SQL, so it cannot be asserted at the use-case boundary. Acceptable mechanically but the rule is unverified.
- **RejectCandidateUseCase.test.ts** — asserts both `deactivate` and `save` are called for approved→rejected but **cannot** detect the missing transaction (C2). No test for the approved→pending / rejected→* forbidden transitions (the code simply has no branch for them; reject from `approved` is the only non-pending path and there is no guard preventing `RejectCandidateUseCase` being the sole mutator — approve already blocks non-pending via `InvalidStatusError`, but there is no test asserting `rejected → approve` is rejected... actually `ApproveCandidateUseCase.ts:50` does block it; an explicit test for `rejected` status approve attempt is missing).

## Port Placement Note (checklist item 7)

`KakaoLocalApiPort` lives in `src/application/ports/` while `TrendDiscoveryPort`/`TrendDataSourcePort` live in `src/domain/ports/`. `KakaoLocalApiPort` returns infrastructure-shaped data (`{lat,lng,thumbnailUrl}`) consumed only by `EnrichCandidateUseCase` — application-level. `LLMEnricherPort` is also in `src/application/ports/`. This is internally consistent (LLM/Kakao = application-driven enrichment ports; trend = domain ports because `TrendCandidate`/`TrendSignal` are domain types). Not a defect, but the split is arbitrary and undocumented — a reader cannot predict which directory a new port goes in. Recommend an ADR documenting the rule (domain port = trades in domain entities; application port = trades in DTOs for a specific use case).

## SQL Safety Note (checklist item 8)

`PostgresRecommenderAdapter.warm()` (`:135-170`) builds `CASE WHEN` clauses by string concatenation but every value is a bound `$N` parameter (`params.push(category, weight)`) and the clause text is `$index` placeholders only — **no user data is interpolated into SQL text**. `caseWhenClauses.join` only joins generated placeholder strings. This is safe. `PostgresSpotRepository.search` uses `%${query}%` but binds it as `$1` (`:68,76`) — safe (the `%` wrapping is in JS, the value is parameterized). No raw interpolation found anywhere in the reviewed persistence code.

## Summary

CRITICAL: 3, MAJOR: 6, MINOR: 6, NIT: 6

**Top blockers before this can ship:**
1. C1 — admin endpoints are unauthenticated (write access to production catalog).
2. C2 — approved→rejected cascade not transactional (T1 violated, data-corruption risk).
3. C3 — approve cascade not transactional + idempotency-by-kakaoPlaceId is broken (returns phantom spotId).
4. M4 — LLM prompt emits `high`, which the DB CHECK constraint rejects → approve 500s on real data.
5. D5 — section limit (8) and no-offset contract not enforced in `GetRecommendationsUseCase`.
