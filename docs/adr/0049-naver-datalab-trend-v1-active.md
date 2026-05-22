# ADR-0049: 네이버 데이터랩 트렌드 API — v1 활성화

Status: Accepted (2026-05-20)

## Context

Phase 0 설계 시 네이버 데이터랩 트렌드 API를 "v1.5 보류"로 분류했다. 이유: NAVER_CLIENT_ID 데이터랩 권한 획득 불확실, 구현 우선순위 후순위.

2026-05-20 확인 결과: **NAVER_CLIENT_ID 데이터랩 권한 이미 활성화** (기존 발급 키에 포함).

비짓제주 점수 기반 선별(ADR-0051) 에서 `trend_category` 가 보너스 점수(±0.5~2점) 로 사용된다. 트렌드 없이는 declining 스팟 패널티(-2점) 적용 불가 — 선별 품질 저하.

## Decision

네이버 데이터랩 트렌드 API **v1 활성화**.

### 적용 범위

- 입력: 비짓제주 1,000건 선별 후 카테고리별 5건 단위 배치 쿼리 (= 200 API 호출)
- 쿼리 기간: 최근 12개월 (주간 단위)
- 출력: `trend_category` = `steady | rising | declining | seasonal | new`

### 판단 기준

| 판단값 | 조건 |
|--------|------|
| `rising` | 최근 3개월 평균 > 이전 9개월 평균 × 1.3 |
| `declining` | 최근 3개월 평균 < 이전 9개월 평균 × 0.7 |
| `seasonal` | 분산/평균 > 0.5 AND 최대월이 특정 분기에 집중 |
| `new` | 12개월 중 7개월 이상 데이터 없음 (신생 spot) |
| `steady` | 그 외 |

### 비용

- 네이버 데이터랩 API: 무료 (일 25,000회 한도)
- 1,000건 ÷ 5 = 200회 → 한도의 0.8%
- 배치 처리 시간: ~30초 (rate limit 고려)

## Consequences

**Positive:**
- declining 스팟(-2점) 자동 패널티로 폐업·방치 장소 자연 탈락
- rising 스팟(+0.5점)으로 신흥 핫플 조기 포착
- seasonal 정보 → 코멘트 시점 어드바이스에 활용 가능 (ADR-0052)

**Negative / Risk:**
- 5건 배치 이름 오매칭 가능 (네이버 검색어 ≠ 비짓제주 title)
  → 큐레이터 UI에서 수동 override 가능
- 12개월 데이터 없는 spot(신생) → `new` 태그, 점수 보너스 없음

## Alternatives Considered

**v1.5 보류 유지**: 기각. 권한 이미 활성화, declining 패널티 미적용 시 선별 품질 저하.

**절대값 기반 (검색량 N건 이상)**: 기각. 카테고리별 절대값 차이 크다 — percentile 정규화와 일관성 없음.

## References

- ADR-0051: external_buzz_score + trend_category 종합 점수
- ADR-0018: External Trend Data ACL
- ADR-0019: TrendDiscoveryPort 분리
- ADR-0026: 트렌드 점수 설계 원칙
