# Light Spec: 익명 사용 기록

근거: ADR-0061.

## 이벤트

`{ e, id?, mood?, sub?, range?, basis?, dated?, d }`

- `e`: `shown` | `save` | `unsave` | `map` | `book` | `tap`(기분 탭)
- `id`: 장소 id (shown/save/unsave/map/book)
- `mood`, `sub`, `range`(walk/30/60), `basis`(here/stay/area), `dated`(날짜 모드 여부 true/false)
- `d`: 로컬 날짜 `YYYY-MM-DD` (시각 없음)
- 좌표·숙소·지역 이름 이외의 위치·식별자 없음. 지역 기준일 때만 `area` 이름 허용.

## 클라이언트

- `src/track.ts`: `track(event)` → 메모리 큐, 10초 또는 20건마다, 그리고 `visibilitychange: hidden`에 `navigator.sendBeacon(ENDPOINT, JSON 배열)`.
- `ENDPOINT` = 빌드 환경변수 `VITE_EVENTS_URL`. 없으면 no-op(개발·테스트 기본).
- 끄기: 저장 목록 각주 아래 `기록 끄기`/`기록 켜기` 글자 버튼, 값은 로컬 저장. 꺼져 있으면 큐도 쌓지 않음.
- 고지 문구: `어디가 좋았는지 익명으로 세어요` (저장 목록 각주에 한 줄).
- `shown`은 같은 화면 3장당 한 번(재렌더 중복 없음). 같은 이벤트 두 번 탭은 한 번만.
- 오프라인이면 버린다. 실패 재시도 없음.
- 서비스워커는 이벤트 요청을 캐시하지 않는다.

## 받는 쪽 (최소)

- `apps/web/events/`에 호스트 비종속 핸들러 하나: POST JSON 배열 → 검증(필드·값 목록·크기 ≤ 8KB·배열 ≤ 50) → `(d, id, e)` 카운터 증가. IP·UA 저장 안 함.
- 저장소 어댑터는 인터페이스로 두고 메모리 구현 + 테스트만. 실제 저장소(KV/D1 등)는 호스트 결정 후.
- 집계 스크립트: 카운터 덤프 → `review/popularity.json` (`{ id, shown, save, map, book }`).

## 성공 기준

- U1: `VITE_EVENTS_URL` 미설정이면 네트워크 요청 0(e2e로 확인).
- U2: 설정 시 탭·하트·지도·예약에서 정확한 이벤트가 한 번씩, 좌표 필드 없음(테스트).
- U3: 기록 끄기 후 요청 0, 새로고침 후에도 유지.
- U4: 핸들러가 잘못된 입력을 거부하고 카운터가 정확(유닛 테스트).
- U5: 기존 테스트·check:slop 통과.
