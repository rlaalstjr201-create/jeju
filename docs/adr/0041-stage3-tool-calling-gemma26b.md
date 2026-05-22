# ADR-0041: Stage 3 Tool Calling + Gemma 26B 채택

## Context
Phase 1 비교: Claude v6 vs Gemma v6 품질 5:3:1 (표본 9건, 통계적 유의성 낮음).
비용 차이 8~10배 (Claude Haiku $4 vs Gemma 26B ~$0.4/50-query run).
Tool Calling이 환각의 근본 원인을 제거 (검증 없이 추출 불가).

## Decision
- Gemma 26B (google/gemma-4-26b-a4b-it) 기본 LLM으로 채택
- Stage 3에 Tool Calling 도입: LLM이 Kakao/Naver 검색 도구를 직접 호출해 검증
- Claude는 LlmProviderPort fallback으로 유지 (ANTHROPIC_API_KEY 없을 경우 불사용)
- Stage 4 역할: Tool Calling 시대에도 좌표 해석 및 최종 지역 검증(bbox) 담당 — Phase 2에서는 Stage 3 병렬 유지, Phase 3에서 통합 가능

## Consequences
- 환각 (반빛당류) 제거: 검색 0건 → 자동 null
- 이름 정제 (금능 → 금능해수욕장): LLM이 대안 쿼리로 재검색
- extraction_confidence + verification_status로 게이트 가능
- 비용: Tool Calling으로 snippet당 LLM 호출 2-4회 증가, 하지만 Gemma 비용 절감으로 Claude 단일호출보다 저렴

## Status
Deprecated (2026-05-20)

> **폐기 사유**: Stage 3 Tool Calling은 발굴 단계(네이버 블로그 → spot 검증) 전용. 발굴 파이프라인 폐기(ADR-0029 Deprecated)에 따라 이 결정도 무효. Gemma 26B LLM 자체는 코멘트 생성에서 재검토 가능하나, Tool Calling 아키텍처는 폐기.
