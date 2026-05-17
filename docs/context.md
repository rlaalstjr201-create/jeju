# Jeju Travel All-in-One

A single-context app covering the entirety of a short-stay Jeju trip — from arrival to departure — replacing the 8-app stack most travellers currently use. Value is in curation and context, not inventory or payments.

## Mission

**"제주에서 머무는 시간을 돌려드린다. 여행을 잘 아는 친구가 옆에 있는 것처럼."**

Monetisation is not a v1 decision criterion. Affiliate fees, ads, and partnerships do not influence feature or design decisions in v1.

### Validation criteria

When evaluating any feature, design decision, or scope call, apply these 11 criteria. Conflict resolution order: **B5 > A5 > A1 > A4 > others**.

| ID | Criterion | Description |
|----|-----------|-------------|
| A1 | Comfortable | Is the user at ease? No friction, no overwhelm. |
| A2 | Smart | Does the app understand the user? Contextual, not generic. |
| A3 | Genuinely useful | Does it actually help with the trip? Not just pretty. |
| A4 | Partner-like | Feels like a knowledgeable friend, not a service counter. |
| A5 | Monetisation-agnostic | Revenue logic does not shape the experience. |
| B1 | Trustworthy | No hallucination, sourced claims, fresh information. |
| B2 | Lightweight | Minimum input required, minimum decision burden. |
| B3 | Immediate | Now, here, fast. Latency and friction both count. |
| B4 | Honest | No ad-copy tone. Real curation, real opinions. |
| B5 | Non-destructive | Automation never overwrites Traveller intent. |
| B6 | Familiar | Respects Korean user patterns (찜하기, 카카오, etc.). |

## Language

### Core structure

**Traveller**:
The person who uses the app. Always an authenticated account holder (Kakao social login); no guest mode. Owns a Shortlist and zero or more Trips. The domain-layer term for the human actor; distinct from the authentication-layer `User` (account credential holder).
_Avoid_: User (in domain code), member, customer, visitor, guest

**Trip**:
A Jeju visit with a fixed date range owned by one Traveller. The top-level container for a DayPlan and zero or more Bookings. Duration is variable (day-trip to 1+ weeks); 2–6 nights is the primary target but is a default, not an invariant. No hard duration validation beyond rejecting negative or physically impossible values.
_Avoid_: Journey, session, vacation, travel

**DayPlan**:
The day-by-day Spot grouping inside a Trip. Contains one Day per calendar date in the Trip's date range. No time slots — Spots within a Day are ordered but not time-assigned. Replaces the deprecated `Schedule` concept.
_Avoid_: Schedule, itinerary, plan, timetable

**Day**:
A first-class citizen within a DayPlan, identified by `dayIndex` (1, 2, 3, …) with an associated `date: CalendarDate`. Holds an ordered list of Spots (`pinnedSpots`). Spots are added via `pin(spot)` and removed via `unpin(spot)`. Order implies a loose visiting sequence; no time constraints are enforced.
When Trip dates shift, `dayIndex` is preserved and `date` is updated — `pinnedSpots` follow the index, not the calendar date.
When a Trip is shortened, the Traveller is warned ("Day N's M pinned Spots will be removed"); on confirmation those Days are unpinned and removed; on refusal the shortening is cancelled.
_Avoid_: Slot, block, period, time-block

**Spot**:
The atomic content unit — any place a Traveller can go or thing they can do in Jeju (restaurant, beach, attraction, activity provider, accommodation). Lives in a self-curated database; metadata (name, coordinates, hours) seeded from Kakao Local API, category/tags and curation comments (1–2 lines, Korean) assigned by the editorial team. Carries `curationScore` and `popularityScore` (both editorial-assigned). Photos are not stored — served at runtime via Kakao Maps Places widget embed. "Hidden Gem" is a UI label (high curation, low popularity) — not a domain type.
_Avoid_: Place, venue, location, experience, activity (as standalone nouns), HiddenGem (as a type)

**Booking**:
A time-ranged external reservation link belonging to a Trip. Shape: `{ type, deepLink, timeRange }`. No status machine — the domain does not track whether the reservation was confirmed; that is the Traveller's responsibility. Partner brands are ACL-layer concerns only. Webhook/status tracking deferred to v2.
_Avoid_: Reservation, purchase, order

**Shortlist**:
A Traveller-owned collection of Spots with no date assignment. Operates independently of any Trip. Serves as the staging area before Spots are distributed into a DayPlan. Rendered as "찜하기" in the UI; the domain term is always Shortlist.
_Avoid_: Wishlist, saved items, favourites, bookmarks, 찜 (in code)

### Value objects

**CalendarDate**:
A timezone-free date (`YYYY-MM-DD`) fixed to KST (UTC+9). No timezone conversion anywhere in the system. Used as the `date` field on Day and the time range boundaries on Booking.
_Avoid_: DateTime, timestamp, UTC date

**Region**:
A value object on Spot that classifies its geographic area within Jeju. Values: `jeju-city | eastern | seogwipo | western | hallasan`. Outlying islands (Udo, Gapado, Marado) are temporarily classified under `eastern` or `western` in v1; an `islets` value may be added in Light Spec. Used by ScheduleComposer for Day clustering.
_Avoid_: District, zone, area, 지역 (in code)

**priceRange**:
A value on Spot indicating rough cost tier: `free | budget | mid | premium`. No exact monetary values stored. No `Money` type in the domain — affiliate deepLink model means no payments are processed.
_Avoid_: Money, Price, cost, fare

### Lifecycle

**TripPhase**:
The lifecycle state of a Trip: `planning` (before departure), `active` (currently in Jeju), or `completed` (after return). Governs which features are foregrounded — curation and DayPlan building in `planning`, spontaneous recommendation in `active`. Transition triggers (date-based, GPS, manual) are deferred to Light Spec.
_Avoid_: TripStatus, TripState, TripMode

### Discovery & recommendation

**SpotPreferences**:
A derived, non-persisted value computed on demand from a Traveller's Shortlist — specifically the distribution of Spot types it contains. The sole taste signal in v1; no separate input step. Consumed by the Recommender; never stored as a separate entity.
_Avoid_: TasteProfile (implies persistence), UserPreferences, interests

**RecommendationContext**:
A value object capturing the inputs to a recommendation call. In v1 (`recommendForShortlist`): Traveller + Trip metadata. In v2 (`recommendNow`): Traveller + current GPS coordinates + remaining time. The Recommender accepts a RecommendationContext and returns ranked Spots.
_Avoid_: RecommendationRequest, RecommendationInput

**Recommender**:
A domain service that ranks and surfaces Spots. Two operations, scoped by version:
- v1 — `recommendForShortlist(context)`: supplements a Traveller's Shortlist with curated Spots when the ScheduleComposer needs more content to fill a DayPlan.
- v2 — `recommendNow(context)`: surfaces immediately relevant nearby Spots based on GPS and remaining time (Now Mode).
Both operations share the same service; v2 adds a new call, not a new service.
_Avoid_: RecommendationEngine, SuggestionService, ConciergeService

**ScheduleComposer**:
A domain service invoked explicitly by the Traveller to distribute Spots from a Shortlist into a DayPlan draft via geographic clustering. Returns a proposed DayPlan for the Traveller to accept or modify — does not auto-apply. Does not assign times, check conflicts, or reorder based on travel duration. DayPlan authority always stays with the Traveller.
Re-invocation behaviour: if the existing DayPlan has no manually pinned Spots, generates immediately; if manual pins exist, asks "keep existing layout and fill empty Days only, or rebuild from scratch?" — executes Fill-empty-only or Replace accordingly.
Signature: `compose(shortlist, trip) → DayPlan`
_Avoid_: Scheduler, Planner, Optimizer, TripPlanner

**Now Mode**:
A GPS-triggered entry point (v2) that activates the `recommendNow` operation on the Recommender. Requires only that `isInJeju(gps)` is true — independent of TripPhase and Trip existence. A Traveller with no active Trip (or no Trip at all) can still enter Now Mode. The v1 design exposes the interface; the implementation ships in v2.
_Avoid_: Explore mode, nearby mode, live mode

## Relationships

- A **Traveller** owns one **Shortlist** and zero or more **Trips**
- A **Trip** contains one **DayPlan** and zero or more **Bookings**, and has a **TripPhase**
- A **DayPlan** contains one **Day** per calendar date in the Trip's date range
- A **Day** contains zero or more **Spots** in order (no time slots)
- A **Shortlist** belongs to a **Traveller**, not to a **Trip** — it persists across trips
- A **Booking** belongs to exactly one **Trip** and has a time range
- A **Spot** can appear in multiple **Days** across any number of **Trips**, and simultaneously in a **Shortlist** — it is shared content, not consumed when pinned
- Pinning a **Spot** into a **Day** does not remove it from the **Shortlist**; the two references are independent
- **ScheduleComposer** reads a **Shortlist** (and optionally calls **Recommender**) to populate a **DayPlan**
- **Recommender** consumes a **RecommendationContext** (derived from **SpotPreferences** + trip/GPS data) and returns ranked **Spots**

## Example dialogue

> **Dev:** "When a Traveller saves a restaurant before booking their trip, where does it go?"
> **Domain expert:** "Into their Shortlist — no Trip needed yet."

> **Dev:** "And when they build their DayPlan, the ScheduleComposer takes those Shortlist Spots and groups them by day?"
> **Domain expert:** "Yes — it clusters by location. Day 1 gets the eastern spots, Day 2 gets Seogwipo. No times assigned."

> **Dev:** "What if the Shortlist only has three Spots for a four-day trip?"
> **Domain expert:** "ScheduleComposer calls Recommender to fill the gaps. Same service, `recommendForShortlist`."

> **Dev:** "Is Now Mode part of the DayPlan flow?"
> **Domain expert:** "No — it's parallel. GPS triggers it; Recommender handles it via `recommendNow` in v2. DayPlan is untouched."

## Flagged ambiguities

- **Shortlist name resolved**: domain code uses `Shortlist`; UI renders "찜하기".
- **UI language resolved**: Korean-only for MVP. No i18n layer. v2 foreign-traveller target deferred.
- **Identifier policy resolved**: translate to English when a precise single English word exists; otherwise use romanised Korean (e.g. `oreum`, `haenyeo-experience`, `olle-trail`).
- **Spot type taxonomy incomplete**: `beach | restaurant | activity | accommodation | oreum | …` — full list deferred to Light Spec.
- **Score calculation deferred**: `curationScore` and `popularityScore` field ranges and computation methods deferred to Light Spec.
- **Single context confirmed**: one `docs/context.md`. External partner isolation via ACL, not context boundaries.
- **ACL modules (infrastructure only)**: `AgodaAdapter`, `SocarAdapter`, `MyrealtripAdapter`, `KakaoMapAdapter`, `KMAAdapter`. Partner brands do not appear in domain code.
- **Spot seeding method open**: target ~200 curated Spots for launch. Collection approach deferred to Plan stage.
- **"Concierge" resolved**: UI/marketing label only. Does not appear in domain code. Covered functionally by Recommender + ScheduleComposer + Now Mode.
- **Editor/Curator resolved**: no domain entity. Spot curation is a content-operations concern handled in the admin panel (infrastructure). The domain only sees the resulting Spot fields.
- **Spot search resolved**: infrastructure only (`SpotRepository.search`). No domain service. Search indexing, text matching, and filtering are infrastructure concerns.
- **DayPlan incomplete-spot policy**: what happens to unvisited Spots at end of day (carry over? stay in DayPlan?) deferred to Light Spec.
- **TripPhase transition triggers**: date-based vs GPS vs manual activation deferred to Light Spec.

## Deprecated (do not use)

- **Schedule** — replaced by `DayPlan`
- **ScheduleRewriter** — dropped; natural-language restructuring out of v1 scope
- **Time-slot assignment** — DayPlan is intentionally time-free
- **Conflict detection / auto-reorder** — out of scope
