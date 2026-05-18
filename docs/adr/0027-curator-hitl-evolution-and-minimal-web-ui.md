# ADR-0027: HITL 큐레이터 워크플로우 + 진화 단계 명시

Status: Superseded (2026-05-19) — superseded by 0027-curator-hitl-evolution-and-tooling.md

> 이 문서는 이력 추적을 위해 보존됩니다. Deep Research 후 Label Studio·Argilla·Prodigy
> 구체 도구가 결정돼 당일 보강·재발행됐습니다.

## Context

v1은 1인 큐레이터가 후보 Spot 200개를 직접 검토한다. 이것이 ADR-0010에서 확립한 큐레이터-thesis의 본업이다. v1부터 자동화를 시도하면 평균 추천으로 회귀하며 ChatGPT 일반 추천과 차별화가 사라진다.

동시에 시스템은 v2~v4 자동화 진입이 가능하도록 설계돼야 한다. ML 표준 패턴(Tesla·Spotify Algotorial·RLHF)은 동일하다: 사람이 라벨링 → 데이터 누적 → AI 점진 자동화. v1 큐레이터 결정 데이터가 v2 학습 데이터가 된다.

2026년 8월 알파 마감까지 약 4개월. 모바일 본체(React Native 풀앱) 작업 시간을 잠식하지 않는 큐레이터 UI가 필요하다.

## Decision

### HITL 진화 4단계

| 단계 | 시점 | 라벨링 비율 | 큐레이터 역할 |
|---|---|---|---|
| v1 | 2026.8 알파 | 인간 100% | 모든 Spot 직접 판단 |
| v2 | 2027 | 인간 80% + AI 제안 20% | AI 추정 검증 |
| v3 | 2028 | 인간 20% (경계 케이스) | 경계 Spot만 검토 |
| v4 | 2029+ | 인간 5% (메타 결정) | thesis 자체 업데이트 |

**v2 진입 조건**: 큐레이터 결정 1000건 누적 + 거절 사유 분포 분석 + accuracy 측정 도구 구축.

### v1 큐레이터 UI: 미니멀 웹페이지

- **URL**: `http://localhost:3000/admin/curate` (production은 도메인 분리)
- **기능**: 후보 1개씩 표시 (사진·메타·trendScore 슬라이스) → 거절/보류/승인 + 자유 메모
- **사진**: 비짓제주 `repPhoto.thumbnailpath` 직접 임베드 (ADR-0024 매트릭스 준수)
- **인증**: DevAuthProvider role=curator (ADR-0011 + Stage 8b 가드)
- **예상 작업 시간**: 2~3일 (백엔드 admin API 일부 기존재)

### v3까지 호환되는 curation_decisions 데이터 구조

```sql
curation_decisions (
  candidate_id,
  decided_at,
  decided_by,           -- v1: curator, v2+: ai|curator
  decision,             -- approve | reject | hold
  curation_score,       -- 승인 시 부여
  rejection_reason,     -- enum (잘못된 카테고리·낮은 품질·중복·기타)
  ai_estimated_score,   -- v2+ 채움, v1엔 null
  ai_estimated_at,      -- v2+ 채움, v1엔 null
  curator_override,     -- v2+ ai_estimated와 다르면 true
  free_memo
)
```

v1에서는 `ai_estimated_*` 컬럼이 비어 있으나, v2 진입 시 해당 컬럼만 채우면 자동 호환된다.

## Consequences

**Positive:**
- v1 thesis 검증 본업 보존. 큐레이터 라벨이 v2 학습 데이터로 자연 축적된다.
- UI는 단순(2~3일)하지만 데이터 구조는 v3까지 진화 가능하다.
- 4개월 마감 내 모바일 본체 작업 시간을 보호한다.
- 다중 큐레이터 영입(v1.5) 시 URL 공유만으로 확장 가능하다.

**Negative / Risk:**
- 모바일 네이티브 UX 미제공. 스와이프 애니메이션 없이 카페에서 핸드폰 브라우저로만 사용 가능하다.
- v1에서 `ai_estimated_*` 컬럼이 dead column. Karpathy 단순함 원칙의 예외 허용 — v2 로드맵이 명시됐고 스키마 마이그레이션 비용이 컬럼 추가보다 크다.

## Alternatives Considered

**A. RN 풀앱:** 기각.
- 2~3주 소요. 모바일 본체 작업 시간을 잠식하며 4개월 마감에 맞지 않는다.

**B. CLI (터미널 인터페이스):** 기각.
- 모바일·카페 환경 사용 불가. 다중 큐레이터 영입 시 재사용 불가.

**C. CSV 워크플로우:** 기각.
- 엑셀 ↔ DB 왕복이 수동 절차로 매주 30분 습관 형성이 어렵다. 이력 추적도 어렵다.

**v1부터 자동 LLM 큐레이션:** 기각.
- ADR-0010 큐레이터-thesis를 무효화한다. 자동화는 v2 진입 조건 충족 후 점진 도입한다.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0011: Kakao 로그인 + 큐레이터 role
- ADR-0022: Rejected Candidate Is Not Re-Discoverable
- ADR-0025: 큐레이션 시드 목표 — thesis 정렬 우선, 수량 KPI 없음
