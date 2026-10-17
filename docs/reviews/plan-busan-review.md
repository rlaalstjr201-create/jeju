# 독립 검토: plans/busan.md (워크플로우 5단계 Plan Review)

검토 2026-10-18. 계획을 쓰지 않은 검토자. 대조: `specs/busan.md`, ADR-0094(+Amendment 1), `docs/context.md`, `apps/web` 코드(커밋 252adde). 코드·계획은 고치지 않았다. 줄 번호는 이 커밋 기준.

**요약: BLOCKER 0 · MAJOR 11 · MINOR 12.** 뼈대(여행지 표, 파일 분리, 꺼진 스위치로 단계 출하, 사전등록)는 맞다. 다만 "제주 그대로"를 보는 그물이 `dist/jeju/**`·JS+CSS gzip에만 걸려 있어서, 실제로 제주가 바뀌는 길(사이트맵, HTML 바이트, 서버 함수, 이벤트 수집기)이 그물 밖에 있다.

계획의 코드 주장 확인 결과:
- 맞음: `app.ts:595` 백업 복원 `idx.has(e.id)` 거르기, `keep.ts:10-11,57` UUID 아닌 id는 UTF-8, `vite.config.ts:9` `PUBLIC_SHELL`, `sw/sw.js:19-23` `usedLangs`, `sw/sw.js:98-114` 같은 출처 GET은 모두 cache first, `main.ts:15` `locate()`가 제주 밖을 버림, `index.html` 치환(`__I18N__`·`__SPOTS_V__`), `logo.ts:14` `logoInner(region)`, e2e `await check(` 84개.
- 틀림·빠짐: 아래 M1·M2·M6·M9·m6.

---

## MAJOR

### M1. 부산 12곳을 `AREAS`에 넣으면 제주 랜딩·사이트맵·서버 검증이 바뀐다. 계획의 그물은 `dist/jeju/**`만 본다
- 근거: `scripts/landing.ts:6,123,207,212,221,337,372-373,382`와 `scripts/build-landing.mjs:12,89`는 `AREAS`·`nearestArea`를 그대로 돈다. 동네마다 랜딩 쪽(`for (const a of AREAS) pages.push`)과 `sitemap-<slug>.xml`이 생기고, ItemList `numberOfItems`가 27이 된다. 사이트맵은 `dist/` 바로 아래 있어서(`dist/sitemap-aewol.xml` 등) `dist/jeju/**` 해시 비교에 안 잡힌다. spec 9의 「사이트맵에 새 주소는 없다」가 그물 밖이다. 이 밖에 `AREAS`를 읽는 곳: `events/validate.ts:22`(이벤트 `area` 허용 목록), `scripts/regeocode.ts:27`, `src/i18n/apply.ts:86-90`(언어마다 동네 이름 표), `src/home.ts:112`, `src/render.ts:730-737`, `src/store.ts:250`. 계획 뼈대 표에는 `render`·`home`만 있다.
- 고칠 것: S1(또는 S5)의 「주로 건드리는 곳」에 `landing.ts`·`build-landing.mjs`·`regeocode.ts`(→ `areasOf('jeju')`), `events/validate.ts`, `i18n/apply.ts`를 넣는다. 「제주 그대로」 해시 목록을 `dist/jeju/**`에서 **`dist/` 중 `assets/`·`index.html`·`sw.js`를 뺀 전부**로 넓힌다(`sitemap*.xml`·`robots.txt`·`404.html`·`privacy*.html`·`llms.txt` 포함). S7에서 바뀌어도 되는 파일(`privacy*`·`llms.txt`)만 이름을 적어 뺀다.

### M2. `__BUSAN__`는 Vite 빌드에만 있다. 서버 함수·tsx 스크립트에서는 그 이름이 없고, vitest는 한 번에 한 값만 돈다
- 근거: `vite.config.ts:130` `define`은 Vite·vitest에만 들어간다. `functions/_lib/kma.ts:3`(→ `/api/rain`)과 `events/validate.ts:4`(→ `/api/events`)는 `src/areas.ts`를 import하고, wrangler가 이것을 따로 번들한다. `npm run build` 안의 `tsx scripts/build-landing.mjs`(package.json `build`)도 `areas.ts`를 읽는다. 스위치가 `areas.ts`·`dest.ts` 최상위에서 읽히면 결과가 둘 중 하나다. 랜딩 빌드가 ReferenceError로 멈추거나(그나마 드러남), 배포된 함수가 실행 중에 ReferenceError를 내서 비 소식·사용 기록이 조용히 멈춘다. 이때 `rain-fn.test.ts`는 vitest의 `define`을 받으니 통과해 버린다. 「테스트는 켠 빌드와 끈 빌드 둘 다 돈다」도 어떻게 도는지가 없다(`npm test`는 설정 하나).
- 고칠 것: 스위치는 앱 쪽 한 모듈(예: `src/release.ts`의 `export const BUSAN = typeof __BUSAN__ !== 'undefined' && __BUSAN__`)에서만 읽는다. `areas.ts`·`dest.ts`·`kma.ts`·`validate.ts`는 스위치를 모르고 부산 표를 늘 가진다. 서버는 부산 slug를 미리 받아도 해가 없다. 걸러 내는 곳은 앱 진입(딥링크 slug, `destOf`, 기준 시트)뿐이다. vitest는 `BUSAN=0|1` 환경 변수로 `define`을 바꿔 두 번 돈다(`npm test`·`npm run test:off`). 꺼진 빌드 검증에 **`?stay=<해운대 좌표>`는 버림**, **GPS 해운대 → `지금은 제주 밖이에요.`**를 더한다. 지금 계획의 꺼진 빌드 검증은 `?area=gwangalli` 하나뿐이고, S1의 `locate()` 변경으로 이 둘이 꺼진 상태에서도 바뀔 수 있다.

### M3. 인라인 시작 화면·경계 꼭짓점·네 언어 표가 HTML로 모든 제주 방문에 실린다. 예산은 JS+CSS만 잰다
- 근거: 계획 뼈대 「부산 경계」·「여행지 정하기」는 꼭짓점과 표를 `index.html` `<head>` 인라인에 둔다. spec 10은 「제주 사용자: 첫 그리기와 받는 바이트가 그대로다」라고 하는데, 계획 검증은 「한국어 진입 JS+CSS gzip ≤ 50KB」뿐이다. B4(김해공항 안, 김해시청·양산·거제 밖)를 맞히려면 서쪽 낙동강·가덕 경계가 꽤 촘촘해야 해서 수십~수백 꼭짓점이 된다. 게다가 S5는 꺼진 스위치로 나가지만 「꺼져 있으면 인라인은 늘 `jeju`」라고만 했다. 꺼진 빌드에서 인라인 자체가 빠지는지는 정하지 않았다.
- 고칠 것: (a) S0 기준선과 단위마다 기록할 값에 `dist/index.html` 바이트·gzip을 넣는다. (b) 꺼진 빌드는 `transformIndexHtml`로 부산 인라인을 통째로 뺀다(→ S1~S6 동안 제주 HTML 바이트 그대로). (c) 큰 버튼의 GPS 판정은 인라인이 아니라 앱이 하게 한다. 버튼은 누를 때 뜨고, 그때는 앱 번들이 이미 와 있다. 덮개는 `yc:start-gps`를 보내고 앱이 `locate()`→`destOf`로 정한다. 그러면 인라인에는 `?area=` slug 표와 `?stay=`용 제주 네모(`inJeju`)만 남는다. 「제주 네모 밖 = 부산 후보, 앱이 `destOf`로 확정, 둘 다 밖이면 버림」으로 정하면 꼭짓점이 HTML에 없고 인라인·앱 꼭짓점 일치 테스트도 필요 없다. (d) 켠 빌드의 HTML 증가 상한을 적는다(예: gzip +2KB).

### M4. 「권한이 이미 `granted`」 판정은 비동기라서 첫 그리기 전에 정할 수 없다
- 근거: spec 1.2는 「권한이 이미 `granted`면 시작 화면 없이 묻지 않고 읽어 1.1 다음에 정한다」, spec 1.1은 「제주 홈이 번쩍인 뒤 시작 화면이 덮이지 않는다」. 그런데 `navigator.permissions.query`는 Promise다(`main.ts:26-33`). 위치 읽기 제한 시간도 8초다(`main.ts:20`). 계획은 인라인이 이 경우를 어떻게 그리는지 정하지 않았다. 또 `<head>` 스크립트 시점에는 `body`가 아직 없어서 덮개를 「붙일」 자리도 없다.
- 고칠 것: 계획에 순서를 박는다. 첫째, 넷째 경우면 `<head>`에서 `html`에 클래스(예: `.yc-start`)를 달아 CSS로 덮개 자리를 바로 그린다(`.l10n`과 같은 방식). 덮개 DOM은 `#app`보다 앞, `DOMContentLoaded` 전에 바디 첫 스크립트로 붙인다. 둘째, `granted`면 덮개를 「위치 확인 중…」 상태로 보이다가, 안이면 걷고 실패하면 처음 상태로 둔다. `start.test.ts`에 이 상태 전이를 넣고, e2e에 「`granted` + 해운대 → 홈 번쩍임 없이 부산」(첫 그리기 스크린숏에 제주 홈 0)을 넣는다.

### M5. SEO 막는 법이 실제로는 아무것도 재지 않는다
- 근거: 계획 위험 표·S7은 「`seo:crawl` 감사 0」을 막는 법으로 쓴다. 그런데 `scripts/seo/crawl.mjs:1-13`은 빌드된 정적 파일만 읽고(JS 실행 없음) 「게이트가 아니라 계기판이다 — exit 0 고정」이다. 스크립트가 만드는 덮개는 이 크롤러에 보이지 않아서 「감사 0」은 늘 참이다. 「렌더 스크린숏」에는 합격선이 없다. 4주 `/` 노출 비교도 계절·다른 배포를 가르지 못하고, 기준 기간이 S0(계획 시작 때)으로 적혀 있어 S7과 몇 주 벌어질 수 있다.
- 고칠 것: (a) S7 검증을 「Playwright 412×915 모바일, 저장소 없음, JS 실행 → 덮개가 뷰포트에서 차지하는 비율과 덮개 뒤 `h1#ask`·`.lede`의 DOM 존재」로 바꾸고, 합격선을 숫자로 미리 적는다. (b) 배포 직후 서치콘솔 URL 검사 「실제 URL 테스트」 스크린숏을 `design/qa/busan/`에 남긴다. (c) 4주 판정 기준 기간은 **S7 직전 4주**로 하고, 대조군으로 `/jeju/**` 노출의 같은 기간 변화를 함께 적는다. 덮개는 `/jeju/**`에 영향이 없으므로 「`/` 감소 − `/jeju/**` 감소 > 30%p」 같은 차이 기준이 계절을 지운다. 이 식은 S7 전에 spec 9 사전등록에 덧붙인다(주인 승인). (d) 위험을 줄일 꼴 하나를 주인 선택지로 적는다. 덮개를 아래 절반 시트로만 두고(spec 1.2가 이미 버튼을 아래 절반에 둔다) 위쪽에 홈 제목·리드가 보이게 하면 「본문을 가리는 창」에서 벗어난다. 이건 spec 1.2 「홈 위에 덮는 한 장」을 바꾸는 일이라 주인 몫이다.

### M6. 시작 화면 이벤트가 수집기에 들어갈 길이 없다. 사전등록한 70% 판정을 계산할 수 없다
- 근거: D1 표는 `counters(day, id, event)`뿐이다(`migrations/0001_events.sql:3-9`). 맥락 필드는 저장하지 않고, `events/handler.ts:24-32` `counterIds`가 이벤트마다 id를 정한다. `events/validate.ts:24,39-40`은 모르는 필드가 하나라도 있으면 **묶음 전체를 거절**한다. 이벤트 이름도 `EVENTS` 집합(`:13`)에 있어야 한다. 그래서 계획대로 `contextOf`에 `dest`만 더하고 `FIELDS`를 안 고치면, 그 기기의 모든 기록이 버려진다. 계획은 `validate.ts`를 시작 이벤트용으로만 적었고 `handler.ts`는 없다. 「기록에는 `dest` 매개변수가 붙는다」도 D1에는 남지 않는다. 덮개는 앱보다 먼저 뜨는데, 누가 언제 `start_view`를 보내는지도 없다. 덮개를 렌더하는 크롤러가 `start_view`만 부풀리면 비율이 내려가 거짓 「다시 열기」가 난다.
- 고칠 것: S7에 `validate.ts`(`FIELDS`에 `dest`·`how`·`why`, `EVENTS`에 `start_view`·`start_done`, 값 집합)와 `handler.ts`(`start:view`, `start:<how>:<why>:<dest>` 같은 고정 id)를 넣고, `events.test.ts`에 「`dest`가 붙은 기존 이벤트가 거절되지 않음」을 넣는다. `start_view`는 앱이 마운트된 뒤 인라인이 남긴 표시(`window.__startShown`)를 보고 보낸다. 「덮개가 1초 이상 보였고 `navigator.webdriver`가 아님」일 때만 보낸다고 사전등록에 적는다. 판정 수치는 D1 counters로 계산한다고 못박는다(GA4는 보조).

### M7. 지도 검색 링크가 「제주」로 묶여 있다. 부산 카드 이름·사진을 누르면 「X 제주」를 검색한다
- 근거: `src/links.ts:15-19`(`searchUrl`: `제주 ${name}`)와 `:28-32`(`naverSearchUrl`: `${name} 제주`). `placeUrl`(`:39`)은 기본 지도 앱(네이버, `:24`)에서 늘 `naverSearchUrl`을 쓴다. 그러니 부산 카드의 이름·사진 링크는 전부 제주로 범위가 좁혀진 검색이 된다. `kakaoPlaceId`가 없는 부산 곳의 카카오맵 링크도 마찬가지다. 계획은 `links.ts`에서 `inJeju → destOf`만 바꾼다. B11은 길찾기(좌표 링크)만 본다.
- 고칠 것: S5 `links.ts`에 「검색 범위 낱말 = 장소 여행지 이름(`제주|서귀포` / `부산`)」을 넣고, `wayfinding.test.ts`(B11)에 「부산 곳 `placeUrl`·`kakaoUrl`(ID 없음)의 검색어에 `제주`가 없고 `부산`이 있음」을 더한다.

### M8. 부산 체험(`do`)의 예약 경로와 「3곳 미만 탭 숨김」이 어느 단위에도 없다
- 근거: spec 3.3은 「체험은 확인된 예약 경로(`book`, ADR-0074)가 있어야 보인다. 부산 레포츠는 경로 조사가 따로 필요하다」, spec 5는 「탭은 그 여행지에 보일 곳이 3곳 이상일 때만 보인다(체험·쇼핑 공통)」. ADR-0074 2는 판정 없는 체험이 있으면 빌드가 멈춘다고 한다. 계획 S4 `build.mjs` 목록에는 `book`·`hide`가 없다. 탭 숨김 규칙도 어디에도 없다(지금 `index.html`의 `#newSub`는 세 탭 고정). B7의 「보이는 새로운 거 탭 전부」는 이 규칙이 있어야 뜻이 정해진다. 예약 조사용 웹 검색 몫도 API 어림에 없다.
- 고칠 것: S4 뒤(또는 S6)에 「부산 체험 예약 경로」 단위를 넣는다. 산출물은 `review/busan/booking/routes.json`과 판정, `book`/`hide` 적용이다. 웹 검색 상한을 어림 표에 넣는다. S5 `render.ts`·`pick.ts`에 「여행지에 보일 곳 < 3이면 탭 숨김」을 넣고, 제주는 지금 탭이 다 3곳 이상이라 바뀌지 않음을 B6과 테스트로 보인다.

### M9. `npm run check:data`는 지금도 제주에서 실패하고, `--dest busan`은 없다
- 근거: `scripts/check-data.ts:20,26`은 필드가 정확히 9개여야 하는데 지금 `spots.json`은 21종이다(실측: `bookable,indoor,sub,score,…,market`). `:36`은 `mood in rest|walk|new`라 `food`이 실패한다. `:31-32`는 제주 좌표를 박아 두었고, `:49-68`은 Postgres `DATABASE_URL`에 붙는다. 부산은 「Postgres를 쓰지 않는 파일 기반」이다. 실제 S1' 검사는 `tests/data.test.ts:22-45`(vitest)에 있고, 여기도 제주 좌표(`:39`)와 `2964`건(`:48`)을 박아 두었다.
- 고칠 것: 검증 명령에서 `check:data`를 빼거나 「옛 S1, 판정에 안 씀」이라고 적는다. B8의 S1'은 `tests/data.test.ts`의 레코드 형식 검사를 여행지 인자를 받는 함수로 빼서, `busan-data.test.ts`가 같은 함수를 부산 경계로 부르게 한다. 이때 제주 쪽 기대값은 바꾸지 않는다.

### M10. 켠 빌드에서 기존 e2e 84개가 시작 화면에 막힌다. 위치 권한 「요청 기록」도 지금 스텁으로는 못 잰다
- 근거: `tests/e2e/browser.e2e.mjs:95-118` `fresh()`는 저장소를 비우고 시작한다(`localStorage.clear()`). 켠 빌드에서는 1.1 넷째 경우라 대부분의 검사가 덮개 아래에서 실패한다. S7 B14 「e2e 전부」가 곧바로 막힌다. 위치 스텁(`:36-51`)은 `navigator.geolocation`을 갈아 끼우고 `permissions.query`를 늘 `prompt`로 돌린다. 그래서 B2 「권한 요청 0회」와 M4의 `granted` 경우를 이대로는 잴 수 없다.
- 고칠 것: S5에 e2e 하네스 변경을 단위로 넣는다. `fresh()`는 기본으로 `jeju.dest: 'jeju'`를 심는다. 「새 브라우저」 검사만 `storage: null`로 빈 저장소를 쓴다. 이렇게 해도 제주 기존 기대값은 그대로다. 스텁은 `getCurrentPosition` 호출 수를 `window.__geoCalls`에 세고, `__geo.perm`(`prompt|granted|denied`)을 받게 한다. B2는 이 호출 수로 판정한다. 같은 84개를 꺼진 빌드와 켠 빌드에서 각각 돌린다.

### M11. 부산 동네 중심과 D1 점검(「12개 동네 모두 차로 30분 낮에 넓히기 없이 3장」)이 사전등록·검증 어디에도 없다
- 근거: ADR-0094 Amendment 1 D1과 spec 「정한 것」 D1의 점검 문장은 B1~B14 어디에도 없다. B7은 「빈손 0」(넓히기 허용)이라 더 약하다. 동네 중심은 S5에서 「부산 출하 분포로」 정한다. 하지만 이 값이 B7·D1 통과를 바로 움직이는데도 「결과 생성 실행」 표에 없다. 계획 위험 표의 「동네 중심 조정은 판정 전에 정한 방법으로만」은 그 방법을 어디에 먼저 적을지가 없다.
- 고칠 것: 「결과 생성 실행」 표에 「S5 부산 동네 중심」을 넣는다. 먼저 `review/busan/areas-criteria.md`(방법, `plans/tomorrow-picker.md`와 같은 식, 입력 파일 해시)를 커밋하고 한 번 계산한다. `busan-areas.test.ts`에 D1 점검을 B7과 따로 넣는다(famous, drive30, 낮, 넓히기 없음, 12동네 × 3장). 실패하면 60을 바꾸지 않고 동네와 수치를 보고하고 멈춘다고 적는다.

---

## MINOR

- **m1 저장소 읽기가 여행지를 모른다.** `store.ts:402-416`은 읽을 때 `jeju.basis`를 제주 숙소·동네로 검사해 **다시 쓰고**, 제주 밖 숙소는 지운다(`parseStay` `:155`, `removeQuietly`). `jeju.basis`는 여행지 공용으로 남는다. 부산에서 숙소 기준이던 기기가 다시 열면 `gps`로 덮인다. → S5 `store.ts`에 「읽기는 `__dest`를 받아 그 여행지 키로 검사, 다른 여행지 키는 안 건드림」과 `parseRegion(v, dest)`(`:144`는 지금 `AREAS` 전체를 받음)을 적고, `store.test.ts`에 왕복 경우를 넣는다.
- **m2 「다른 여행지 머리말」 판단식.** 제주 id에는 머리말이 없다(UUID, `keep.ts:20`). 그래서 부산 쪽 거르기 식은 「UUID 꼴이면 제주」가 된다. 제주에서 빠진 옛 id는 부산 화면에서 영영 남는다. `mergeSaved`의 `left` 수(`app.ts:595-597`)를 다른 여행지 것과 섞어 세지 않게 하는 것도 적는다.
- **m3 장소 목록 받기가 여행지 하나를 전제한다.** `data.ts:118` `createSpotSource`는 값 하나를 기억하고 `onLoad`를 한 번 부른다. 여행지마다 하나씩 만든다고 적는다. `main.ts:80-83,183-191`은 서비스 워커를 첫 목록 다운로드 뒤에 등록하는데, 그 워커가 `PUBLIC_SHELL`의 제주 `spots.json`(1.19MB)을 미리 받는다. 그래서 **부산 사용자가 제주 파일을 받는다.** spec은 반대 방향만 다룬다. 주인 선택지로 올린다(미리 받기에서 빼기 vs 그대로).
- **m4** `public/_headers`의 `/spots.json` immutable 규칙은 `/spots-busan.json`에 안 맞는다. 계획 캐시 칸에 `_headers` 한 줄을 더한다.
- **m5 정적 HTML의 제주 문구.** 결과 `.credit`(`index.html:150`), 저장한 곳 `.about .credit`(`index.html:199`), `render.ts:59,126`(`지금은 제주 밖이에요.`, 숙소 고르기 문구), `:183-184`. 계획은 홈 출처 줄만 적었다. 부산에서 바꿀 자리를 목록으로 적는다(정적 HTML은 그대로, 앱이 바꿈).
- **m6 재사용 주장 보정.** `famous-measure.mjs:70` `keywordstool`은 export가 아니다. 키워드 규칙도 `keyword03`·`keywords04`(`:55,149`) 가운데 무엇인지 criteria-01에 적는다. `night.mjs:196`은 `public/spots.json`에 바로 쓰고, `loadNightCalls`(`:87`)·`markets.mjs:20-25`는 제주 경로가 기본값이다. 「`night.mjs`를 부산 파일에 적용」하면 제주 해시 불변식이 깨질 수 있으니 경로 인자를 먼저 넣는다고 적는다.
- **m7** TourAPI `firstimage`는 `http://tong.visitkorea.or.kr/…`로 오는 일이 흔하다(원문 스냅숏에서 확인 필요). S1'은 `https://`를 요구한다(`tests/data.test.ts:40`). S2 테스트에 「http → https 바꿈, 바꾼 주소가 200」을 넣는다.
- **m8** `?area=here`(llms.txt·JSON-LD가 알리는 값)는 1.1에서 어느 여행지인지 정해지지 않았다. 「위치를 읽어 `destOf`, 밖이면 제주」처럼 하나를 정해 `start.test.ts`에 넣는다(spec 확인 필요).
- **m9** 이동 시간은 `직선 × 1.3 ÷ 40km/h`(`pick.ts:109`)로 제주에 맞춘 값이다. 부산 시내·다리 구간에서 「차로 30분」이 맞는지 확인하는 단계가 없다. 10쌍 정도를 지도 앱 시간과 견줘 기록만 하는 점검을 S5에 둔다(고치지는 않음).
- **m10 spec 문장 중 테스트가 없는 것.** `role="dialog"`·`aria-modal`·첫 초점(1.2), 부산 문서 제목(1.4), 「다른 동네 둘러보기」 숨김(1.4), 거절 뒤 고르면 라벨 `지역 고르기`(1.2), 부산 오늘 판에 노을 줄 없음(4), `가 본 곳 N곳` 여행지별 계산(6). S5 테스트 목록에 한 줄씩 더한다.
- **m11 「결과 생성」 칸에 안 적힌 실행.** S2 카카오 ID 대조(약 1,100회)는 ADR-0050 규칙으로 판정하는 일이다. keep 판정(S3) 뒤로 옮기면 호출이 약 900으로 준다. 대조 규칙 파일을 먼저 커밋한다고 적는다. S2 목록 호출에는 `numOfRows=1000`인데 쇼핑이 986건이라 1회면 된다는 계산이 맞다. 다만 응답이 1,000을 넘는 종류가 생기면 쪽 넘김이 필요하니 스크립트가 `totalCount`를 보게 한다.
- **m12** 새 워커 install은 `addAll`이 하나라도 실패하면 통째로 실패한다(`sw/sw.js:33-41`). 부산 파일 이어받기를 같은 사슬에 넣으면 부산 파일 하나가 404일 때 새 배포가 그 기기에 안 깔린다. 이어받기는 `.catch`로 따로 두고 `sw.test.ts`에 실패 경우를 넣는다.

---

## API 어림 확인

TourAPI: 목록 5(종류당 1, 최대 986건 < 1,000) + 상세 591(1일차) / 517(2일차). 하루 900 안이라 맞다. 다만 spec 3.1은 1일차를 「약 550」이라 적었다(591과 다름, 무해). 네이버 `keywordstool` 270회는 5개 묶음 기준으로 맞다. 다만 키워드가 keep 전부(먹기 포함)라는 점과 재시도 상한을 criteria-01에 적는다. 빠진 몫: 부산 체험 예약 조사의 웹 검색(M8). 세션당 WebSearch 200회 쿼터 안에서 장날 20회와 함께 상한을 적는다.

## 개인정보 안내 일관성

위치를 기기 밖으로 보내지 않는다는 말은 계획과 맞는다(`__fix`는 기기 안에서만 씀, 비 소식은 동네 이름만). 어긋나는 곳은 셋이다. (1) M6을 고치기 전에는 「보내는 것」에 적을 `dest`가 D1에 남지 않고 GA4에만 간다. 안내에는 「사용 기록(이 사이트)·GA4」에 각각 무엇이 가는지 나눠 적는다. (2) `privacy.html:80`은 사진 서버를 「비짓제주 서버」로만 적는다. 한국관광공사 추가는 계획에 있다. (3) 인라인 덮개가 앱보다 먼저 위치를 물을 수 있는 구조면(M3 c안을 안 따를 때), 안내의 「처음 열 때 ‘내 위치로 시작하기’를 누르면」 문장과 실제 시점이 같은지 e2e로 본다(B2).

## ADR 후보 7개 판정 (되돌리기 어려움 + 뜻밖 + 실제 맞바꿈)

| # | 후보 | 판정 | 이유 |
|---|---|---|---|
| 1 | `src/dest.ts` 여행지 표 | 필요 없음 | 코드 안 구조라 되돌리기 쉽다. `locate()`가 판정을 안 한다는 것은 주석·테스트면 된다 |
| 2 | 시작 화면을 인라인 스크립트로, `__dest`·`__fix`·`yc:dest` | **ADR** | 뜻밖이고(앱 밖에 UI가 하나 더 있음) 예산·SEO·중복 구현의 맞바꿈이 있다. M3의 c안을 고를지도 여기서 정한다 |
| 3 | 단순화 다각형 + 점-다각형 | 필요 없음(2에 합침) | 데이터 파일 머리에 출처·오차를 적으면 된다. 인라인에 꼭짓점을 둘지 여부만 2의 결정이다 |
| 4 | Postgres 없는 부산 파일 파이프라인 | **ADR** | 두 갈래 파이프라인과 S1' 검사 이원화(M9)가 오래 남는다. 제주 방식과 달라 뜻밖이다 |
| 5 | 여행지 파일 캐시(미리 안 받음, 이어받기) | ADR-0093 Amendment | ADR-0093 Amendment 6 M1을 일반화한 것이다. 새 결정이 아니라 범위 넓힘이다. m3(부산 사용자의 제주 파일)를 여기서 같이 정한다 |
| 6 | 저장소 키 `jeju.` 유지, 꼬리 `.busan`, 다른 여행지 id 보존 | **ADR**(ADR-0063·0087 개정) | 사용자 기기에 남아 되돌리기 어렵고, `jeju.stay.busan`이라는 이름이 뜻밖이다. `jeju.basis` 공용 여부(m1)도 여기서 정한다 |
| 7 | `__BUSAN__` 빌드 스위치 | 필요 없음 | 출시 뒤 지울 임시 수단이다. 계획에 「S7 뒤 N주 안에 지움」만 적는다 |

## 단위 순서

순서 자체(S0 → S1 → S2∥ → S3 → S4 → S5 → S6 → S7)는 맞다. 고칠 의존은 셋이다. (1) M8 예약 경로는 S4 출하 파일 전에, 늦어도 S5의 B7 전에 있어야 한다. (2) M10 e2e 하네스 변경은 S5 「e2e는 켠 빌드로」보다 먼저 와야 한다. (3) M6 수집기 변경은 `contextOf`에 `dest`를 넣는 커밋과 같은 배포에 묶는다. Pages는 앱과 함수를 함께 올리지만, 옛 워커가 캐시한 옛 앱이 새 수집기에 보내는 경우도 통과해야 한다.
