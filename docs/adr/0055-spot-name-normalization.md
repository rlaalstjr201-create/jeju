# ADR-0055: Spot Name 정규화 정책

Status: Accepted (2026-05-22)

## Context

비짓제주 원본 데이터의 `name` 필드에는 운영 상태, 별칭, 지점명, 지역명 접미어 등이
괄호·공백으로 혼재한다.

이를 그대로 Naver 검색 쿼리에 사용하면 오매칭이 발생한다.
만장굴 케이스 확인 (2026-05-22):
- `rawName`: `"만장굴(안전점검 및 내부공사로 운영중단)"`
- 검색 쿼리: `"만장굴(안전점검 및 내부공사로 운영중단) 제주"` → 전기공사·한의원 글 오매칭
- 정규화 후: `"만장굴 제주"` → 10/10 100% 포함률

1,000건 알파 셋 진단 결과: **49건(4.9%)** 정규화 효과 발생.

## Decision

`src/lib/normalize-spot-name.ts` 에 두 함수를 정의한다.

### normalizeSpotName(rawName: string): string

DB UPDATE 용도가 아님 — 검색 쿼리·비교 전용.

**규칙 (적용 순서)**:

| # | 규칙 | 예시 |
|---|------|------|
| 1 | 괄호 안 내용 제거 (전각·반각) | `"만장굴(안전점검…)"` → `"만장굴"` |
| 2 | 연속 공백 → 단일 공백, trim | `"쇠소깍  전통  "` → `"쇠소깍 전통"` |
| 3 | trailing ` 제주` 제거 (결과 ≥ 2자) | `"나우카페 제주"` → `"나우카페"` |
| 4 | `제주OO` 선행 형태는 유지 | `"제주4.3평화공원"` → 변경 없음 |

**적용 시점**:
- `collect-snippets.ts`: 검색 쿼리 생성 시 (`${normalizeSpotName(name)} 제주`)
- `snippet-source-audit.ts`: spot명 포함 여부 비교 시
- `collect-snippets-single.ts`: 단건 재수집 시

### spotNameVariants(normalizedName: string): string[]

Naver 검색 공백 처리를 위해 공백 있는 형태와 없는 형태 모두 반환.

```typescript
spotNameVariants("바다의 집") // → ["바다의 집", "바다의집"]
spotNameVariants("만장굴")    // → ["만장굴"]
```

적용 시점: 필요 시 검색 쿼리 변형으로 사용 (현재 collect-snippets는 단일 쿼리).

## Consequences

**Positive:**
- 오매칭 근본 원인 제거
- 만장굴 포함률 75% → 100%
- 1,000건 중 49건(4.9%) 검색 품질 개선

**Negative / Risk:**
- `제주평화박물관(전쟁평화박물관)[휴관중]` — 대괄호 `[...]`는 현재 규칙 밖, `[휴관중]` 잔존
  → v1.5에서 대괄호 규칙 추가 검토
- `고집돌우럭(제주공항점)` + `고집돌우럭(중문)` → 동일 정규화명 수렴
  → spot_id 기준 식별이므로 DB 무결성 영향 없음

## Alternatives Considered

**raw name 그대로 사용**: 기각 — 만장굴 케이스처럼 5/20건 오매칭 발생.

**DB name 필드 직접 수정**: 기각 — 원본 보존 원칙. 정규화는 검색 전용 연산.

## References

- `src/lib/normalize-spot-name.ts` — 구현
- `src/lib/normalize-spot-name.test.ts` — 15 테스트 통과
- `src/scripts/diagnostics/normalization-impact-audit.ts` — 49건 영향 분석
- `src/scripts/diagnostics/extract-operating-status.ts` — 49건 일괄 적용 (curation_candidates.name)
- ADR-0056 — operating_status 분리 정책
