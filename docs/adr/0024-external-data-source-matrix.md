# ADR-0024: 외부 데이터 소스 5슬롯 모델 (Stage 4 검증 체인)

Status: Accepted (2026-05-18, 2026-05-19 수정×2)

## Context

초안(2026-05-18)에서 9개 카테고리 매트릭스를 정의했다. 이후 실측 검증 2건(빅데이터\_지역별 방문자수\_GW API 호출, BC카드·관광자원통계·소상공인 상가정보 API 검증)을 수행한 결과 대다수 슬롯이 비활성이거나 의미가 약함을 확인했다.

주요 검증 결과:
- 빅데이터\_지역별 방문자수\_GW: 반환 격자 2개(제주시·서귀포시), 업종 필드 없음 → spot 단위 trend 산정 불가
- 카카오맵 리뷰·평점: 공식 API 미제공 (카카오 데브톡 공식 확인)
- 관광사진\_GW, 두루누비\_GW, 국문 관광정보\_GW: 비짓제주가 메타·썸네일·좌표를 충분히 제공해 중복
- 새 핵심 소스 발견: **네이버 블로그·카페 검색 API** (일 25,000회, 합법 OpenAPI, hidden gem 발굴 엔진)

어댑터 수 감소 목표: 코드·rate limit·매핑 복잡도를 절반으로 줄이고 실제 동작하는 소스만 유지한다.

## Decision

**5슬롯 모델** (2026-05-19 개정: Stage 4 검증 체인 추가):

| 슬롯 | 역할 | 1차 소스 | 보조 |
|---|---|---|---|
| WHAT | spot 메타 base | 비짓제주 API | 카카오 로컬 (좌표 검증) |
| WHERE | 좌표 (lat/lng) | 비짓제주 `latitude`/`longitude` | — |
| DISCOVERY | long-tail hidden gem 후보 발굴 | **네이버 블로그·카페 검색 API** | — |
| VERIFY | Stage 4 좌표 검증 fallback 체인 | 카카오 로컬 → 네이버 로컬 → parent hint | 수동 (curator PATCH API) |
| WHY | 큐레이터 판단 보조 | 큐레이터 1인 | LLM 사전 점수 + 네이버 데이터랩 (수동) |

**VERIFY 슬롯 fallback 체인 (naver 후보 전용)**:
1. `KakaoLocalVerifier.verify(spot_name)` → matched: `verified_by='kakao'`
2. 실패 시 `NaverLocalVerifierAdapter.verify(spot_name)` → matched: `verified_by='naver'`
3. 2차도 실패 + `parent_spot_hint` 있을 때 `KakaoLocalVerifier.verify(parent_spot_hint)` → matched: `verified_by='kakao_parent'`, spot_name 원본 유지
4. 모두 실패 → `status='kakao_unverified'`, `verified_by=null`, 좌표 null

`verified_by` 컬럼은 Migration 015에서 추가 (ADR-0034).

**임베딩·지도는 별도 인프라 슬롯으로 관리** (소스 교체 가능성 낮음):
- 임베딩: Voyage AI
- 지도 임베드: Kakao JS SDK

**v1 비활성 (어댑터 코드 미작성, v2 이후 재평가)**:

| 소스 | 비활성 이유 | 재평가 시점 |
|---|---|---|
| 빅데이터\_지역별 방문자수\_GW | 격자 2개, 업종 없음 — spot 단위 trend 산정 불가 | v2 사용자 이벤트 대체 후 |
| 관광사진\_GW | 비짓제주 `repPhoto.thumbnailpath`가 충분 | — |
| 두루누비\_GW | 올레길 코스는 v1.5 | v1.5 |
| 국문 관광정보\_GW | 비짓제주와 중복 | — |
| 카카오 Local API | 리뷰·평점 미제공. v2 카페·식당 예약 deep link용 | v2 |
| BC카드 빅데이터 | 가맹점 단위 매칭 법적 불가, 별도 가입·심사 | v1.5 큐레이터 인사이트 검토 |
| datalab.visitkorea.or.kr / data.ijto.or.kr | CSV 수동 다운로드, 자동화 불가 | 큐레이터 인사이트용만 |

**폴백 발동 조건 (유지):** 1차 소스가 해당 필드를 null/누락으로 반환할 때만 보조 호출. 두 소스 동시 머지 금지.

## Consequences

**Positive:**
- 활성 데이터 소스 8개 → 4개 압축. 어댑터 코드·rate limit·매핑 복잡도 50% 감소.
- 네이버 검색 API가 hidden gem 발굴의 실질 엔진. 비짓제주 미등록 spot까지 자동 수집 가능.
- 큐레이터 도구(네이버 데이터랩)와 자동 수집(네이버 검색 API) 분리 명확.

**Negative / Risk:**
- 비활성 API 7종은 v2 진입 시 어댑터 코드 작성 비용 발생.
- 카드사 매출·차량 이동 데이터 부재로 spot 단위 trend 자동 산정 불가 — ADR-0026에서 별도 처리.

## Alternatives Considered

**9개 카테고리 매트릭스 유지:** 기각.
- 실측 후 7개 슬롯이 비활성 또는 중복. 코드에 dead adapter 양산.

**카카오 Local API 1차 채택:** 기각.
- 리뷰·평점 미제공(데브톡 공식 확인). 비짓제주가 메타·좌표·썸네일 충분.

**빅데이터\_GW 큐레이터 알림용 유지:** 기각.
- 격자 2개(제주시·서귀포시)는 큐레이터 인지 부하만 추가. 신호 정확도 낮음.

## References

- ADR-0018: External Trend Data ACL
- ADR-0023: 비짓제주 1차 채택
- ADR-0026 재작성: trendScore 자동 산정 폐기
- Claude Code 실측 보고 2건 (2026-05-19)
