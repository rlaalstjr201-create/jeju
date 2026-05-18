# ADR-0025: 큐레이션 시드 목표 — thesis 정렬 우선, 수량 KPI 없음

Status: Accepted (2026-05-18)

## Context

Phase 0 자동 수집은 후보 100~200개 산출을 예상한다. "200개 채워야 한다"는 암묵적 압박이 생기면, 큐레이터가 thesis 기준을 충족하지 못하는 평균 Spot을 승인하게 된다. 이는 ADR-0010에서 확립한 큐레이터-thesis 근거(신뢰받는 편집 목소리)를 훼손한다.

인수인계 메모: "200 시드는 목표일 뿐, thesis 정렬 50개 > 평균 200개."

## Decision

- v1 큐레이션 목표: **thesis 정렬도 우선**. 승인된 Spot 개수 KPI 없음.
- 200개는 *천장 목표*이고, 50개도 *알파 출시 가능* 기준이다.
- 큐레이터는 후보 검토 시 reject를 적극 사용한다. rejected 후보는 파이프라인에서 영구 차단된다 (ADR-0022).

## Consequences

**Positive:**
- Mission Checklist B1(신뢰)·B4(정직) 보호. 평균 Spot이 추천에 섞이지 않는다.
- cold-start 추천 품질을 수량보다 우선한다. 소수의 고품질 Spot이 많은 평균 Spot보다 추천 경험을 더 잘 나타낸다.
- ADR-0022(rejected 재발굴 X)와 결합하면 큐레이터 의도가 파이프라인 전체에서 존중된다.

**Negative / Risk:**
- 알파 출시 시점 Spot 수가 적을 수 있다. Tagalong 사용자가 "추천이 너무 적다" 피드백을 줄 수 있다 — 측정 후 v1.5에서 보강.
- 큐레이터 1인이 thesis 기준을 일관되게 적용해야 한다. 기준 문서화(`docs/context.md` 큐레이션 기준 섹션)가 필요하다.

## Alternatives Considered

**200개 시드 KPI 박기:** 기각.
- ADR-0010(광고 없음, 큐레이터 thesis)과 충돌. 양적 압박이 thesis 훼손으로 이어진다.
- KPI 달성을 위한 승인이 B1(신뢰)·A4(파트너 같은 경험)를 직접 위협한다.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0022: Rejected Candidate Is Not Re-Discoverable
