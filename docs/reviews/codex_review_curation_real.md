# Codex Adversarial Review — Curation Pipeline (c5ed559)

**Reviewer:** Codex (OpenAI)  
**Date:** 2026-05-18  
**Base:** d89304b → c5ed559  
**Verdict:** needs-attention / NO-SHIP

---

## SECTION A — Self-review 동의 (검증 효과)

Codex는 Opus self-review의 다음 항목을 **실제 블로커**로 확인:

| 항목 | 판정 |
|------|------|
| C1 — admin 라우트 인증 없음 | ✅ 동의 (real blocker) |
| C2 — RejectCandidateUseCase 트랜잭션 없음 | ✅ 동의 (real blocker) |
| C3 — ApproveCandidateUseCase phantom spotId | ✅ 동의 (real blocker) |
| M1 — 바디 검증 누락 (out-of-range → 500) | ✅ 동의 (real blocker) |
| M4 — LLM "high" vs DB CHECK "premium" | ✅ 동의 (real blocker) |
| M5 — approve/reject TOCTOU | ✅ 동의 (real blocker) |
| M2 — CalibrationProfile.toJSON dead code | 🟡 cleanup-level |
| M3 — existsByKakaoPlaceId dead code | 🟡 cleanup-level |
| M6 — rejected 후보 재발굴 차단 | 🔵 product/API 확인 필요 |
| D5 — offset 제거·limit=8 미적용 | 🔵 product/API 확인 필요 |

---

## SECTION B — 추가 발견 (Cross-model 가치 ← 핵심)

### B1 — MAJOR: 점수 동기화 실패 카운터 dead code
**파일:** `src/application/curation/SyncSpotScoresUseCase.ts:37-80`

`SyncSpotScoresUseCase`는 매 실행마다 `consecutiveFailureMap`을 새로 생성, 각 실패 소스를 `1`로 세팅한 뒤 `>= 3` 조건을 확인한다. `TrendSourceRepository` 포트에 이전 실패 횟수를 읽는 메서드가 없고, `updateStatus`에 하드코딩된 `1`을 전달하므로 DB의 `consecutive_failures` 컬럼은 절대 1을 초과하지 않는다. 실제 다일 API 장애가 발생해도 알람이 발행되지 않으며 데이터 품질 저하가 무성하게 숨겨진다.

**권장 fix:**
- `TrendSourceRepository`에 `getStatus(sourceName)` 읽기 메서드 추가
- 실패 시 이전 카운트를 읽어 +1 증가, 성공 시 0 리셋
- 3회 연속 실패 테스트 케이스 추가

### B2 — MAJOR: 점수 동기화 범위가 curation score TOP 10000으로 오염
**파일:** `src/application/curation/SyncSpotScoresUseCase.ts:24-26`

```ts
const spots = await this.spotRepo.findTopByCurationScore(10000);
```

`findTopByCurationScore`는 큐레이션 점수 내림차순으로 최대 10000개를 반환하는 추천용 메서드다. 활성 Spot 전체 동기화와 의미가 다르다. 카탈로그가 10000개를 초과하거나, 낮은 큐레이션 점수로 임포트된 Spot은 인기도·트렌드 점수가 영구 갱신되지 않는다.

**권장 fix:**
- `SpotRepository`에 `findAllActiveIds(): Promise<string[]>` (또는 커서 기반 페이지네이션) 추가
- `SyncSpotScoresUseCase`를 해당 메서드 기반으로 교체

### B3 — MAJOR: curatedRatio=0 / 1.0 선언해도 양쪽 트랙 모두 쿼리됨
**파일:** `src/infrastructure/recommender/PostgresRecommenderAdapter.ts:78-112`

`PostgresRecommenderAdapter`는 두 섹션 limit을 `Math.max(1, ...)` 로 감싸므로:
- `curatedRatio=0.0` → curated limit이 0이어야 하나 최소 1로 올라가 쿼리 실행
- `curatedRatio=1.0` → popular limit이 0이어야 하나 최소 1로 올라가 쿼리 실행

API 응답에는 비율이 0%로 표시되지만 실제로는 해당 트랙 Spot이 반환된다. 사용자가 슬라이더를 극단값으로 설정해도 기대 동작이 실현되지 않는다.

**권장 fix:**
- limit이 0이면 해당 DB 쿼리를 skip하고 빈 배열 반환
- `curatedRatio=0.0` / `1.0` 케이스에 대한 어댑터·API 레벨 테스트 추가

---

## SECTION C — 동의 안 하는 항목 (false positive 후보)

| self-review 항목 | Codex 판정 |
|-----------------|-----------|
| `gen_random_uuid()` 확장 위험 | ❌ false positive — PostgreSQL 버전에 따라 내장 함수로 유효함 |
| `Promise.allSettled` 부분 실패 관측 불가 | ❌ false positive — 부분 실패가 문서화되어 있고 의도된 동작 |

---

## 종합

| 구분 | 항목 수 |
|------|---------|
| Self-review 블로커 확인 | C1, C2, C3, M1, M4, M5 (6건) |
| Cleanup-level 확인 | M2, M3 (2건) |
| 추가 발견 (SECTION B) | B1, B2, B3 (3건, 모두 MAJOR) |
| False positive | 2건 |

**Ship 차단 항목 (9건):** C1, C2, C3, M1, M4, M5, B1, B2, B3
