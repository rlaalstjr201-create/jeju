# ADR-0014: is_auto_filled is a Sticky Flag

**Status:** Accepted  
**Date:** 2026-05-17

## Context

When the ScheduleComposer's gap-fill path runs, it auto-recommends Spots and writes them into the Traveller's Shortlist with `is_auto_filled = true`. This flag drives the "자동 추천으로 채움" UI label (ADR-0003, B1, B5).

The UI label matters for trust: a Traveller who sees it knows the Spot was chosen by the system, not by themselves. Accidentally clearing this flag — say, because the Traveller temporarily removes the Spot and re-adds it — would silently promote a system choice into something that looks like a personal pick, undermining the non-destructive principle (B5).

The persistence concern: `PostgresShortlistRepository.save()` performs a DELETE + UPSERT cycle. If a Spot is removed and re-added in separate API calls, the DELETE removes the row, and the subsequent INSERT cannot recover `is_auto_filled = true` without external input. Within a single save call, a naive `SET is_auto_filled = EXCLUDED.is_auto_filled` upsert could also downgrade `true → false` if the caller passes `false`.

## Decision

`is_auto_filled` is declared **sticky**: once a row is written with `is_auto_filled = true`, no subsequent save operation may revert it to `false`.

Two enforcement layers:

1. **Application layer** — `save()` reads existing `is_auto_filled` values from the DB before writing (`existingMap`). When upserting a Spot that already has `is_auto_filled = true`, it passes `true` regardless of the current `autoFilledSpotIds` argument.

2. **DB layer** — the ON CONFLICT clause uses `GREATEST` to guarantee the DB-level invariant:
   ```sql
   ON CONFLICT (traveller_id, spot_id) DO UPDATE
     SET is_auto_filled = GREATEST(shortlist_spots.is_auto_filled, EXCLUDED.is_auto_filled)
   ```

### Known v1 limitation

Cross-call sticky behaviour (remove via one API call → re-add via another) is **not** preserved in v1. The DELETE removes the row; the subsequent INSERT starts fresh with `is_auto_filled = false` unless `autoFilledSpotIds` includes the Spot again. This is a v1 acceptance: the gap-fill path is only triggered from the Compose flow, and in normal UI usage a Traveller removing a Spot and re-adding it manually is expressing intentional preference (B5 cut both ways). v2 may persist auto-fill metadata independently of Shortlist membership if this edge case becomes a real complaint.

## Consequences

**+** UI label accuracy: the "자동 추천으로 채움" badge stays consistent with the Spot's origin.  
**+** B5 compliance: automation never silently downgrades provenance metadata.  
**+** DB GREATEST guard catches any future code path that accidentally supplies `false`.  
**−** Cross-call remove+re-add loses the flag (v1 limitation, documented above).  
**Risk:** Low — the only caller of `autoFilledSpotIds` is `ComposeDayPlanService`; application-layer guard makes the DB guard redundant in practice, but defense-in-depth is cheap here.

## Alternatives Considered

**Option A — Write `is_auto_filled` on each save unconditionally.**  
Why not: a Traveller removing a Spot and re-adding it would clear the flag silently; the UI label would lie about provenance.

**Option B — Persist auto-fill metadata in a separate table, independent of Shortlist rows.**  
Why not: correct and cross-call durable, but adds schema complexity and a join for a v1 edge case. Deferred to v2.

**Option C — Never allow deletion of auto-filled Spots.**  
Why not: conflicts with B5 (Traveller intent is authoritative); forcing a user to keep an unwanted auto-filled Spot is clearly worse than losing a UI badge on re-add.
