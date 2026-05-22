# Light Spec — Migration 019: events 테이블 사전 준비

**Feature:** 축제·행사 별도 events 모델 사전 준비 (v1 빈 테이블, v1.5 활성)  
**Status:** Draft  
**Depends on:** ADR-0047, Migration 018  
**Migration files:**
- `migrations/019_up_events_table.sql`
- `migrations/019_down_events_table.sql`

---

## 1. 배경

ADR-0047: 비짓제주 c5 축제/행사(474건)는 기간 한정 데이터. spots 모델과 분리된 `events` 테이블로 관리.  
v1 알파: 빈 테이블만 준비. 수집 스크립트·동선 연동 없음.

---

## 2. 테이블 스키마

```sql
CREATE TABLE events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  location_spot_id  UUID        REFERENCES spots(id) ON DELETE SET NULL,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  event_start       DATE,
  event_end         DATE,
  source            TEXT        NOT NULL,
  sourced_id        TEXT,
  thumbnail_url     TEXT,
  status            TEXT        NOT NULL DEFAULT 'inactive'
                                CHECK (status IN ('active', 'inactive', 'ended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**컬럼 설명:**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `title` | TEXT NOT NULL | 행사명 |
| `description` | TEXT | 설명 (비짓제주 introduction) |
| `location_spot_id` | UUID FK | 연계 spot (optional — 장소가 spots에 있을 경우) |
| `lat`, `lng` | NUMERIC | 행사 좌표 (비짓제주 latitude/longitude) |
| `event_start` | DATE | 행사 시작일 |
| `event_end` | DATE | 행사 종료일 |
| `source` | TEXT NOT NULL | 데이터 출처 (`'visitjeju_events'`) |
| `sourced_id` | TEXT | 소스 시스템 ID (비짓제주 contentsid) |
| `thumbnail_url` | TEXT | 썸네일 URL |
| `status` | TEXT | `'inactive'` (v1 기본), `'active'` (v1.5 활성), `'ended'` (종료) |
| `created_at` | TIMESTAMPTZ | 레코드 생성 시각 |

---

## 3. 인덱스

```sql
-- 날짜 범위 검색 (v1.5 동선 알고리즘용)
CREATE INDEX events_date_range_idx
  ON events (event_start, event_end)
  WHERE status = 'active';

-- status partial index (inactive 제외)
CREATE INDEX events_status_active_idx
  ON events (status)
  WHERE status IN ('active', 'ended');
```

---

## 4. Migration 파일

### 4.1 UP (`migrations/019_up_events_table.sql`)

```sql
CREATE TABLE IF NOT EXISTS events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  location_spot_id  UUID        REFERENCES spots(id) ON DELETE SET NULL,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  event_start       DATE,
  event_end         DATE,
  source            TEXT        NOT NULL,
  sourced_id        TEXT,
  thumbnail_url     TEXT,
  status            TEXT        NOT NULL DEFAULT 'inactive'
                                CHECK (status IN ('active', 'inactive', 'ended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_date_range_idx
  ON events (event_start, event_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS events_status_active_idx
  ON events (status)
  WHERE status IN ('active', 'ended');
```

### 4.2 DOWN (`migrations/019_down_events_table.sql`)

```sql
DROP TABLE IF EXISTS events;
```

---

## 5. v1 알파 상태

- 테이블 생성 완료, 데이터 0건
- `status = 'inactive'` DEFAULT로 v1에서 활성화 불가
- 이 Migration은 `seed:visitjeju-reference-top1000` 스크립트와 독립적 (선택 적용)

---

## 6. v1.5 trigger 조건 (ADR-0047)

아래 두 조건 모두 충족 시 활성:
1. 여행 날짜 입력 UI 구현 완료
2. 동선 알고리즘에 날짜 매칭 로직 진입

**v1.5 활성 시 추가 작업:**
- `src/scripts/seed-visitjeju-events.ts` 작성
  - 비짓제주 c5 수집 → `events` 테이블 INSERT
  - `event_start`, `event_end` 파싱 (비짓제주 API에서 날짜 필드 확인 필요)
  - `status = 'active'` 설정
- 동선 알고리즘에 events 매칭 로직 추가:
  - `여행 기간 ∩ 이벤트 기간` 필터
  - Day plan 생성 시 인근 events 추천

---

## 7. 수락 기준

### AC-019-1: 테이블 생성
- Migration 019 실행 후 `events` 테이블 존재.
- 컬럼 목록, 타입, 제약조건이 Section 2 스키마와 일치.

### AC-019-2: 인덱스 생성
- `events_date_range_idx`, `events_status_active_idx` 존재.

### AC-019-3: 빈 테이블
- `SELECT COUNT(*) FROM events` = 0.

### AC-019-4: DOWN 가역성
- `019_down_events_table.sql` 실행 후 `events` 테이블 없음.

---

## References

- ADR-0047: 축제·행사 별도 events 모델
- `specs/visitjeju-reference-top1000.md`: c5 알파 제외 결정
- 비짓제주 c5 API: `category=c5` → 474건 (축제/행사)
