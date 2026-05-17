# ADR 0006: PinnedSpot Model as Day-Spot Relationship Carrier

Status: Accepted (2026-05-17)

## Context

The `pinned_spots` table carries `is_auto_filled BOOLEAN` — tracking whether a Spot was added to a Day by gap-fill (ADR-0003) or manually pinned by the Traveller. The UI must display "자동 추천으로 채움" labels for auto-filled Spots (B5, B1).

Codex cross-model review identified MAJOR 3: `EditDayPlanUseCase` hardcoded `isAutoFilled: false` for all Spots in its response because the `Day` domain model carried `pinnedSpots: Spot[]` — `Spot` has no `isAutoFilled` field. Every edit operation erased the auto-fill metadata persisted in the DB.

Two fix options were evaluated:
- **Option A**: Extend `Spot` with an optional `isAutoFilled?: boolean` field.
- **Option B**: Replace `Spot[]` with `PinnedSpot[]` on `Day`, where `PinnedSpot = { spot: Spot; isAutoFilled: boolean }`.

## Decision

Option B: `PinnedSpot` as a first-class relationship model on `Day`.

```typescript
export interface PinnedSpot {
  readonly spot: Spot;
  readonly isAutoFilled: boolean;
}

class Day {
  private readonly _pinnedSpots: PinnedSpot[];

  pin(spot: Spot, isAutoFilled = false): void { ... }
  get pinnedSpots(): readonly PinnedSpot[] { return this._pinnedSpots; }
}
```

`PostgresDayPlanRepository.findByTripId` reads `is_auto_filled` from the DB and passes it to `day.pin(rowToSpot(pr), pr.is_auto_filled)`.

`EditDayPlanUseCase` now maps `ps.isAutoFilled` from the loaded domain object rather than hardcoding `false`.

`updatePinnedSpots` writes `is_auto_filled = ps.isAutoFilled` in the INSERT — auto-fill status persists through edit round-trips.

## Consequences

**Positive:**
- `isAutoFilled` round-trips correctly through load → edit → save without information loss.
- `Spot` remains a clean shared-content value object with no relationship metadata.
- `PinnedSpot` explicitly represents the Day-Spot relationship — DDD alignment (`context.md`: "Pinning a Spot into a Day does not remove it from the Shortlist; the two references are independent").
- `withDate()` preserves `isAutoFilled` when shifting Trip dates.

**Negative:**
- Cascades to all callers of `day.pinnedSpots`: `ps.spot.id`, `ps.spot.name`, `ps.spot.region` instead of `s.id`, `s.name`, `s.region`.
- ~10 file cascade at implementation time (ScheduleComposer tests, repositories integration tests, use cases).

**Risk:**
- Future properties on the Day-Spot relationship (e.g., `visitedAt`, `userNote`) should be added to `PinnedSpot`, not to `Spot`. This must be documented to prevent future contributors from adding relationship fields to `Spot`.

## Alternatives Considered

**Option A — add `isAutoFilled` to `Spot`:** Rejected.
- `Spot` is shared content: the same Spot appears in multiple Travellers' Shortlists, multiple Days, and multiple Trips. `isAutoFilled` is not a property of the Spot itself — it is a property of a specific Traveller pinning that Spot to a specific Day on a specific Trip.
- Adding it to `Spot` would require per-caller context to set correctly, breaking the shared-content invariant.
- `context.md`: "A Spot can appear in multiple Days across any number of Trips, and simultaneously in a Shortlist — it is shared content, not consumed when pinned."
