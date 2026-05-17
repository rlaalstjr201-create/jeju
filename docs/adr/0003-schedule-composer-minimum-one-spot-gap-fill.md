# ADR 0003: ScheduleComposer Minimum 1 Spot + Gap-fill via Recommender

Status: Accepted (2026-05-17)

## Context

`ScheduleComposer.compose(shortlist, trip)` distributes Shortlist Spots into a DayPlan by geographic clustering. When `shortlist.count < trip.dayCount`, some Days have no Spots to assign. Three options exist: (a) reject compose entirely, (b) produce a DayPlan with empty Days, (c) automatically fill gaps via the Recommender.

The system mission B5 (Non-destructive) requires that "automation never overwrites Traveller intent." B2 (Lightweight) requires minimum input and decision burden. The Traveller must be able to see what was auto-added vs. manually chosen (B1 — Trustworthy).

## Decision

Minimum Shortlist size for `compose()` is 1 Spot (D1). Calling `compose()` with an empty Shortlist throws `ShortlistEmptyError`.

When `shortlist.count < trip.dayCount`, `ScheduleComposer` calls `Recommender.recommendForShortlist(context)` once to fill empty Days. Each Recommender-returned Spot that is used as gap-fill is also added to the Traveller's Shortlist with `isAutoFilled = true` (invariant: Shortlist always contains every Spot in the DayPlan).

The API response includes `autoFilledSpotIds: string[]` and each auto-filled Spot carries `isAutoFilled: true`. The UI must label these Spots "자동 추천으로 채움" (B5).

Gap-fill does not guarantee all Days are filled if the Recommender returns insufficient regional diversity (see `docs/adr/0011` ... see ADR on warm recommender limitation).

## Consequences

**Positive:**
- Travellers with few saved Spots still get a complete DayPlan draft, supporting the mission of zero friction.
- B5 satisfied: auto-fill is explicitly labelled; Traveller can unpin auto-filled Spots without penalty.
- The Shortlist-contains-DayPlan invariant means the Traveller always sees all their Spots in one place.
- Recommender is called once (batch), not per-Day — single round trip.

**Negative:**
- Auto-filled Spots appear in the Shortlist without the Traveller explicitly adding them. This can surprise users who return to the Shortlist view.
- Gap-fill is best-effort: a single-category, single-region Shortlist may still produce empty Days.

**Risk:**
- If the Recommender fails or returns no results, Days remain empty — the system does not retry or fall back to cold-start in the gap-fill path.

## Alternatives Considered

**Reject compose if `shortlist.count < dayCount`:** Rejected.
- Forces the Traveller to manually find and add Spots for every Trip day before seeing a DayPlan. Violates B2 and contradicts the "친구 같은 concierge" mission.

**Produce a DayPlan with empty Days (no gap-fill):** Rejected.
- An empty Day in the draft is confusing and unhelpful. The Traveller has no cue about what to do with it.
- Still requires manual action for every empty Day, defeating the purpose of ScheduleComposer.

**Re-invoke Recommender per empty Day:** Rejected.
- N round trips for N empty Days increases latency and hammers the DB.
- A single batch call is sufficient; the Recommender returns up to 12 candidates, enough for most trip lengths.
