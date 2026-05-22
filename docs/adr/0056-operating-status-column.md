# ADR-0056: operating_status 컬럼 정책

Status: Accepted (2026-05-22)

## Context

비짓제주 원본 `name` 필드에 운영 상태가 괄호로 혼재하는 패턴 발견:
- `"만장굴(안전점검 및 내부공사로 운영중단)"`
- `"버디프렌즈 플래닛(2025년 04.12~별도 안내 시까지 전시관 휴관) "`

ADR-0055 정규화 후 name에서 분리. 이 정보를 저장·갱신할 컬럼이 필요.

또한 snippet 재수집 후 최신 운영 상태가 확인되는 경우
(만장굴: 2025-05-30 재개방) 출처별 우선순위가 필요.

## Decision

### 컬럼 명세 (Migration 026)

```sql
-- spots 테이블 + curation_candidates 테이블 양쪽 추가
ALTER TABLE spots ADD COLUMN operating_status TEXT;
ALTER TABLE spots ADD COLUMN operating_status_source TEXT
  DEFAULT 'visitjeju'
  CHECK (operating_status_source IN ('visitjeju', 'manual', 'snippet'));
ALTER TABLE spots ADD COLUMN operating_status_updated_at TIMESTAMPTZ;
```

| 컬럼 | 설명 |
|------|------|
| `operating_status` | 자유 텍스트. NULL = 정상 운영 또는 불명. |
| `operating_status_source` | 정보 출처. 우선순위 높을수록 덮어쓰기 불가. |
| `operating_status_updated_at` | 마지막 갱신 시각 (TIMESTAMPTZ). |

### source 우선순위

```
snippet > manual > visitjeju
```

- `visitjeju`: 비짓제주 원본 name 괄호에서 자동 추출. 재수집 시 덮어씀.
- `snippet`: 수집된 블로그·카페 snippet에서 확인. 갱신 로직이 명시적으로 변경.
- `manual`: 큐레이터 직접 입력. 어떤 자동화도 덮어쓰지 않음.

### 갱신 트리거

| 이벤트 | 동작 |
|--------|------|
| visitjeju 재수집 | `source='visitjeju'`인 경우만 덮어씀 |
| snippet 재수집 후 상태 확인 | `source='snippet'`으로 갱신 (visitjeju 무시) |
| 큐레이터 수동 입력 | `source='manual'`으로 갱신 (snippet·visitjeju 무시) |
| 정상 운영 확인 | `operating_status = NULL` 로 초기화 (source 명시) |

### 초기값 (2026-05-22 기준)

| spot | operating_status | source |
|------|-----------------|--------|
| 버디프렌즈 플래닛 | `2025년 04.12~별도 안내 시까지 전시관 휴관` | `visitjeju` |
| 만장굴 | `2025년 5월 30일 재개방` | `snippet` |

## Consequences

**Positive:**
- name 필드 정규화와 운영 상태 분리 — 검색 쿼리 품질 향상
- 큐레이터 수동 override 가능 (manual source)
- snippet 기반 자동 갱신 경로 마련

**Negative / Risk:**
- `operating_status` TEXT 자유 형식 — 향후 구조화(enum) 필요 시 마이그레이션 필요
- 정기 snippet 재수집 미구현 시 stale 데이터 누적

## Alternatives Considered

**name 필드에 그대로 유지**: 기각 — 검색 쿼리 오매칭 + 정규화 어려움.

**is_active BOOLEAN으로 대체**: 기각 — 세부 상태 텍스트 손실, 재개방 날짜 등 저장 불가.

**별도 테이블 (spot_status_history)**: 기각 — Phase E 범위 초과. v2에서 검토.

## References

- Migration: `026_up_spot_operating_status.sql`
- 추출 스크립트: `src/scripts/diagnostics/extract-operating-status.ts`
- ADR-0055 — spot name 정규화 정책
