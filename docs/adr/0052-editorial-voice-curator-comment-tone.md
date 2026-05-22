# ADR-0052: Editorial Voice 큐레이터 코멘트 톤 가이드

Status: Accepted (2026-05-20) — supersedes ADR-0043 톤 정의 부분  
**Amendment 1: 2026-05-22** — 2-필드 출력 + mindtrip식 attribution + 존댓말 톤 + snippet 사전 배치  
**Amendment 3: 2026-05-22** — Extractive-First + HHEM-2.1-Open NLI 검증  
**Amendment 4: 2026-05-22** — Stage 1 모델 Gemma 4 26B → Claude Haiku 4.5 전환  
**Amendment 5: 2026-05-22** — B2 prompt + L2 snippet-target + L1 relax + HHEM 영구 폐기 + 풀런 완료 (78.8% 수율)

## Context

ADR-0043에서 Gemma 기반 코멘트 생성을 결정했다. 초기 생성 결과 품질 문제:

- 톤 부족: "한달살기 블로그 언급이 많으며 비관광지 산책에 적합함" — 메모지 수준
- 차별점 없음: 일반 여행 블로그와 동일한 어투
- 큐레이션 thesis 미반영: "큐레이터 시점이 있는 곳" → 감각·맥락·솔직함 필요

목표 모델: Monocle, Lonely Planet 영문 큐레이션 스타일. 신뢰받는 편집자 목소리.

## Decision

### Pydantic 구조화 출력 6 필드 (ADR-0045 Layer 2 확장)

| 필드 | 설명 | 예시 |
|---|---|---|
| `sensory_hook` | 감각 어휘 (시각·청각·시간대 중심) | "해 질 무렵 등대가 보이는" |
| `vibe` | 분위기 1단어 | "적막", "분주", "끈적", "차가움" |
| `timing_tip` | 시간대·요일·계절 | "평일 오후", "11월 동백 절정" |
| `honest_downside` | 솔직한 단점 | "오후엔 줄어듦", "비추 비 오는 날" |
| `practical_note` | 실용 팁 | "보말칼국수만 시키고 가는 곳" |
| `source_snippet_ids` | grounding citation (필수) | `["snip_abc", "snip_def"]` |

### 후처리 합성 규칙

구조: `[sensory_hook/vibe로 시작]` + `[practical_note 또는 honest_downside]` + `[timing_tip]`  
길이: **30~80자** (한국어 기준)

**예시 코멘트:**
- "해 질 무렵 등대 보이는 벤치 한 자리. 평일 오후 추천."
- "파도 소리만 들리는 30분. 성산일출봉 그늘에 가려 사람들이 지나친다."
- "보말칼국수만 시키고 가는 곳. 주말 줄 30분."
- "보림출판사 협업. 어른이 그림책 읽다 우는 곳. 시간 잡고 가야 함."

### 금지 어휘 — negative regex post-filter

❌ 출력 생성 후 필터링:
- `꼭 가봐야|인생샷|강추|현지인 추천|숨겨진 보석`
- 의문문·감탄사: `[!?！？]`
- 1인칭·2인칭: `저는|저도|여러분|당신`

### 권장 어휘 패턴

✅ 감각: "해 질 무렵", "파도 소리만", "차가운 공기", "이른 아침"  
✅ 시점: "평일 오후", "주말 줄 30분", "11월 동백 절정", "비 오는 날 비추"  
✅ 솔직: "평범한 바위", "오후엔 줄어듦", "주차 어려움"  
✅ 구체: 음식 이름, 장면 묘사, 디테일 명시

### 언어 정책

- **Instruction**: 영어 (LLM 성능 최적화)
- **출력**: 한국어 (서비스 언어)
- 이유: 영어 instruction → 한국어 생성이 구조 이탈 방지에 효과적 (내부 실측)

### trend_category 코멘트 반영

- `steady` → "꾸준한", "변하지 않는"
- `rising` → "최근 검색량 급상승", "떠오르는"
- `seasonal` → "11월 동백 절정", "여름 한정"
- `declining` → 코멘트 생성 시 warning flag (큐레이터 수동 확인 유도)

## Consequences

**Positive:**
- 메모지 톤 차단, 편집자 목소리 차별화
- ADR-0045 환각 방지 5-Layer와 정합 (구조화 출력 + grounding citation)
- v1.5 negative dictionary 학습 데이터 자연 축적 (금지 어휘 탐지 로그)

**Negative / Risk:**
- 30~80자 한국어 합성 prompt 튜닝 필요
- Gemma·GPT-4o mini 한국어 출력 품질 변동성 (큐레이터 검토로 보완)

## Alternatives Considered

**4 필드 유지 (sensory·vibe 없음)**: 기각. 톤 부족 문제 미해결.

**자유 텍스트 생성**: 기각. ADR-0045 Layer 2 Structured Output 위반, 환각 통제 불가.

**더 긴 코멘트 (100~200자)**: 기각. 모바일 카드 UI 가독성 저하.

**한국어 instruction**: 기각. 내부 실측에서 영어 instruction → 한국어 출력이 구조 이탈 적음.

## References

- ADR-0010: 큐레이터 thesis (신뢰받는 편집자 목소리)
- ADR-0043: 코멘트 생성 정책 (superseded 부분: 톤 정의)
- ADR-0045: 환각 방지 5-Layer (구조화 출력 기반)
- ADR-0049: trend_category (코멘트 시점 정보 활용)
- Tokyo curated maps $19.99 사례 (Monocle 톤 검증 근거)

---

## Amendment 3 (2026-05-22): Extractive-First + HHEM-2.1-Open NLI 검증

### 변경 배경

Amendment 1 설계(Stage 2 = GPT-4o mini CoVe)의 실측 문제:
- hook null 60%: Stage 1이 `llm_summary` 정보를 hook으로 생성 → Stage 2가 "snippet 미지원"으로 탈락
  (Stage 1 user prompt에 `Description: {llm_summary}` 포함 → Stage 2 snippet 기반 검증과 정보 비대칭)
- Stage 2 과도 엄격: "고요한", "박물관처럼" 같은 편집자 해석을 사실 주장으로 취급, snippet에 실제 존재해도 탈락
- 근본 원인: free-form paraphrase + post-hoc 검증 구조는 grounding과 생성이 분리됨

### 해결책: Extractive-First 설계

Stage 1이 **evidence_quote(snippet 원문 substring) 먼저 추출**, 그 다음 paraphrase 생성.
Stage 2는 LLM 없이 결정론적 3-Layer로 검증.

### Stage 1 최종 Prompt

**SYSTEM (한국어 — 이번 태스크는 한국어 instruction이 추출 정확도 우위)**:
```
당신은 한국어 여행 큐레이션 에디터입니다.
아래 스니펫만 근거로 1~2문장의 자연스러운 코멘트를 작성합니다.

규칙:
1. 스니펫의 정보만 사용 (추론 금지, 내부 지식 금지).
2. evidence_quote는 한 스니펫의 정확한 substring이어야 합니다 (텍스트 수정 X).
3. comment는 evidence_quote의 의미를 보존한 자연스러운 한국어 (paraphrase 가능).
4. 핵심 표현은 따옴표로 직접 인용 가능.
5. 광고 어휘 금지: 꼭, 강추, 인생, 숨겨진, !, ?
6. 1·2인칭 금지: 저는, 여러분, 당신
7. 존댓말: ~좋아요, ~쉽습니다, ~납니다
8. 30~80자
```

**출력 JSON 스키마:**
```json
{
  "comment": "string",
  "evidence_quote": "string (스니펫 원문 substring)",
  "source_id": "string (스니펫 번호 '1'~'10')"
}
```

**언어 정책 변경:** 이번 태스크는 한국어 instruction 채택 (추출 정확도 우위, ADR-0052 원칙의 예외).

### Stage 2: 결정론적 3-Layer

LLM 없음. 순서대로 실패 시 다음 단계:

| Layer | 방식 | 실패 시 |
|-------|------|---------|
| Layer 1 | evidence_quote ⊆ snippets[source_id] substring 검사 | 1회 재시도 → reject |
| Layer 2 | cosine(comment, evidence_quote) via Voyage AI ≥ 0.70 | reject |
| Layer 3 | HHEM-2.1-Open NLI entailment(snippet, comment) ≥ 0.50 | 큐레이터 수동 큐 |

### HHEM-2.1-Open 채택 근거

- vectara/hallucination_evaluation_model (HuggingFace)
- 요약 태스크 hallucination 검증 특화, 학계 표준
- 오픈소스·로컬 추론·비용 0
- Gemma 3 12b 4.4% hallucination rate 실증 (소형 모델이 요약에 강함)
- 다국어 지원 (한국어 snippet+comment 처리 가능)
- Node.js → Python 브릿지 (stdin/stdout NDJSON, long-lived process)

### ADR-0052 Amendment 1 대비 변경 요약

| 항목 | Amendment 1 | Amendment 3 |
|------|------------|------------|
| Stage 2 검증자 | GPT-4o mini (LLM) | 결정론적 3-Layer (LLM 없음) |
| 생성 방식 | Free paraphrase | Extractive-first (quote → paraphrase) |
| hook null 예상 | 60% | < 20% (evidence_quote 존재 시 항상 생성) |
| 비용/건 | ~$0.003 | ~$0.002 (Stage 2 LLM 제거) |
| System 언어 | 영어 | 한국어 (추출 정확도 예외 규정) |

## Amendment 1 (2026-05-22): mindtrip식 attribution 구조 도입

### 변경 배경

mindtrip 참고 디자인 검토 결과:
- 2문장 구조 (hook + supporting)가 모바일 카드 스캔 패턴에 적합
- 존댓말 종결어미가 앱 톤과 정합
- 출처 attribution("Mentioned by...")이 신뢰도 강화에 효과적
- 블로거명은 개인정보 우려 → URL + 타입 아이콘으로 대체

### 출력 스키마 변경: 6 필드 → 2 필드 + sources

**구 스키마 (6 필드):** sensory_hook, vibe, timing_tip, honest_downside, practical_note, source_snippet_ids  
**신 스키마 (2 필드 + sources):**

```json
{
  "hook": "string | null",        // 1문장 30~50자, 감각·실용 후크, 존댓말
  "supporting": "string | null",  // 1문장 30~50자, timing|practical|downside 중 1, 존댓말
  "sources": [
    {
      "source_type": "blog | cafe | official",
      "source_url": "string",
      "quote": "string"
    }
  ]
}
```

### 톤 보강

- **존댓말 종결어미 필수**: "~좋아요", "~쉽습니다", "~납니다", "~됩니다"
- **비교 기준 권장**: "교토보다 한적한", "성산보다 덜 알려진"
- 기존 감탄사·1인칭 금지 룰 유지

### 코멘트 합성 규칙 변경

구: `[sensory_hook/vibe]` + `[practical/downside]` + `[timing]` → 1줄  
신: `hook` + `supporting` → 2문장, 각 30~50자, 합계 60~100자

**예시:**
- hook: "이른 아침 파도 소리만 들리는 해안입니다."  
  supporting: "성산일출봉 쪽보다 방문객이 적어 여유롭습니다."
- hook: "보말칼국수 한 그릇으로 끝나는 집입니다."  
  supporting: "주말엔 줄이 30분 정도 됩니다."

### UI attribution 표시 (Phase F·알파)

- 출처 타입 아이콘: 블로그 🟦, 카페 📗, 비짓제주/공식 🏛️
- 클릭 시 `quote` + `source_url` 펼침 (author 미노출)
- "N곳에서 언급됨" 집계 (N = sources 배열 길이)

### snippet 수집 방식 변경

Q1 결론: **옵션 C (사전 배치)** 선택.  
이유: attribution 필수 = llm_summary 단독 grounding 불가. 응답 속도·비용 균형 최적.

- **Phase E.0**: 알파 1,000건 사전 배치 수집 (`spot_snippets` 테이블, Migration 024)
- Naver 블로그 + 카페 각 10건, 쿼리: `{name} 제주`
- 저장: title, description(snippet 본문), source_url, source_type

### declining 처리

`trend_category = 'declining'` 98건:
- 코멘트 생성 진행 (생성 보류 아님)
- `comment_warning_flag = 'declining'` 마킹
- Stage 1 prompt에 "⚠️ DECLINING TREND" 힌트 추가 → LLM이 과장된 긍정 생성 억제

---

## Amendment 4 (2026-05-22): Stage 1 모델 Gemma 4 26B → Claude Haiku 4.5 전환

### 변경 배경: Gemma 4 26B tool calling 신뢰성 실패

Amendment 3에서 Stage 1 모델로 `google/gemma-4-26b-a4b-it` (OpenRouter)를 채택했다.
풀런 dry-run 3회 실행 결과 Stage 1 통과율이 일관되게 20%를 기록했다.

**실패 양상:**

| 실험 | 처리 건수 | Stage 1 성공 | 성공률 |
|------|----------|------------|--------|
| dry-run #1 (원본) | 10건 | 2건 | 20% |
| dry-run #2 (retry fix 적용) | 5건 | 0건 | 0% |
| dry-run #3 (retry fix + 다른 spot set) | 10건 | 2건 | 20% |

- HTTP 에러 없음: OpenRouter는 200 OK 반환
- `tool_calls` 부재: response body에 `tool_calls` 필드가 없는 경우가 대부분
- 에러 메시지 없음: `[LLM] HTTP` 에러 로그 미출력
- 따라서 **OpenRouter가 Gemma에게 `tool_choice: { type: 'function' }` 강제를 제대로 적용하지 못함**으로 추정

**재시도 fix 비효과:**

```typescript
// Before: !args → 즉시 return null (1회만 시도)
if (!args) return null;

// After: !args → 1초 대기 후 최대 3회 재시도
if (!args) { await new Promise(r => setTimeout(r, 1000)); continue; }
```

재시도 fix를 적용했으나 통과율 변화 없음.
원인: `temperature: 0.1`로 인해 동일 입력 → 동일 출력 (결정론적).
같은 prompt를 3회 보내도 모델은 같은 응답(tool_calls 없음)을 반환함.

**이론적 예상 vs 실측:**

| 가정 | 1회 시도 | 3회 재시도 이론값 | 실측 |
|------|--------|----------------|------|
| 시도당 성공률 20% | 20% | 49% (1−0.8³) | 20% (변화 없음) |

결정론적 출력이 확인됨 → 재시도는 무의미.

**Thesis 수정:**

Amendment 3 채택 근거 중 "Gemma 3 12b 4.4% hallucination rate (Vectara 리더보드)"는
**영어 요약 태스크 기준**이다. 본 태스크(한국어 snippet 추출 + paraphrase + JSON tool calling)
와는 도메인·언어·출력 형식이 모두 다르다.

특히 Gemma 4 26B(`a4b` = active 4B 파라미터 MoE)는 소형 활성 파라미터 모델이라
OpenRouter 경유 강제 tool calling의 신뢰성이 낮았다.

### 결정: Claude Haiku 4.5 (Anthropic SDK 직접 호출)

**검증 결과:**

```
dry-run #1 (Claude Haiku 4.5, 10건): Stage 1 성공 10/10 = 100%
L1 substring check: 10/10 = 100%
```

**구현 변경:**

| 항목 | Before (Amendment 3) | After (Amendment 4) |
|------|---------------------|---------------------|
| Stage 1 모델 | `google/gemma-4-26b-a4b-it` | `claude-haiku-4-5-20251001` |
| API 엔드포인트 | OpenRouter (`/api/v1/chat/completions`) | Anthropic SDK (`messages.create`) |
| 환경변수 | `OPENROUTER_API_KEY` | `ANTHROPIC_API_KEY` |
| tool 형식 | OpenAI (`parameters`, `tool_choice.function`) | Anthropic (`input_schema`, `tool_choice.tool`) |
| 구현 방식 | 스크립트 내 하드코딩 | 스크립트 내 하드코딩 (config 없음) |

**비용 비교:**

| 방식 | 예상 패스 수 | 예상 비용 |
|------|-----------|---------|
| Gemma 4 26B (20% 성공률 기준) | 10+ 패스 | ~$5.77 |
| Claude Haiku 4.5 (100% 성공률) | 1 패스 | ~$0.94 |

Haiku가 비용도 저렴하고 신뢰성도 높음. 단순 비용 우위가 아니라 **확정적 1-pass 실행**이 핵심.

### Gemma fallback 결정

Gemma 4 26B는 Stage 1 fallback에서도 제외한다.
이유: tool calling 신뢰성 문제가 근본적이므로 fallback으로도 유용하지 않음.
Stage 1 실패 시 처리: `comment_draft IS NULL` 유지 → 동일 Haiku 명령 재실행.

### 비용 실측

풀런 930건 완료 후 실비용을 이 ADR에 추가 기록 예정.
(예상: ~$0.94, 입력 930×2K tokens + 출력 930×400 tokens 기준)

## References (Amendment 4 추가)

- `src/scripts/generate-comments-v2.ts` — Stage 1 구현 (callWithTool 함수)
- `ANTHROPIC_API_KEY` — 환경변수 (`.env`)
- Vectara HHEM 리더보드 (영어 요약 기준, 한국어 추출에 적용 주의)
- ADR-0052 Amendment 3 — Extractive-First 설계

---

## Amendment 5 (2026-05-22): B2 prompt + L2 snippet-target + L1 relax + HHEM 영구 폐기 + 풀런 완료

### 변경 배경: L2 통과율 14% → 57% 문제

Amendment 4 (Claude Haiku 4.5)로 Stage 1 100% 성공 달성 후, L2(cosine) 검증에서 다수 탈락 발생.  
dry-run 실험 A(10건): L2(quote) 기준 1/10 성공. 근본 원인: **semantic drift** — Haiku가 evidence_quote를 paraphrase하는 과정에서 의미가 분산되어 cosine 유사도가 하락.

### 실험 결과 요약

| 실험 | 설정 | 주요 발견 |
|------|------|---------|
| A | l2-target=both (quote+snippet 비교) | snippet 기준 57% vs quote 기준 14% — L2 타겟 변경 필요 |
| B1 | stage1-variant=B1 (긴 evidence_quote) | quote-L2 0.604~0.633 — L1은 통과하나 L2 여전히 실패 |
| B2 | stage1-variant=B2 (quote 표현 첫 절 배치) | quote-L2 0.777~0.770 — 같은 spot이 0.604→0.777로 향상 |
| D | l1-relax (전체 스니펫 재탐색) | L1 구조적 실패(quote 합성) 해소 불가, 정규화 버그 수정 기여 |

### Amendment 5 결정 사항

**B2 Stage 1 prompt 변경:**

- comment 필드 지시: `"evidence_quote의 핵심 표현을 그대로 살린 30~50자 한국어 1문장. 장소명·위치·업종 framing 최소화. evidence_quote 표현으로 시작하거나 첫 절에 배치."`
- 추가 규칙 9: `"[장소명]은/는 [위치/분류] 이에요" 패턴 금지. evidence_quote의 표현이 comment의 첫 절에 등장해야 합니다.`
- 근거: framing-first 패턴이 evidence_quote 표현을 2절로 밀어내어 semantic drift 발생. 첫 절 배치 강제로 차단.

**L2 검증 타겟: evidence_quote → full snippet (`--l2-target=snippet`)**

- `cosine(comment, evidence_quote)` 기준 14% pass → `cosine(comment, full_snippet)` 기준 57% pass
- 이유: full snippet이 comment와 공유하는 맥락이 더 넓음. evidence_quote 단독 벡터가 짧아 코사인 민감도 높음.
- threshold 0.70 유지.

**L1 정규화 (`normalize`):**

- 버그: `'연우네 식당'` (unicode curly quote) ⊄ `'연우네 식당'` (ASCII) → false L1 failure
- 수정: `normalize = s => s.replace(/[''‚‛]/g, "'").replace(/[""„‟]/g, '"')` 후 substring 검사

**L1 relax (`--l1-relax`):**

- source_id 스니펫에서 탐색 실패 시 전체 스니펫에서 재탐색
- 효과: typographic 오류 보정 후 잔여 L1 실패 구조적 감소 (source_id 오기재 복구)

**HHEM 영구 폐기:**

- Amendment 3에서 Layer 3으로 채택한 HHEM-2.1-Open을 영구 비활성화 (`--no-hhem` 기본값으로 전환)
- 실증 근거: 한국어 여행 코멘트에서 L2 통과 평균 HHEM = L2 실패 평균 HHEM = **0.137** (구별 불가)
- 추가 원인: transformers 5.x에서 T5 weight tie 버그 (encoder.embed_tokens ≠ shared.weight → 고정 출력 0.502) — 별도 수정 코드 적용했으나 한국어 여행 도메인 미지원이 근본 원인
- Stage 2 = L1 + L2 2-Layer로 단순화

### 풀런 결과 (2026-05-22)

**명령:**
```
VOYAGE_INTERVAL_MS=30000 HAIKU_INTERVAL_MS=2000
npx tsx src/scripts/generate-comments-v2.ts \
  --no-hhem --stage1-variant=B2 --l2-target=snippet --l1-relax
```

**결과:**

| 항목 | 건수 |
|------|------|
| 대상 | 539건 |
| 성공 | **425건 (78.8%)** |
| L2 실패 (cosine < 0.70) | 97건 |
| L1 구조적 실패 | 4건 |
| Stage 1 실패 (529 Overloaded) | 13건 |

**L2 cosine:** 평균 0.780 / 최저 0.700 / 최고 0.938 (해녀박물관)

**DB 누적 (Phase E 완료):** reference 1000건 중 **816건 has_draft** / 114건 NULL 잔여 / 69건 snippet_poor

**NULL 잔여 분류:**
- 529 재처리 대상: 13건 (새빌, 남경미락, 하나로국밥, 곱들락, 하늘채가든, 제주예찬, 카페공작소, 피어22, 가시아방, 그랑블루 요트투어, 바다해찬, 엉덩물, 도두해녀의집)
- 구조적 실패: 101건 (L2 97건 + L1 4건) — snippet 품질 낮거나 semantic drift 잔여

### 비용 회고: prompt caching 미적용

`@anthropic-ai/sdk` 0.27.3에서 `TextBlockParam.cache_control` 타입 미지원으로 prompt caching 미적용.  
추정 절감 가능액: ~$0.5 (system prompt ~1,000 tokens × 595 호출 기준).  
다음 풀런(NULL 재처리) 전 SDK 업그레이드 필요 (`npm install @anthropic-ai/sdk@latest`).

**실제 비용 (추정):** ~$1.4 (input ~1.2M tokens + output ~120K tokens, Haiku 4.5 기준)

## References (Amendment 5 추가)

- `diagnostics/fullrun-*.log` — 풀런 전체 로그
- `diagnostics/exp-{a,b1,b2,d}.log` — 4개 실험 결과
- `src/scripts/generate-comments-v2.ts` — B2/snippet/relax 구현
- ADR-0052 Amendment 4 — Claude Haiku 4.5 채택
