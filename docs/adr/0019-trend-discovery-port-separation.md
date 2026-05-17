# ADR-0019 — TrendDiscoveryPort Separated from TrendDataSourcePort

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Eng team  
**Supersedes:** —

---

## Context

CM-1 issue identified during Codex review: `TrendSignal.spotId` references an existing Spot
in the database by UUID. This is incompatible with the new-place discovery workflow, which
operates on Kakao Place IDs of places not yet in the system.

Attempting to reuse `TrendDataSourcePort` for both discovery and score-sync would require
either (a) allowing `spotId` to be null (breaks type safety for score-sync) or (b) mixing
concerns in a single interface.

---

## Decision

Introduce two separate ports:

1. **`TrendDiscoveryPort`** (CM-1 — discovery-only)
   - Operates on `TrendCandidate` which has `kakaoPlaceId` (external key)
   - Used by `DiscoverCandidatesUseCase`
   - Returns candidates for new spots not yet in the system

2. **`TrendDataSourcePort`** (score-sync-only)
   - Operates on `TrendSignal` which has `spotId` (internal UUID)
   - Used by `SyncSpotScoresUseCase`
   - Assumes spots already exist in the DB

Adapters that implement both (Datalab, IJTO) implement both interfaces.

---

## Consequences

- **+** Each interface has a single, clear responsibility
- **+** Type safety is preserved — no optional fields to handle null spotId
- **+** `DiscoverCandidatesUseCase` never accidentally calls score-sync methods
- **-** Adapters like `DatalabVisitkoreaAdapter` must implement two interfaces (minor duplication)
- **Workaround:** Adapters that implement both share the `sourceName` field
