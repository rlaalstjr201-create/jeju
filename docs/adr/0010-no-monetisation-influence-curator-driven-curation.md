# ADR 0010: No Monetisation Influence on Curation; Curator-Thesis Scoring

Status: Accepted (2026-05-17)

## Context

Travel apps commonly inject affiliate-weighted results: higher-commission restaurants appear higher in recommendations; sponsored listings displace curated picks; ad slots reduce visible content. This is the dominant monetisation pattern in the category (Naver Map, Kakao Map, TripAdvisor, Google Maps).

The Jeju project's mission statement directly addresses this: "Monetisation is not a v1 decision criterion. Affiliate fees, ads, and partnerships do not influence feature or design decisions in v1."

Validation criterion A5 (Monetisation-agnostic) is part of the 11-criterion framework with conflict resolution: **B5 > A5 > A1 > A4 > others** — A5 is the second-highest priority.

Office Hours context established that the differentiator for this product is curation trust: "여행을 잘 아는 친구가 옆에 있는 것처럼" — a knowledgeable friend whose recommendations are never influenced by commission. This thesis is the product's reason to exist alongside the 8-app stack.

## Decision

`curationScore` and `popularityScore` on `Spot` are editorial-assigned values. No commercial weighting, affiliate multiplier, or sponsored placement is applied anywhere in the recommendation pipeline.

The warm recommendation query orders by `curation_score * category_weight` — editorial quality × Traveller taste. No revenue signal enters the formula.

ACL adapters (Agoda, Socar, Myrealtip, Kakao) are infrastructure concerns only. Partner brand identifiers do not appear in domain code. Booking deeplinks are stored as opaque strings — the domain does not know or care which partner generated them.

Revenue exploration (affiliate fees, subscription) is explicitly deferred past v1. Any monetisation feature introduced in v2+ must pass A5 review before implementation.

## Consequences

**Positive:**
- A5 satisfied at every layer: domain, application, infrastructure.
- B4 (Honest): curation comments are editorial opinions, not ad copy. Travellers can trust the ranking.
- B1 (Trustworthy): no hidden commercial bias — the recommendation explanation ("this is highly curated + matches your cafe preference") is accurate.
- Competitive differentiation: the 8-app stack is all commercially influenced. Honest curation is the moat.

**Negative:**
- Revenue is deferred. The product must find a monetisation path that does not compromise A5 — harder to design than a simple affiliate layer.
- `curationScore` and `popularityScore` are editorial-assigned with no automated calibration. Editorial workload scales with Spot count.

**Risk:**
- Future pressure to add affiliate weighting must be resisted at the product level. This ADR exists to make that rejection explicit and documented.

## Alternatives Considered

**Affiliate-weighted ranking (commercial bias):** Rejected.
- Directly violates A5 (second-highest priority criterion).
- Undermines the core product thesis: a trusted friend vs. a commission-motivated service counter (A4).
- Would merge this product's recommendation signal with Naver Map and Kakao Map — eliminating the differentiator.

**Sponsored Spot slots (fixed positions):** Rejected.
- Even if disclosed ("협찬"), interrupts the editorial narrative of the recommendation list.
- Violates B4 (Honest) and A4 (Partner-like).

**No curation scores — pure user ratings:** Rejected.
- Jeju-specific curation is the editorial value proposition. Pure user ratings replicate TripAdvisor; no moat.
- Cold-start problem: a new Spot with zero ratings cannot appear in recommendations.
