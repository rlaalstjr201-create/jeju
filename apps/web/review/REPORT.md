# 전 항목 검수 보고서 (ADR-0028)

실행: 2026-09-30, 워크플로 `full-review-curation` (run wf_2ed81615-e0f). 기준은 `plans/tomorrow-picker.md` "전 항목 검수" 절에 실행 전 고정.

## 결과

| 항목 | 값 |
|---|---|
| 검수 대상 (사전 필터 통과) | 3,245 |
| 판정 완료 | 3,245 (누락 0) |
| keep | 3,006 |
| 최종 `public/spots.json` | 3,003 (이유 문장 규칙·충실성 감사 위반 제외) |
| 기분별 | food 1,704 / new 517 / walk 460 / rest 322 |
| 카카오 ID 없음 → 이름 검색 링크 | 879 |

drop 사유: INSUFFICIENT_INFO 114, NOT_DESTINATION 83, INAPPROPRIATE 17, CLOSED_OR_TEMP 13, CHAIN_GENERIC 11, TEST_OR_FAKE 1

## 보정 (기준 세트 60곳, opus vs sonnet)

- keep/drop 일치율 98.3% (기준 ≥85%) · mood 일치율 98.2% (기준 ≥80%) → 전 항목 검수 모델 sonnet
- 1차 검수에서 확신 낮음 1,053건 → 전부 opus 재판정

## 감사

- 무작위 162곳 opus 블라인드 재판정: keep/drop 불일치 3.7%, mood 불일치 0.7%
- 이유 문장 충실성(sonnet, 149건): 원문에 없는 표현 1건(“매콤한”), 경계 사례 1건 → 둘 다 제외
- 기계 검사(haiku): 길이 위반 0, 금지 패턴 4건(“24시간 우려낸” 같은 조리 시간 표현) → 빌드 시 규칙상 제외

## 방법론 근거

체크리스트 기반 판정(CheckEval, EMNLP 2025), 확신 낮음 → 상위 모델 에스컬레이션(Trust or Escalate, ICLR 2025), 위치·자기선호 편향 대응, 배치 판정 효율 연구, 판정 신뢰도 추정. 전체 목록은 워크플로 결과의 `protocolRefs`.

## 한계

판정 근거는 보유 텍스트뿐이다. 영업 여부 등 현재성은 확인하지 않았다(ADR-0025).
