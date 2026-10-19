# Plan: 부산 — 같은 앱의 두 번째 여행지

Spec: `specs/busan.md`(D1~D5 정함). ADR-0094 + Amendment 1. 용어는 `docs/context.md`의 **여행지**·**시작 화면**·**장소 범위**·**세부 지역**·**유명한 곳**.

2판(2026-10-18): 독립 검토 `docs/reviews/plan-busan-review.md`(MAJOR 11·MINOR 12)를 반영했다. 무엇을 어디서 고쳤는지는 맨 아래 「검토 반영」.

## 뼈대

| 자리 | 파일 | 하는 일 |
|---|---|---|
| 여행지 표 | 새 `src/dest.ts` | `Dest = 'jeju' \| 'busan'`, `destOf(p)`: `inJeju` → 제주, 부산 경계 안 → 부산(S5부터), 아니면 `null`. **빌드 정의(`__…__`)를 읽지 않는 순수 모듈**이라 서버 함수·tsx 스크립트가 import해도 된다(M2). 여행지별 해 기준점·머리말·출처 줄은 쓰는 단위(S5·S6)에서 더한다 |
| 출시 스위치 | 새 `src/release.ts` | `export const BUSAN = typeof __BUSAN__ !== 'undefined' && __BUSAN__`, `released(d)`. **스위치를 읽는 곳은 이 파일 하나**(테스트가 소스 전체에서 `__BUSAN__`을 찾아 본다). `areas.ts`·`dest.ts`·`kma.ts`·`events/*`는 스위치를 모른다. 거르는 곳은 앱 진입(딥링크 slug·`?stay=`, GPS 판정, 기준 시트 여행지 줄)뿐(M2) |
| 스위치 값 | `vite.config.ts` | Vite mode `busan`일 때만 켬: `vite build --mode busan`·`vitest run --mode busan`(Windows npm 스크립트에 환경 변수 문법이 없어 mode를 쓴다). `__BUSAN_V__` = `public/spots-busan.json` 해시, 파일이 없으면 `''` |
| 동네 | `src/areas.ts` | **`AREAS`는 제주 15곳 그대로 둔다**(이름·순서·값·`inJeju`). 랜딩·사이트맵·`regeocode`·`i18n/apply`·`home`·`render`·테스트 30여 곳이 `AREAS`를 읽으므로, 부산을 같은 배열에 넣지 않으면 그 소비자는 손대지 않아도 제주만 본다(M1). 부산 12곳은 S5에서 `BUSAN_AREAS`, `areasOf(dest)`, `nearestArea(p, areas = AREAS)`. 여행지 둘 다 필요한 곳만 `ALL_AREAS`를 이름으로 쓴다: `kma.ts` `areaBySlug`(S6), 딥링크 slug(S5, `released`로 거름), `events/validate.ts` 동네 이름(S7) |
| 부산 경계 | 새 `data/geo/busan-boundary.json`(단순화 다각형, 출처·꼭짓점 수·허용 오차를 머리에) → `src/dest.ts` | **앱만 쓴다. HTML 인라인에는 꼭짓점이 없다**(M3 c). 인라인 판정에는 꼭짓점이 필요 없다(아래) |
| 여행지 정하기 | `index.html` `<head>` 인라인(언어 고르기 다음), `<!--busan-->…<!--/busan-->`로 감쌈 | 1.1 순서: `?area=` slug 표(부산 12개 이름만), `?stay=`는 제주 네모(`inJeju`와 같은 수) 안 → 제주, 밖 → 부산 후보(앱이 `destOf`로 확정, 둘 다 밖이면 버리고 제주), 키만 있는 링크·`?area=here`·`/jeju/**` referrer → 제주, `jeju.dest`, `jeju.` 키 하나라도 → 제주. 넷째 경우만 `html`에 `.yc-start` 클래스(CSS가 덮개 자리를 바로 그림, `.l10n`과 같은 방식). 결과는 `window.__dest`. **꺼진 빌드는 `transformIndexHtml`이 이 블록을 통째로 지운다**(→ S1~S6 제주 HTML 바이트 그대로, M3 b) |
| 시작 화면 덮개 | `index.html` 바디 첫 인라인(`#app` 앞, 같은 표시로 감쌈) + `src/start.ts`(앱) | `.yc-start`일 때만 덮개 DOM을 만든다(정적 HTML에 새 요소 없음). 칸 고르기는 인라인이 바로 처리(`jeju.dest` 쓰고 `yc:dest`). 큰 버튼은 `yc:start-gps`만 보내고 앱이 `locate()` → `destOf`로 정한다(누를 때는 앱 번들이 이미 와 있다, 오기 전 누름은 기분 누름처럼 `__startTap`에 남겨 마운트 때 처리). 네 언어 문구는 인라인 작은 표 |
| `granted` 순서 | `src/start.ts` | M4: `.yc-start`가 그려진 채로 앱이 권한을 본다. `granted`면 큰 버튼을 `위치 확인 중…`으로 바꾸고 읽는다 → 여행지 안이면 덮개를 걷고 그 여행지, 실패·밖이면 처음 상태(밖이면 밖 문구). 제주 홈이 덮개보다 먼저 보이는 순간은 없다(덮개는 첫 그리기부터 있고, 걷히는 것만 있다) |
| 데이터 받기 | `src/main.ts` `loadSpots(dest)` | 제주 `spots.json?v=__SPOTS_V__` 그대로, 부산 `spots-busan.json?v=__BUSAN_V__`. 주소 짓기는 `main.ts`에 둔다(빌드 정의를 쓰므로). `createSpotSource`는 여행지마다 하나(m3) |
| GPS 판정 | `src/main.ts` `locate()` | S1: `destOf(p)`가 `released`된 여행지면 점, 아니면 `outside`(꺼진 빌드 = 지금과 같음). S5: 켠 빌드에서 부산 점도 돌려주고 앱이 자동 전환(1.3) |
| 상태 | `src/state.ts`, `src/app.ts` | S5: `dest`를 상태에 둔다. 자동 전환은 기준 `gps`일 때만. 전환 시 새 데이터를 받은 뒤 그리기. 세션 복원에 `dest` |
| 저장소 | `src/store.ts` | S5(ADR, 아래 #6): `jeju.dest`. 제주 숙소·동네 키(`jeju.stay`·`jeju.region`)는 그대로 제주 것, 부산은 `jeju.stay.busan`·`jeju.region.busan`. `jeju.basis`도 여행지별(`jeju.basis.busan`): 읽기가 그 여행지 키로만 검사·다시 쓰기, 다른 여행지 키는 건드리지 않음(m1). `parseRegion(v, dest)`. 다른 여행지 id 보존: 백업 복원 거르기를 「지금 여행지 데이터에 있음, 또는 id가 다른 여행지 것(`bs-` 머리 = 부산, UUID 꼴 = 제주)」로, `left` 수는 지금 여행지 것만 센다(m2) |
| 그리기 | `src/render.ts`, `src/home.ts`, `src/logo.ts` | 기준 시트 맨 위 `여행지` 줄, 동네 칸 `areasOf(dest)`, 저장한 곳 맨 아래 `부산에 저장한 곳 N곳`, 부산 홈 머리말·출처 줄, 부산 문서 제목, 「다른 동네 둘러보기」 숨김, 외국어 부산 안내 한 줄, 보일 곳 < 3인 탭 숨김(M8). 앱이 바꾸는 제주 문구 자리(m5): `index.html` `.credit`(결과·저장한 곳), `render.ts` `지금은 제주 밖이에요.`·숙소 고르기 문구. 정적 HTML은 그대로, 앱이 부산일 때만 바꾼다 |
| 링크 | `src/links.ts`, `src/deeplink.ts` | S1: `inJeju(s)` → `destOf(s) !== null`(같은 결과). S5: 검색 범위 낱말 = 장소 여행지(`제주\|서귀포` / `부산`, M7). 딥링크 `?area=` 부산 slug·`?stay=` 부산 좌표는 `released('busan')`일 때만 |
| 비 소식 | `functions/_lib/kma.ts` | S6: `areaBySlug`가 `ALL_AREAS`를 본다(스위치 없음, 부산 slug를 미리 받아도 해 없음). 제주 15 slug 격자 그대로 |
| 사용 기록 | `src/track.ts`, `events/validate.ts`, `events/handler.ts` | S7(M6): `FIELDS`에 `dest`·`how`·`why`, `EVENTS`에 `start_view`·`start_done`, 값 집합 고정. `handler.ts` 고정 id `start:view`, `start:<how>:<why>:<dest>`. 수집기 변경을 `contextOf`에 `dest`를 넣는 커밋보다 **먼저 또는 같은 배포**에(옛 앱 → 새 수집기, 새 앱 → 새 수집기 둘 다 통과) |
| 부산 데이터 | 새 `scripts/busan/*.mjs`, `review/busan/` | S2~S4b. Postgres·`build-spots.mjs`를 쓰지 않는 파일 기반(ADR, 아래 #4) |
| 캐시 | `vite.config.ts`, `scripts/sw-build.ts`, `sw/sw.js`, `public/_headers` | 부산 파일은 미리 받기(`PUBLIC_SHELL`)에 넣지 않는다. 쓸 때 캐시(이미 `?v=`는 cache first). 새 워커 install에서 옛 캐시에 `spots-busan.json`이 있었으면 새 주소를 받아 둔다 — `addAll` 사슬과 **따로 `.catch`**(부산 파일 404가 새 배포 설치를 막지 않게, m12). `_headers`에 `/spots-busan.json` immutable 한 줄(m4) |

## 단위 (순서대로. 단위마다 검증 → 커밋. 꺼진 스위치로 각각 출하 가능)

| # | 단위 | 주로 건드리는 곳 | 검증 |
|---|---|---|---|
| S0 | 기준선 | `review/busan/release-baseline.json`(기계), `review/busan/release-baseline.md`(사람), `scripts/jeju-baseline.ts`(`npm run check:jeju`, `-- --write`) | 아래 「제주 그대로」의 값을 지금 커밋에서 잰다. 같은 커밋에서 두 번 돌려 둘 다 통과(지문이 흔들리지 않음) |
| S1 | 여행지 모델 + 데이터 나누기(제주만) | `src/dest.ts`(`Dest`, `destOf` 제주만), `src/release.ts`, `vite.config.ts`·`env.d.ts`(`__BUSAN__`·`__BUSAN_V__`, mode `busan`), `package.json`(`test:busan`), `main.ts`(`loadSpots(dest)`, `locate()`가 `destOf`+`released`), `app.ts`(`loadSpots('jeju')`), `links.ts`·`deeplink.ts`(`destOf`), `tests/spot-record.ts`(S1' 레코드 형식 검사를 경계 인자 받는 함수로, M9) | 기존 vitest·e2e 기대값 **안 바꾸고** 통과, `npm test`·`npm run test:busan` 각각 두 번. `tests/dest.test.ts`(제주 `inJeju` 표 그대로, `destOf`, 스위치는 `release.ts`만, 서버 함수 모듈이 빌드 정의 없이 실행됨). `check:jeju` 통과 |
| S2 | 부산 수집 | `scripts/busan/collect.mjs`·`.d.mts`, `review/busan/raw/list-<type>.json`·`raw/detail/<contentid>.json`·`raw/calls.log`, `review/busan/scope.json` | `tests/busan-collect.test.ts`: 범위 거르기(3.2 표, `lclsSystm3` SH060100·SH060200만), id `bs-<contentid>`, 사진 `firstimage`→`firstimage2`→`''`, `http://` → `https://`(바꾼 주소가 답하는지 원문 스냅숏 몇 곳으로 확인, m7), 받은 것 건너뛰기, KST 하루 900회에서 멈춤, `modifiedtime` 갱신 판단, 목록 `totalCount` > `numOfRows`면 쪽 넘김(m11). 원문 스냅숏 커밋. ADR #4 |
| S3 | AI 판정 + 표본 검수(**결과 생성, 1회**) | 먼저 `review/busan/criteria.md` 커밋 → `review/busan/judge-01/*.json` → `review/busan/audit-01.json`·`REPORT.md` | 근거 조각 원문 대조 스크립트, 후보 전부 기록, 일치율. keep·기분 ≥ 90%, 실내 ≥ 95%, 사실 오류 ≤ 3/120. 못 넘으면 붙이지 않고 수치와 가설만 적고 멈춘다 |
| S3b | 카카오 ID·폐업 대조(**결과 생성, 1회**) | 먼저 `review/busan/kakao-criteria.md`(ADR-0050 규칙: 이름·거리 기준) 커밋 → `review/busan/kakao-01.json` | keep된 곳만(약 900회, m11). 규칙 밖 판단 0 |
| S4 | 검색수 측정(**결과 생성, 1회**) + 부산 출하 파일 | 먼저 `docs/research/busan-popularity/criteria-01.md` 커밋(키워드 규칙 — `famous-measure.mjs`의 `keyword03`·`keywords04` 중 무엇을 쓰는지, 흔한 이름 `부산 + 이름`, `< 10`=5, 재시도 상한, 대상 = keep 전부 먹기 포함) → `famous-measure.mjs`에서 `keywordstool`을 export로(m6) → `scripts/busan/measure.mjs` → `review/busan/pop-01.json`. `scripts/busan/build.mjs` → `public/spots-busan.json` | `tests/busan-data.test.ts`(B8): `tests/spot-record.ts`를 부산 경계로 부름(제주 기대값 그대로), `bs-` 머리말, 뺀 분류 0, `famous`가 규칙과 정확히 같은 60곳, 개요·근거 원문 없음, 멱등. 파일 크기 기록. `check:jeju` |
| S4b | 부산 체험 예약 경로(M8) | 먼저 `review/busan/booking/criteria.md`(ADR-0074 판정 규칙 그대로) → `review/busan/booking/routes.json` → `build.mjs`가 `book`/`hide` 적용(판정 없는 체험이면 빌드가 멈춤, ADR-0074 2) | `busan-data.test.ts`: `do`는 모두 `book` 또는 `hide`. 웹 검색 상한(아래 어림) 안 |
| S5 | 시작 화면 + 여행지 바꾸기 + 부산 12동네 | **먼저 e2e 하네스**(M10): `fresh()`가 켠 빌드에서 기본으로 `jeju.dest: 'jeju'`를 심고 「새 브라우저」 검사만 `storage: null`, 위치 스텁이 `getCurrentPosition` 호출 수를 `window.__geoCalls`에 세고 `__geo.perm`(`prompt\|granted\|denied`)을 받음. 그다음 동네 중심(**결과 생성, 1회**: 먼저 `review/busan/areas-criteria.md` — `plans/tomorrow-picker.md`와 같은 방법, 입력 `spots-busan.json` 해시 — 커밋 후 한 번 계산, M11), 경계 다각형, index.html 인라인(표시로 감쌈, 꺼진 빌드는 지움), `src/start.ts`, `app.ts`(`__dest`·`yc:dest`·`yc:start-gps`, 자동 전환, 숙소·동네·기준 여행지별), `render.ts`(여행지 줄, 저장한 곳 다른 여행지 줄, 부산 홈, 탭 숨김), `store.ts`, `links.ts`(M7), `sw.js`·`_headers`, `src/i18n/{en,zh-Hans,ja}.ts`. ADR #2·#6, ADR-0093 Amendment(#5) | `tests/start.test.ts`(인라인 판정 표, 가상 window: 링크·`?area=here`(m8)·`/jeju/**` referrer·기억·이전 기기·없음, `granted` 상태 전이 M4, `role="dialog"`·`aria-modal`·첫 초점 m10), `tests/busan-areas.test.ts`(slug 안 겹침, 대표 지명이 제 동네, 구포→서면(areas-criteria 고침 3), 가덕도→다대포, 일광→송정·기장, **B7** 12×3×6×비 켬/끔 빈손 0, **D1 점검 따로**: `famous`·`drive30`·낮·넓히기 없이 12동네 × 3장 — 실패하면 60을 바꾸지 않고 동네·수치를 보고하고 멈춤), `dest.test.ts` **B4** 10점, `store.test.ts`(B10, 백업 왕복 `bs-`, 여행지별 기준 왕복 m1·m2), `wayfinding.test.ts`(B11 + 부산 `placeUrl`·`kakaoUrl`(ID 없음) 검색어에 `제주` 없고 `부산` 있음 M7), `sw.test.ts`(부산 파일 이어받기 실패해도 설치 m12), `i18n.test.ts`(새 키·인라인 표에 한글 없음), m10의 나머지(부산 문서 제목, 둘러보기 숨김, 거절 뒤 `지역 고르기`, 노을 줄 없음, `가 본 곳 N곳` 여행지별). 이동 시간 점검(m9): 부산 10쌍의 `직선×1.3÷40km/h`와 지도 앱 시간을 기록만(고치지 않음, 지도 앱은 주인이 보거나 웹 검색 상한 안). e2e는 꺼진 빌드와 켠 빌드 각각 전부 |
| S6 | 오늘 판 부산 몫 | `home.ts`(위치 모를 때 부산시청 해), `kma.ts`(`ALL_AREAS`), `review/busan/market-days.json`, 밤 산길 부산 회차(**결과 생성, 1회**): `night.mjs`·`loadNightCalls`·`markets.mjs`에 **입력·출력 경로 인자를 먼저 넣는다**(기본값은 제주 그대로, m6) → `review/busan/night/criteria.md` → `candidates.json`·`trail-01.json`·`audit-01.json` → 부산 파일에 적용 | `rain-fn.test.ts`(`haeundae` 답 또는 204, 제주 15 slug 격자 그대로 — **B12**), `night-data`·`night-pick` 부산 경우, `market.test.ts` 부산 장날. `check:jeju`(`spots.json` 해시 그대로가 경로 인자의 증거) |
| S7 | 출시 | `events/validate.ts`·`handler.ts`·`events.test.ts`(「`dest`가 붙은 기존 이벤트가 거절되지 않음」, 옛 앱 묶음도 통과, M6), `src/track.ts` `contextOf`에 `dest`, `start_view`(앱이 마운트 뒤 `window.__startShown`을 보고, 덮개가 1초 이상 보였고 `navigator.webdriver`가 아닐 때만), `start_done`, `scripts/analytics-report.mjs`, GA4 매개변수, `public/privacy*.html` 네 언어(7절, 사용 기록(이 사이트)·GA4에 각각 무엇이 가는지 나눠), `public/llms.txt`(부산 slug 한 줄), `docs/partner/`(공사 답변 원문), `design/SPEC.md`·`docs/context.md`(「준비 중」 지움), `__BUSAN__` 켬 | **B14** 전부, 렌더 SEO 점검(M5, 아래), `check:jeju`는 허용 차이 목록만, 출시 뒤 측정 두 개를 날짜와 함께 `review/busan/release-baseline.md`에 예약. 스위치와 꺼진 빌드 갈래는 출시 뒤 4주 판정이 끝나면 지운다 |

S2는 S1과 따로 진행할 수 있다(앱을 안 건드린다). S4b는 S4 출하 파일 전에, S5는 S4·S4b의 출하 파일이 있어야 동네 중심을 정한다. e2e 하네스 변경은 S5 첫 커밋이다.

## 제주가 그대로임을 보이는 법 (`npm run check:jeju`, S1~S6 매 단위, S7은 허용 차이만)

`scripts/jeju-baseline.ts`가 아래를 다시 재서 `review/busan/release-baseline.json`과 견준다. 운영 빌드(`SITE_URL=https://yeochana.com`, 꺼진 스위치) 뒤에 돌린다. 하나라도 다르면 무엇이 다른지 적고 exit 1.

1. **데이터**: `public/spots.json`·`public/i18n/places.*.json` sha256, `__SPOTS_V__`·`__PLACES_V__`. `build-spots.mjs`는 돌리지 않는다.
2. **배포 파일 전부**: `dist/` 아래 `assets/`를 뺀 모든 파일의 sha256 — `index.html`(바이트 전부, 인라인 포함), `sw.js`, `sitemap*.xml`, `robots.txt`, `404.html`, `privacy*.html`, `llms.txt`, `_headers`, `manifest`, 아이콘, `dist/jeju/**`(폴더별 묶음 해시·파일 수). 견주기 전에 바꾸는 것은 셋뿐이다: 해시 붙은 자산 이름(`index-XXXXXXXX.js` → `index-*.js`, 코드가 바뀌면 이름은 늘 바뀐다), `sw.js`의 `VERSION` 값, `sitemap-core.xml`의 `/`·`/privacy` `<lastmod>`(빌드 날짜를 따라 움직이는 기존 동작). 이름을 지운 `index.html`의 바이트 수·gzip도 기록한다.
3. **서비스 워커 미리 받기 목록**: 이름을 지운 목록이 같다(부산 파일 0, 제주 `spots.json?v=` 그대로).
4. **자산**: 해시 뺀 자산 이름 목록이 같다. 한국어 진입 JS+CSS gzip ≤ 50,000 B(Vite가 보이는 kB와 같은 셈)이고 S0 대비 늘어난 바이트를 출력한다(같을 필요는 없다 — `__APP_V__`가 커밋마다 JS를 바꾼다). 넘치면 부산 동네 표를 `spots-busan.json` 머리로 옮긴다.
5. **서버 함수**(tsx, Vite 정의 없이 = wrangler와 같은 조건, ReferenceError면 실패): `functions/api/rain.ts` `onRequestGet`을 제주 15 slug·`haeundae`·`gwangalli`·빈 값·모르는 값·키 없음으로 불러 상태·이유·보낸 격자(가짜 `fetch`), `events/handler.ts` `handleEvents`를 고정 묶음(기분 누름, `area` 기준 보임, 숙소 링크, 모르는 필드 `dest`, 모르는 동네 `광안리`, 모르는 이벤트 `start_view`)으로 불러 상태·카운터 증가. 서버 함수 코드 경로가 바뀌면 여기서 걸린다.
6. **브라우저**(운영 빌드를 `vite preview`, Chrome 375×812, `ko-KR`, 시계 고정, `/api/**` 204, 사진 로컬, 위치 스텁 동문시장·권한 `prompt`): 기기 둘 — 빈 저장소, `jeju.saved.v2`에 한 곳만. 기기마다
   - 첫 그리기 전: `DOMContentLoaded` 때 `<html>` 전체(인라인 스크립트가 바꾼 것 포함)와 클래스,
   - 앱이 그린 뒤: `<body>` DOM과 계산 스타일 지문(요소마다 고른 속성·상자 크기), 저장소(local·session) 키와 값, 네트워크 요청 목록(`spots-busan.json` 0), 위치 읽기 호출 수(0 = **B2**),
   - `좀 걷고 싶어` 누른 뒤: 카드 이름, 저장소, 요청 목록, 위치 읽기 1회.
7. **꺼진 빌드 동작**(vitest, S1부터): `/?area=gwangalli`는 모르는 동네, `?stay=<해운대 좌표>`는 버림, GPS 해운대 → `지금은 제주 밖이에요.`(M2).

S7에서 허용하는 차이: 기준 시트 여행지 줄, 저장한 곳 다른 여행지 줄, `privacy*.html`, `llms.txt`, 인라인 블록(켠 빌드), 사용 기록의 `dest`. 목록은 S7 커밋에서 `release-baseline.json`의 `allowed`에 이름으로 적는다.

## SEO 점검 (M5, S7 전에)

`seo:crawl`은 JS를 돌리지 않는 계기판(exit 0 고정)이라 덮개를 보지 못한다. 감사 0은 정적 HTML이 그대로라는 뜻일 뿐이다. 그래서 따로 잰다.

- **렌더 점검**(Playwright, 412×915 모바일, 저장소 없음, JS 실행, Googlebot 스마트폰 UA): 덮개가 뷰포트에서 차지하는 비율, 덮개 뒤 `h1`·`.lede`·기분 목록이 DOM에 있고 `display:none`이 아님. 합격선(지금 적음): 덮개 뒤 본문 DOM 셋 모두 있음. 덮개 비율은 기록만 한다(spec 1.2의 「덮는 한 장」이면 100%에 가깝다). 스크린숏 `design/qa/busan/`.
- 배포 직후 서치콘솔 URL 검사 「실제 URL 테스트」 스크린숏(주인 몫)을 같은 곳에.
- **4주 판정**(spec 9 사전등록에 덧붙임, S7 전 주인 승인): 기준 기간은 **S7 직전 4주**(S0이 아님). 대조군 `/jeju/**` 노출의 같은 기간 변화를 함께 잰다. 「`/` 감소율 − `/jeju/**` 감소율 > 30%p」면 ADR-0094 2를 다시 연다.
- **주인 선택지**: 덮개를 아래 절반 시트로만 두고 위쪽에 홈 제목·리드가 보이게 하면 「본문을 가리는 창」 위험이 준다. spec 1.2 「홈 위에 덮는 한 장」을 바꾸는 일이라 S5 착수 전에 주인이 고른다. 고르기 전에는 spec대로 만든다.

## API 호출 어림

| 단위 | 대상 | 호출 |
|---|---|---|
| S2 1일차 | TourAPI `areaBasedList2`(`lDongRegnCd=26`, `numOfRows=1000`) 종류 5개 | 약 5~7(`totalCount`가 1,000을 넘으면 쪽 넘김) |
| S2 1일차 | `detailCommon2` 관광지 351·문화시설 123·레포츠 60·전통시장 57 | 약 591(합 ≤ 900) |
| S2 2일차 | `detailCommon2` 음식점 517 | 517 |
| S3b | 카카오 로컬 키워드 검색(keep만, ADR-0050) | 약 900 |
| S2 이후 갱신 | 목록 5 + `modifiedtime` 바뀐 곳만 | 수십 |
| S3·S6 판정 | 모델 판정(외부 API 아님) | 약 1,108곳 + 표본 120, 밤 산길 후보 수십 |
| S4 | 검색광고 `keywordstool`(한 번에 5개) | ⌈keep 수 × 규칙당 키워드 ÷ 5⌉, keep 약 900·평균 1.5개면 약 270. 재시도는 criteria-01의 상한까지, 한 번만 |
| S4b 예약 경로 | 웹 검색 | 60회 이하(레포츠 60곳, 곳마다 1회) |
| S5 이동 시간 점검 | 웹 검색 | 10회 이하 |
| S6 장날 | 웹 검색 | 20회 이하 |
| 출시 뒤 | `/api/rain` | 사용자 몫(엣지 캐시), 부산 slug 12개 늘어남 |

TourAPI는 개발 한도 1,000회/일 안이다. 스크립트가 KST 날짜별 `calls.log`로 900회에서 스스로 멈춘다. 웹 검색은 세션당 200회 쿼터에서 위 합 90회 이하, 단위마다 에이전트 프롬프트에 상한을 적는다.

## 주인 몫

- **필요 없음(첫 출시)**: TourAPI 운영계정 전환, 부산시 관광 API 활용신청. 키는 `.env`의 `DATA_GO_KR_SERVICE_KEY`·`NAVER_AD_*`·카카오 키를 그대로 쓴다.
- **S5 전에 고를 것**: 덮개 꼴(위 SEO 점검의 선택지). 부산 사용자가 서비스 워커 미리 받기로 제주 `spots.json`(1.19MB)을 받는 문제(m3): (가) 그대로 둔다 — 제주 사용자 동작이 안 바뀐다(기본값), (나) 미리 받기에서 빼고 쓸 때 캐시 — 제주 기기의 오프라인 첫 실행이 바뀐다. 고르기 전에는 (가).
- **S7 전에 필요**: 한국관광공사 답변 원문 → `docs/partner/`. 원문이 없으면 S7을 열지 않는다. spec 9 4주 판정식 덧붙임 승인.
- **S7 뒤**: GA4 관리 화면에 맞춤 측정기준 `dest`·`how`·`why` 등록. 배포 직후 URL 검사 스크린숏.
- **승인**: 결과 생성 실행이 통과 기준을 못 넘었을 때의 재실행. 장날 주인 예시(구포 3·8일, 기장 2·7일)는 원문 확인 전까지 싣지 않는다.

## 결과 생성 실행 (사전등록 먼저, 1회)

| 실행 | 먼저 커밋할 것 | 판정 |
|---|---|---|
| S3 부산 판정 + 블라인드 120곳 | `review/busan/criteria.md` | spec 3.3 기준 |
| S3b 카카오 대조 | `review/busan/kakao-criteria.md` | ADR-0050 규칙 |
| S4 검색수 측정 | `docs/research/busan-popularity/criteria-01.md` | 보고 나서 키워드 규칙을 고치지 않는다 |
| S4b 예약 경로 | `review/busan/booking/criteria.md` | ADR-0074 |
| S5 부산 동네 중심 | `review/busan/areas-criteria.md`(방법·입력 해시) | B7·D1 점검. 실패하면 중심·60을 고치지 않고 보고 |
| S6 밤 산길 부산 회차 | `review/busan/night/criteria.md` | `specs/night-trails.md` 1절 기준 |
| 출시 4주 뒤 시작 화면 | spec 7(이미 등록) + 「`start_view`는 1초 이상 보였고 webdriver 아님, 수치는 D1 counters로(GA4 보조)」 덧붙임 | `start_view` ≥ 100이면 `start_done ÷ start_view` < 70% → 꼴 다시 열기, 미만이면 「판단 보류」 |
| 출시 4주 뒤 `/` 노출 | spec 9 + 위 차이 기준 덧붙임 | S7 직전 4주 대비, `/jeju/**` 대조군 |

## 검증 명령 (`apps/web`)

```
npm run typecheck
npm test                      # 꺼진 스위치
npm run test:busan            # 켠 스위치 (S1부터)
npm run check:slop
npm run e2e                   # 꺼진 빌드. S5부터 켠 빌드도 (E2E_BUSAN=1)
$env:SITE_URL='https://yeochana.com'; npm run build
npm run check:jeju            # 위 「제주 그대로」. 운영 빌드 뒤
npm run seo:crawl             # 정적 HTML 계기판(감사 0). 덮개 판정은 위 렌더 점검
```

`check:data`(`scripts/check-data.ts`)는 옛 S1 검사라 지금 제주 파일에서도 실패하고(필드 9개 가정, Postgres 연결) 판정에 쓰지 않는다(M9). S1' 레코드 검사는 `tests/data.test.ts`·`tests/spot-record.ts`다. 빌드가 바꾸는 `data/landing/lastmod.json`은 랜딩이 실제로 바뀐 단위가 아니면 되돌린다. 측정·검사는 한 번 돌리고, 실패하면 출력과 가설을 보고한다.

## 위험과 되돌리기

| 위험 | 막는 법 | 되돌리기 |
|---|---|---|
| 시작 화면이 모바일 가로막기 창으로 읽혀 `/` 노출 감소 | 홈 본문 DOM 그대로, 덮개는 스크립트로만, 렌더 점검 합격선, 대조군 있는 4주 판정. 크롤러를 가려내 다르게 보이지 않는다(클로킹) | `__BUSAN__`을 끄고 다시 배포하면 인라인이 빠지고 저장소 없는 방문은 제주 홈. 4주 기준에 걸리면 ADR-0094 2 재론 |
| 기존 사용자가 출시 날 시작 화면을 봄 | 1.1의 3(이전 기기), e2e B1 | 같음 |
| 스위치가 서버 함수에서 ReferenceError(조용히 비 소식·기록 멈춤) | 스위치는 `release.ts`만, `check:jeju` 5가 Vite 정의 없이 함수 실행 | — |
| 다른 여행지 저장·가 본 곳·기준이 사라짐 | 복원 거르기 바꿈, 여행지별 키, `known()`은 그리기에서만, B10 | 저장소는 안 지우므로 스위치를 꺼도 id가 남는다 |
| 한국어 번들 50KB 넘침 | GPS 판정은 앱, 꼭짓점은 앱, 인라인은 HTML. 단위마다 바이트 기록 | 부산 동네 표를 부산 파일로 |
| 켠 빌드 HTML이 커짐 | 인라인 블록 gzip 증가 ≤ 2KB(켠 빌드 `index.html` gzip − 꺼진 빌드) | 문구 표를 줄인다 |
| 인라인과 앱의 slug 표가 어긋남 | slug 일치 테스트(꼭짓점은 인라인에 없음) | — |
| 이벤트 묶음이 통째로 거절됨(`dest` 필드) | 수집기 먼저, `events.test.ts` | 수집기는 모르는 값만 거절 |
| TourAPI 한도 초과·중단 | 900회 멈춤, 받은 것 건너뛰기, 원문 커밋 | 다음 날 이어서 |
| 판정·측정 미달, 얇은 동네에서 빈손(B7·D1) | 사전등록 기준, 미달이면 멈추고 보고 | 판정·중심을 고쳐 통과시키지 않는다 |
| 부산 쪽 스크립트가 제주 파일에 씀 | `night.mjs`·`markets.mjs` 경로 인자, `check:jeju` 1 | — |
| 옛 워커 + 새 HTML 짝 안 맞음 | `?v=` 해시, 부산 파일 이어받기(따로 catch), `sw.test.ts` | — |
| 사진 핫링크(TourAPI 서버) 개인정보 | 안내에 한국관광공사 서버 추가(S7) | — |

## 지킬 불변식

- `build-spots.mjs`를 돌리지 않는다. 제주 데이터·랜딩·정적 홈 HTML(`<title>`·description·OG·`<noscript>`·JSON-LD)은 바꾸지 않는다.
- 페이지가 열릴 때 위치를 묻지 않는다. 위치는 기기 밖으로 보내지 않는다.
- 원문(`overview`)과 판정 근거는 `review/`에만, 출하 파일에 없다.
- 제주 상설시장 추가(spec 5절)는 이 계획 밖, 데이터 회차를 따로 연다. 쇼핑 탭·노을·철·부산 랜딩·부산 장소 글 번역도 밖.

## ADR (검토 판정대로, 쓰는 단위에서 쓴다)

- **#2 시작 화면을 앱 번들 밖 인라인으로**(S5): 판정은 인라인, 덮개 DOM은 쓸 때만, GPS 판정과 꼭짓점은 앱(M3 c), `__dest`·`yc:dest`·`yc:start-gps`, `granted` 순서(M4), 꺼진 빌드는 블록을 지움.
- **#4 부산 데이터는 Postgres 없는 파일 파이프라인**(S2): `review/busan/raw` → `scripts/busan/build.mjs` → `spots-busan.json`, 제주 `build-spots.mjs`와 분리, S1' 검사는 `tests/spot-record.ts` 하나를 두 여행지가 부름.
- **#6 저장소 키**(S5, ADR-0063·0087 개정): 머리말 `jeju.` 유지, 여행지별 키는 꼬리 `.busan`(`stay`·`region`·`basis`), `jeju.dest`, 다른 여행지 id 보존.
- **#5 여행지 파일 캐시**(S5, ADR-0093 Amendment): 미리 받지 않고 쓴 기기만, 새 워커가 따로 이어받음, m3 주인 선택 결과.
- 쓰지 않음: #1 여행지 표(코드 안 구조, 되돌리기 쉬움), #3 다각형(#2·데이터 파일 머리에 합침), #7 스위치(임시, S7 뒤 4주 판정이 끝나면 지움).

S1은 저장 키를 건드리지 않는다(`jeju.dest`는 S5에서 처음 쓰고 읽는다). 그래서 S1에 ADR은 없다.

## 검토 반영 (`docs/reviews/plan-busan-review.md`)

| 항목 | 반영 |
|---|---|
| M1 `AREAS` 소비자·사이트맵 | `AREAS`를 제주 15곳으로 고정하고 부산은 `BUSAN_AREAS`. 검토의 「소비자마다 `areasOf('jeju')`로 바꾸기」 대신 고른 이유: 바꿀 곳이 0이 되고 빠뜨릴 수 없다. 해시 그물은 `dist/` 전부(자산 이름만 지움) |
| M2 스위치·서버 함수·두 상태 | `release.ts` 하나, mode `busan`(환경 변수 대신: Windows npm 스크립트), `test:busan`, `check:jeju` 5가 Vite 정의 없이 실행, 꺼진 빌드 `?stay=`·GPS 검증 |
| M3 인라인 바이트 | HTML 바이트를 그물에, 꺼진 빌드는 블록 삭제, GPS·꼭짓점은 앱, 켠 빌드 +2KB 상한 |
| M4 `granted` 순서 | `.yc-start` 클래스로 첫 그리기부터 덮개, 앱이 상태 전이, `start.test.ts`·e2e |
| M5 SEO | 렌더 점검 합격선, URL 검사, S7 직전 4주 + `/jeju/**` 대조군 차이 기준, 아래 절반 시트는 주인 선택지 |
| M6 이벤트 | `validate.ts`·`handler.ts`·`events.test.ts`, 수집기 먼저, `start_view` 조건, D1으로 판정 |
| M7 검색 링크 | S5 `links.ts` 여행지 낱말, B11에 검색어 검사 |
| M8 예약·탭 숨김 | S4b, `render.ts` 탭 숨김, 웹 검색 상한 |
| M9 `check:data` | 검증 명령에서 뺌, `tests/spot-record.ts`(S1) |
| M10 e2e 하네스 | S5 첫 커밋, 두 빌드에서 전부 |
| M11 동네 중심·D1 | 결과 생성 표에 사전등록, D1 점검 따로 |
| m1·m2 | 저장소 칸, `jeju.basis`도 여행지별, ADR #6 |
| m3 | 주인 선택지, 기본값 (가) 그대로 — 제주 동작을 안 바꾸는 쪽 |
| m4·m12 | 캐시 칸 |
| m5 | 그리기 칸에 자리 목록 |
| m6 | S4·S6 칸(export, 경로 인자 먼저) |
| m7·m11 | S2 칸, S3b(카카오는 keep 뒤로) |
| m8 | `?area=here`는 「키만 있는 링크」로 보아 제주로 연다. 위치를 읽어 부산이면 1.3 자동 전환(기준 `gps`)이 옮긴다 — spec 1.1·1.3과 어긋나지 않아 spec은 그대로 |
| m9 | S5 기록만 점검 |
| m10 | S5 테스트 목록 |

반대한 것: 없음. 검토와 다른 방법을 고른 곳은 M1(소비자 수정 대신 배열 분리)과 M2(환경 변수 대신 mode) 둘이고 이유는 위 표에 적었다.
