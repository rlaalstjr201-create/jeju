# ADR 0002: Trip.dateRange Required with Inferred Default

Status: Accepted (2026-05-17)

## Context

A Trip requires a date range to create a DayPlan — Day objects are identified by `dayIndex` and `date`, both derived from the Trip's `dateRange`. Without a date range, `ScheduleComposer.compose()` cannot produce a DayPlan.

However, users enter trips via free-text ("제주 가요", "이번 주말에") and natural language does not always yield a parseable date range. Two design choices exist: (a) make `dateRange` nullable and defer DayPlan creation, or (b) require `dateRange` and supply an inferred default when parsing fails.

Design principle B2 (Lightweight) forbids asking the user an extra question. Design principle B5 (Non-destructive) requires that any automation be visible and easily corrected.

## Decision

`Trip.dateRange` is required and never nullable (D2). The domain constructor throws `InvalidDateRangeError` when `end < start`.

When natural-language parsing fails to yield a date range, `CreateTripUseCase` applies the default: **next weekend, 1박2일 (KST)**. The response includes `dateInferred: true`. The client must display a prominent banner: inferred date + one-tap edit affordance. No additional question turn is added.

The inferred value is computed relative to the current KST date at request time. CalendarDate is timezone-free (UTC+9 fixed) — no conversion required.

## Consequences

**Positive:**
- Domain model is always valid: a Trip always has a well-formed date range.
- `ScheduleComposer` never receives a null dateRange — no defensive null checks downstream.
- B2 satisfied: zero extra input required from the user.
- B5 satisfied: `dateInferred: true` banner makes the automation visible.

**Negative:**
- The inferred default (next weekend 1박2일) may be wrong ~40% of the time for users with no specific dates in mind. Most will need to tap edit.

**Risk:**
- If the client does not render the `dateInferred` banner, users may not notice the inferred dates. This is a client contract obligation — the API spec makes it explicit.

## Alternatives Considered

**Nullable dateRange:** Rejected.
- Requires every downstream consumer (`ScheduleComposer`, `Day`, `DayPlan`) to handle null — propagates complexity throughout the domain layer.
- Forces a two-step flow (enter trip → separately set dates) contradicting B2.

**Block Trip creation until dates are known:** Rejected.
- Violates B2 (forces user input) and A1 (uncomfortable friction on first interaction).
- The mission explicitly states "no extra question turn" (D2).
