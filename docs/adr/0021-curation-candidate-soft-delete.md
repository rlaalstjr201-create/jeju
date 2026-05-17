# ADR-0021 — CurationCandidate Uses Soft-Delete

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Eng team  
**Supersedes:** —

---

## Context

A1 decision: How to handle rejected `CurationCandidate` records?

Options:
1. **Hard DELETE**: Remove the row when rejected
2. **Soft-delete**: Set `status = 'rejected'`, preserve the row

---

## Decision

Use **soft-delete** for rejected candidates (`status = 'rejected'`, row preserved).

Additionally, when a previously `approved` candidate is rejected:
- `SpotRepository.deactivate(kakaoPlaceId)` is called to set `is_active = false`
  and `curation_score = 0` on the associated Spot
- `CurationCandidateRepository.save({ ...candidate, status: 'rejected' })` updates the status

This is "cascade rejection": approved → rejected cascades to Spot deactivation.

---

## Consequences

- **+** Full audit trail: every discovery, enrichment, and approval/rejection decision is visible
- **+** `GET /candidates?status=rejected` returns the full rejection history
- **+** Allows future un-rejection (re-approve) without re-running discovery
- **+** Approved-then-rejected candidates are traceable to their associated Spot
- **-** Table grows unboundedly (expected volume: hundreds/year, acceptable)
- **-** `status='rejected'` rows must be excluded from active discovery dedup checks
  (handled: `findExistingKakaoPlaceIds` checks all statuses — ensures no re-discovery)

---

## Implementation Note

`RejectCandidateUseCase` uses idempotent logic:
- `already rejected` → no-op (safe to call multiple times)
- `pending → rejected` → soft delete only
- `approved → rejected` → Spot deactivation + soft delete
