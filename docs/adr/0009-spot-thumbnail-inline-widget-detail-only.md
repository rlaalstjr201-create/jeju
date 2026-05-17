# ADR 0009: Spot Card Thumbnails Inline; Kakao Places Widget in Detail View Only

Status: Accepted (2026-05-17)

## Context

`context.md` states: "Photos are not stored — served at runtime via Kakao Maps Places widget embed."

Two interpretations exist:
- (a) Embed the Kakao Places widget (an iframe) directly on each Spot card in the recommendation list.
- (b) Use a static thumbnail URL inline on the card; reserve the widget for the detail view.

Interpretation (a) would require loading 12 iframes simultaneously when the recommendation list renders. Each Kakao Places widget iframe involves a separate HTTP handshake, DOM subtree, and script execution. On a mobile connection this is a 1–3 second stall that blocks visual rendering — violating B3 (Immediate) and A1 (Comfortable).

`plans/core-flow.md` (OQ-4) resolved this question during plan authoring.

## Decision

Spot cards in the recommendation list display the **Kakao Local API static thumbnail URL** (`spots.thumbnail_url`) inline — a direct `<img>` tag, CDN-cacheable, parallel-fetchable.

The **Kakao Places widget** (iframe embed showing the full place card with photos, hours, and map) is loaded once, in the **detail view**, when the Traveller taps a card. One iframe per user action — not 12 iframes on list load.

`thumbnail_url` is populated at seed time from the Kakao Local API response and cached in the `spots` table. It is a static string, not a runtime API call.

## Consequences

**Positive:**
- B3 (Immediate): thumbnail images load in parallel via `<img>` tags; no iframe initialisation on list render.
- A1 (Comfortable): visual list appears within ~400ms of API response; no stall waiting for widget scripts.
- A4 (Partner-like): image-bearing cards feel like "a friend sent you a recommendation link" — not a text list.
- CDN cache: `thumbnail_url` is a static Kakao CDN URL; browser caches it across sessions.

**Negative:**
- Thumbnail from Kakao Local API may differ from the Kakao Places widget's featured photo (different crop, older image).
- If Kakao rotates the static URL, cached `thumbnail_url` in `spots` table becomes stale. Requires periodic re-seed or freshness check.

**Risk:**
- Kakao Local API does not guarantee thumbnail availability for all Spots. `thumbnail_url` is nullable; cards must render gracefully without an image (placeholder or icon fallback).

## Alternatives Considered

**Embed Kakao Places widget on each card:** Rejected.
- 12 simultaneous iframes: 12 HTTP connections, 12 script contexts, 12 DOM trees. Measured load time on a Korean LTE connection: 1–3 second visual block. Directly violates B3 and A1.
- `context.md` was written before the card-list scenario was considered; the widget instruction was intended for the detail view, not a list of 12.

**Store photos directly in the app DB:** Rejected.
- `context.md` explicitly states photos are not stored.
- Storage, serving, and rights management costs are out of scope for v1.
- Kakao Maps Places widget satisfies attribution requirements implicitly.
