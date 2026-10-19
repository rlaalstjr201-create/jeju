# Light Spec: 익명 사용 기록

근거: ADR-0061.

## 이벤트

`{ e, id?, mood?, sub?, range?, basis?, dated?, indoor?, season?, dest?, d }` — 시작 화면 둘은 따로(아래)

- `e`: `shown` | `save` | `unsave` | `map` | `book` | `tap`(기분 탭) | `visited` | `unvisited`(ADR-0087: 카드의 「가 봤어요」 누름 / 되돌림 — 카드에서 다시 누름, 저장한 곳의 `다시 넣기`, `모두 다시 넣기`는 장소마다 하나)
- `id`: 장소 id (shown/save/unsave/map/book/visited/unvisited)
- `visited`·`unvisited`는 이 수집기에만 간다. GA4·네이버로는 보내지 않고, 집계 스크립트의 장소 인기(`review/popularity.json`)에는 넣지 않는다(장소의 좋고 나쁨이 아니라 이 기기의 고르기). 필드는 `id`와 위 맥락(`mood`·`range`·`basis`·`dated`·`d` 등) 그대로, D1 카운터 키는 `(d, id, e)` 그대로.
- `mood`, `sub`(food: meal/cafe, new: mix/sight/do — ADR-0064), `range`(walk/30/60), `basis`(here/stay/area), `dated`(날짜 모드 여부 true/false), `indoor`(비 와요(실내만)가 켜져 있으면 true, 꺼져 있으면 없음 — ADR-0065), `season`(`shown`·`map`에서 그 카드가 철 글자를 보였을 때만 그 종류: cherry/plum/maple/rapeseed/hydrangea/silvergrass/camellia/tangerine/muhly, 없으면 필드 없음 — ADR-0080. D1 카운터 키는 그대로. GA4에는 `card_shown`·`map_open`의 `season` 매개변수로 간다 — ADR-0080 8 개정)
- `d`: 로컬 날짜 `YYYY-MM-DD` (시각 없음)
- 숙소 링크(ADR-0089, `specs/partner-stay-link.md`): 링크의 `src` 꼬리표가 이번 세션에 있으면 `tap`·`map`이 나갈 때마다 `{ e, id: 'src:<꼬리표>', d }`를 하나 더 보내고, 링크로 들어온 순간 `open`을 한 번 보낸다(저장 목록 열기 `open`과 다른 id). 인앱 브라우저 안내가 넘긴 주소(`relay=1`, SPEC 6.14)로 들어오면 꼬리표는 이어받고 `open`은 다시 보내지 않는다. 다른 필드는 없다. 이 수집기에만 가고(GA4·네이버 없음), 장소 인기 집계에서 빠지며, 보고서(`analytics:report`)에 숙소별 줄로 나온다. 받는 쪽은 `src:` + `[a-z0-9-]{2,24}`만 받는다.
- 좌표·숙소·지역 이름 이외의 위치·식별자 없음. 지역 기준일 때만 `area` 이름 허용(제주 15곳과 부산 12곳).
- `dest`(`jeju`|`busan`, specs/busan.md 7): 지금 여행지. 출시 스위치를 켠 앱만 맥락(`contextOf`)에 넣는다. 숙소 링크 꼬리표 기록에는 없다. 받는 쪽은 `dest` 없는 옛 앱과 있는 새 앱을 모두 받고, 모르는 값이면 묶음을 통째로 거절한다. D1 카운터 키는 그대로다(장소 id 머리말 `bs-`가 여행지를 말한다). GA4에는 `dest` 매개변수로 간다.
- 시작 화면(specs/busan.md 7, plans/busan.md 결과 생성 표): `{ e: 'start_view', d }`는 덮개가 1초 넘게 보였을 때 한 번, `{ e: 'start_done', how, why, dest, d }`는 덮개를 떠날 때 `start_view`를 보낸 뒤에만(`how`: `gps`|`pick`, `why`: `denied`|`outside`|`unavailable`|`none`, `dest`: 고른 여행지). 자동화 브라우저(`navigator.webdriver`)는 보내지 않는다. 다른 필드는 받지 않는다. D1 카운터 id는 `start:view`와 `start:<how>:<why>:<dest>`(`events/handler.ts` `START_IDS`, 장소 아님). GA4에는 같은 이름 이벤트로 보조로 간다. 보고서(`analytics:report`) 「시작 화면」 절.

## 클라이언트

- `src/track.ts`: `track(event)` → 메모리 큐, 10초 또는 20건마다, 그리고 `visibilitychange: hidden`·`pagehide`에 `navigator.sendBeacon(ENDPOINT, JSON 배열)`. 길찾기·지도·예약 링크를 센 직후에도 바로 보낸다(지도 앱으로 넘어가며 인앱 WebView가 숨김 없이 멈추거나 닫힐 수 있어서). 큐를 비우고 보내므로 두 번 가지 않는다.
- `ENDPOINT` = 빌드 환경변수 `VITE_EVENTS_URL`. 없으면 no-op(개발·테스트 기본). 운영 빌드(`SITE_URL`)는 기본 `/api/events`이고, 비우면 빌드가 실패한다(ADR-0078).
- 끄기: 저장 목록 각주 아래 `기록 끄기`/`기록 켜기` 글자 버튼, 값은 로컬 저장. 꺼져 있으면 큐도 쌓지 않음.
- 고지 문구: `어디가 좋았는지 익명으로 세어요` (저장 목록 각주에 한 줄).
- `shown`은 같은 화면 3장당 한 번(재렌더 중복 없음). 같은 이벤트 두 번 탭은 한 번만.
- 오프라인이면 버린다. 실패 재시도 없음.
- 서비스워커는 이벤트 요청을 캐시하지 않는다.

설문 응답(ADR-0081, `specs/survey.md`)은 이 이벤트가 아니다: 사용자가 `보내기`를 누를 때만 `/api/feedback`으로 가고, 기록 끄기와 무관하다(끄면 홈 설문 줄만 숨는다).

## 받는 쪽 (최소)

- `apps/web/events/`에 호스트 비종속 핸들러 하나: POST JSON 배열 → 검증(필드·값 목록·크기 ≤ 8KB·배열 ≤ 50, `d`는 서버의 제주 날짜 ±1일) → `(d, id, e)` 카운터 증가. 본문은 8KB까지만 흘려 읽는다. 길이 머리(Content-Length)가 8KB를 넘으면 바로 413이고, 길이 머리가 없어도 거절하지 않는다(`/api/feedback`의 411과 다름 — 이 기록이 시범을 재는 도구라, 머리 하나 때문에 기록을 버리지 않는다). IP·UA 저장 안 함. 수집 상태(`/api/events/health`)는 어제~내일만 센다.
- 저장소 어댑터는 인터페이스로 두고 메모리 구현 + 테스트만. 실제 저장소(KV/D1 등)는 호스트 결정 후.
- 집계 스크립트: 카운터 덤프 → `review/popularity.json` (`{ id, shown, save, map, book }`). 장소 이벤트 다섯(`shown`·`save`·`unsave`·`map`·`book`)만 센다(`visited`·`unvisited`는 빠진다, ADR-0087).

## 성공 기준

- U1: `VITE_EVENTS_URL` 미설정이면 네트워크 요청 0(e2e로 확인).
- U2: 설정 시 탭·하트·지도·예약에서 정확한 이벤트가 한 번씩, 좌표 필드 없음(테스트).
- U3: 기록 끄기 후 요청 0, 새로고침 후에도 유지.
- U4: 핸들러가 잘못된 입력을 거부하고 카운터가 정확(유닛 테스트).
- U5: 기존 테스트·check:slop 통과.
