# Light Spec — Stage 4 Generic-Phrase 필터 픽스

**Feature:** Stage 4 Kakao/Naver 검증 경로에 isSubstantialMatch 필터 적용  
**Persona:** 파이프라인 엔지니어  
**Status:** Draft  
**Depends on:** ADR-0029, ADR-0041  
**Migration:** 없음 (코드 변경만)

---

## 1. 결함 설명

### 증상

Phase 0 풀런(50쿼리) 결과 큐레이터 큐에 다음과 같은 generic phrase가 포함됨:

- `"제주 서귀포 현지인 맛집"` — Kakao 검색 시 인근 식당 히트, spot_name으로 저장
- `"제주한달살이숙소"` — Kakao 숙소 카테고리 히트
- `"제주 카페 추천"`, `"제주 맛집 투어"` 유사 패턴

이 항목들은 특정 장소가 아니라 설명 문구이므로, 큐레이터 검토 화면에서 수동으로 걸러야 한다.

### 근본 원인

```
TC 어댑터 (Stage 3 tool calling 내부)
  └─ onToolCall → isSubstantialMatch() 필터 적용 ✓
      (search 결과 이름이 검색 쿼리를 포함해야 유효)

Stage 4 (RunDiscoveryPipelineUseCase)
  └─ KakaoLocalVerifier.verify(spot_name) ← 필터 없음 ✗
  └─ NaverLocalVerifier.verify(spot_name) ← 필터 없음 ✗
```

TC 어댑터는 LLM이 검색한 결과를 필터링하지만, Stage 4에서 파이프라인이 직접 호출하는 Kakao/Naver 검증에는 동일 필터가 없다.

`"제주 서귀포 현지인 맛집"` → Kakao 검색 → 인근 식당 반환 → `isSubstantialMatch("제주 서귀포 현지인 맛집", "서귀포 흑돼지 전문점")` = false (결과 이름이 쿼리 포함 안 함) → 필터로 걸러야 하는데 Stage 4엔 필터 없음.

---

## 2. 픽스 설계

### 2.1 KakaoLocalVerifier에 match filter 추가

위치: `src/infrastructure/kakao/KakaoLocalVerifier.ts`

현재 동작: Kakao API가 결과를 반환하면 첫 번째 결과를 matched=true로 반환.

변경: 결과 이름이 검색 쿼리를 실질적으로 포함하는지 검사. 불일치 시 matched=false 반환.

```typescript
// 적용할 함수 — LlmExtractorAdapter.ts의 isSubstantialMatch와 동일 로직
function isSubstantialMatch(query: string, resultName: string): boolean {
  const q = query.replace(/\s+/g, '');
  const r = resultName.replace(/\s+/g, '');
  return r.includes(q);
}
```

**예시:**

| 검색 쿼리 | Kakao 반환 이름 | 현재 | 픽스 후 |
|---|---|---|---|
| `선흘곶식당` | `선흘곶식당` | matched=true | matched=true ✓ |
| `제주 서귀포 현지인 맛집` | `서귀포 흑돼지 전문점` | matched=true ✗ | matched=false ✓ |
| `에코랜드` | `에코랜드테마파크` | matched=true ✓ | matched=true ✓ |
| `금능` | `금능해수욕장` | matched=false | matched=false (별도 확장 로직에서 처리) |

### 2.2 NaverLocalVerifier에 match filter 추가

위치: `src/infrastructure/naver/NaverLocalVerifier.ts` (또는 동등 어댑터)

KakaoLocalVerifier와 동일 패턴 적용.

### 2.3 적용 위치 — Stage 4 검증 체인

```typescript
// KakaoLocalVerifier.verify() 내부
const results = await this.fetchKakaoLocal(spotName);
const matched = results.find(r => isSubstantialMatch(spotName, r.place_name));
if (!matched) return { matched: false, ... };
```

---

## 3. 검증 계획

### 3.1 기존 큐 1,207건 중 generic-phrase 추출률 측정

```sql
-- Stage 4 통과한 현재 큐 중 generic phrase 의심 패턴
SELECT name, verified_by, naver_snippet
FROM curation_candidates
WHERE source_type = 'naver'
  AND verified_by IS NOT NULL
  AND (
    name LIKE '%현지인%'
    OR name LIKE '%추천%'
    OR name LIKE '%맛집%'
    OR name LIKE '%한달살이%'
    OR name LIKE '%투어%'
    OR char_length(name) > 15  -- 장소명치고 너무 긴 이름
  )
ORDER BY created_at DESC
LIMIT 50;
```

기준:
- `name` 길이 > 15자: 장소명보다 설명 문구일 가능성 높음
- 특정 단어 포함: 현지인, 추천, 맛집, 투어, 한달살이, 숙소 추천

### 3.2 단위 테스트 추가

`KakaoLocalVerifier.test.ts`:

```typescript
it('returns matched=false when kakao result name does not contain the searched query', async () => {
  // kakao returns "서귀포 흑돼지 전문점" when queried "제주 서귀포 현지인 맛집"
  // isSubstantialMatch("제주서귀포현지인맛집", "서귀포흑돼지전문점") = false
  expect(result.matched).toBe(false);
});

it('returns matched=true when kakao result name contains the searched query', async () => {
  // kakao returns "선흘곶식당" when queried "선흘곶식당"
  expect(result.matched).toBe(true);
});
```

### 3.3 회귀 테스트 — 기존 TC 어댑터 테스트 전체 통과 유지

`isSubstantialMatch` 로직이 두 곳에 복제되므로:
- 공유 유틸 함수로 추출 (옵션 A)
- 각 파일에 동일 로직 유지 (옵션 B)

**권장: 옵션 A** — `src/application/curation/SpotNameMatcher.ts` 에 단일 함수 추출, 두 어댑터에서 import.

---

## 4. 영향 범위

| 파일 | 변경 |
|---|---|
| `src/infrastructure/kakao/KakaoLocalVerifier.ts` | `isSubstantialMatch` 필터 추가 |
| `src/infrastructure/naver/NaverLocalVerifier.ts` | 동일 |
| `src/application/curation/SpotNameMatcher.ts` | 신규 — 공유 유틸 추출 (권장) |
| `src/infrastructure/kakao/KakaoLocalVerifier.test.ts` | 단위 테스트 추가 |
| `src/infrastructure/llm/LlmExtractorAdapter.ts` | `isSubstantialMatch` 제거 → import로 교체 |

---

## 5. 기존 큐 처리

픽스 적용 이후 신규 수집분에는 자동 적용.

기존 큐(1,207건) 중 generic-phrase 오분류 건:
- **재처리 불필요**: 큐레이터 검토 화면에서 `name` 길이 > 15자 또는 의심 단어 포함 건을 UI 필터로 걸러낼 수 있도록 export-curator-queue 스크립트에 플래그 추가 검토.
- **v1 결정**: 큐레이터가 수동으로 reject. 재수집 X (ADR-0022 거절 재발굴 금지 원칙 준수).

---

## 6. 수락 기준

### AC-G1: generic-phrase 차단
- `"제주 서귀포 현지인 맛집"` 쿼리가 Stage 4 Kakao 검증을 통과하지 않는다 (matched=false 반환).
- `"에코랜드"` 쿼리는 기존과 동일하게 `"에코랜드테마파크"` 결과와 매칭된다 (회귀 없음).

### AC-G2: 단위 테스트
- `KakaoLocalVerifier` generic-phrase 차단 테스트 통과.
- 기존 429개 테스트 전체 유지.

### AC-G3: 공유 유틸
- `isSubstantialMatch`가 `SpotNameMatcher.ts` 한 곳에서만 정의되고, `LlmExtractorAdapter`·`KakaoLocalVerifier`·`NaverLocalVerifier`에서 import한다 (중복 로직 제거).

---

## Open Questions

- **OQ-G1:** `isSubstantialMatch`는 결과 이름이 쿼리를 포함하는지 확인한다. 반대 방향 (쿼리가 결과 이름을 포함)도 허용해야 하는 케이스가 있는가? 예: 쿼리 `"에코랜드"`, 결과 `"에코랜드"` → 이미 r.includes(q) 통과. 쿼리 `"에코랜드테마파크"`, 결과 `"에코랜드"` → 실패 (정상). 추가 케이스 없으면 단방향 유지.

---

## References

- ADR-0029: Phase 0 hidden gem 발굴 (isSubstantialMatch 최초 도입 배경)
- ADR-0041: Stage 3 Tool Calling (TC 어댑터 내 필터 적용)
- `src/infrastructure/llm/LlmExtractorAdapter.ts:34` — 현재 isSubstantialMatch 위치
