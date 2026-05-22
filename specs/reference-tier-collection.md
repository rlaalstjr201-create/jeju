# Light Spec — Reference Tier 자동 수집 스크립트

**Feature:** Reference Tier 후보 자동 수집 (비짓제주 인기순, v1 단독)  
**Persona:** 큐레이터(서비스 운영자 1인)  
**Status:** ❌ Deprecated (2026-05-20) — sortType=POPULAR 무효 + dedup 100m 룰 폐기. 점수 기반 선별로 대체 (ADR-0051). `specs/visitjeju-curation-pipeline-v2.md` 참조.  
**Depends on:** ADR-0023, ADR-0042, ADR-0044  
**Migration:** 018 (spots 스키마 확장, 별도 spec)

---

## 1. 범위

**In (v1):**
- 비짓제주 API 인기순(`POPULAR`) 정렬로 상위 후보 수집 — **단독 소스**
- 반경 100m dedup (기존 curation_candidates와 교차 비교)
- ADR-0044 awards 패턴 매칭 → `awards_hint` 자동 추출
- curation_candidates에 `tier='reference'` 로 enqueue
- 알파 목표: reference 후보 **60건** (큐레이터가 30건으로 추리는 여유분)
- 60건 미달 fallback: awards 추출(ADR-0044) 경로에서 reference 판정된 naver hidden 후보로 보강

**Out (v1) — Stage R2 보류:**
- 네이버 데이터랩 검색어 트렌드 수집: **보류** (OQ-R1 미해소, 아래 참조)
- 사용자 이벤트 기반 인기도 산정 (v2+)
- BC카드 빅데이터 연동 (v2+)
- 인스타그램·유튜브 소스 (v2+)
- 자동 cron 실행 (수동 trigger만)

---

## 2. 수집 소스 2종

### 2.1 비짓제주 API — 인기순 정렬

기존 `VisitjejuAdapter` 재사용. 신규 파라미터:

| 파라미터 | 값 | 비고 |
|---|---|---|
| `sortType` | `POPULAR` | 기존 기본값은 `RECENT` |
| `category` | `c1` (관광지), `c4` (음식점) | 두 카테고리 분리 수집 |
| `pageSize` | 100 | 최대 |
| `page` | 1 | 1페이지만 (상위 100건) |

수집 대상: 각 카테고리 상위 100건 → 합계 최대 200건 → dedup 후 최종.

### 2.2 네이버 데이터랩 검색어 트렌드 — 보류 (v1.5)

**OQ-R1 해소됨 → Stage R2 보류 결정.**

`.env` 확인 결과:
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 검색 API 전용 (NaverSearchAdapter 사용 중)
- `NAVER_AD_*` — 광고 API, 데이터랩과 무관
- 데이터랩 검색어 트렌드 API 키: **없음**

`NAVER_CLIENT_ID`에 데이터랩 권한이 포함될 수 있으나, 네이버 개발자센터에서 앱 설정 → "데이터랩 검색어 트렌드" 권한 별도 추가 확인 없이는 신뢰 불가.

**v1.5 trigger 조건:** 네이버 개발자센터에서 `NAVER_CLIENT_ID` 앱의 데이터랩 검색어 트렌드 권한 확인 → 권한 있으면 Stage R2 재활성. 권한 없으면 신규 앱 등록 후 키 분리.

---

## 3. 파이프라인 흐름

```
[수동 trigger: npm run seed:reference-tier]
           │
           └─ Stage R1: 비짓제주 인기순 수집 (v1 단독 소스)
               └─ VisitjejuAdapter(sortType=POPULAR)
               └─ 카테고리별 상위 100건 × 2 = max 200건
               │
               └─ Stage R3: dedup + awards 추출 + enqueue
                   ├─ 기존 curation_candidates 좌표와 반경 100m dedup
                   │   (기존 hidden tier 후보와도 비교)
                   ├─ ADR-0044 awards 패턴 매칭 → awards_hint[]
                   │   (introduction + tag 필드 입력)
                   ├─ Kakao 검증 (좌표 확보)
                   └─ curation_candidates 저장
                       tier = 'reference'
                       status = 'pending'
                       awards_hint (TEXT[])

[60건 미달 시 fallback: npm run seed:reference-tier --supplement]
           │
           └─ naver hidden tier 후보 중 awards_hint 非비어있음 → tier 'reference' 재판정
               └─ curation_candidates.tier UPDATE (OQ-R2 해소 필요)

[v1.5: Stage R2 재활성 — 데이터랩 권한 확인 후]
           │
           └─ DataLabAdapter.fetchTrendKeywords()
               └─ 키워드 → Kakao 검증 → 장소명 추출 → enqueue(tier='reference')
```

---

## 4. 컴포넌트

### 4.1 VisitjejuAdapter 확장

기존 `VisitjejuFetchParams`에 `sortType` 추가:

```typescript
export interface VisitjejuFetchParams {
  category?: string
  region?: string
  pageSize?: number
  sortType?: 'POPULAR' | 'RECENT'  // 신규
}
```

### 4.2 AwardsExtractor (신규, ADR-0044)

Stage 3 LLM 추출 후 패턴 매칭. Reference tier 수집에서도 동일 모듈 재사용:

```typescript
export interface AwardsExtractorPort {
  extract(snippets: string[]): AwardsHint[]
}

export type AwardsHint =
  | 'blue_ribbon'
  | 'blue_ribbon_star'
  | 'michelin'
  | 'michelin_star'
  | 'bib_gourmand'
```

비짓제주 소스는 snippet이 없으므로 `introduction` + `tag` 필드를 입력으로 사용.

### 4.3 ReferenceCollectionScript

위치: `src/scripts/seed-reference-tier.ts`

```typescript
// 진입점
async function main(): Promise<void>

// 출력
interface ReferenceCollectionResult {
  visitjejuFetched: number
  datalabFetched: number       // OQ-R1 해소 시
  dedupSkipped: number
  awardsExtracted: number
  enqueued: number             // curation_candidates에 저장된 reference 후보
}
```

실행: `npm run seed:reference-tier`  
package.json 스크립트: `tsx src/scripts/seed-reference-tier.ts`

---

## 5. 데이터 스키마

### curation_candidates 추가 필드 (마이그 018과 연계)

```sql
-- 마이그 018에서 추가 예정
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS tier TEXT
    CHECK (tier IN ('reference', 'hidden')) DEFAULT 'hidden';

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS awards_hint TEXT[] DEFAULT '{}';
```

`tier` 자동 판정 기준 (ADR-0042):
- visitjeju 시드 + awards_hint 비어있지 않음 → `'reference'`
- visitjeju 시드 + awards_hint 비어있음 → `'reference'` (인기순 수집 = reference 판정)
- naver 발굴 + authenticity_score ≥ 0.7 + awards_hint 비어있음 → `'hidden'`

---

## 6. dedup 전략

기존 `CandidateDeduper` 재사용:
- 반경 100m Haversine (인메모리 + DB 조회)
- 기존 hidden tier 후보와 교차 dedup: 이미 hidden로 적재된 spot이 reference 수집에서도 나오면 → tier를 `'reference'`로 **업데이트** (덮어쓰기, 재삽입 X)
  - **Open Question (OQ-R2):** tier 업데이트 허용 여부 큐레이터 확인 필요

---

## 7. 수락 기준

### AC-R1: 수집량
- `npm run seed:reference-tier` 실행 후 `tier='reference'` 신규 행이 최소 60건 이상 `curation_candidates`에 저장된다.
- 60건 미달 시 `--supplement` 플래그로 awards 보유 naver 후보를 reference로 보강해 60건 달성.
- 기존 중복 후보(반경 100m 이내)는 재삽입되지 않는다.

### AC-R2: awards 추출
- `awards_hint` 배열이 `introduction`/snippet에서 패턴 매칭된 경우 non-empty로 저장된다.
- "미쉐린 타이어" 등 False Positive는 큐레이터 감수로 처리 (큐레이터 검토 화면에 `awards_hint` 표시).

### AC-R3: 알파 목표
- 큐레이터 검토 후 최종 reference 승인 30건이 가능하도록 후보 여유분 60건을 확보한다.
- 검토 기간: 알파 출시(2026-08) 전까지.

---

## 8. Open Questions (Plan 진입 전 해소)

- **OQ-R1 (해소됨):** 데이터랩 API 키 없음. v1은 비짓제주 POPULAR 단독. v1.5: 네이버 개발자센터 `NAVER_CLIENT_ID` 앱에서 "데이터랩 검색어 트렌드" 권한 확인 후 Stage R2 활성.
- **OQ-R2:** hidden tier로 이미 적재된 spot이 reference 수집에 중복 등장 시 tier 업데이트 허용 여부. 큐레이터 확인 필요.
- **OQ-R3:** 비짓제주 `POPULAR` 정렬 기준이 비짓제주 자체 뷰카운트인지 외부 신호 반영인지 확인.

---

## References

- ADR-0023: 비짓제주 API (1차 시드 소스)
- ADR-0042: Two-Tier 큐레이션 모델 (reference tier 정의)
- ADR-0044: awards 자동 추출 (패턴 매칭 모듈)
