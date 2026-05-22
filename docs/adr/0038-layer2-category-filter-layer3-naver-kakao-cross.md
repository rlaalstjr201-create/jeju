# ADR-0038: Layer 2 카카오/네이버 카테고리 필터 + Layer 3 Naver→Kakao 교차 검증

- 날짜: 2026-05-19
- 상태: 결정됨
- 연관: ADR-0029 (Phase 0 발굴 파이프라인)

## 맥락

Phase 0 파이프라인의 Stage 4 검증 체인에서 두 가지 false positive 패턴이 발견됐다.

1. **Layer 2 문제 — 필라테스 false positive**: '제주필라테스 디프로'가 카카오 로컬 API에 등록된 사업장이기 때문에 `verified_by='kakao'`로 통과됐다. 그러나 필라테스 스튜디오는 여행 목적지가 아니므로 큐레이터 검토 대상이 돼선 안 된다.

2. **Layer 3 문제 — 돌핀뷰 false positive**: '돌핀뷰'가 네이버 로컬 API에는 존재하지만 카카오 로컬 API에는 없는 경우, 이전 구현은 네이버 단독 매칭만으로 `verified_by='naver'`를 부여했다. 이는 오등록·폐업 장소가 통과될 위험을 내포한다.

## 결정

### Layer 2: 카카오/네이버 카테고리 블록리스트

`src/config/kakao-blocked-categories.json`에 차단 카테고리 목록을 관리한다. 카카오 로컬 응답의 `categoryName`이 블록리스트 항목 중 하나를 **포함**하면 매칭으로 간주하지 않고 다음 단계로 넘어간다.

초기 블록리스트:
- `의료,건강` — 의원, 약국, 한의원
- `교육` — 학원, 어학원
- `스포츠,레저 > 스포츠시설 > 헬스/필라테스/요가/볼링/당구`
- `스포츠,레저 > PC방`
- `자동차`, `부동산`, `주택`

**골프는 차단하지 않는다.** 제주 여행 맥락에서 골프장·골프 클럽은 유효한 여행 목적지다 (ADR-0038 명시 결정).

네이버 로컬 응답의 `category` 필드도 동일 블록리스트로 검사한다.

### Layer 3: Naver→Kakao 교차 검증

네이버 로컬 API가 매칭되더라도 카카오 교차 검증을 추가로 수행한다. 네이버 위경도 힌트를 사용해 카카오 API를 재호출하고, 카카오가 동일 장소를 확인해 줄 때만 `verified_by='naver_kakao_cross'`로 저장한다.

교차 검증 실패 시 `auto_rejected`로 처리한다 (기존 `verified_by='naver'` 경로 제거).

## 구현

### 코드 변경
- `NaverLocalVerifierPort.ts`: `category: string | null` 필드 추가
- `NaverLocalVerifierAdapter.ts`: 응답 item의 `category` 반환
- `CurationCandidate.ts`: `verifiedBy`에 `'naver_kakao_cross'` 추가
- `RunDiscoveryPipelineUseCase.ts`:
  - `blockedCategories` 옵션 추가
  - `isCategoryBlocked()` 헬퍼 함수
  - Layer 2: 카카오 매칭 후 카테고리 체크
  - Layer 3: 네이버 매칭 후 카카오 교차 검증 수행
- `LlmExtractorAdapter.ts`: v5 프롬프트 — 일상 운동시설/의료/교육 등 `spot_name=null` 가이드 추가
- `seed-pipeline.ts`: `loadBlockedCategories()` 추가 및 UseCase에 전달

### 설정 파일
- `src/config/kakao-blocked-categories.json`: 차단 카테고리 목록
- `src/config/naver-queries-20dryrun.json`: 20-query 드라이런 쿼리셋

### DB 마이그레이션
- `migrations/017_up_naver_kakao_cross.sql`: `verified_by` 체크 제약에 `'naver_kakao_cross'` 추가
- `migrations/017_down_naver_kakao_cross.sql`: 롤백 — `naver_kakao_cross` → `naver` 재매핑 후 제약 원복

## `verified_by='naver_kakao_cross'` 시맨틱스

- 네이버 로컬 API에서 장소를 찾음 (위경도 획득)
- 해당 위경도를 힌트로 카카오 API 교차 검증 통과
- 양 소스 모두 카테고리 블록리스트 통과
- `kakaoPlaceId`는 카카오 교차 검증에서 얻은 값으로 설정됨

## 결과

- 이전 `verified_by='naver'` 경로는 제거됨 (네이버 단독 검증으로는 더 이상 통과 불가)
- 기존 DB의 `verified_by='naver'` 레코드는 그대로 유지 (마이그레이션 017 down에서만 처리)
- 골프 관련 장소는 블록리스트에서 명시적으로 제외됨
