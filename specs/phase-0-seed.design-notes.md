# Phase 0 Seed — 설계 노트

> Claude Code가 이 노트를 입력으로 `specs/phase-0-seed.md` (Light Spec) 작성.
> 이 문서는 **결정·제약·경계**만 담고, spec 본문 작성은 위임.

Inputs: ADR 0023, 0024, 0025, 0026, 0027, 0028, 0029, 0030

---

## 1. 범위 경계

**In**: 후보 자동 수집 → LLM 점수화 → 카카오 검증·dedup → CurationCandidate 적재 → Label Studio 검토 → 승인 Spot embedding 배치.

**Out (v1.5+)**: BC카드/빅데이터_GW, 자동 trend/popularity 산정, 거절 사유 클러스터링, 인스타·유튜브, Argilla 전환, 다중 큐레이터.

## 2. 핵심 결정 (ADR 매핑, 재논의 X)

| 결정 | 출처 |
|---|---|
| 1차 소스 = 비짓제주, Kakao Local은 v2 스텁 | 0023 |
| 4슬롯 (WHAT/WHERE/DISCOVERY/WHY), 7개 어댑터 v2까지 비활성 | 0024 |
| 수량 KPI 없음, thesis 정렬 50개로도 알파 가능 | 0025 |
| 자동 trendScore 폐기, v1 ranking = curation_score 단일 | 0026 |
| Label Studio (Docker 1줄), curation_decisions webhook 연동 | 0027 |
| 승인 후 LLM-augmented embedding 1회 배치, 수동 trigger | 0028 |
| 5단계 파이프라인, long-tail 쿼리 50개 큐레이터 직접 설계 | 0029 |
| rejection_reason_enum/text 컬럼 v1 수집만, 클러스터링은 v1.5 | 0030 |

## 3. 컴포넌트 경계 (이름·책임만)

- `VisitjejuAdapter` — Stage 1 base layer
- `NaverSearchAdapter` — Stage 2 long-tail discovery (블로그+카페)
- `LlmExtractor` — Stage 3 structured 추출 (authenticity/ordinariness)
- `KakaoLocalVerifier` — Stage 4 좌표·실재 검증 (스텁 → 활성)
- `CandidateDeduper` — Stage 5 반경 100m + 좌표 round dedup
- `EmbeddingBatcher` — 승인 후 1회 배치 (raw + LLM 추론 concat → Voyage)
- `LabelStudioBridge` — webhook → curation_decisions 영속화

각 컴포넌트 입출력 타입·내부 구현은 Claude Code가 spec/plan 단계에서 결정.

## 4. 데이터 모델 변경 포인트

- 마이그 **013** 필요:
  - `curation_decisions`: rejection_reason_enum, rejection_reason_text, ai_estimated_score, ai_estimated_at, curator_override
  - `curation_candidates` 신규 테이블
- `spots.trend_score`, `spots.popularity_score`: v1 null 유지 (dead column 허용, 0026)
- `spots.embedding`: 0028 배치로 채움

스키마 컬럼 타입·제약은 Claude Code가 spec/plan에서 확정.

## 5. 외부 의존 (4슬롯)

| 슬롯 | 서비스 | 한도 | 비고 |
|---|---|---|---|
| WHAT/WHERE | 비짓제주 | 확인 필요 (OQ-1) | 메타+좌표+사진 1엔드포인트 |
| DISCOVERY | 네이버 블로그·카페 검색 | 25,000/일 (합산? OQ-1) | 합법 OpenAPI |
| WHY 보조 | Claude API | 표준 | structured output |
| 검증 | 카카오 로컬 | 100,000/일 | v1 활성 (이전 스텁) |
| 임베딩 | Voyage AI | 표준 | 0028, ~$3 |

## 6. 제약 / 원칙

- **수동 trigger only** (ADR-0017). cron 금지.
- **수량 KPI 없음** (ADR-0025). reject 적극 사용.
- **rejected 재발굴 X** (ADR-0022).
- **자동 점수가 ranking 결정 X**. LLM 사전 점수는 큐레이터 참고용 (ADR-0026, 0029).
- **dead column 허용** — v2 로드맵 명시된 경우만 (ADR-0027, 0030).

## 7. 도구·스킬 매핑 (Claude Code 작업 시)

| 작업 | 사용 스킬/도구 |
|---|---|
| 워크플로우 단계 진행 (Light Spec → Plan → Build) | **superpowers / gstack** |
| TS 어댑터·타입 (VisitjejuAdapter, NaverSearchAdapter 등) | **Matt Pocock TS skills** |
| LLM structured 추출 (Pydantic) | Anthropic SDK 표준 (별도 스킬 없음) |
| 마이그 013 작성·적용 | 기존 마이그 008~012 패턴 따름 |
| 테스트 (245건 누적 라인) | superpowers test 단계 |
| 자율 루프 (테스트 통과·타입 에러 픽스·DDD 스캐폴딩) | **Claude Code `/goal`** (v2.1.139+) |

`/goal`은 Spec/Plan/Domain 결정에는 쓰지 말 것 — 대화 필요.

## 8. Open Questions (Plan 진입 전 해소)

- **OQ-1**: 네이버 블로그·카페 검색 25,000/일이 합산인지 각각인지 — Stage 2 구현 전 실측
- **OQ-2**: LLM 진정성/뻔함 점수 prompt — 별도 ADR로 분리? (설계자 결정 필요)
- **OQ-3**: Label Studio webhook → curation_decisions 매핑 위치 (admin API 확장 vs 별도 서비스)
- **OQ-4**: long-tail 쿼리 50개 저장 위치 (config JSON vs DB 테이블)
- **OQ-5**: Stage 4 카카오 미매칭 시 처리 (drop vs hold-for-curator)
- **OQ-6**: 마이그 013 시점 (Light Spec 승인 직후 vs Plan 단계)

## 9. Claude Code에게 — Light Spec 작성 가이드

1. 본 노트의 결정 8개(섹션 2)는 **재논의 금지**. spec에 그대로 반영.
2. 컴포넌트 7개(섹션 3)의 입출력 타입을 spec에서 정의.
3. 마이그 013 스키마를 spec에 SQL로 명시 (컬럼 타입·NULL·default).
4. 5단계 파이프라인을 spec에 stage 표 + 데이터 흐름 다이어그램으로 표현.
5. Acceptance criteria: 수량 KPI 없음, 검토 페이스 측정, 거절 사유 분포 기록.
6. Open Questions 6개는 spec 말미에 그대로 포함 (Plan에서 해소).
