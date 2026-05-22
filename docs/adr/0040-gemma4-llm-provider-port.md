# ADR-0040: LlmProviderPort 추상화 및 Gemma 4 도입

## Context

`LlmExtractorAdapter`와 `SpotMetaInfererAdapter`가 Anthropic SDK를 constructor에서 직접 생성하여 하드코딩되어 있었음.
다른 LLM provider로의 교체가 불가능한 구조였으며, 테스트 역시 `vi.mock('@anthropic-ai/sdk')`에 의존했음.

Gemma 4 26B (OpenRouter)가 Claude Haiku 대비 8~10배 저렴하고 OpenAI-compatible function calling을 지원함.
v6 English instruction prompt를 도입하는 시점에 맞춰 provider 추상화를 함께 적용함.

## Decision

- `LlmProviderPort` 인터페이스 도입 (`callWithTool` 단일 메서드, `src/application/ports/LlmProviderPort.ts`)
- `AnthropicLlmAdapter` — Anthropic SDK wrapper, `implements LlmProviderPort`
- `OpenRouterLlmAdapter` — OpenRouter HTTP API (OpenAI-compatible function calling), `implements LlmProviderPort`
- `LlmExtractorAdapter` constructor: `(apiKey?: string)` → `(provider: LlmProviderPort)`
- `SpotMetaInfererAdapter` constructor: `(apiKey?: string)` → `(provider: LlmProviderPort)`
- v6 English instruction prompt 도입: 한국어 instruction → 영어로 전환 (연구: 영어 instruction이 한국어 컨텍스트 LLM 정확도 향상)
- `seed-pipeline.ts`에서 `--provider=openrouter` CLI arg 또는 `LLM_PROVIDER` 환경변수로 provider 선택 가능
- `compare-providers.ts` 스크립트: Claude v6 vs Gemma v6 동일 스니펫 병렬 비교 (`npm run compare:providers`)

## Status

Deprecated (2026-05-20)

> **폐기 사유**: 발굴 단계용 LLM provider port. 발굴 파이프라인 폐기(ADR-0029 Deprecated)에 따라 해당 추상화 불필요. LLM provider는 코멘트 생성(ADR-0043·ADR-0052) 한정 사용으로 단순화.

## Consequences

- Provider swap 가능 구조 — 향후 다른 LLM 추가 시 `LlmProviderPort` 구현체만 추가
- 테스트가 SDK mock이 아닌 port mock 방식으로 단순화됨
- v6 prompt의 Claude vs Gemma 비교 dry-run 후 실제 채택 결정 예정
- `AnthropicLLMEnricherAdapter`, `LLMParseFreeTextAdapter`는 이번 범위 외 — 별도 ADR로 관리
