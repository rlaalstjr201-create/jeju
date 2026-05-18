# ADR-0027: HITL 큐레이터 워크플로우 + 구체 도구 진화 단계

Status: Accepted (2026-05-19, 도구 명시 보강)

## Context

v1은 1인 큐레이터가 후보 Spot 200개를 직접 검토한다. 이것이 ADR-0010에서 확립한 큐레이터-thesis의 본업이다. v1부터 자동화를 시도하면 평균 추천으로 회귀하며 ChatGPT 일반 추천과 차별화가 사라진다.

동시에 시스템은 v2~v4 자동화 진입이 가능하도록 설계돼야 한다. ML 표준 패턴(Tesla·Spotify Algotorial·RLHF)은 동일하다: 사람이 라벨링 → 데이터 누적 → AI 점진 자동화. v1 큐레이터 결정 데이터가 v2 학습 데이터가 된다.

2026년 8월 알파 마감까지 약 4개월. 모바일 본체(React Native 풀앱) 작업 시간을 잠식하지 않는 큐레이터 UI가 필요하다. Deep Research 후 OSS 라벨링 도구 비교 완료 (Label Studio·Argilla 2.x·Prodigy).

## Decision

### HITL 진화 4단계 + 구체 도구

| 단계 | 시점 | 라벨링 비율 | 큐레이터 역할 | 도구 | 구축 시간 |
|---|---|---|---|---|---|
| v1 알파 | 2026.8 | 인간 100% | 모든 Spot 직접 판단 | **Label Studio** (Docker 1줄) | 2~3일 |
| v1.5 베타 | 2027 H1 | 인간 100% + LLM 사전 점수 | AI 추정 참조, 판단은 큐레이터 | **Argilla 2.x** | 1주 |
| v2 본격 | 2028 | 인간 20% (경계 케이스) | 경계 Spot만 검토 | **Prodigy** (검토) | 1~2주 |
| v3+ | 2029+ | 인간 5% (메타 결정) | thesis 자체 업데이트 | — | — |

**도구 전환 조건**:
- v1 → v1.5: 라벨 누적 ≥ 1,000건 AND 검토 페이스 ≥ 6건/분 유지
- v1.5 → v2: MAU ≥ 1,000 AND 사용자 이벤트 ≥ 10,000건/월
- AI 자동 사전 거절 도입: LLM-큐레이터 일치율 ≥ 85% 검증 후

**v2 진입 조건 (원안 유지)**: 큐레이터 결정 1,000건 누적 + 거절 사유 분포 분석 + accuracy 측정 도구 구축.

### v1 큐레이터 UI: Label Studio

- **기동**: `docker run -p 8080:8080 heartexlabs/label-studio` (1줄)
- **인터페이스**: Classification 템플릿 — 후보 1개씩 표시 → 거절/보류/승인 + 자유 메모
- **사진**: 비짓제주 `repPhoto.thumbnailpath` 임베드
- **인증**: DevAuthProvider role=curator (ADR-0011 + Stage 8b 가드)와 Label Studio 내부 인증 연동
- **curation_decisions 스키마 연동**: Label Studio webhook → 백엔드 admin API 저장
- **fallback**: Label Studio 연동 어려울 경우 Streamlit 30~50줄 대안 허용

### v3까지 호환되는 curation_decisions 데이터 구조

```sql
curation_decisions (
  candidate_id,
  decided_at,
  decided_by,               -- v1: curator, v2+: ai|curator
  decision,                 -- approve | reject | hold
  curation_score,           -- 승인 시 부여
  rejection_reason_enum,    -- 광고성|뻔함|낮은품질|중복|기타 (ADR-0030)
  rejection_reason_text,    -- 자유 텍스트 1줄 (ADR-0030)
  ai_estimated_score,       -- v2+ 채움, v1엔 null
  ai_estimated_at,          -- v2+ 채움, v1엔 null
  curator_override,         -- v2+ ai_estimated와 다르면 true
  free_memo
)
```

v1에서는 `ai_estimated_*` 컬럼이 비어 있으나 v2 진입 시 해당 컬럼만 채우면 자동 호환된다.

## Consequences

**Positive:**
- v1 thesis 검증 본업 보존. 큐레이터 라벨이 v2 학습 데이터로 자연 축적된다.
- Label Studio Docker 1줄 — 자체 HTML 구현보다 빠르고, v1.5 Argilla 전환 시 학습 곡선 절반.
- 4개월 마감 내 모바일 본체 작업 시간 보호.
- 다중 큐레이터 영입(v1.5) 시 URL 공유만으로 확장 가능.

**Negative / Risk:**
- Label Studio 학습 비용 약 1일. 자체 구현이면 0이나 v1.5 전환 시 폐기 비용 발생.
- Label Studio ↔ curation_decisions 웹훅 연동 추가 작업 필요.
- Apache 2.0 의존 — 단 검증된 글로벌 OSS.

## Alternatives Considered

**자체 미니멀 웹페이지 (원안 A.5):** 기각.
- v1.5 전환 시 폐기 비용. Label Studio가 동일 직관성을 더 빠르게 제공.

**Streamlit:** 보류.
- Label Studio 연동 실패 시 fallback. 30~50줄로 즉시 대체 가능.

**CLI (터미널 인터페이스):** 기각.
- 모바일·카페 환경 사용 불가. 다중 큐레이터 영입 시 재사용 불가.

**RN 풀앱:** 기각.
- 2~3주 소요. 모바일 본체 작업 시간 잠식.

**Prodigy v1 도입:** 기각.
- 5석 최소 구매 $2,450(개인 $390). 1인 큐레이터 v1 단계에 오버스펙.

**v1부터 자동 LLM 큐레이션:** 기각.
- ADR-0010 큐레이터-thesis를 무효화한다. 자동화는 v2 진입 조건 충족 후 점진 도입.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0011: Kakao 로그인 + 큐레이터 role
- ADR-0022: Rejected Candidate Is Not Re-Discoverable
- ADR-0025: 큐레이션 시드 목표 — thesis 정렬 우선, 수량 KPI 없음
- ADR-0030: 거절 사유 → negative dictionary 자동 갱신
- Deep Research 보고서: Label Studio·Argilla 2.x·Prodigy 비교 (2026-05-19)
