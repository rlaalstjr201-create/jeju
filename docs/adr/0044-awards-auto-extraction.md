# ADR-0044: awards 자동 추출 (블루리본·미쉐린 등)

Status: Accepted (2026-05-19)

## Context

제주 맛집 후보 중 일부는 블루리본서베이, 미쉐린 가이드 등 외부 권위 기관의 인증을 보유한다. 이 정보는:

1. **사용자 신뢰 강화**: "큐레이터 추천 + 블루리본 인증"은 "큐레이터 추천"보다 더 강한 신호.
2. **Reference Tier 자동 분류 근거** (ADR-0042): awards 보유 → reference tier 자동 판정.
3. **현실적 수집 방법**: 이미 수집하는 네이버 블로그/카페 snippet에 awards 언급이 자연스럽게 포함된다.

수집 대안 검토:

| 방법 | 상태 |
|------|------|
| 블루리본서베이 유료 DB 구매 | 기각 (별도 결제) |
| 미쉐린 가이드 책 구매·입력 | 기각 (별도 구매 + 수작업) |
| 외부 사이트 스크래핑 | 기각 (약관 위반·법적 위험) |
| 네이버 snippet 패턴 매칭 | **채택** — 이미 수집 중인 데이터, 추가 API 비용 0 |

## Decision

### 패턴 매칭 기반 awards 추출

Phase 0 파이프라인의 네이버 블로그/카페 snippet에서 다음 정규식 패턴으로 awards를 추출한다:

```typescript
const AWARD_PATTERNS: Array<{ pattern: RegExp; award: string }> = [
  { pattern: /블루리본/,           award: 'blue_ribbon' },
  { pattern: /[1-3]리본/,          award: 'blue_ribbon_star' },
  { pattern: /미쉐린|미슐랭/,      award: 'michelin' },
  { pattern: /미쉐린\s*스타|미슐랭\s*스타/, award: 'michelin_star' },
  { pattern: /빕\s*그루망|Bib\s*Gourmand/i, award: 'bib_gourmand' },
];
```

추출 시점: Stage 3 LLM 추출 직후, Kakao 검증 전. `LlmExtraction` 결과와 함께 파이프라인 downstream으로 전달.

### 저장 스키마

```sql
-- spots.awards JSONB 컬럼 추가 예정 (마이그레이션 번호 풀런 후 확정)
-- 예시:
{
  "blue_ribbon": true,
  "blue_ribbon_star": "1",  -- "1"~"3"
  "michelin_star": true,
  "bib_gourmand": true
}

-- curation_candidates에는 awards_hint TEXT[] 임시 저장
-- (큐레이터 검토 화면에서 참고용)
```

### Two-Tier 자동 판정 연동 (ADR-0042)

```
awards 보유 AND Kakao 검증 통과
    → tier = 'reference' (자동 판정, 큐레이터 override 가능)

awards 없음 AND authenticity_score ≥ 0.7
    → tier = 'hidden' (자동 판정)
```

### UI 배지

카드 상단에 awards 배지 표시:
- 🔵 블루리본 (1·2·3리본 구분)
- ⭐ 미쉐린 스타
- 🍽 빕 그루망

사용자가 배지를 탭하면 해당 awards 설명 툴팁.

### 한계 및 신뢰도 정책

패턴 매칭은 snippet 언급 기반이라 False Positive 가능:
- "미쉐린 타이어 제주점" → 미쉐린 식당으로 오인 가능
- 큐레이터 Label Studio 화면에 `awards_hint` 표시 → 최종 확정은 큐레이터

False Negative (언급 없는 경우): 수용. 네이버에서 언급되지 않은 awards는 "아직 모름"으로 처리.

## Consequences

**Positive:**
- 추가 API·결제 없이 이미 수집 데이터로 awards 정보 확보.
- UI 배지로 사용자 신뢰도 강화 — 큐레이터 추천 + 외부 인증의 시너지.
- ADR-0042 reference tier 자동 판정의 핵심 입력값.

**Negative / Risk:**
- 패턴 매칭 정확도 한계 (False Positive): 큐레이터 최종 확인 필수.
- 미쉐린/블루리본 수록 정보가 구버전 snippet에 포함돼 있을 수 있음 (매년 업데이트 필요).
- snippet에 awards 언급이 없으면 미탐지 (False Negative 수용).

## Alternatives Considered

**블루리본서베이 유료 DB 구매:** 기각.
- 별도 결제. 이미 수집 중인 snippet 데이터로 충분.

**미쉐린 가이드 공식 사이트 스크래핑:** 기각.
- 약관 위반·법적 위험 (대법원 2025 판례).

**수동 입력:** 기각.
- 50건 한정이라 단기 가능하나, 파이프라인 확장 시 지속 불가.

**LLM 추출 (기존 Stage 3 확장):** 보류.
- 패턴 매칭보다 비용 증가. v1.5에서 LLM이 awards 필드를 직접 추출하도록 프롬프트 확장 검토 가능.

## References

- ADR-0029: Phase 0 hidden gem 발굴 (네이버 snippet 수집 기반)
- ADR-0041: Stage 3 Tool Calling (LLM 추출 단계, awards 추출 시점)
- ADR-0042: Two-Tier 큐레이션 모델 (awards → reference tier 자동 판정)
