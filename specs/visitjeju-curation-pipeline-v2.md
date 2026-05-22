# Light Spec — 비짓제주 큐레이션 파이프라인 v2

**Feature:** 비짓제주 3,534건 → 점수 기반 1,000건 선별 → 큐레이터 검토 → 코멘트 생성  
**Persona:** 큐레이터(서비스 운영자 1인)  
**Status:** Draft (2026-05-20)  
**Supersedes:** specs/visitjeju-recollect-with-tier-merge.md (Deprecated), specs/visitjeju-reference-top1000.md (Deprecated)  
**ADR:** ADR-0051 (점수), ADR-0052 (톤), ADR-0023 Amendment 3, ADR-0042 Amendment  
**Schema:** specs/spots-schema-020.md (마이그 020 의존)

---

## 개요

```
Phase A: 비짓제주 재적재 + DB 롤백 (seed-visitjeju-v2.ts)
Phase B: external_buzz 계산 (buzz-calculator.ts)
Phase C: 점수 산정 + 1,000건 선별 (score-selector.ts)
Phase D: 메타 보강 (augment-meta.ts) — optional, v1.5
Phase E: 코멘트 생성 (comment-generator.ts)
Phase F: 큐레이터 검토 (Label Studio 또는 CLI)
```

---

## Phase A: 비짓제주 재적재 + 롤백

### A-1. 현재 DB 롤백

이전 실행(`seed-visitjeju-recollect.ts`, dedup v1) 결과 롤백:

```sql
-- hidden_upgraded 1,229건 롤백
UPDATE curation_candidates
SET tier = 'hidden',
    visitjeju_content_id = NULL,
    updated_at = NOW()
WHERE updated_at >= '<run_timestamp>'
  AND tier = 'reference'
  AND source_type = 'visitjeju';

-- new_insert 32건 삭제
DELETE FROM curation_candidates
WHERE updated_at >= '<run_timestamp>'
  AND sourced_from = 'visitjeju'
  AND source_type = 'visitjeju';
```

`<run_timestamp>`: production run 시각 (2026-05-20 KST 확인 필요)

### A-2. 비짓제주 전체 재페치

```
입력: 비짓제주 c1(관광지) + c4(음식점·체험)
출력: curation_candidates 전체 upsert (coords 있는 항목만)
```

**dedup v3 룰 (ADR-0053):**
```
duplicate = (
    haversine(a, b) < 100m
    AND jaccard_bigram(normalize(a.name), normalize(b.name)) >= 0.7
    AND normalized_category(a) == normalized_category(b)
    AND abs(len(normalize(a.name)) - len(normalize(b.name))) < 3
) OR (a.contentsid == b.contentsid)
```

카테고리 정규화 완료 후 적용. 선행 조건: Phase A-2 카테고리 분류.

**자동 제외:**
- lat/lng NULL (`coords_missing`)

**카테고리 분류 (5분류):**

| VisitJeju 코드 | curation_candidates.category | 매칭 룰 |
|---|---|---|
| c1 잔여 | sightseeing (관광) | 체험·문화공간 keyword 미매칭 c1 |
| c1 매칭 | experience (체험) | 체험·만들기·클래스·공방·액티비티·패러글라이딩·승마·낚시·다이빙·서핑·카약 |
| c1 매칭 | cultural_space (문화공간) | 박물관·미술관·갤러리·전시관·기념관·문학관·아트센터·도서관 |
| c4 매칭 | cafe (카페) | 카페·베이커리·디저트·빙수·빵·로스터리·티하우스·찻집 |
| c4 잔여 | restaurant (맛집) | 카페 keyword 미매칭 c4 전체 |

우선순위: c1 내 `문화공간 > 체험 > 관광`, c4 내 `카페 > 맛집`  
알파 제외: c2 쇼핑, c3 숙박, c6 테마여행  
v1.5 보류: c5 축제·행사 (events 테이블 별도, ADR-0047)

#### c4 음식점 → 카페/맛집 분리

카페 keyword 매칭 대상: `title`, `introduction`, `tag` 필드 union (1개라도 포함 시 카페)

카페 keyword 목록:
```
카페, 베이커리, 디저트, 빙수, 빵, 로스터리, 티하우스, 찻집
```

맛집: c4 중 카페 keyword 미매칭 잔여 전체  
분류 충돌 우선순위: 카페 > 맛집 (c4 내)

근거: 베이커리·디저트·찻집은 머무는 공간 UX → 음식점보다 카페 흡수가 추천 맥락 정확.

**Whitelist** (`src/config/visitjeju-whitelist.json`):
- 만장굴 (`CONT_000000000500182`)
- 주상절리대 (`CNTS_000000000020476`)
- 비자림 (`CONT_000000000500270`)
- intro 길이·coords 필터 통과 보장, final_score +2점

---

## Phase B: external_buzz 계산

```
입력: curation_candidates (coords 있는 전체)
처리:
  1. 카테고리별 그룹화
  2. 각 spot: 네이버 블로그 검색 totalCount + 카페 검색 totalCount 합산
     → external_buzz_count (INT)
  3. 카테고리 내 percentile 정규화 → external_buzz_score (0~10)
     top 10% → 10 / top 25% → 8 / top 50% → 6 / top 75% → 4 / bottom → 2
  4. 절대값 floor:
     buzz_count < 10  → 최대 4점 cap
     buzz_count < 50  → 최대 7점 cap
출력: external_buzz_count, external_buzz_score UPDATE
```

**API 사용량**: 3,534건 × 2 = 7,068회 (일 한도 25,000의 28%)

---

## Phase C: 점수 산정 + 1,000건 선별

```
입력: external_buzz_score + awards_hint + whitelist + trend_category
처리:
  final_score = external_buzz_score
              + (awards_hint 보유 ? +1 : 0)
              + (whitelist ? +2 : 0)
              + (trend_category = 'steady' ? +1 : 0)
              + (trend_category = 'rising' ? +0.5 : 0)
              + (trend_category = 'declining' ? -2 : 0)

  카테고리별 final_score 내림차순 정렬 → 쿼터 적용:
    관광 250 / 맛집 300 / 카페 200 / 체험 150 / 문화공간 100

출력:
  선별된 1,000건 → tier = 'reference', status = 'pending'
  미선별 ~2,500건 → tier = 'hidden', status = 'pending' (v1.5 보류)
```

**네이버 데이터랩** (trend_category 계산):
- 선별 1,000건 ÷ 5건 배치 = 200회 API 호출
- trend_category = steady | rising | declining | seasonal | new

---

## Phase D: 메타 보강 (v1.5, 선택적)

```
대상: info_status = 'thin' | 'missing' (intro 짧은 유명 spot)
처리: 네이버 블로그 snippet → augmented_intro 저장
     (LLM 요약 아님 — snippet 직접 저장)
출력: augmented_intro UPDATE
```

---

## Phase E: 코멘트 생성

```
입력: reference 1,000건 (status = 'pending')
처리:
  1. 네이버 블로그·카페 snippet 3~5건 수집 (grounding 소스)
  2. LLM (Gemma 26B 또는 GPT-4o mini) 구조화 출력:
     sensory_hook / vibe / timing_tip / honest_downside / practical_note / source_snippet_ids
  3. 후처리 합성 (30~80자)
  4. 금지 어휘 post-filter
  5. hallucination check (ADR-0045 5-Layer)
출력: curation_comment 저장, status = 'ready_for_review'
```

톤 가이드: ADR-0052

---

## Phase F: 큐레이터 검토

```
입력: status = 'ready_for_review' (1,000건)
처리: Label Studio 또는 CLI
  approve → spots 테이블 INSERT (curator_approved = true)
  reject  → status = 'rejected', rejection_reason 기록
  edit    → comment 수정 후 approve
목표: 최종 reference 30건 approve (ADR-0025)
```

---

## 성공 기준

| 기준 | 값 |
|---|---|
| AC-1 | 유명 spot 9건 (만장굴·주상절리·비자림 포함) reference tier 진입 |
| AC-2 | external_buzz_score 계산 완료율 ≥ 95% |
| AC-3 | reference tier 최종 ≥ 60건 큐레이터 approved |
| AC-4 | 코멘트 금지 어휘 통과율 100% |

---

## 의존성

- 마이그 020: `spots.external_buzz_count`, `external_buzz_score`, `final_score`, `trend_category`, `augmented_intro` 컬럼 (`specs/spots-schema-020.md`)
- `src/config/visitjeju-whitelist.json`: 만장굴·주상절리·비자림 초기 등록
- 네이버 검색 API: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- 네이버 데이터랩: `NAVER_CLIENT_ID` (ADR-0049, 권한 활성 확인)
- 카카오 Local API: `KAKAO_REST_API_KEY` (ADR-0050)

---

## 제외 범위 (v1.5)

- Naver hidden gem 발굴 121건 처리 (ADR-0029 Deprecated)
- Phase D 메타 보강 LLM 요약
- ADR-0047 events 테이블 이관
