# ADR-0017: Two-Track Recommendation — Curated vs Popular (Spotify Algotorial Pattern)

**Status:** Accepted  
**Date:** 2026-05-18

## Context

The v1 Recommender returned a single merged ranked list (`Spot[]`), scored by `curationScore` weighted toward the Traveller's category preferences. As the curation pipeline matures, two fundamentally different quality signals need to coexist without distorting each other:

1. **Editorial signal** (`curationScore`): The curator's personal, thesis-quality judgment. This is the app's core value proposition — a trusted human voice. It must never be diluted by crowdsource metrics.
2. **Popularity signal** (`popularityScore` + `trendScore`): Public data (card sales, mobility heatmaps, SNS mentions). Useful for Tagalong-type travellers who want social proof, but noise for hardcore travellers who explicitly want to avoid tourist traps.

Three design options were evaluated:

**M1 — Weighted blending**: a single score `α·curationScore + β·popularityScore + γ·trendScore`. Simple, but α/β/γ are arbitrary and will be tuned under commercial pressure. Academic research on popularity bias (Mansoury et al., 2020; Deldjoo et al., 2021) shows that blended systems disproportionately amplify already-popular items, suppressing discovery of genuinely curated content.

**M2 — Two separate tracks** (chosen): `curatedPicks` and `popularSpots` returned as distinct `RecommendationSection`s. The consumer (UI, ScheduleComposer) decides how to present or use each track. Inspired by Spotify's "Algotorial" model where human-curated playlists and algorithmic feeds are surfaced separately and deliberately.

**M3 — User preference filter**: show only one track based on explicit user toggle. Simpler but loses the complementary value — a Tagalong may still want to discover hidden gems even if their default is social proof.

## Decision

The `Recommender` interface returns `RecommendationResult { curatedPicks: RecommendationSection, popularSpots: RecommendationSection }` for all operations. The two tracks are never merged in the domain layer.

- `curatedPicks`: ranked by `curationScore`, filtered to SpotPreferences categories. Saturation-immune — the curator's judgment is not overridden by foot-traffic data.
- `popularSpots`: ranked by a composite of `popularityScore` + `trendScore`, weighted by the Traveller's `CalibrationProfile` ratio. Spots exceeding saturation thresholds (혼잡도, TOP15 카드매출) are down-ranked within this track (D-CUR-6).

The `CalibrationProfile` controls how many spots from each track surface, not whether tracks exist. Both tracks are always computed.

## Consequences

**+** Editorial integrity: `curationScore` is never contaminated by popularity metrics.  
**+** Traveller autonomy: a slider or preference signal adjusts the mix without hiding either track entirely (B5, A4).  
**+** Testable independently: each track has its own ranking logic, unit-testable in isolation.  
**+** Evolvable: v2 can add a third track (e.g. "nearby now") without restructuring the existing two.  
**−** ScheduleComposer must decide how to use two tracks when filling gaps — it receives a `RecommendationResult`, not a flat `Spot[]`. This is a breaking interface change from v1.  
**−** UI must display two labelled sections rather than one sorted list — more layout complexity.  
**Risk:** If `CalibrationProfile` defaults are wrong, one track may be invisible in practice. Mitigation: default to balanced 50:50 in v1 until persona data informs calibration (OQ-CUR-1).

## Alternatives Considered

**M1 — Weighted blending.**  
Why not: arbitrary weight tuning under commercial pressure. Popularity bias amplification documented in academic literature. Curator signal would erode as popularity data volume grows.

**M3 — Single-track toggle.**  
Why not: loses complementary value; forces a binary choice where the Tagalong may want both; worse for ScheduleComposer which benefits from a richer candidate pool.
