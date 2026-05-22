# ADR-0037 — Matched-Only Curation Policy: Stage 4 실패 자동 폐기

**날짜**: 2026-05-19  
**상태**: 결정됨

## 컨텍스트

Phase 0 v2 dry-run에서 `kakao_unverified` (Stage 4 모두 실패) 후보가 27건 중 ~10건으로 큐레이션 부담 발생. 이 후보들은:
- 좌표 없음 → Day Plan 배치 불가
- Kakao·Naver·parent hint 모두 미등록 → 지도 링크 없음
- 큐레이터가 수동으로 좌표를 찾아 PATCH API로 보강해야만 승인 가능

v2 dry-run에서 `kakao_unverified` 27건 전량이 결국 비제주·비장소·중복이거나, 좌표 미확인으로 Day Plan 등록이 막혔다.

## 결정

**Stage 4 검증 체인(kakao → naver → kakao_parent) 모두 실패한 naver 후보는 큐레이션 대상에서 제외하고 `auto_rejected`로 저장한다.**

### 변경 내용

**`RunDiscoveryPipelineUseCase`**: Stage 4 전부 실패 시
- `status='auto_rejected'`
- `llm_summary='Stage 4 모든 검증 실패 (kakao·naver·parent 모두 미등록)'`
- 이름 dedup 여전히 적용 (같은 이름 중복 저장 방지)
- 결과 카운터: `naverAutoRejected`

**`export-curator-queue.ts`**: WHERE 조건에 `AND verified_by IS NOT NULL` 추가
- 큐레이터는 좌표 확인된 후보만 검토
- `kakao_unverified` (visitjeju 등 좌표 있는 케이스) 제외됨 → 의도된 동작

**Migration 016**:
- `CHECK (status IN (..., 'auto_rejected'))` 추가
- 기존 naver `kakao_unverified` AND `lat IS NULL` 레코드 → `auto_rejected` 일괄 변환

### 보존 이유 (drop이 아닌 save)

- 추후 검색 엔진·지도 서비스 추가 시 재활용 가능성
- 모니터링: `auto_rejected` 비율이 높으면 LLM 프롬프트 추가 강화 신호
- 큐레이터가 수동 보강할 특수 케이스 구제 여지 (status를 'pending'으로 수동 전환 가능)

## 근거

- ADR-0034 (좌표 없는 후보 approve 차단)와 일관된 방향: 좌표 없으면 Day Plan 불가
- v2 dry-run 감사: `kakao_unverified` 전체가 결국 폐기 대상 → 큐레이터 시간 낭비
- `naverAutoRejected` 카운터로 파이프라인 품질 모니터링 가능

## 영향

- `src/domain/curation/CurationCandidate.ts`: `CandidateStatus`에 `'auto_rejected'` 추가
- `src/application/curation/RunDiscoveryPipelineUseCase.ts`: 저장 로직 + 카운터 변경
- `src/scripts/export-curator-queue.ts`: `verified_by IS NOT NULL` 필터 추가
- `migrations/016_up_auto_rejected.sql`: CHECK 갱신 + 일괄 UPDATE

## 관련 ADR

- ADR-0034: approve 조건 — 좌표 필수
- ADR-0024: Stage 4 VERIFY 슬롯 fallback 체인
- ADR-0035: v3 도메인 차단 + 이름 dedup
