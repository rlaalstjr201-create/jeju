# ADR-0024: 외부 데이터 소스 매트릭스 + 폴백 정책

Status: Accepted (2026-05-18)

## Context

v1 외부 의존 7종:

- 데이터 소스 5종: data.go.kr (빅데이터\_지역별 방문자수\_GW, 국문 관광정보\_GW, 관광사진\_GW, 두루누비\_GW) + 비짓제주 API
- Voyage AI (embedding)
- Kakao JS SDK (지도 임베드)

어댑터마다 "어디서 뭘 가져올지" 결정을 분산시키면 일관성이 깨진다. 새 소스 추가 시(인플루언서·매거진 등) 영향 범위를 단일 진실 원천 한 곳에서 파악할 수 있어야 한다.

## Decision

필요 데이터별 소스 매트릭스:

| 필요 데이터 | 1차 소스 | 2차 폴백 | v2+ 예정 |
|---|---|---|---|
| 시드 메타 (제주 관광지) | 비짓제주 API | 국문 관광정보\_GW | — |
| 썸네일 (관광지·자연·문화) | 비짓제주 `repPhoto.thumbnailpath` | 관광사진\_GW (포토코리아) | Kakao Local 사진 (카페·식당) |
| 좌표 (lat/lng) | 비짓제주 `latitude`/`longitude` | 국문 관광정보\_GW `mapx`/`mapy` | — |
| 카테고리 | 비짓제주 `contentscd` | 큐레이터 수동 태깅 | — |
| 지역 | 비짓제주 `region1cd`/`region2cd` | 도메인 Region VO 매핑 | — |
| `popularityScore` 산정 | 빅데이터\_지역별 방문자수\_GW (KT/SKT 이동통신) | — | 카드매출·내비 z-score 추가 |
| 임베딩 | Voyage AI | — | — |
| 지도 임베드 | Kakao JS SDK | — | — |
| 올레길 GPX 코스 | 두루누비\_GW | — | v1.5에서 활성화 |

**KakaoLocalPlaceAdapter 상태:** v1에서 스텁 유지. 콘텐츠 라우팅은 하지 않으며, v2 예약 deep link 포트로만 존속한다. dead code 아님.

**폴백 발동 조건:** 1차 소스가 해당 필드를 null/누락으로 반환할 때만 2차 호출. 두 소스를 동시에 머지하지 않는다.

## Consequences

**Positive:**
- 어댑터 라우팅 단일 진실 원천. 소스별 결정이 코드 곳곳에 흩어지지 않는다.
- 신규 소스 추가 시 매트릭스 갱신 1곳 → 영향 어댑터만 변경.
- "왜 Kakao Local 안 쓰지?" 류의 미래 의문에 ADR-0023 + 이 매트릭스로 즉답 가능.

**Negative / Risk:**
- v1에서 폴백 체인이 사실상 비활성 (1차 소스가 거의 모두 채움). YAGNI 위반 우려 — 어댑터 인터페이스만 유지하고 실제 폴백 호출 코드는 미작성으로 절충.
- 매트릭스 갱신 누락 시 ADR과 코드 괴리. `CLAUDE.md`에 "외부 소스 변경 = ADR-0024 갱신" 룰 추가 필요.

## Alternatives Considered

**어댑터별 자유 결정:** 기각.
- 같은 소스 선택 결정을 6개월 뒤 반복하게 된다. 일관성 없는 폴백 정책이 생긴다.

**단일 통합 어댑터 (FacadeAdapter):** 기각.
- 도메인 격리를 깨는 구조. ACL 원칙 위반 (ADR-0018과 충돌).

## References

- ADR-0018: External Trend Data ACL
- ADR-0023: 비짓제주 1차 채택
