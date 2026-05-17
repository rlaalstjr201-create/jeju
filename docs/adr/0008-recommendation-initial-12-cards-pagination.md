# ADR 0008: Recommendation Initial Card Count — 12 with Scroll Pagination

Status: Accepted (2026-05-17)

## Context

`GET /api/v1/trips/:tripId/recommendations` returns ranked Spot cards. The number of cards to return initially affects two competing concerns: B2 (Lightweight — minimum decision burden) and A3 (Genuinely useful — enough choice to build a real itinerary).

The primary trip length target is 2–6 nights. A typical planning heuristic is ~2 Spots per Day: a 4박5일 trip needs ~10 Spots to fill a DayPlan without gap-fill. Cards above this count extend the Traveller's browsing surface without adding decision value per card.

Mobile card grid layouts standardise on 2–4 columns. 12 cards fits a 3×4 grid exactly — one viewport without scroll on most phones.

## Decision

Return **12 cards** on the initial request. Support `?limit=N&offset=M` pagination; each subsequent page returns 8 cards.

API: `GET /api/v1/trips/:tripId/recommendations?limit=12&offset=0`

The `total` field in the response tells the client how many total candidates exist (enabling a "더 보기" CTA if `total > 12`).

## Consequences

**Positive:**
- B2 (Lightweight): 12 is the minimum set covering a 4박5일 trip (2 Spots/day × 5 = 10, plus 2 buffer).
- A1 (Comfortable): fits a single viewport without scroll on a standard mobile screen; Traveller can make a complete selection without scrolling.
- 3×4 grid is a standard mobile card pattern — no custom layout logic required.

**Negative:**
- Power users browsing for a long trip (7박8일) may find 12 initial cards insufficient.
- Pagination requires a second API call for further exploration — adds latency on demand.

**Risk:**
- The Recommender LIMIT is currently hardcoded at 12 in `PostgresRecommenderAdapter`. If `emptyDays.length > 12` during gap-fill, gap-fill will only partially fill Days. The LIMIT is appropriate for the display use case but is reused for gap-fill — these two use cases may diverge. Document this in code.

## Alternatives Considered

**20 cards initial:** Rejected.
- Exceeds one viewport; requires scrolling to assess all options.
- Research on decision fatigue (Barry Schwartz, "Paradox of Choice") supports smaller initial sets. 20 cards likely increases the proportion of Travellers who don't choose any — violating B2.

**8 cards initial:** Rejected.
- Insufficient for a 4박5일 trip: Traveller would immediately need to paginate to find enough Spots.
- Creates a poor first impression — appears limited.

**Infinite scroll / load-on-demand:** Rejected for initial implementation.
- Requires frontend streaming or cursor-based pagination — higher implementation complexity.
- Acceptable as a v2 enhancement if user research shows Travellers want to browse more than ~20 Spots before composing.
