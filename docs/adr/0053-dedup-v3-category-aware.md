# ADR-0053: dedup v3 — 카테고리 정규화 기반 중복 판정

Status: Accepted (2026-05-20)

## Context

dedup v1 (좌표 100m 단독): 99% 오매칭 확인 — 폐기 (ADR-0051, 2026-05-20 분석).

dedup v2 (ADR-0051): `좌표 ≤ 100m AND name Levenshtein 유사도 ≥ 0.7` 를 채택했으나, 한 가지 케이스 미처리:

- **"성산일출봉" (관광) vs "성산일출봉 카페" (카페)**: 이름 유사도 높음 + 좌표 인접 → v2에서 false dedup 위험
- 이름에 spot 명이 포함된 인접 업장(카페·식당)이 landmark와 같은 grid cell에 존재하는 경우 일반적

해결: 동일 카테고리 내에서만 중복 판정. 카테고리가 다르면 "같은 spot"이 아님.

## Decision

### dedup v3 판정 공식

```
duplicate(a, b) =
  (
    haversine(a.lat, a.lng, b.lat, b.lng) < 100        -- 좌표 100m 이내
    AND jaccard_bigram(normalize(a.name), normalize(b.name)) >= 0.7  -- 이름 유사도
    AND normalized_category(a) == normalized_category(b)             -- 카테고리 일치
    AND abs(len(normalize(a.name)) - len(normalize(b.name))) < 3     -- 길이 차 < 3자
  )
  OR (a.contentsid == b.contentsid)                    -- contentid 완전 일치
```

### name 전처리 (`normalize`)

```
1. 공백 제거
2. 괄호·특수문자 제거 ((), [], （）, ., ·, -, _)
3. 소문자화 (영문 포함)
4. stop-token 제거 안 함 (점포명 보존)
   예: "스타벅스" 유지, "제주" 유지
```

### 유사도: Jaccard bigram

```
bigrams(s) = { s[i:i+2] for i in range(len(s)-1) }
jaccard(a, b) = |bigrams(a) ∩ bigrams(b)| / |bigrams(a) ∪ bigrams(b)|
```

Levenshtein 대비 bigram Jaccard 채택 이유: 어절 순서 불변(설명 순서 차이 허용), 계산 단순, 2자 이상 공통 부분에 민감.

### 카테고리 정규화 (`normalized_category`)

ADR-0051 카테고리 정의 5분류 적용:

| DB category | normalized |
|---|---|
| sightseeing | 관광 |
| restaurant | 맛집 |
| cafe | 카페 |
| experience | 체험 |
| cultural_space | 문화공간 |

카테고리가 다르면 → **무조건 duplicate = false** (이름·좌표 무관).

### len diff 조건 (`abs(len(a) - len(b)) < 3`)

목적: 점포명 변형(체인 지점명) 분리.

```
"스타벅스" (4자) vs "스타벅스 성산점" (8자)  → len diff = 4 → ≥ 3 → NOT duplicate ✓
"이중섭미술관" (7자) vs "이중섭미술관" (7자)  → len diff = 0 → < 3 → duplicate 후보 ✓
"제주도공방노꼬메" (8자) vs "제주도공방 노꼬메" (9자, 공백 제거 후 8자) → duplicate ✓
```

### 선행 조건

카테고리 정규화(Spec v2 Phase A-2 카테고리 분류) **완료 후** dedup 적용.  
정규화 전 dedup 실행 시 카테고리 불일치로 false negative 발생.

## Consequences

**Positive:**
- "성산일출봉"(관광) vs "성산일출봉 카페"(카페) → 카테고리 불일치 → NOT duplicate ✓
- "스타벅스"(카페) vs "스타벅스 성산점"(카페) → len diff ≥ 3 → NOT duplicate ✓ (별도 spot)
- "이중섭미술관" vs "이중섭미술관" (동일 DB 내) → duplicate ✓
- contentid 일치 경로는 카테고리·이름 무관 항상 dedup → anchor 역할 유지

**Negative / Risk:**
- bigram Jaccard는 짧은 이름(2자 이하)에서 신뢰도 낮음 (e.g., "우도" — bigram 1개만 존재)
  → 짧은 이름은 contentid 경로에 의존, 좌표+이름 경로 보조
- 카테고리 오분류 시 true positive miss (카테고리 정규화 품질 의존)

## Alternatives Considered

**dedup v2 (Levenshtein) 유지**: 기각. 카테고리 다른 유사명 오탐 미해결.

**TF-IDF 코사인 유사도**: 기각. 비짓제주 짧은 명칭에 IDF 계산 불안정. bigram Jaccard가 단순·견고.

**Embedding cosine (ADR-0028)**: 기각. 배치 호출 비용 + 단순 중복 판정에 과잉.

**len diff 조건 제거**: 기각. 체인 지점명("스타벅스 성산점") 분리 불가.

## References

- ADR-0051: 카테고리 정의 (normalized_category 기준)
- ADR-0023 Amendment 3 (dedup 역사 — v1→v2→v3)
- 2026-05-20 분석: dedup v1 99% 오매칭, "성산일출봉 카페" 케이스
- `specs/visitjeju-curation-pipeline-v2.md` Phase A-2 (선행 조건)
