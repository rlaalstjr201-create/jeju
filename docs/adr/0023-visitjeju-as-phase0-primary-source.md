# ADR-0023: 비짓제주 API를 Phase 0 시드의 1차 데이터 소스로 채택

Status: Accepted (2026-05-18) — Amended (2026-05-20) — Amended 2 (2026-05-20) — Amended 3 (2026-05-20)

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

---

## Amendment 3 (2026-05-20): 비짓제주 Primary 강화 — 점수 기반 1,000건 선별

### 배경

Amendment 2의 구현(`seed-visitjeju-recollect.ts`) 실행 결과, dedup 로직 구조적 결함 발견:

- 좌표 100m 단독 dedup → 99% 오매칭 (천지연폭포 vs 서귀포칠십리축제, 용두암 vs 해원횟집 등)
- 자연 landmark, 이벤트, 음식점을 같은 지점의 "동일 spot"으로 잘못 판단
- 유명 spot 7건 reference tier 미진입 (SKIP_ALREADY_QUEUED로 블록됨)
- 선행 스크립트 결과 롤백 대상

### 변경된 결정

| 항목 | Amendment 2 | Amendment 3 |
|---|---|---|
| 선별 기준 | intro ≥ 30자 필터 + 전체 적재 | 외부 노출도(external_buzz_score) 점수 기반 1,000건 선별 |
| dedup 조건 | 좌표 100m 단독 (폐기) | contentid 일치 OR (좌표 ≤ 100m AND name 유사도 ≥ 0.7) |
| 데이터 범위 | c1(1,407) + c4(2,127) | c1 + c4 + c6 (체험) 확장 검토 |
| 대상 건수 | 1,581건 중 전체 | 점수 상위 1,000건 (카테고리별 쿼터) |

구현 Spec: `specs/visitjeju-curation-pipeline-v2.md`  
선별 알고리즘 결정: ADR-0051

### 이전 Spec 상태 변경

- `specs/visitjeju-recollect-with-tier-merge.md` → **Deprecated** (dedup v2 + 점수 기반으로 대체)
- `src/scripts/seed-visitjeju-recollect.ts` → **DEPRECATED** (롤백 대상)

---

## Amendment 2 (2026-05-20): Dedup 룰 변경 — Hidden→Reference Upgrade + 재적재

### 배경

Amendment 1의 구현 스크립트(`seed-visitjeju-reference-top1000.ts`) dry-run 결과 및 실측 분석으로 기존 설계의 구조적 문제 3개 발견:

**1. API keyword 파라미터 완전 무시**  
`?keyword=한라산` 등 12개 유명 spot 검색 시 전부 동일한 기본 정렬 결과 반환. keyword 기반 spot 조회 불가능.

**2. Dedup 100m 룰이 유명 spot을 차단**  
c1 전체 스캔 결과: 한라산국립공원·성산일출봉·만장굴·천지연폭포·협재해수욕장·주상절리대·카멜리아힐·용두암 등 12개 중 8개가 API에 존재하나 DB에 미적재 상태.
원인: 기존 `RunDiscoveryPipelineUseCase`가 100m 이내 기존 좌표 존재 시 무조건 skip. 네이버 발굴 hidden 후보가 먼저 적재된 경우 visitjeju 유명 spot이 통째로 누락됨.

**3. repPhoto 어댑터 버그 (이 세션 내 픽스 완료)**  
실측: `repPhoto`는 `{ descseo, photoid: { thumbnailpath, imgpath } }` 구조. 어댑터가 flat `{ thumbnailpath }` 로 잘못 가정 → `thumbnail_url` 전량 NULL. 2026-05-20 수정 완료, 9/9 테스트 통과.

### 변경된 결정

| 항목 | Amendment 1 | Amendment 2 |
|---|---|---|
| dedup 룰 | 100m 이내 → skip (신규 INSERT 없음) | 100m 이내 hidden → tier='reference' UPGRADE + 메타 병합 |
| intro 필터 | ≥ 50자 | **≥ 30자** (API 데이터 특성상 완화) |
| photo 필터 | 필수 | **제거** (어댑터 버그와 분리, 재적재 시 자동 보강) |
| 100m 이내 reference 존재 시 | skip | skip (contentsid만 보강) |
| 100m 이내 없을 시 | tier='reference' INSERT | tier='reference' INSERT (동일) |

구현 Spec: `specs/visitjeju-recollect-with-tier-merge.md`

### 이전 Spec 상태 변경

- `specs/visitjeju-reference-top1000.md` → **보류 — 잘못된 dedup 가정 (Amendment 2로 대체)**
- `specs/reference-tier-collection.md` → **보류 — sortType=POPULAR 무효(실측), OQ-R2 Amendment 2로 해소**

---

## Amendment (2026-05-20): 비짓제주 역할 재정의 — Review Excluded 폐기 + Top 1,000 Reference Tier 채택

### 배경

Phase 0 풀런(50쿼리) 완료 후 pipeline 운용 결과:

1. **review_excluded 정책 폐기**: 이전에 비짓제주 후보에 `review_excluded=true` 플래그를 적용해 큐레이터 검토 대상에서 제외하는 방식이 있었다. 그러나 ADR-0042(Two-Tier 큐레이션)의 thesis 재정의("큐레이터 시점이 있는 곳")와 충돌한다 — 유명 장소라도 큐레이터 시점이 있으면 추천 가능.

2. **비짓제주 3,712건 전체 중 상위 1,000건 = Reference Tier 자동 채택**: 비짓제주 API가 제공하는 전체 3,712건을 모두 큐레이터 큐에 올리면 과부하. 상위 1,000건(카테고리·지역 균등 배분)만 reference tier 후보로 enqueue. 큐레이터가 최종 30건으로 추린다.

3. **Hidden Tier thesis 회귀**: 네이버 발굴(Phase 0 현재 파이프라인)은 **"비짓제주에 없는 곳"** 발굴이 본연 목적. 비짓제주와 중복인 네이버 후보는 기존처럼 dedup으로 제거 (ADR-0029 유지).

### 변경된 결정

| 항목 | 이전 | 변경 후 |
|---|---|---|
| 비짓제주 후보 처리 | review_excluded=true (큐레이터 검토 제외) | Top 1,000건 → tier='reference', 큐레이터 검토 대상 포함 |
| Hidden Tier 소스 | 비짓제주 포함 혼재 | **비짓제주에 없는 곳** 전용 (네이버 발굴) |
| 큐레이터 목표 | visitjeju 후보 자동 승인 | 1,000건 중 reference 30건 큐레이터 선별 |

상세 선별 기준은 `specs/visitjeju-reference-top1000.md` 참조.

---

## Decision (원안, 유효)

- Phase 0 시드 1차 데이터 소스: **비짓제주 API**
- 2차 폴백: 국문 관광정보\_GW (data.go.kr) — 비짓제주 누락 시
- 사진 보강: 관광사진\_GW (포토코리아) — 자연·문화 스팟 대상, 공공누리 1유형
- **Kakao Local API는 v2 이후로 보류** — v1에서 어댑터는 스텁 유지 (v2 예약 deep link 용도 존속)

## Consequences

**Positive:**
- LLM enrichment 부담 절반 감소. 좌표·썸네일 외부 호출 제거.
- 단일 API로 카테고리 + 지역 + 사진까지 일관된 메타 확보.
- 데이터 품질 균일 (단일 공공 출처 = 제주관광공사).
- *(Amendment)* review_excluded 폐기로 큐레이터 thesis와 정합: 유명 장소도 큐레이터 시점 있으면 추천 가능.
- *(Amendment)* Hidden tier thesis 명확화: 네이버 발굴 = "비짓제주에 없는 곳" 전용.

**Negative / Risk:**
- 비짓제주는 *공식 등록 관광지 중심* — 비공식 핫플(작은 카페, 신생 식당)은 누락 가능. v1.5 확장 시 보강 필요.
- `KakaoLocalPlaceAdapter`는 v2까지 스텁 유지 — dead code 아님 (v2 예약 deep link 용도 살아있음). ADR-0024 매트릭스에 명시.
- *(Amendment)* 1,000건 중 큐레이터가 30건 선별 = 검토 부담 증가. on-demand 코멘트 생성(ADR-0043)으로 완화.

## Alternatives Considered

**Kakao Local API 1차 채택:** 기각.
- 카페·식당 데이터 풍부하나, v1 큐레이션 50~100개는 관광지·자연·문화 중심. ROI 낮음.
- 사진 라이선스 불명확 (비짓제주는 공공누리 1유형으로 명시).

**국문 관광정보\_GW 1차 채택:** 기각.
- 전국 데이터라 제주 region 필터 필요 + 좌표·사진 메타가 비짓제주만큼 풍부하지 않음.

**여러 소스 동시 호출 후 머지:** 기각.
- 1인 학습 프로젝트에 과한 복잡도. 소스 간 충돌 해소 정책을 추가로 결정해야 함.

**비짓제주 전체 3,712건 enqueue:** 기각 (Amendment).
- 큐레이터 1인이 3,712건 검토 불가. 카테고리·지역 균등 배분 상위 1,000건으로 제한.

## References

- 비짓제주 OPEN API 활용가이드 v1.0 (`docs/api-guides/VisitJeju_OpenAPI_Guide_v1.0.pdf`)
- ADR-0018: External Trend Data ACL
- ADR-0024: 외부 데이터 소스 매트릭스 + 폴백 정책
- ADR-0042: Two-Tier 큐레이션 모델 (Amendment 배경 — review_excluded 폐기)
- `specs/visitjeju-reference-top1000.md` (Amendment 구현 Spec)
