# Office Hours — Jeju Travel All-in-One

YC-style forcing-question session. 6 questions (D1–D6). Completed 2026-05-17.

---

## D1 — Why are you building this?

**Verdict:** Supply-push, honest.

Myrealtrip exists but five gaps make it insufficient for the Jeju-depth use case:
1. Generic inventory, not curated — no editorial voice
2. Affiliate logic shapes what surfaces (commission > fit)
3. No contextual DayPlan builder — users copy-paste from blogs
4. No Shortlist → DayPlan flow — curation and scheduling are disconnected
5. No spontaneous Now Mode — useless once you're already in Jeju

The honest motivation: learning the full Uber GO-GET pattern by building a real version of it, domain-first.

---

## D2 — What does the real workflow look like today?

**Verdict:** Skyscanner → Booking → ChatGPT → NMap. Two user segments identified.

**Actual pre-trip stack (5–8 apps):**
- Skyscanner / Jeju Air — flights
- Booking.com / Yeogi — accommodation
- ChatGPT — "제주 3박4일 일정 짜줘"
- Naver Map — navigation + reviews
- Myrealtrip — activity booking
- Kakao T — ground transport
- Weather app — packing

**Two segments:**

| Segment | Behaviour | Core job |
|---------|-----------|----------|
| **Planner** | Builds detailed itinerary weeks ahead; heavy Naver/blog research | Reduce research time |
| **Tagalong** | Dragged along; zero ownership; relies on whoever planned | Reduce overwhelm, give agency |

**Key insight:** Shortlist is the output of the Recommender's first pass, not manual curation. Most users start with a generic ChatGPT dump, not a curated list.

---

## D3 — Who is the sharpest user?

**Verdict:** 가족여행에 끌려가는 30대 (Tagalong persona).

**Persona:** 30대, dragged into a family trip, has preferences but no ownership of the plan. Not the planner. Wants to feel like a participant, not a passenger.

**Entry point:** ChatGPT "제주 3박4일 일정 짜줘" — this is the real competitor's UI. The app must require ≤ one line of input on first screen to be competitive.

**Job-to-be-done:** "내가 가고 싶은 곳을 조용히 찜해두고, 일정에 반영되는 경험."

---

## D4 — What is the narrowest wedge?

**Verdict:** Narrowest wedge is NOT the goal. Full domain, simplified entry.

This project is a 4-month learning/build exercise, not a pre-seed startup seeking PMF validation. The full Uber GO-GET vision applies:
- Uber started with "black car on demand" — seemed narrow
- GO-GET logic required the full platform to be worth building
- Jeju version: full domain (Trip, DayPlan, Shortlist, Recommender, ScheduleComposer, Now Mode) from day one

**Rule:** Do not cut the domain to fit a wedge. The entry UX is simplified (Tagalong); the domain stays complete.

---

## D5 — What did you learn from testing?

**Verdict:** ChatGPT is the real competitor. Seven gaps confirmed.

**ChatGPT test:** "제주 3박4일 일정 짜줘"
- Output is a wall of text — "눈에 들어오지 않음"
- No photos, no map context, no deepLink to book
- Recommendations are algorithmically generic (성산일출봉 every time)
- No Shortlist concept — users can't curate before generating
- No DayPlan editing — output is read-only
- No Now Mode — useless in Jeju
- No context across trips — every query starts cold

**Seven gaps confirmed:**
1. Visual: text output vs map-first with photos
2. Curation: generic vs editorial voice
3. Editing: read-only vs DayPlan that Traveller controls
4. Shortlist: absent vs staging area before composing
5. Booking: out-of-scope vs deepLink integration
6. Now Mode: absent vs GPS-triggered spontaneous recommendation
7. Context: stateless vs Trip/Traveller persistence

**Domain model validation from D5:**
- curationScore is the primary differentiator signal (not star rating, not review count)
- popularityScore needs saturation/cliché penalty (성산일출봉 should rank lower for travellers who've been before, or when it dominates the plan)

**Domain additions flagged for Light Spec:**
- `saturationPenalty` — Recommender weighting to avoid cliché stacking
- Cold-start fallback — empty Shortlist → curationScore-only ranking
- `negativeSignal` — meta-intent in RecommendationContext ("유명한 데 말고")
- Discovery UX without keywords — Tinder-style card swipe as alternative entry

---

## D6 — Future-fit thesis?

**Verdict:** Jeju super-app. Position is unclaimed.

In a world where users want one purpose-specific entry point per context:
- ChatGPT: too generic, no visual layer, no booking, no map
- Myrealtrip: inventory/booking focused, no curation depth, no DayPlan
- Naver Map: navigation, not trip planning
- **Jeju All-in-One:** Jeju-specific, curated, deepLink-integrated, DayPlan-first

Lock-in mechanism (Uber analogy):
- Uber: convenience lock-in (one app vs. calling a cab)
- Jeju app: context lock-in (Shortlist + DayPlan + Bookings all in one place — switching cost = losing your plan)

Monetization deferred entirely from v1. Revenue logic must not shape feature or design decisions (criterion A5).

---

## Key outputs

| Item | Decision |
|------|----------|
| Primary persona | Tagalong — 가족여행에 끌려가는 30대 |
| Real competitor | ChatGPT (not Myrealtrip) |
| Core differentiator | 입력 없이 작동하는 추천 + 진부함 회피 + deepLink 통합 |
| UX principle | First screen ≤ ChatGPT input (one line) |
| Scope | Full domain; simplified entry UX |
| Monetization | Deferred entirely from v1 |

---

## Domain additions flagged for Light Spec

- `saturationPenalty` on Recommender (cliché avoidance)
- Cold-start policy: empty Shortlist → curationScore-only fallback
- `negativeSignal` field on RecommendationContext
- Discovery UX: keyword-free card-swipe alternative
- Full Spot type taxonomy
- Score field ranges and computation methods
- TripPhase transition triggers (date-based / GPS / manual)
- DayPlan unvisited Spot end-of-day policy

---

## Next step

Light Spec stage → `specs/<feature>.md`

Candidate first feature: **Shortlist + ScheduleComposer flow** (core value loop: curate → compose → DayPlan draft).
