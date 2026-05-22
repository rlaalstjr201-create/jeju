# ADR-0033 — LLM Extractor v2: 가짜 Spot 추출 방지 + 광고 탐지 강화 + parent spot hint

**날짜**: 2026-05-19  
**상태**: Deprecated (2026-05-20)

> **폐기 사유**: 발굴 단계(Stage 2 LLM extractor) 폐기. 비짓제주 중심 전환으로 블로그 snippet → spot 추출 파이프라인 불필요. 코멘트 생성용 grounding 필드(source_snippet_ids) 설계 자산은 ADR-0045·ADR-0052에서 재활용.

## 컨텍스트

H4 큐레이터 검토에서 v1 LLM extractor 결함 발견:
- spot_name에 묘사 문장 ("제주 동쪽 숨은 카페"), 검색어 반복, 일반 명칭 박힘 (60%+)
- 정보 요청 글·질문 글이 spot 후보로 통과
- 광고·협찬 글도 authenticity 필터 우회
- 부속 위치 (외돌개뒷길)가 부모 장소 (외돌개) 대신 저장 → Stage 4 검증 실패

결과: naver 1,207건 전량 폐기, v2로 재추출 결정.

## 결정

### spot_name 추출 규칙 강화

null 반환 조건:
- 묘사 문장 (명사 고유명사 없는 서술)
- 검색 쿼리와 토큰 70%+ 일치 (쿼리 그대로 베끼기)
- 일반 명칭/지명 단독 ("해변", "오름", "시장")
- 정보 요청·질문 글 (알려주세요/추천해주세요/아시는분/찾고있어요/있을까요/? 포함)

추출 조건: 스니펫 본문에 명시된 고유 가게/장소명만.

### authenticity_score 강화

≤ 0.4 강제 조건:
- 체험단/협찬/광고/후원/인플루언서
- "VISIT JEJU ㅡ" 인용 출처 표기
- 줄서는식당/웨이팅필수 (과장 마케팅 신호)

### parent_spot_hint 신규 필드

`LlmExtraction`에 `parent_spot_hint: string | null` 추가.
- 부속 위치인 경우 상위 장소명 반환 ("외돌개뒷길" → "외돌개")
- Stage 4 fallback 체인에서 kakao_parent 검증에 활용 (ADR-0024 개정)

### string "null" 정규화

LLM이 JSON null 대신 문자열 "null" 반환하는 버그 → 어댑터에서 JS null로 정규화.

## 근거

- 큐레이터 수작업 검토 결과 60%+ 잘못된 추출 확인 → spot_name null 비율 상승이 곧 데이터 품질 향상
- few-shot 예시 5개 추가 → 모호한 케이스 명확화
- parent_spot_hint: Stage 4 검증 성공률 향상 (실패 fallback 활용)

## 영향

- `src/application/ports/LlmExtractorPort.ts`: parent_spot_hint 필드 추가
- `src/infrastructure/llm/LlmExtractorAdapter.ts`: 프롬프트 재설계, 스키마 업데이트
- `src/infrastructure/llm/LlmExtractorAdapter.test.ts`: 5개 신규 테스트
- naver 1,607건 폐기 후 재추출 (ADR-0032 큐 정책과 연계)
