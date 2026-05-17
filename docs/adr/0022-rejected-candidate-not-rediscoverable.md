# ADR-0022: Rejected Candidate Is Not Re-Discoverable

**Date:** 2026-05-18  
**Status:** Accepted

## Context

`DiscoverCandidatesUseCase` uses `CurationCandidateRepository.findExistingKakaoPlaceIds` to deduplicate incoming trend signals against already-queued candidates. This prevents the same place from being queued multiple times.

The `status` field on `CurationCandidate` can be `pending`, `approved`, or `rejected`. A rejected candidate keeps its row in the `curation_candidates` table (soft-delete, per ADR-0021).

A question arose: if a curator rejects a place, and that place resurfaces in a later trend signal, should it be re-queued? The current `findExistingKakaoPlaceIds` query checks all rows regardless of status, so rejected candidates block re-discovery.

## Decision

**Rejected candidates permanently block re-discovery.** A rejected place will never be re-queued through the automated discovery pipeline, even if it gains renewed trend signal.

The `findExistingKakaoPlaceIds` deduplication check is intentionally status-agnostic — it matches on `kakao_place_id` across `pending`, `approved`, and `rejected` rows.

## Rationale

1. **Curator intent is authoritative.** If a curator explicitly rejected a place, re-surfacing it automatically disrespects that judgment. The signal that caused rejection (low quality, wrong category, etc.) is unlikely to change.

2. **Prevents alert fatigue.** Without this block, a high-traffic place could be re-queued on every sync cycle after rejection, filling the candidates queue with noise.

3. **Manual override is possible.** A curator who wants to reconsider a rejected place can delete the candidate row directly in the DB, which allows re-discovery on the next sync. This is a deliberate friction point.

4. **Simpler query, no hidden state.** A status-filtered dedup query (`WHERE status != 'rejected'`) would silently re-surface places, which is surprising. The current behavior is explicit and predictable.

## Consequences

- Curators must be aware that rejection is permanent via the pipeline. The admin UI should communicate this.
- If a place is legitimately re-evaluated (e.g., under new ownership), a curator must manually clear the rejected row.
- `DiscoverCandidatesUseCase` does not need to be changed. The behavior is a side-effect of the soft-delete retention policy (ADR-0021).
- This policy is not documented in the API response today; a `skippedRejected` count field could be added to `DiscoverCandidatesUseCase` output if observability is needed.

## Related

- ADR-0021: Curation Candidate Soft Delete
- ADR-0019: Trend Discovery Port Separation
