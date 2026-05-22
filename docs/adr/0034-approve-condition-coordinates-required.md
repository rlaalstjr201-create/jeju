# ADR-0034 — Approve 조건: 좌표 필수 (kakao_unverified 좌표 미확인 후보 approve 금지)

**날짜**: 2026-05-19  
**상태**: 결정됨

## 컨텍스트

H4 큐레이터 검토에서 Stage 4 검증 실패(kakao_unverified) 후보 중 좌표 null 상태로
ApproveCandidateUseCase 통과 가능성 확인.

좌표 없는 Spot은 지도 표시, 거리 계산, dedup 모두 불가 → v1 알파 Spot 품질 훼손.

## 결정

`ApproveCandidateUseCase.execute()` 내부에 선행 조건 추가:

```
IF candidate.status == 'kakao_unverified'
  AND (candidate.lat == null OR candidate.lng == null)
  → throw ApproveBlockedError("좌표 미확인 후보는 approve 불가")
```

별도 에러 클래스 `ApproveBlockedError` (name: 'ApproveBlockedError').  
HTTP 매핑: 422 APPROVE_BLOCKED.

### 좌표 수동 보강 API

`PATCH /api/v1/admin/curation/candidates/:id/coordinates`  
Body: `{ lat: number, lng: number }`  
- 제주 bbox 검증 (lat 33.0–34.0, lng 126.0–127.0)
- status: kakao_unverified → pending으로 승격
- verified_by = 'manual' (Migration 015, ADR-0024 개정)

### 적용 범위

- visitjeju 후보: enrichedAt 기반 기존 가드가 이미 lat 검사 포함 → 영향 없음
- naver pending 후보: kakao 검증됨 → lat/lng 있음 → 영향 없음
- naver kakao_unverified + lat=null: approve 차단 → 큐레이터가 수동 좌표 입력 필요

## 근거

- Spot 도메인 불변식: 지도 표시 가능 조건 = lat/lng 필수
- 좌표 없는 Spot이 추천에 포함되면 ScheduleComposer 거리 계산 오류 발생
- 큐레이터 워크플로우: kakao_unverified → 좌표 수동 입력 → pending → approve

## 영향

- `src/application/curation/ApproveCandidateUseCase.ts`: ApproveBlockedError 추가 + 가드
- `src/application/curation/PatchCandidateCoordinatesUseCase.ts`: 신규 use case
- `src/interface/api/routes/admin-curation.ts`: PATCH /coordinates 엔드포인트
- `src/interface/api/routes/_shared.ts`: ApproveBlockedError → 422 매핑
- `src/interface/api/AppDependencies.ts`: patchCandidateCoordinatesUseCase 추가
