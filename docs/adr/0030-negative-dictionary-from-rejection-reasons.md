# ADR-0030: 거절 사유 → negative dictionary 자동 갱신

Status: Accepted (2026-05-19)

## Context

ADR-0027에서 v1.5 진화 단계에 "거절 사유 분포 분석 + accuracy 측정 도구"가 명시됐다. 본 ADR은 그 구체 메커니즘을 결정한다.

v1 큐레이터(너)가 매일 후보를 검토하며 쌓는 거절 사유는 thesis의 진짜 신호다 — "왜 이게 hidden gem이 아닌지"를 반복 기록하면 thesis가 자동으로 sharpening된다. 본격 RLHF(reward model fine-tuning)는 1인 프로젝트에 오버엔지니어링이나, 가벼운 negative dictionary 패턴으로 동일 효과를 낼 수 있다.

메커니즘: 거절 사유 자유 텍스트 → Voyage 임베딩 → DBSCAN 클러스터링 → 다음 배치 prompt에 few-shot 주입.

## Decision

**v1부터 거절 사유 데이터 수집 (v1.5에서 활성)**

### v1: 데이터 수집만

`curation_decisions` 테이블에 다음 컬럼 추가 (ADR-0027 스키마 확장):

```sql
rejection_reason_enum  TEXT,  -- 광고성|뻔함|낮은품질|중복|기타 (거절 시 1개 선택)
rejection_reason_text  TEXT,  -- 자유 텍스트 1줄 (의무 X, 권장)
```

v1에서는 두 필드 모두 저장만 하고 처리 로직 없음.

### v1.5 진입 시 활성

```
주간 cron:
  1. rejection_reason_text 누적 → Voyage AI embedding 생성
  2. DBSCAN 클러스터링 (min_samples=3, eps 조정 필요)
  3. 각 클러스터 → 1줄 요약 (Claude API)
  4. 결과를 Phase 0 배치 LLM prompt에 few-shot으로 주입:
     예: "다음 패턴은 거절 대상입니다: [cluster 요약 3개]"
  5. 큐레이터 UI에 "이번 주 새 negative pattern" 표시

v1.5 진입 조건 (ADR-0027 기준):
  - 라벨 ≥ 1,000건 누적
  - 검토 페이스 ≥ 6건/분 유지
```

**부가 옵션 (v1.5 시점 선택)**:
- 주간 거절 사유 상위 3개를 1줄로 공개 (큐레이션 일지 포맷) → thesis 투명성 + PR 자산

## Consequences

**Positive:**
- fine-tuning 없이 RLHF 가벼운 버전 구현 — prompt context 갱신만으로 thesis sharpening.
- v1.5 진입 시 데이터 이미 누적돼 즉시 작동.
- 큐레이터 자유 텍스트가 제품 자산으로 전환.

**Negative / Risk:**
- v1에서 `rejection_reason_*` 컬럼은 dead column. Karpathy 원칙 예외 허용 — v1.5 준비 목적 명시됨.
- DBSCAN 파라미터(eps) 튜닝은 v1.5 시점에 경험적으로 결정 필요.

## Alternatives Considered

**RLHF reward model fine-tuning:** 기각.
- 1인 학습 프로젝트엔 오버엔지니어링. 학습 데이터·컴퓨트·검증 비용 불균형.

**거절 사유 enum만 (자유 텍스트 없음):** 기각.
- enum은 노이즈 분류용. 실제 thesis 신호는 자유 텍스트에 있다 ("뻔하다" 단어 하나보다 "여행사 가이드가 다 데려가는 식당" 한 줄이 더 정확).

**수동 negative dictionary 작성:** 기각.
- 큐레이터 부담 폭증. 거절 기록이 자동으로 쌓이면 수동 작성보다 빠르고 편차가 적다.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0017: LLM 발굴 수동 trigger 정책
- ADR-0022: Rejected Candidate Is Not Re-Discoverable
- ADR-0027: HITL 진화 단계 (v1.5 진입 조건)
- ADR-0029: Phase 0 hidden gem 발굴 파이프라인 (prompt 주입 대상)
