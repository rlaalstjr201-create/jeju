# ADR 0001: SpotPreferences as Category Distribution Map

Status: Accepted (2026-05-17)

## Context

`plans/core-flow.md` (rev 1) described SpotPreferences as "Shortlist Spot들의 embedding 평균 벡터로 파생" — a dense float vector computed by averaging Spot embeddings. `docs/context.md` defines SpotPreferences as "the distribution of Spot categories it contains … a map from Spot category to frequency weight, e.g. `{ oreum: 0.4, cafe: 0.3, beach: 0.3 }`."

The plan-review agent (gstack, 2026-05-17) flagged this as BLOCKER B1: the two definitions are incompatible. A categorical histogram is not a dense float array. Agent A and Agent F would interpret the spec differently and produce code that cannot interoperate.

`CLAUDE.md` absolute rule: "`context.md` 없이 도메인 entity·용어 추정 금지. context.md만 권위 있음."

## Decision

SpotPreferences = categorical type distribution map `{ category → weight }`, derived on demand from a Traveller's Shortlist. Non-persisted. Never a dense embedding vector.

Concretely: `SpotPreferences.fromShortlist(shortlist)` counts Spot categories and normalises to weights. The Recommender uses these weights to score candidate Spots via a category-weighted SQL query (`curation_score * $weight`).

`spots.embedding VECTOR(1536)` exists as infrastructure for semantic search but is NOT involved in SpotPreferences computation (see ADR-0004).

## Consequences

**Positive:**
- Interpretable: the UI can explain "왜 이 Spot?" by citing the matching category weight.
- No ML infrastructure required in the v1 recommendation path — pure SQL, fast, deterministic.
- Aligns with `context.md` authority; no domain model rewrite needed.
- B1 (Trustworthy): no black-box vector math hidden from the user.

**Negative:**
- Category-only signal has lower semantic precision than embedding similarity (a "cafe" with unique character looks the same as a generic "cafe").
- Recommendations are bounded by the category vocabulary; new category types require re-weighting logic.

**Risk:**
- SpotPreferences is empty when the Shortlist is empty (cold-start). Handled separately: cold-start path uses `ORDER BY curation_score DESC` without category weighting.

## Alternatives Considered

**Option A — embedding vector average (plan rev 1 intent):** Rejected.
- Contradicts `context.md` definition (authoritative). Changing the domain definition would require a Grilling session and context.md revision — scope beyond this plan.
- Requires Spot embedding generation at seed time AND at recommendation time; adds Voyage AI / pgvector dependency to the hot recommendation path.
- Contradicts B1: vector similarity is a black box; the user cannot inspect why a Spot was recommended.

**Hybrid — use both:** Rejected.
- Over-engineering for v1 with ~200 Spots. Category weights already capture the Traveller's taste signal at the granularity the editorial team controls.
- Two weighting signals with unclear merge strategy introduces tuning complexity.
