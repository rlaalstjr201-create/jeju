# ADR-0023: 비짓제주 API를 Phase 0 시드의 1차 데이터 소스로 채택

Status: Accepted (2026-05-18)

## Context

외부 데이터 소스 5종 가입 완료 (2026-05-18):

- data.go.kr: 빅데이터_지역별 방문자수\_GW, 국문 관광정보\_GW, 관광사진\_GW, 두루누비\_GW
- 비짓제주 자체 API (제주관광공사)

원래 Phase 0 계획 (curation-pipeline.md): 공공 데이터 → 후보 100개 자동 수집 → LLM enrichment (Kakao Local API로 lat/lng·thumbnail 보강) → 큐레이터 검토.

비짓제주 OPEN API 가이드 v1.0 검토 결과, 단일 엔드포인트 `/vsjApi/contents/searchList`가 다음을 한 번에 제공한다:

| 필드 | 내용 |
|---|---|
| `contentsid`, `contentscd` | 콘텐츠 ID, 카테고리 (c1=관광지 등) |
| `title`, `address`, `roadaddress` | 명칭·주소 |
| `latitude`, `longitude` | 좌표 |
| `tag`, `introduction` | 태그·소개 |
| `repPhoto.thumbnailpath` / `imgpath` | 썸네일·원본 사진 URL |
| `region1cd` / `region2cd` | 제주시·서귀포시 + 세부 지역 |

이로써 LLM enrichment 중 좌표·썸네일 보강 단계가 사실상 불필요해졌다.

## Decision

- Phase 0 시드 1차 데이터 소스: **비짓제주 API**
- 2차 폴백: 국문 관광정보\_GW (data.go.kr) — 비짓제주 누락 시
- 사진 보강: 관광사진\_GW (포토코리아) — 자연·문화 스팟 대상, 공공누리 1유형
- **Kakao Local API는 v2 이후로 보류** — v1에서 어댑터는 스텁 유지 (v2 예약 deep link 용도 존속)

## Consequences

**Positive:**
- LLM enrichment 부담 절반 감소. 좌표·썸네일 외부 호출 제거.
- 단일 API로 카테고리 + 지역 + 사진까지 일관된 메타 확보.
- 데이터 품질 균일 (단일 공공 출처 = 제주관광공사).

**Negative / Risk:**
- 비짓제주는 *공식 등록 관광지 중심* — 비공식 핫플(작은 카페, 신생 식당)은 누락 가능. v1 큐레이션 thesis(자연·문화 우선)와는 정합하지만, v1.5 확장 시 보강 필요.
- `KakaoLocalPlaceAdapter`는 v2까지 스텁 유지 — dead code 아님 (v2 예약 deep link 용도 살아있음). ADR-0024 매트릭스에 명시.

## Alternatives Considered

**Kakao Local API 1차 채택:** 기각.
- 카페·식당 데이터 풍부하나, v1 큐레이션 50~100개는 관광지·자연·문화 중심. ROI 낮음.
- 사진 라이선스 불명확 (비짓제주는 공공누리 1유형으로 명시).

**국문 관광정보\_GW 1차 채택:** 기각.
- 전국 데이터라 제주 region 필터 필요 + 좌표·사진 메타가 비짓제주만큼 풍부하지 않음.

**여러 소스 동시 호출 후 머지:** 기각.
- 1인 학습 프로젝트에 과한 복잡도. 소스 간 충돌 해소 정책을 추가로 결정해야 함.

## References

- 비짓제주 OPEN API 활용가이드 v1.0 (`docs/api-guides/VisitJeju_OpenAPI_Guide_v1.0.pdf`)
- ADR-0018: External Trend Data ACL
- ADR-0024: 외부 데이터 소스 매트릭스 + 폴백 정책
