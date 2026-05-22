# ADR-0035 — LLM Extractor v3: 비제주·브랜드 차단 + 도메인 차단 + 이름 dedup

**날짜**: 2026-05-19  
**상태**: 결정됨

## 컨텍스트

v2 dry-run 59건 전수 감사 결과 20% (12건) 노이즈 패턴 발견:

| 패턴 | 건수 | 원인 |
|---|---|---|
| 제주 외 지역 명시 | 9 | cafeflex.naver.com 전국 이벤트 게시판 |
| 광고/협찬 (auth<0.4) | 6 | v2 규칙 작동 중이나 비제주 게시판 유입 |
| 제품/음료 브랜드 | 3 | 물리 장소 아닌 제품명 ("탄산오름") |
| 일반명칭/쿼리복사 | 3 | v2 규칙으로 일부 커버 |
| 이름 중복 | 5 | 같은 spot_name이 여러 스니펫에서 반복 저장 |

## 결정

### A. LLM Prompt v3 — 규칙 추가

기존 v2 규칙(1–3) 유지, 신규 추가:

**규칙 4**: 스니펫에서 해당 장소의 주 위치가 제주 외(서울·경기·강원·충청·전라·경상·일본·해외 등)로 명시되면 `spot_name=null`
- "서울 한티역 가츠오" → null
- "홋카이도 오르골당" → null
- "강원 양양 카페화일리" → null

**규칙 5**: 물리적 공간이 아닌 제품·음료·화장품 브랜드는 `spot_name=null`
- "탄산오름" (음료 브랜드) → null
- "메종드백" (제품 라인) → null

### B. 파이프라인 레벨 도메인 차단

`src/config/naver-blocked-domains.json`에 차단 도메인 목록 관리:
```json
["cafeflex.naver.com"]
```

`RunDiscoveryPipelineUseCase` Stage 2 item 루프에서 LLM 호출 전 hostname 매칭 → `naverDomainBlocked++` 후 skip.

**근거**: cafeflex.naver.com은 전국 이벤트·쿠폰 게시판으로 제주 무관 장소 9건의 공통 발원지. 큐레이터가 추가 도메인 발견 시 config JSON만 수정하면 적용됨. 프롬프트 규칙 대신 source-level 차단이 더 확실.

### C. 이름 기반 dedup 추가 (`CandidateDeduper`)

기존 좌표 100m 반경 dedup에 이름 dedup 추가:
- 정규화: 괄호·괄호 내용 제거, 공백 제거, lowercase
  - `메종드백(분점)` → `메종드백`
  - `카페 아무개` → `카페아무개`
- 같은 정규화 이름 2회+ 등장 시 첫 번째만 저장
- `kakao_unverified` (좌표 없음) 레코드에도 적용 — 기존에 좌표 dedup 불가로 중복 저장되던 문제 해소

적용 순서 (naver 루프):
1. 도메인 차단 → skip
2. LLM 추출 → `spot_name=null`이면 drop
3. Stage 4 fallback 체인 (kakao → naver → kakao_parent)
4. 이름 dedup (좌표 유무 무관)
5. 좌표 dedup (좌표 있는 경우만)
6. 저장 → `acceptName()` + `accept()`

## 결과 카운터 추가

`DiscoveryPipelineResult`에 `naverDomainBlocked: number` 추가.

## 근거

- v2 dry-run 감사 → cafeflex 패턴이 비제주 노이즈 9건의 단일 발원지임을 확인
- 도메인 차단은 프롬프트 규칙보다 비용 효율적 (LLM 호출 자체를 차단)
- 이름 dedup → 메종드백×3 같은 중복 해소, kakao_unverified dedup 미비 보완
- 380개 테스트 모두 통과 (11개 신규 추가)

## 영향

- `src/config/naver-blocked-domains.json` — 신규
- `src/domain/curation/CandidateDeduper.ts` — `isNameDuplicate`, `acceptName`, `normalizeName` 추가
- `src/infrastructure/llm/LlmExtractorAdapter.ts` — 규칙 4·5 + 예시 추가
- `src/application/curation/RunDiscoveryPipelineUseCase.ts` — 도메인 차단 + 이름 dedup
- `src/scripts/seed-pipeline.ts` — `loadBlockedDomains()` + 전달

## 관련 ADR

- ADR-0033: LLM extractor v2 (이 ADR의 선행)
- ADR-0029: Phase 0 hidden gem discovery 전략
- ADR-0032: Phase 0 큐레이션 우선순위 정책
