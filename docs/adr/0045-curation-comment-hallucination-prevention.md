# ADR-0045: 큐레이션 코멘트 환각 방지 5-Layer 파이프라인

Status: Accepted (2026-05-20)

## Context

ADR-0043은 Gemma가 큐레이터 코멘트 초안을 자동 생성하고, 큐레이터가 감수(reject·수정)하는 구조를 채택했다. 그러나 LLM 코멘트 생성의 최대 리스크인 환각(hallucination)에 대한 구체적 방어 체계가 정의되지 않았다.

학계·실무 자료 종합:

| 자료 | 핵심 결론 |
|------|-----------|
| Dhuliawala 2023 (Meta CoVe) | Factored 2-Step 검증이 Joint보다 환각 17%→70% 차단 |
| ACM "Cite Before You Speak" 2025 | Citation 강제가 grounding 13.83% 향상 |
| Cross-model audit arXiv:2603.03299 | Multi-model consensus 95.6% 정확도 |
| HELM benchmark | temperature 0.1 환각 -20% |
| RefusalBench 2025 | Selective refusal이 grounded model 신뢰도 핵심 |
| AWS RAG best practices | 출처 품질이 응답 신뢰도를 결정, 양 아님 |

단일 기법으로는 환각률 목표 달성 불가. Multi-layered framework 필요.

**알파 목표: 큐레이터 audit 기준 환각률 < 5%**

ChatGPT external review (2026-05-20) 반영: 알파 200건 규모에 4-Stage Factored CoVe 전체 적용은 over-engineered. 2-Stage 기본 구조로 시작, v1.5에서 trigger 조건 명시.

## Decision

### 전체 구조: 2-Stage 기본 + 5-Layer 방어선

```
snippet 수집 (5 → 10건)
       │
       ▼
Layer 5: Multi-source dedup (cosine ≥ 0.80 → 클러스터 1건 카운트)
       │
       ▼
Layer 3: Selective Refusal (snippet 수 → null / 경고 / 정상)
       │
       ▼
Layer 1+2: Stage 1 — Gemma 26B
       RAG + Grounding 강제 + Structured Output
       → CuratorCommentDraft
       │
       ▼
Negative regex post-filter (Layer 4 sub)
       │ 매칭 시 Stage 1 재실행 1회
       ▼
Layer 4: Stage 2 — GPT-4o mini
       독립 Grounding 검증 (Factored 원칙)
       실패 사실 drop
       │
       ▼
후처리: 필드 합성 → 1줄 코멘트
       │
       ▼
큐레이터 감수 (ADR-0043)
```

---

### Layer 1: Grounding + Citation 강제

snippet에 없는 사실 생성 금지. 프롬프트 규칙:

```
RULES (absolute):
Every factual claim MUST come from provided snippets.
DO NOT use general knowledge about this place.
Cite source snippet ID for each claim (e.g. [S1], [S2]).
If snippets provide insufficient information for a field, return null for that field.
```

- 영어 instruction + 한국어 출력 (메모리 정책)
- `source_snippet_ids: List[str]` 필드 Pydantic 모델에 필수 포함
- `according to snippet [S1]...` 패턴 유도 ("According to..." prompting, UNC/Allen AI arXiv:2305.13252)

---

### Layer 2: Structured Output (Pydantic)

자유 텍스트 생성 금지. 4개 nullable 필드로 구조화:

```python
class CuratorCommentDraft(BaseModel):
    timing_tip: str | None          # 시간대·요일 팁 (객관)
    queue_status: str | None        # 웨이팅·혼잡도 (객관)
    honest_downside: str | None     # 솔직한 단점 (주관 허용)
    practical_note: str | None      # 실용 팁 (혼합)
    source_snippet_ids: list[str]   # 인용 snippet ID 목록 (필수)
```

후처리에서 non-null 필드를 합성해 1줄 코멘트 생성.

---

### Layer 3: Selective Refusal (완화 기준)

snippet 수 기반 3단계 판정:

| snippet 수 | 처리 |
|---|---|
| 0건 | 전체 코멘트 null, 큐레이터 직접 작성 큐 |
| 1건 | `"참고자료 부족"` 플래그 + 큐레이터 우선 검토 큐에 분리 |
| ≥ 2건 | 정상 생성 |

필드별 차등:
- **객관 필드** (`timing_tip`, `queue_status`): 근거 snippet ≥ 2건 일치 → 채택. 1건 단독 → 해당 필드 null.
- **주관 필드** (`honest_downside`, `practical_note`): 근거 ≥ 1건 허용 (단일 출처도 의견으로 가치 있음).

AWS RAG 지침 적용: snippet 개수보다 출처 품질(중복 제거 후 독립 근거 수)이 핵심.

---

### Layer 4: 2-Stage Pipeline (알파)

#### Stage 1 — Gemma 26B (Draft 생성)

- 모델: `google/gemma-2-26b-it` (OpenRouter)
- 입력: spot 메타 + snippet 목록 (S1~S10)
- Layer 1·2 적용: Grounding 강제 + Structured Output
- 출력: `CuratorCommentDraft`

**Negative regex post-filter** (ADR-0030 인프라 재활용):

금지 패턴:
```
꼭 가봐야|인생샷|강추|현지인 추천|숨겨진 보석|[!?]{1,}|저는|여러분
```

매칭 시 Stage 1 재실행 1회 (이후 매칭 유지되면 통과시키되 큐레이터 경고 플래그).

#### Stage 2 — GPT-4o mini (Grounding 검증)

- 모델: `openai/gpt-4o-mini` (OpenRouter, 별도 OpenAI 키 불필요)
- Factored 원칙: Draft를 직접 보지 않고 snippet만으로 독립 판단
- 입력: `[원본 snippet 전부] + [Draft의 각 factual claim 목록]`
- 출력: 각 사실별 `{claim: str, supported: bool, evidence_snippet_id: str | None}`
- 후처리: `supported: false` 사실은 대응 필드에서 drop → 재합성

**v1.5 진입 조건**: 큐레이터 주간 audit 환각률 > 5% 시 4-Stage Factored CoVe 활성:

```
Stage 1 Draft (Gemma 26B)
  → Stage 2 Plan Verification (질문 목록 생성)
  → Stage 3 Answer Verification (각 질문에 독립 답변)
  → Stage 4 Synthesize (verified 사실만 합성)
```

KalyanKS-NLP/Prompt-Engineering-Techniques-Hub Pydantic 4-stage 구조 차용 (MIT 라이선스).

---

### Layer 5: Multi-source Cross-check + 한국어 어뷰징 복제 dedup

#### Multi-source 기준

- 객관 사실: ≥ 2건 **독립** 출처 일치 → 채택
- 주관 의견: ≥ 1건 → 허용
- snippet 수집: 기존 5건 → **10건**으로 확대

#### 한국어 어뷰징 복제 dedup

한국 미디어는 단일 오류가 어뷰징 형태로 다수 언론사·블로그에 복제되는 경향. LLM이 복제된 동일 오류를 "여러 출처 검증됨"으로 오인할 위험.

대응:
- snippet 본문 cosine 유사도 ≥ 0.80 → 같은 클러스터 = **1건**으로 카운트
- embedding: ADR-0028에서 이미 도입한 Voyage AI 인프라 재활용
- 클러스터 내 대표 snippet 1건만 독립 출처로 인정

---

### 부가 설정

- 전 Stage temperature=0.1, top_p=0.3 (HELM benchmark 기준, 환각 -20%)
- 큐레이터 주간 무작위 20건 audit (환각률 측정 기준)
- 거절 사유 자동 누적: `curation_decisions.rejection_reason_text` → v1.5 negative dictionary 학습

---

### LlmProviderPort 확장

```typescript
// ADR-0040 LlmProviderPort에 추가 예정
generateCommentDraft(params: {
  spotName: string;
  category: SpotCategory;
  snippets: Array<{ id: string; text: string }>;
  toneGuide: string;
  maxTokens?: number;
}): Promise<CuratorCommentDraft>;

verifyCommentGrounding(params: {
  snippets: Array<{ id: string; text: string }>;
  claims: Array<{ id: string; text: string }>;
  maxTokens?: number;
}): Promise<Array<{ claimId: string; supported: boolean; evidenceSnippetId: string | null }>>;

// v1.5 trigger 시 추가:
// planCommentVerification()  — Stage 2-plan
// answerVerifications()      — Stage 3
// synthesizeFinalComment()   — Stage 4
```

### OpenRouterLlmAdapter 확장

| Stage | 모델 | 역할 |
|---|---|---|
| Stage 1 | `google/gemma-2-26b-it` | Draft 생성 |
| Stage 2 | `openai/gpt-4o-mini` | Grounding 검증 |

환경 변수: `OPENROUTER_API_KEY` (기존, 별도 OpenAI 키 불필요).

---

### 비용 (코멘트 1건당, v1 알파 2-Stage)

| Stage | 모델 | 단가 | 추정 토큰 | 건당 비용 |
|---|---|---|---|---|
| Stage 1 | Gemma 26B | $0.20/$0.60 per 1M | 입력 4K / 출력 300 | ~$0.002 |
| Stage 2 | GPT-4o mini | $0.15/$0.60 per 1M | 입력 5K / 출력 400 | ~$0.001 |
| **합계** | | | | **~$0.003** |

알파 200건 총 비용: **~$0.6**

### v1.5 A/B 후보 (Stage 2 검증자 모델)

| 모델 | 단가 | 특이사항 |
|---|---|---|
| `openai/gpt-4.1-nano` | $0.10/$0.40 per 1M | GPT-4o mini 대비 33% 저렴, 1M context |
| `openai/gpt-5-nano` | $0.05/$0.40 per 1M | 67% 저렴, 400K context |

---

### 환각률 목표 로드맵

| 버전 | 목표 | 수단 |
|---|---|---|
| v1 알파 | < 5% | 2-Stage + 5-Layer |
| v1.5 | < 3% | 4-Stage Factored CoVe + negative dictionary |
| v2 | < 2% | 사용자 implicit feedback 추가 |

## Consequences

**Positive:**
- 환각률 < 5% 달성 목표 (큐레이터 audit 기준).
- Thesis 보호: snippet 부족 spot은 거짓말 대신 null 또는 큐레이터 수동 큐 분리.
- Multi-model diversity (Google Gemma + OpenAI GPT-4o mini) → 단일 모델 self-verify 함정 회피.
- 비용 미미 ($0.6 / 알파 200건).
- 알파 2-Stage로 단순 시작, v1.5 trigger로 4-Stage 진화 경로 명시.
- 한국어 어뷰징 복제 dedup으로 도메인 특화 리스크 차단.
- 주관·객관 사실 차등 처리로 `honest_downside` 유실 방지.

**Negative / Risk:**
- 2-Stage는 4-Stage Factored CoVe보다 환각 차단력 낮음 → v1.5 trigger 명시로 대응.
- snippet 부족 spot(0~1건)은 큐레이터 직접 작성 부담 증가.
- Stage 2 GPT-4o mini 응답 실패 시 fallback 없음 (v1.5에서 검토).
- cosine 임계값 0.80은 경험적 결정, 실측 후 튜닝 필요.

## Alternatives Considered

**4-Stage Factored CoVe (알파부터 전면 적용):** 보류.
- Meta CoVe 환각 17%→70% 차단 효과 검증됨 (Dhuliawala 2023).
- 알파 200건에 4단계·4회 LLM 호출은 over-engineered (ChatGPT critique 반영).
- 큐레이터 audit이 최종 방어선이므로 LLM-side 4단계의 ROI 약함.
- v1.5 trigger 조건 명시로 진화 경로 보존.

**Single-pass RAG + strong prompt:** 기각.
- Baseline으로 가치 있으나 검증 layer 없으면 환각 차단 약함.
- Citation 강제 단독으론 부족 (Cite Before You Speak 2025: +13.83%지만 검증 없음).

**Claude Haiku 4.5 (Stage 2 검증자):** 기각.
- 가격 5배 ($0.80/$4 per 1M vs GPT-4o mini $0.15/$0.60).
- Anthropic family는 Gemma와 다른 family 보장에만 우위.
- Multi-model diversity는 GPT-4o mini로 충분.

**GPT-4.1 Nano (Stage 2, 알파부터):** 보류.
- 33% 저렴($0.10/$0.40), 1M context.
- 단순 fact-check에 적합하나 미묘한 판단에서 GPT-4o mini가 더 안전.
- v1.5 A/B 후보로 분류.

**Self-Verification (단일 모델 self-critique):** 기각.
- Meta CoVe 연구: Factored 2-Step이 Joint(self-critique)보다 우월.
- 동일 모델 self-verify는 자기 실수 반복 위험.

**Single-source 사실 채택 (모든 필드):** 기각.
- 객관 사실 환각 위험. Multi-source ≥ 2건이 학계 표준.
- 단, 주관 의견은 단일 출처 허용 (ChatGPT critique 반영, honest_downside 유실 방지).

**엄격한 Selective Refusal (snippet < 3 → null):** 기각.
- 유용한 코멘트 유실 위험.
- AWS RAG 지침: 출처 품질이 핵심, 양이 아님.
- snippet 1건은 null 대신 큐레이터 우선 검토 큐로 분리.

## References

- Dhuliawala et al. "Chain-of-Verification Reduces Hallucination in Large Language Models" (Meta AI, arXiv:2309.11495, 2023)
- KalyanKS-NLP/Prompt-Engineering-Techniques-Hub (CoVe Pydantic 4-stage, v1.5 진입 시, MIT)
- ACM "Cite Before You Speak" (2025) — citation grounding 13.83% 향상
- RefusalBench (2025) — selective refusal in grounded models
- Cross-model audit (arXiv:2603.03299, 2026) — multi-model consensus 95.6% 정확도
- "According to..." prompting (UNC/Allen AI, arXiv:2305.13252)
- HELM benchmark — temperature 0.1 환각 -20%
- AWS RAG best practices — 출처 품질이 응답 신뢰도 결정
- ChatGPT external review (2026-05-20) — 알파 200건 over-engineering critique
- OpenRouter docs: `openai/gpt-4o-mini`, `google/gemma-2-26b-it`
- 한국어 미디어 어뷰징 복제 현상 분석
- ADR-0028: Voyage AI embedding 인프라 (cosine dedup 재활용)
- ADR-0030: 거절 사유 수집 인프라 (negative regex 재활용)
- ADR-0040: LlmProviderPort 추상화 (generateCommentDraft·verifyCommentGrounding 추가 기반)
- ADR-0041: Stage 3 Tool Calling (동일 Gemma 26B 모델)
- ADR-0043: Gemma 큐레이터 코멘트 생성 (감수 워크플로우, 이 ADR이 환각 방지 layer 추가)
