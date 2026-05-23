# Post-Alpha 백로그 (2026-05-23)

Phase F alpha 49건 approve 완료 후 잔여 작업 목록.
알파 출시 전 필수 → [critical] / 알파 후 → 일반

---

## [backlog] 우도바위소리 50번째 Spot

- **사유:** visitjeju content CNTS_000000000022453 → 404 (삭제됨). thumbnail_url = NULL.
- **조치:** 대체 이미지(Naver/Kakao/공식) 소싱 후 `thumbnail_url` 업데이트 → `run-approve-pipeline.ts` 재실행
- **ID:** `e5bca46f-483b-4498-9cdc-3d4e146b6ecd`

---

## [backlog] 코멘트 NULL 잔여 114건

Phase E 풀런 결과:
- 529 재처리 대상 13건 (서버 과부하 시점 실패): 새빌, 남경미락, 하나로국밥, 곱들락, 하늘채가든, 제주예찬, 카페공작소, 피어22, 가시아방, 그랑블루 요트투어, 바다해찬, 엉덩물, 도두해녀의집
  - 조치: 새벽 오프피크 시간대 `generate-comments-v2.ts --ids <13개>` 재실행
- 구조적 실패 101건: L2<0.70 (97건) + L1 실패 (4건)
  - 옵션: (a) l2-threshold 0.65로 완화 재실행, (b) 수동 코멘트 작성, (c) 알파 후 보류

---

## [backlog] naver_snippet=NULL 규모 전수 audit

- **발견:** B25·B28·B50 검증 시 `naver_snippet = NULL, naver_source_url = NULL` 확인
- **의미:** evidence_quote 출처가 DB에 보존되지 않음 — 사실 검증 불가
- **조치:** `SELECT COUNT(*) FROM curation_candidates WHERE naver_snippet IS NULL AND selected_tier = 'reference'` 실행 → 규모 파악 → 필요 시 재수집

---

## [backlog] 합성 이름 오류 탐지

- **발견:** '감귤박물관 월라봉 산책로 - 생이소리길' 등 장소명+코스명 합성 형태
- **조치:** `SELECT name FROM curation_candidates WHERE name LIKE '%-%' OR name LIKE '% - %'` 로 1000건 전체 탐지 → 오류 유형 분류 → 수동 정정 또는 파이프라인 수정

---

## [backlog] SDK 업그레이드 + Prompt Caching

- **현황:** `@anthropic-ai/sdk` 0.27.3 — `cache_control` 타입 미지원
- **최신:** 0.98.0 — prompt caching 지원
- **비용 영향:** ADR-0052 Amendment 5에 기록 — 캐싱 미적용으로 토큰 절감 실패
- **조치:** `npm install @anthropic-ai/sdk@latest` → `TextBlockParam`에 `cache_control` 추가 → system prompt 캐싱 활성화

---

## [backlog] experience 카테고리 polluted 69건

- **발견:** Phase E 이전 category-snippet-audit에서 experience 카테고리 오분류 다수 탐지
- **규모:** ~69건 재분류 필요
- **조치:** `category-snippet-audit.ts` 재실행 → category_mismatch flag 확인 → 수동/자동 재분류

---

## [backlog] tsc 기존 에러 19건 — Phase E/F 스키마 드리프트

- **사유:** Phase E/F에서 `CurationCandidate`에 `tier`, `awardsHint`, `curatorComment` 필드 추가 후
  `DiscoverCandidatesUseCase`, `PostgresDayPlanRepository`, `PostgresShortlistRepository` 등 미갱신.
  기타: `VisitjejuRawSpot.alltag` optional→required 변경, `DiscoveryPipelineResult` 필드 추가 등.
- **영향:** 런타임 및 599 tests 영향 없음. RN 앱과 무관.
- **조치:** 큐레이션 파이프라인 재가동 전 각 파일 누락 필드 보완.

---

## [backlog] Label Studio 풀 연동 (알파 후)

- **현황:** B1(comment export), B3(webhook secret), B4(webhook handler), B5(UI template) 미구현
- **결정 배경:** 알파 50건은 DB 직접 처리로 완료. Label Studio는 v2 큐레이션 사이클용.
- **ADR 참고:** ADR-0027 (큐레이터 HITL evolution)
