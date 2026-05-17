# ADR 0004: Spot Embedding for Semantic Search Infrastructure Only (v1 Unused in Recommendation)

Status: Accepted (2026-05-17)

## Context

The `spots` table carries `embedding VECTOR(1536)`. The plan-review agent flagged this as BLOCKER B1/MAJOR B4: it was unclear whether this embedding was (a) the basis for SpotPreferences computation, (b) used in the v1 recommendation warm path, or (c) infrastructure reserved for future use.

Resolving this required alignment with ADR-0001 (SpotPreferences = category distribution, not embedding vector). If SpotPreferences is a categorical histogram, the embedding column serves a different purpose.

Agent E (Spot seed pipeline) needed a clear scope: does it generate embeddings for recommendation, or for future semantic search?

## Decision

`spots.embedding VECTOR(1536)` is populated at seed time via batch using **Voyage AI voyage-3** (1536-dimensional embeddings of Spot name + category + curation comment text). This column is infrastructure preparation for future semantic similarity search (e.g., `ORDER BY embedding <=> $query_vector`).

In v1:
- The embedding column is **NOT** used in `recommendForShortlist` — the warm path uses category-weighted SQL (ADR-0001).
- The embedding column is **NOT** used in `SpotPreferences` computation.
- The embedding column is **NOT** used in the cold-start path — `ORDER BY curation_score DESC` only.

The column exists so that v2 semantic search can be activated without a schema migration.

## Consequences

**Positive:**
- v1 recommendation path is deterministic and fast — pure SQL, no vector math.
- v2 semantic search requires zero schema migration; the infrastructure is already seeded.
- Agent E scope is clear: Kakao Local API collection + Voyage AI batch embedding → `spots.embedding`.

**Negative:**
- ~200 embedding generation API calls at seed time (Voyage AI cost).
- The column occupies disk space without being read in v1.

**Risk:**
- If the Voyage AI embedding model changes between v1 seed and v2 activation, embeddings may need to be regenerated. Document the model version used at seed time.

## Alternatives Considered

**Use embedding for SpotPreferences (plan rev 1 intent — Option A):** Rejected.
- Contradicts `context.md` (ADR-0001). The domain definition of SpotPreferences is categorical, not vectorial.
- Requires real-time embedding generation at recommendation time (latency hit); or pre-computation of a "preference vector" that is stored — adding a new persisted entity contradicting the non-persisted nature of SpotPreferences.

**Skip embedding column entirely in v1:** Rejected.
- Defers a schema migration to v2. Adding a VECTOR column to a table with 200+ rows after-the-fact requires pgvector `CREATE INDEX` rebuild — low risk for 200 rows but sets a bad precedent.
- The seed pipeline's marginal cost for generating embeddings is low.
