# Light Spec — 비짓제주 Reference Tier 상위 1,000건 선별

**Feature:** 비짓제주 3,712건 → Reference Tier 상위 1,000건 자동 수집  
**Persona:** 큐레이터(서비스 운영자 1인)  
**Status:** ❌ Deprecated (2026-05-20) — dedup 100m 좌표 단독 룰 폐기. 점수 기반 1,000건 선별 시스템으로 대체 (ADR-0051). `specs/visitjeju-curation-pipeline-v2.md` 참조.  
**Depends on:** ADR-0023 (Amendment), ADR-0042, ADR-0043, ADR-0044, Migration 018  
**Script:** `npm run seed:visitjeju-reference-top1000`

---

## 1. 배경 및 범위

ADR-0023 Amendment(2026-05-20): 비짓제주 3,712건 전체를 큐레이터 큐에 올리면 1인 운영 불가 → 카테고리·지역 균등 배분 기준으로 상위 1,000건만 reference tier 후보로 enqueue. 큐레이터가 최종 30건으로 추린다.

**In (v1):**
- 비짓제주 API 호출 (단독 소스)
- 필터링 기준 적용 후 category × region 쿼터 배분
- `curation_candidates`에 `tier='reference'`, `source='visitjeju_popular'`, `status='pending'` 저장
- dedup: 기존 `curation_candidates`와 반경 100m Haversine 비교 (hidden tier 포함)
- awards_hint 추출 (ADR-0044 패턴 매칭)
- Migration 018 category enum에 `'cultural_space'` 추가 (이 스크립트 실행 전 마이그 필요)

**Out (v1) — 보류:**
- 네이버 데이터랩 트렌드 연동 (OQ-V1 — 키 없음, v1.5)
- BC카드 빅데이터 연동 (v2+)
- 자동 cron 실행 (수동 trigger만)
- **c2 쇼핑** API 카테고리: 알파 제외 (v1.5 여행 쇼핑 기능 검토 시 재고)
- **c3 숙박** API 카테고리: 알파 제외 (숙소 기획 없음, 변경 없음)
- **c5 축제/행사** API 카테고리: 알파 제외 — v1.5에서 `events` 테이블로 별도 처리 (ADR-0047, specs/events-table-019.md)
- **c6 테마여행** API 카테고리: 알파 제외 — 좌표 없는 편집 기사, 개별 장소 아님

---

## 2. API 파라미터 확인 현황

### 2.0 실제 API 파라미터 및 카테고리 매핑 (라이브 테스트 결과, 2026-05-20)

라이브 테스트에서 PDF 가이드와 다른 사실 2가지 확인:

**1) 카테고리 필터 파라미터: `cid` → `category`**

기존 `VisitjejuAdapter`는 `cid=c1` 사용 → 실제 결과 0건. 올바른 파라미터는 `category=c1` (총 1,407건 반환).

> **Build 시 VisitjejuAdapter.ts 수정 필요:** `url.searchParams.set('cid', ...)` → `url.searchParams.set('category', ...)`

**2) 실제 카테고리 매핑 (Spec 이전 가정과 다름)**

| API 코드 | 실제 Label | 건수 | 알파 활용 |
|---|---|---|---|
| c1 | 관광지 | 1,407 | ✓ (경우에 따라 cultural_space 재분류) |
| c2 | 쇼핑 | 328 | ✗ 알파 제외 |
| c3 | 숙박 | 1,049 | ✗ 알파 제외 |
| c4 | 음식점 | 2,127 | ✓ (tag 기반 카페/맛집 분류) |
| c5 | 축제/행사 | 474 | ✗ 알파 제외 (ADR-0047) |
| c6 | 테마여행 | 730 | ✗ 알파 제외 (좌표 없음) |

→ 알파 활용: **c1 + c4 전용**

### 2.1 인기순 정렬 파라미터

**상태: RESOLVED (2026-05-20) — sortType 파라미터 무시 확인**

라이브 테스트 결과:
- `category=c1&sortType=POPULAR` 응답 순서 = `category=c1` 기본 순서 완전 동일
- API가 sortType 파라미터를 무시함

**채택:** API 기본 반환 순서 사용. `contentsid` 정렬 파라미터 추가 X (서버 기본값 유지). `VisitjejuAdapter`에 `sortType` 필드 추가 불필요.

### 2.2 c4 카테고리 하위 세분류 (음식점 vs 카페)

**상태: RESOLVED (2026-05-20) — 하위 분류 파라미터 없음 확인**

라이브 테스트 결과: `cid2`, `subCategoryId`, `subcategory`, `type`, `keyword` 파라미터 모두 c4 전체(2,127건) 반환 — 서버 무시. 하위 분류 API 파라미터 없음.

**확정:** c4 전체 취득 후 아래 우선순위로 카페/음식점 분류:

| 우선순위 | 조건 | 판정 |
|---|---|---|
| 1 | `tag` 필드에 "카페" 직접 포함 | 카페 |
| 2 | `introduction`에 "카페" 단어 빈도 ≥ 2 | 카페 |
| 3 | `introduction`에 "베이커리", "디저트", "커피", "원두" 중 하나 포함 | 카페 |
| 4 | 위 모두 해당 없음 | 음식점 |

카페 풀 200건 미달 시:
- 음식점 풀 중 `introduction`에 "디저트" 또는 "베이커리" 포함 spot을 카페로 재분류
- 그래도 미달이면 그대로 진행 (WARNING 출력)

---

## 3. 선별 기준 (필터링)

모든 카테고리에 공통 적용:

| 기준 | 조건 | 이유 |
|---|---|---|
| 사진 필수 | `repPhoto.thumbnailpath` NOT NULL (또는 NOT empty) | 큐레이터 검토 화면에 썸네일 필수 |
| 소개글 최소 길이 | `introduction` 글자 수 ≥ 50 | 너무 짧으면 awards_hint 추출 불가, 큐레이터 판단 정보 부족 |

위 두 조건 미충족 항목은 필터링 후 제외.

---

## 4. 쿼터 배분

총 1,000건을 category × region으로 균등 배분:

### 4.1 카테고리 쿼터

| 카테고리 | API 코드 | 목표 건수 | 비고 |
|---|---|---|---|
| 관광지 | c1 | 400 | 자연·명소; keyword 재분류로 cultural_space 추출 |
| 맛집(음식점) | c4 (카페 제외) | 350 | tag/introduction keyword 기반 분류 |
| 카페 | c4 (카페 keyword) | 250 | Section 2.2 우선순위 분류 |
| **합계** | | **1,000** | c2·c3·c5·c6 제외 (Section 1 Out 참조) |

### 4.2 지역 쿼터

각 카테고리 쿼터 내부를 region으로 균등 2분:

| 지역 | region1cd | 목표 비율 |
|---|---|---|
| 제주시 권역 | 제주시 코드 | 500 (50%) |
| 서귀포시 권역 | 서귀포시 코드 | 500 (50%) |

**쿼터 미달 처리 (Section 6 참조):** 특정 category×region 조합이 필터 후 쿼터 미달이면 동일 카테고리의 다른 지역에서 보충. 그래도 미달이면 인접 카테고리(관광지↔카페, 맛집↔카페)에서 보충. 최소 목표: 총 600건 이상 확보 (큐레이터 30건 선별의 20배 여유).

---

## 5. 파이프라인 흐름

```
[npm run seed:visitjeju-reference-top1000]
           │
           ├─ OQ-V2 체크: sortType=POPULAR 지원 여부 (라이브 ping)
           │   ├─ 지원: sortType=POPULAR
           │   └─ 미지원: contentsid ASC (등록순)
           │
           ├─ Stage 1: 비짓제주 API 카테고리별 수집 (c1·c4 전용)
           │   ├─ c1: pageSize=100, page=1~N (400건 확보까지)
           │   └─ c4: pageSize=100, page=1~N (600건 확보까지)
           │
           ├─ Stage 2: 필터링
           │   ├─ repPhoto.thumbnailpath NOT NULL·NOT empty
           │   └─ introduction.length ≥ 50
           │
           ├─ Stage 3: 지역 쿼터 적용
           │   └─ region1cd 기준 제주시 500 : 서귀포시 500 배분
           │
           ├─ Stage 4: dedup
           │   └─ 기존 curation_candidates 반경 100m Haversine 비교
           │       ├─ 중복(hidden tier): tier → 'reference' UPDATE
           │       │   ├─ sourced_from: 기존값 유지 (예: 'naver') — 발굴 경로 추적용
           │       │   └─ awards_hint: 기존 ∪ 신규 (union, 중복 제거)
           │       ├─ 중복(reference tier): 스킵 (dedupSkipped++)
           │       └─ 신규: INSERT (tier='reference', source='visitjeju_popular')
           │
           ├─ Stage 5: awards_hint 추출 (ADR-0044)
           │   └─ introduction + tag → 패턴 매칭 → awards_hint[]
           │
           └─ Stage 6: curation_candidates 저장
               tier = 'reference'
               source = 'visitjeju_popular'
               status = 'pending'
               awards_hint = TEXT[]

[쿼터 미달 시 (--supplement)]
           └─ awards_hint 非empty인 naver hidden 후보 → tier='reference' 업데이트
               sourced_from 기존값 유지, awards_hint union 병합
```

---

## 6. 쿼터 미달 Fallback

### 6.1 category×region 쿼터 미달

1. 동일 카테고리 타 지역에서 초과분으로 보충 (지역 균형 완화)
2. 인접 카테고리에서 보충:
   - 맛집 ↔ 카페 교환 허용
   - 관광지 ↔ 카페/맛집 교환 허용 (체험·문화공간은 v1 제외)
3. 총 600건 미달이면 스크립트가 WARNING 출력 후 그대로 진행 (오류 X)

### 6.2 문화공간(cultural_space) keyword 추출 — c1 재분류

c5 API 카테고리는 알파 제외(ADR-0047). 대신 c1(관광지) 수집분에서 keyword 기반으로 `cultural_space` 재분류:

**대상:** c1 수집분 중 `tag` 또는 `introduction`에 아래 키워드 포함 spot:
- "박물관", "미술관", "갤러리", "공방", "전시"

재분류 시:
- `sourced_from` = `'visitjeju_popular'` 유지
- `category` = `'cultural_space'`로 변경
- `reassignedToCulturalSpace` 카운터 증가

미달이어도 강제 보충 X — WARNING 출력 후 진행.

### 6.3 카페(c4) 쿼터 미달 Fallback

Section 2.2 우선순위 분류 후 카페 풀 200건 미달 시:
- 음식점 풀 중 `introduction`에 "디저트" 또는 "베이커리" 포함 spot을 카페로 재분류
- 그래도 미달이면 그대로 진행 (WARNING 출력)

### 6.4 총 600건 미달 시 보충 (--supplement 플래그)

`npm run seed:visitjeju-reference-top1000 --supplement`:
- `curation_candidates` 중 `tier='hidden'` AND `awards_hint != '{}'` 항목을 `tier='reference'`로 업데이트
- sourced_from 기존값 유지, awards_hint union 병합
- 600건 달성까지 보충

---

## 7. 컴포넌트

### 7.1 VisitjejuAdapter 수정

라이브 테스트 결과 두 가지 수정:

**1) 카테고리 필터 파라미터 수정 (버그 픽스)**

`src/infrastructure/visitjeju/VisitjejuAdapter.ts` line ~81:
```typescript
// 변경 전 (0건 반환 버그)
if (params.category) url.searchParams.set('cid', params.category);
// 변경 후
if (params.category) url.searchParams.set('category', params.category);
```

**2) sortType 추가 없음**

`sortType=POPULAR`이 API에서 무시됨 확인 → `VisitjejuFetchParams`에 `sortType` 필드 추가 불필요. API 기본 반환 순서 사용.

### 7.2 ReferenceTop1000Script

위치: `src/scripts/seed-visitjeju-reference-top1000.ts`

```typescript
async function main(): Promise<void>

interface ReferenceTop1000Result {
  visitjejuFetched: number              // 필터 전 총 수집
  filteredOut: number                   // 필터 탈락
  dedupSkipped: number                  // 반경 100m 중복 (reference tier — 스킵)
  dedupUpgraded: number                 // hidden → reference UPDATE 건수
  awardsExtracted: number               // awards_hint 非empty 건수
  reassignedToCulturalSpace: number     // c1→cultural_space 재분류 건수 (6.2 fallback)
  enqueued: number                      // 신규 INSERT 건수
  totalReference: number                // enqueued + dedupUpgraded
  quotaShortfall: number                // 1000 - totalReference (음수 가능)
}
```

실행: `npm run seed:visitjeju-reference-top1000`  
package.json: `tsx src/scripts/seed-visitjeju-reference-top1000.ts`

#### --dry-run 모드

`npm run seed:visitjeju-reference-top1000 -- --dry-run`:
- DB INSERT/UPDATE 없음 (읽기 전용)
- 아래 통계만 콘솔 출력:

```
[dry-run] stage 1 fetched:    210  (c1=80 c2=50 c4=60 c5=20)
[dry-run] stage 2 filtered:   14   (photo_null=5 intro_short=9)
[dry-run] stage 3 region:     제주시=100 / 서귀포시=96
[dry-run] stage 4 dedup:      skip=8 upgrade=3
[dry-run] stage 5 awards:     extracted=12
[dry-run] projected enqueue:  188  (target 1000 — shortfall 812)
[dry-run] 600건 임계값: ✗ MISS (supplement 필요)
```

#### 진행률 로그

실행 중 카테고리별 페이지 진행상황 출력:

```
[c1] fetching page 1/3 ...
[c1] collected 100/250
[c1] collected 200/250
[c1] collected 250/250 ✓
[c4:restaurant] fetching page 1/4 ...
...
[done] enqueued=820 upgraded=42 shortfall=138
```

---

## 8. 데이터 스키마 영향

### 8.1 Migration 018 사전 필요 (별도 spec: specs/spots-schema-018.md)

이 스크립트 실행 전 Migration 018 적용 완료 필요:
- `curation_candidates.tier TEXT CHECK (tier IN ('reference', 'hidden'))`
- `curation_candidates.awards_hint TEXT[]`

### 8.2 Migration 018 추가 항목 (완료)

`spots.category` 및 `curation_candidates.category` enum에 `'cultural_space'` 추가 — Migration 018에서 적용 완료.

**비짓제주 API 카테고리 → 내부 category 매핑:**
- c1 관광지 → `'sightseeing'` (단, keyword 재분류 항목은 `'cultural_space'`)
- c4 음식점 → `'restaurant'` 또는 `'cafe'` (Section 2.2 keyword 분류)
- c5 축제/행사 → 알파 제외 (ADR-0047; events 테이블은 Migration 019)

### 8.3 Migration 019 사전 준비

`events` 테이블 사전 준비 (빈 테이블, 알파 데이터 수집 X):
- 상세: `specs/events-table-019.md`
- 이 스크립트 실행 전 Migration 019 적용 여부: **선택 사항** (이 스크립트는 events 테이블을 사용하지 않음)

### 8.4 source 값

`curation_candidates.sourced_from` = `'visitjeju_popular'` (기존 `'visitjeju'`와 구분).

---

## 9. 큐레이터 검토 연동

- `status='pending'` 으로 저장 → 기존 큐레이터 검토 화면에 자동 노출
- `awards_hint` 배열은 큐레이터 검토 화면에 배지로 표시 (ADR-0044)
- `tier='reference'` 항목은 검토 화면에서 별도 섹션 또는 필터 탭으로 구분 (ADR-0042)
- 큐레이터 코멘트: on-demand 생성 (ADR-0043). 이 스크립트는 코멘트 생성 X.

---

## 10. 수락 기준

### AC-V1: 수집량
- `npm run seed:visitjeju-reference-top1000` 실행 후 `tier='reference'` 행이 최소 600건 이상 `curation_candidates`에 존재한다.
- 목표: 1,000건. 미달 시 WARNING 출력.

### AC-V2: 카테고리 배분
- 각 카테고리 건수가 목표치의 ±20% 이내.
- 예: 관광지 목표 250 → 실제 200~300 허용.

### AC-V3: 지역 배분
- 제주시 : 서귀포시 = 40:60 ~ 60:40 이내.

### AC-V4: 필터링
- `repPhoto.thumbnailpath` NULL 항목 0건.
- `introduction.length < 50` 항목 0건.

### AC-V5: dedup
- 기존 `curation_candidates`와 반경 100m 이내 중복 항목은 재삽입되지 않는다.
- 기존 hidden → reference 업데이트 건수가 `dedupUpgraded`에 집계된다.
- 업데이트된 항목의 `sourced_from`은 기존값(예: `'naver'`)을 유지한다.
- 업데이트된 항목의 `awards_hint`는 기존값 ∪ 신규값(union, 중복 제거)으로 병합된다.

### AC-V6: Migration 018 의존성
- `spots.category` enum에 `'cultural_space'` 포함 확인.
- `curation_candidates.tier`, `curation_candidates.awards_hint` 컬럼 존재 확인.

### AC-V7: --dry-run
- `--dry-run` 실행 시 `curation_candidates` 테이블 변경 행 수 = 0.
- 통계 출력 (fetched, filteredOut, dedupSkipped, dedupUpgraded, awardsExtracted, projected enqueue, 600건 임계값 결과) 모두 출력됨.

### AC-V8: hidden 승격 카운터
- `dedupUpgraded` 값이 0 이상으로 정상 집계된다.
- 실제 업데이트된 DB 행 수와 `dedupUpgraded` 값이 일치한다.

### AC-V9: cultural_space reassign
- c5 풀 미달 시 6.2 1단계 fallback이 작동한다: c1 중 키워드 포함 spot이 `category='cultural_space'`로 저장된다.
- `reassignedToCulturalSpace` 카운터가 실제 재분류 건수와 일치한다.

---

## 11. Open Questions

- **OQ-V2 (RESOLVED 2026-05-20):** `sortType=POPULAR` API에서 무시 확인 (POPULAR·RECENT 동일 순서). API 기본 반환 순서 사용. `VisitjejuAdapter`에 sortType 추가 없음.
- **OQ-V3 (RESOLVED 2026-05-20):** c4 하위 분류 파라미터 없음 확인. Section 2.2 keyword 분류 확정.
- **OQ-V4 (RESOLVED):** hidden tier → reference 승격 채택. sourced_from 기존값 유지, awards_hint union 병합. dedupUpgraded 카운터 집계.
- **OQ-V5 (CLOSED):** POPULAR 정렬 자체가 무시됨으로 해소 불필요.
- **OQ-V6 (RESOLVED 2026-05-20):** 실제 API 카테고리 매핑 확인. c2=쇼핑·c3=숙박·c5=축제/행사·c6=테마여행(좌표 없음). 알파 활용: c1+c4 전용. c5는 ADR-0047로 v1.5 events 모델 사전 준비.

---

## References

- ADR-0023 Amendment (2026-05-20): 비짓제주 역할 재정의 — Top 1,000 Reference Tier
- ADR-0042: Two-Tier 큐레이션 모델 (reference tier 정의; hidden 본질 = "비짓제주 미등록" → OQ-V4 결정 근거)
- ADR-0043: on-demand 큐레이션 코멘트 생성
- ADR-0044: awards 자동 추출
- `specs/reference-tier-collection.md`: VisitjejuAdapter sortType 확장 선행 spec
- `specs/spots-schema-018.md`: Migration 018 (tier, awards, cultural_space enum)
- VisitJeju OPEN API Guide v1.0 (`docs/api-guides/VisitJeju_OpenAPI_Guide_v1.0.pdf`) — CIDFont 인코딩으로 텍스트 추출 불가; 정렬·하위분류 파라미터는 라이브 테스트로 확인 필요
