# ADR-0018: External Trend Data Sources via Anti-Corruption Layer

**Status:** Accepted  
**Date:** 2026-05-18

## Context

Computing `popularityScore` and `trendScore` on Spots requires data from multiple Korean public and commercial sources:

| Source | Provider | Data |
|--------|----------|------|
| `data.ijto.or.kr` | 제주관광공사 빅데이터 | 이동통신 혼잡도, 내비 차량 분포, 카드매출 TOP15, 도민 vs 관광객 인기 장소, 슬로우로드 |
| `datalab.visitkorea.or.kr` | 한국관광 데이터랩 | SNS 언급량·키워드 트렌드, AI See |
| Kakao Map API | Kakao Corp | 평점, 리뷰 수 |

Each source has its own authentication scheme, schema, rate limits, update cadence, and failure modes. Allowing these raw external schemas to leak into domain code would:
1. Couple domain ranking logic to provider-specific field names and formats.
2. Make provider swaps or additions require domain changes.
3. Force every piece of domain code that reads trend data to understand multiple external contracts simultaneously.

## Decision

Each external data source is wrapped in a dedicated ACL (Anti-Corruption Layer) adapter in the infrastructure layer. The domain never imports external schemas.

The ACL boundary:
- **Infrastructure side**: `IJTOAdapter`, `VisitKoreaAdapter`, `KakaoMapRatingAdapter` — each implements a `TrendSourcePort` interface.
- **Domain side**: only receives normalised `TrendSignal { spotId: string, popularitySignal: number, trendSignal: number, fetchedAt: CalendarDate }` payloads.

`TrendSource` appears in `docs/context.md` as a domain vocabulary term to name the concept, but its implementations are infrastructure-only. Domain code references `TrendSourcePort`, not concrete adapters.

This follows the same ACL pattern established for Booking partners (`AgodaAdapter`, `SocarAdapter`) and the Kakao auth provider (`KakaoAuthAdapter`).

## Consequences

**+** Provider swap (e.g. replacing IJTO with a new public API) is contained to one adapter.  
**+** Domain ranking tests use `TrendSignal` stubs — no HTTP mocking required.  
**+** Saturation threshold logic (D-CUR-6) lives in domain code against normalised signals.  
**+** Adding a new source (e.g. Naver Place reviews) requires only a new adapter, not domain changes.  
**−** Each adapter requires its own fetch → normalise → persist pipeline. Three adapters = three fetch/caching concerns. Rate limit and caching strategies deferred to Plan stage (OQ-CUR-4).  
**Risk:** Normalisation formula for `popularitySignal` from heterogeneous sources (card sales units vs. mobility counts vs. review counts) is non-trivial. An incorrect normalisation silently produces wrong rankings. Mitigation: each adapter's normalised output is logged; formula is an OQ (OQ-CUR-1) to be resolved in Plan.

## Alternatives Considered

**Option A — Direct domain access to external APIs.**  
Why not: couples domain logic to multiple external schemas; any provider change cascades through ranking code; impossible to test domain without live external calls.

**Option B — Single unified external data service (one adapter for all sources).**  
Why not: a single adapter that understands IJTO + visitkorea + Kakao Map simultaneously becomes a god-object. Provider-specific error handling, authentication, and data cadence differ enough to warrant separation.

**Option C — Materialise all trend data into a single `spot_scores` table and update nightly.**  
Why not: correct approach for caching, but the table schema and population strategy belong in Plan, not this ADR. This ADR governs the ACL boundary; caching is an implementation detail of the adapter layer.
