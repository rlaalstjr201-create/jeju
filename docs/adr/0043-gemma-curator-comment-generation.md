# ADR-0043: Gemma 큐레이터 코멘트 생성 + 사용자 reject·수정 감수

Status: Accepted (2026-05-19)

## Context

ADR-0027은 v1 큐레이터 역할을 "모든 Spot 직접 판단"으로 정의했다. 여기서 "판단"은 approve/reject 결정이었고, 코멘트(추천사) 작성은 큐레이터 본인이 한다고 암묵적으로 전제했다.

그런데 50건의 Spot마다 큐레이터가 코멘트를 직접 작성하면:
- 1건당 최소 5~10분 → 50건 = 4~8시간
- 4개월 마감(2026.8) 내 모바일 본체와 병행 불가

동시에 "AI가 쓴 코멘트를 그대로 쓰면 큐레이터 thesis가 희석된다"는 정반대 우려도 있다. ChatGPT가 생성한 관광지 설명과 차별화가 없어진다.

절충점: **AI가 초안을 생성하고, 큐레이터는 reject·수정만 한다.** 큐레이터의 노동은 '작성'이 아니라 '감수(editorial review)'로 전환. 큐레이터 개입 흔적이 최종 코멘트에 남는다.

## Decision

### 코멘트 생성 모델

| 단계 | 모델 | 조건 |
|------|------|------|
| 1차 생성 | Gemma 4 26B (OpenRouter, Tool Calling 모드) | 기본 |
| fallback | Claude Haiku 4.5 | Gemma 생성 실패 / API 오류 시 |

Gemma Tool Calling을 선택한 이유: ADR-0041에서 채택한 Gemma 26B가 이미 Kakao/Naver 검색 컨텍스트를 처리한다. 코멘트 생성은 Tool Calling이 아닌 단순 generation이지만, 동일 모델 사용으로 인프라 통일성 유지.

### 작성 시점

Label Studio 검토 화면에서 **on-demand 1건씩**. 큐레이터가 후보를 열 때 "코멘트 생성" 버튼 → API 호출 → 결과 표시.

배치 사전 생성 X — 코멘트를 보지도 않고 거절된 후보에 LLM 비용 낭비 방지.

### 큐레이터 감수 워크플로우

```
[코멘트 생성 버튼]
      ↓
Gemma 초안 생성 (naver_snippet + kakao 검색 결과 컨텍스트 포함)
      ↓
  큐레이터 검토
  ├─ OK → 그대로 사용
  ├─ Reject("다시 뽑기") → 2차 생성 1회 허용
  │       ↓
  │   2차 초안 검토
  │   ├─ OK → 사용
  │   └─ 여전히 별로 → 큐레이터 직접 수정 (텍스트 편집)
  └─ 직접 수정 → 수정 코멘트 저장
```

큐레이터 직접 수정 내용은 `curation_decisions.free_memo`에 저장 → v1.5 few-shot 학습 데이터로 활용.

### 톤 가이드

**금지어 (퍼플렉서티·ChatGPT 패턴):**
- "꼭 가봐야 할 명소", "인생샷", "현지인 추천", "숨은 보석", "강추"
- 과도한 감탄사 ("정말!!", "완전 대박")

**권장 패턴:**
- 시간대 팁: "오전 10시 이전, 주차 여유 있음"
- 솔직한 단점: "줄이 길지만 웨이팅 가치 있음", "오름 초입 30분은 가파름"
- 구체적 관찰: "창가 자리 추천, 4층이라 바다 뷰 확보"
- 계절/날씨 조건: "맑은 날 한정, 흐리면 에메랄드빛 없음"

### LlmProviderPort 확장

```typescript
// LlmProviderPort에 추가 예정
generateComment(params: {
  spotName: string;
  category: SpotCategory;
  snippet: string;
  toneGuide: string;
  maxTokens?: number;
}): Promise<string>;
```

마이그레이션: 코드 변경 불필요. `callWithTool`의 단순화 래퍼로 구현 가능.

## Consequences

**Positive:**
- 큐레이터 코멘트 작성 시간 1건당 10분 → 2분 이하 목표 (감수만).
- 큐레이터 수정 흔적이 데이터로 누적 → v1.5 few-shot으로 톤 자동 학습.
- 금지어/권장 패턴 프롬프트로 ChatGPT 관광 설명과 명확히 차별화.

**Negative / Risk:**
- Gemma 초안 품질이 낮으면 큐레이터 감수 부담이 오히려 증가. fallback(Claude Haiku) 존재.
- "다시 뽑기 1회" 정책이 충분하지 않을 수 있다 → 큐레이터가 직접 편집하면 됨.
- 큐레이터 수정 없이 Gemma 초안을 그대로 승인할 경우 thesis 희석 위험 → 감수 원칙 교육 필요.

## Alternatives Considered

**큐레이터 전량 직접 작성:** 기각.
- 50건 × 5~10분 = 4~8시간. 4개월 마감 내 모바일 본체와 병행 불가.

**Claude Opus 단독 사용:** 기각.
- 비용 과다. Gemma 26B + Claude Haiku fallback으로 충분.

**배치 사전 생성:** 기각.
- 거절 후보에 LLM 비용 낭비. on-demand가 더 경제적.

**LLM 코멘트를 큐레이터 검토 없이 직접 publish:** 기각.
- ADR-0027 HITL 원칙 위반. 큐레이터 개입이 thesis의 핵심.

## References

- ADR-0027: HITL 큐레이터 워크플로우 (큐레이터 역할 = thesis 설계 + reject + 수정, 작성 X로 재정의)
- ADR-0040: Gemma4 LlmProviderPort 추상화 (generateComment 추가 기반)
- ADR-0041: Stage 3 Tool Calling + Gemma 26B (동일 모델 사용)
