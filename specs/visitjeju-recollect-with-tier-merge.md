# Light Spec — 비짓제주 재적재 + Tier Merge

**Feature:** 비짓제주 전체 재페치 → hidden tier UPGRADE + 유명 spot 신규 적재  
**Persona:** 큐레이터(서비스 운영자 1인)  
**Status:** ❌ Deprecated (2026-05-20) — dedup v1 (좌표 100m 단독) 구현 완료 후 99% 오매칭 확인. dedup v2 (좌표+name 유사도) + 점수 기반 선별로 대체 (ADR-0051). `specs/visitjeju-curation-pipeline-v2.md` 참조.  
**Depends on:** ADR-0023 (Amendment 2), ADR-0042, ADR-0044  
**Script:** `src/scripts/seed-visitjeju-recollect.ts`  
**Supersedes:** `specs/visitjeju-reference-top1000.md` (보류), `specs/reference-tier-collection.md` (보류)

---

## 1. 배경 및 범위

### 1.1 왜 재적재가 필요한가

실측 분석(2026-05-20) 결과:

| 문제 | 실측 근거 |
|------|----------|
| API keyword 파라미터 무시 | 12개 spot 동일 결과 반환 |
| dedup 100m skip이 유명 spot 차단 | 8개 유명 spot API 존재 + DB 미적재 |
| thumbnail_url 전량 NULL | repPhoto 어댑터 버그 (이 세션 내 픽스) |
| intro 81% 50자 미만 (c1 기준) | API 자체 데이터 특성 |

### 1.2 In (v1)

- 비짓제주 c1(관광지) + c4(음식점) 재페치 — 카테고리 필터, 정렬 기본값
- intro ≥ 30자 + 좌표 NOT NULL (photo 필터 제거)
- dedup 룰 변경: hidden → reference UPGRADE + 메타 병합
- ADR-0044 awards 패턴 매칭 자동 추출
- 알파 목표: reference tier 후보 60건 이상 확보

### 1.3 Out (v1)

- c2(쇼핑) · c3(숙박) · c5(축제/행사) · c6(테마여행) 수집
- sortType=POPULAR 정렬 (실측: API 무시, 기본 정렬 사용)
- keyword 기반 spot 검색 (API 미지원 확인)
- 자동 cron 실행 (수동 trigger만)

---

## 2. 필터 기준

### 2.1 통과 조건 (AND)

| 조건 | 기준 | 근거 |
|------|------|------|
| intro 길이 | `introduction.length >= 30` | 50자에서 완화 — c1 기준 30자+ = 64% |
| 좌표 | `latitude && longitude` NOT NULL | 앱 지도 표시 필수 |
| 사진 | 제거 | 어댑터 버그 fix 후 재적재 시 자동 보강 |

### 2.2 제거된 조건

- `hasPhoto`: repPhoto 어댑터 버그로 항상 NULL이었음. 버그 픽스 후 `thumbnail_url` 정상 저장되므로 미래 적재에서 자동 보강. 기존 3,714건 backfill은 별도 UPDATE 스크립트로 처리 (v1.5).

---

## 3. Dedup + Tier Merge 룰 (핵심 변경)

기존 모든 spot에 대해 Haversine 100m 이내 기존 `curation_candidates`를 조회:

```
for each visitjeju spot (필터 통과):
  existing = findWithin100m(lat, lng)  ← DB 조회

  if existing.tier == 'hidden':
    → UPGRADE: tier = 'reference'
    → MERGE: visitjeju_content_id, llm_summary(보강), llm_tags(보강)
    → UPDATE thumbnail_url if currently NULL

  else if existing.tier == 'reference':
    → SKIP (중복)
    → UPDATE visitjeju_content_id if currently NULL (메타 보강만)

  else (no match within 100m):
    → INSERT: sourced_from='visitjeju', tier='reference', status='pending'
    → visitjeju_content_id, llm_summary, llm_tags, thumbnail_url 포함
```

### 3.1 MERGE 필드 정의

| DB 컬럼 | 조건 | 동작 |
|---------|------|------|
| `tier` | existing.tier='hidden' | `'reference'`로 UPDATE |
| `visitjeju_content_id` | currently NULL | visitjeju contentsid로 SET |
| `llm_summary` | visitjeju intro 길이 > 현재 llm_summary 길이 | visitjeju intro로 교체 |
| `llm_tags` | always | 기존 태그와 visitjeju tag 병합 (중복 제거) |
| `thumbnail_url` | currently NULL AND visitjeju repPhoto 있음 | visitjeju thumbnailpath로 SET |

### 3.2 INSERT 필드

```typescript
{
  name: spot.title,
  category: classifyCategory(spot),      // c1→sightseeing/cultural_space, c4→cafe/restaurant
  lat: parseFloat(spot.latitude),
  lng: parseFloat(spot.longitude),
  region: REGION_MAP[spot.region1cd],
  sourced_from: 'visitjeju',
  source_type: 'visitjeju',
  visitjeju_content_id: spot.contentsid,
  llm_summary: spot.introduction,
  llm_tags: spot.tag.split(',').map(t => t.trim()),
  thumbnail_url: spot.repPhoto?.thumbnailpath ?? null,
  tier: 'reference',
  status: 'pending',
  awards_hint: extractAwards(spot),
}
```

---

## 4. 카테고리 분류 (c1/c4 → 앱 카테고리)

### 4.1 c1 관광지

| 분류 | 조건 |
|------|------|
| `cultural_space` | tag 또는 introduction에 박물관/미술관/갤러리/공방/전시 포함 |
| `sightseeing` | 그 외 |

### 4.2 c4 음식점

| 분류 | 조건 (우선순위 순) |
|------|------------------|
| `cafe` | tag에 "카페" 포함 |
| `cafe` | introduction에 "카페" 2회 이상 |
| `cafe` | introduction에 베이커리/디저트/커피/원두 포함 |
| `restaurant` | 그 외 |

---

## 5. 수집 범위

| category | API totalCount | 수집 대상 | 예상 필터 통과율 |
|----------|---------------|----------|----------------|
| c1 | 1,407 | 전체 | ~64% (30자+ 기준) |
| c4 | 2,127 | 전체 | ~65% (30자+ 기준) |

페이지당 100건, 전체 페이지 순회 (`fetchAll()` 기존 어댑터 재사용).

---

## 6. 파이프라인 흐름

```
npm run seed:visitjeju-recollect [--dry-run]
          │
          Stage 1: Fetch
          ├─ VisitjejuAdapter.fetchAll({ category: 'c1' })  → max 1,407건
          └─ VisitjejuAdapter.fetchAll({ category: 'c4' })  → max 2,127건
          │
          Stage 2: Filter
          ├─ intro.length >= 30
          └─ lat && lng NOT NULL
          │
          Stage 3: Classify
          ├─ c1 → sightseeing | cultural_space
          └─ c4 → cafe | restaurant
          │
          Stage 4: Dedup + Tier Merge
          ├─ DB에서 전체 curation_candidates 좌표 로드
          ├─ Haversine 100m 검색
          ├─ hidden match → UPGRADE (tier+meta)
          ├─ reference match → SKIP (contentsid 보강)
          └─ no match → INSERT (tier='reference')
          │
          Stage 5: Awards 추출 (ADR-0044)
          └─ introduction + tag 입력 → awards_hint[]
          │
          Stage 6: DB 반영 (--dry-run 시 skip)
          └─ UPDATE + INSERT 실행
          │
          SUMMARY 출력
```

---

## 7. 수락 기준

### AC-1: 유명 spot 적재

dry-run 제거 후 실행 시 다음 spot들이 `curation_candidates`에 `tier='reference'`로 존재:

- 천지연폭포 (`CONT_000000000500618`, intro=51자 → 30자+ 통과)
- 용두암 (`CONT_000000000500469`, intro=57자 → 30자+ 통과)
- 한라산국립공원 (`CONT_000000000500685`, intro=59자 → 이미 DB, UPGRADE)
- 우도(해양도립공원) (`CONT_000000000500477`, intro=30자 → 경계)
- 성산일출봉 (`CONT_000000000500349`, intro=48자 → 30자+ 통과)

### AC-2: 통계

dry-run 출력에 다음 카운터 포함:

```
[summary] fetched:         c1=N c4=N total=N
[summary] filter_passed:   N
[summary] hidden_upgraded: N
[summary] reference_skip:  N
[summary] new_insert:      N
[summary] awards_found:    N
[summary] reference_total: N  (DB 전체 reference tier 건수)
```

### AC-3: 목표

`reference_total >= 60` (알파 reference 30건 큐레이션을 위한 여유분).

---

## 8. Open Questions (해소됨)

| OQ | 내용 | 결정 |
|----|------|------|
| OQ-V2 | sortType=POPULAR 유효성 | 실측: 무시됨. 기본 정렬 사용 |
| OQ-V3 | c4 subcategory 파라미터 | 실측: 없음. tag 분류 사용 |
| OQ-R2 | hidden→reference upgrade 허용 | Amendment 2: 허용 결정 |

---

## References

- ADR-0023 Amendment 2: dedup 룰 변경 결정
- ADR-0042: Two-Tier 큐레이션 모델
- ADR-0044: awards 자동 추출
- `specs/visitjeju-reference-top1000.md` (보류 — 잘못된 dedup 가정)
- `specs/reference-tier-collection.md` (보류 — sortType 무효, OQ-R2 해소)
