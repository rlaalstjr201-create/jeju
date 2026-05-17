# ADR-0015: Warm Recommender is Category-Scoped in v1

**Status:** Accepted  
**Date:** 2026-05-17

## Context

`PostgresRecommenderAdapter.warm()` ranks Spots using per-category weights derived from the Traveller's Shortlist (`SpotPreferences`). The SQL WHERE clause filters to `category = ANY($categories)`, where `$categories` is the set of categories already present in the Shortlist.

This means the warm path is **category-closed**: if a Traveller's Shortlist contains only restaurants and cafes, the recommender will never surface a beach attraction or cultural site — even if those cross-category Spots have high curation scores and would genuinely appeal to the Traveller.

The limitation surfaces most sharply for:
1. Travellers whose Shortlist is narrow (one or two categories).
2. The gap-fill path in `ComposeDayPlanService`, which calls `recommendForShortlist` when `shortlist.count < trip.dayCount` — it can only fill empty Days with the same category mix the Traveller already chose.

The intended v2 fix is an embedding-based warm path: retrieve a top-K candidate set by vector similarity to the Traveller's Shortlist embeddings, then re-rank by `curation_score`. That approach is cross-category by design and already has infrastructure scaffolding (`spots.embedding` column, Voyage AI seed pipeline).

## Decision

Accept the category-scoped limitation for v1. Document it in the code (inline comment on `warm()`) and here so reviewers and future contributors understand it is a known constraint, not an oversight.

The cold-start path (`curation_score DESC`, no category filter) provides a safety valve: if `SpotPreferences.isEmpty` (empty Shortlist), the recommender degrades to cold-start, which is not category-scoped. The gap-fill case that would most benefit from cross-category results always has a non-empty Shortlist, so cold-start is not triggered there.

## Consequences

**+** Simple and fast: a single parameterized SQL query with no vector ops.  
**+** Results feel coherent: recommendations reinforce the Traveller's established taste rather than introducing random novelty.  
**−** Narrow Shortlists get narrow recommendations — the filter amplifies tunnel vision.  
**−** Gap-fill Days may all receive the same category, producing a visually repetitive DayPlan.  
**Risk:** Medium — likely noticed by real users with single-category Shortlists; mitigated by v2 embedding path (ADR-0004 already specifies the infrastructure).

## Alternatives Considered

**Option A — Remove the category filter; score all active Spots by weighted category match.**  
Why not: correct but scales poorly (full table scan weighted by CASE WHEN); also returns low-relevance Spots at the top when the Traveller has strong category preferences, since non-matching Spots fall to the ELSE branch (×0.1) but aren't excluded.

**Option B — Hybrid: category-filtered for top-N, then backfill with cold-start.**  
Why not: correct, but adds query complexity and a merge step for a v1 edge case. The simpler path ships first; the embedding-based v2 supersedes both.

**Option C — Embedding similarity search (v2 path).**  
Why not: correct and cross-category, but requires the embedding pipeline to be populated for all Spots (ADR-0004). The pipeline exists but is not run in the normal API request cycle in v1. Deferred to v2.
