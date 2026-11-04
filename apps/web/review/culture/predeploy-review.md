# 오늘 근처에서 하는 것 (ADR-0112) — 배포 전 독립 리뷰

범위: `git diff 106097f8^..HEAD` (apps/web/src, functions, tests, public/privacy*.html, scripts/jeju-baseline.ts). 읽기 전용 리뷰, 2026-11-04.
확인한 것: `npx vitest run tests/culture.test.ts tests/culture-fn.test.ts` 18 통과, `npx vitest run --mode nation tests/culture-app.test.ts` 6 통과(기본 모드에서는 6개 모두 skip), `npx tsc --noEmit -p .` exit 0.

결론: 개인정보·XSS·제주/부산 회귀는 문제 없음. 다만 서버 경로(서울 API 전체 훑기)가 시간·CPU 예산 안에 끝난다는 증거가 없고, 실패하면 그날 내내 다시 묻지 않아 기능이 통째로 안 보일 위험이 크다.

## MAJOR

### M1. 콜드 크롤(캐시 없을 때 처음 훑기)이 8초·CPU 예산 안에 끝난다는 근거 없음 → 계속 204가 날 수 있음
- `functions/api/culture.ts:130,160-173`: AbortController 하나(8,000ms)가 루프 **전체**를 덮는다. ADR-0112 Context·plan §1 기준으로 약 2만 건, 즉 1,000건씩 약 20회를 **순서대로** http 호출한다(로컬 측정으로 페이지당 약 0.85MB JSON).
- 시나리오: 엣지 POP(Cloudflare 지역 서버)의 첫 요청에서 20회 순차 호출이 8초를 넘김 → 204 `no-store` → 캐시에 아무것도 안 들어감 → 다음 사용자도 처음부터 다시 훑다가 또 204. 기능이 사실상 계속 안 보인다.
- 클라이언트 타임아웃도 8초(`src/culture-view.ts:273`)로 서버 예산과 같다. 서버가 7.9초에 끝나도 클라이언트는 이미 끊었을 수 있다. 클라이언트가 끊기면 함수가 취소되어 `cache.put`(L185)까지 못 갈 수 있다.
- CPU: 로컬(데스크톱 Node 24)에서 2만 행 JSON.parse만 약 44ms, 필터는 행 구성에 따라 수십~150ms 걸렸다. ADR-0093이 「유료 API·새 계정 없음」이라 Workers 무료 플랜이면 호출당 CPU 한도가 10ms → 1102 오류가 날 수 있다(플랜은 확인 못 함).
- 수정 제안: (a) 배포 전에 preview 배포에서 `/api/culture?city=seoul` 콜드 요청을 1회 측정한다(소요 시간·CPU·상태). (b) 페이지를 병렬(예: 4~5개씩)로 받고 타임아웃은 페이지마다 둔다. (c) 클라이언트 타임아웃을 서버보다 넉넉히 잡거나, 크롤을 `waitUntil`로 돌려 클라이언트 연결과 상관없이 캐시를 채운다. (d) CPU 한도에 걸리면 Cron Trigger와 KV로 하루 한 번 미리 만들어 둔다(ADR 6 개정 필요).

### M2. 한 번 실패하면 그날은 다시 묻지 않음
- `src/app.ts:463-476`: `cultureDay = s.today`를 fetch **전에** 기록하고, 결과가 null(204·타임아웃·오프라인)이어도 되돌리지 않는다. 그 뒤 `askCulture`는 `if (cultureDay === s.today) return;`에서 멈춘다.
- 시나리오: 여행자가 지하철(오프라인)에서 앱을 열거나 M1 때문에 첫 요청이 8초를 넘김 → 다시 온라인이 되고 화면을 오가도(visibilitychange 포함) 자정까지, 또는 앱을 완전히 새로 열 때까지 블록이 안 나온다. `release.ts:125-126` 주석의 「again after a failure」는 청크 로드에만 해당하고 목록 요청에는 적용되지 않는다.
- 수정 제안: 비 소식(`askRain`, `RAIN_RETRY_MS` 5분)처럼 실패 시각을 기억해 몇 분 뒤 다시 묻는다. 요청이 진행 중일 때 다시 보내지 않도록 busy 플래그도 둔다.

## MINOR

### m1. 엣지 캐시가 「하루 한 번」이 아니라 「한 시간에 한 번」 다시 훑음 (ADR 6과 다름)
- `functions/api/culture.ts:183,186`: 캐시에 넣는 응답 자체가 `max-age=3600`이어서 `caches.default`가 1시간 뒤 버린다. 결국 POP마다 매시간 서울 API를 약 20회 부른다(ADR Consequences는 하루에 「엣지 위치 수 × 약 20회」). 동시에 캐시가 비어 있으면 요청이 합쳐지지 않아 호출이 더 늘어난다.
- 시나리오: 서울 API 키의 일일 호출 한도에 걸리거나 서울 쪽에서 막혀 204가 됨. 키 한도는 확인 못 함.
- 수정: 캐시용 사본은 `Cache-Control: s-maxage=<KST 자정까지 남은 초>`로 넣고, 브라우저에 주는 응답은 따로 짧게 둔다.

### m2. 자정 뒤 1시간은 브라우저 캐시가 어제 목록을 줌 → 그날 잠김
- `functions/api/culture.ts:183` `public, max-age=3600` + `src/culture-view.ts:278`(기본 fetch 캐시 모드) + `src/app.ts:471-474`.
- 시나리오: 23:30에 목록을 받음 → 00:10에 앱으로 돌아옴 → `tick`이 새 날짜를 dispatch → `askCulture`가 다시 묻지만 브라우저가 40분 된 어제 응답을 돌려줌 → `c.day !== day`라서 버림 → `cultureDay`가 이미 오늘이라 그날 다시 묻지 않음(M2와 겹침). ADR이 노리는 밤 시간대에 걸린다.
- 수정: 브라우저용 `max-age`를 KST 자정까지로 줄이거나 `fetch(..., { cache: 'no-cache' })`를 쓴다. 날짜가 다르면 M2의 재시도 경로로 보낸다.

### m3. 화면을 손대지 않고 두면 「지금」이 갱신되지 않음
- `src/app.ts:466-467`: minute은 다른 dispatch가 있어야 `drawn()`→`askCulture`에서 갱신된다. 해가 진 뒤에는 자정 tick 말고는 `clock` dispatch가 없다(`duskTimer` L422).
- 시나리오: 18:40에 홈을 열고 그대로 둠 → 19:20에도 「19:00 시작」 공연이 남아 있고, 시간을 모르는 실내 전시도 19:00 규칙(ADR 4)으로 빠지지 않는다.
- 수정: 블록이 보이는 동안 5분 타이머(`later`)로 minute을 dispatch한다.

### m4. 시간을 못 읽은 공연은 낮에 이미 시작했어도 남음
- `src/culture.ts:132-134`: `t === null`이면 공연도 09:00~19:00에는 `unknown`으로 남는다. 「공연은 시작 전에만」(판 2) 규칙과 맞지 않는다. 확인한 예: `time: '공연별 상이'`, kind 콘서트, 15:00 → `unknown`. 정렬(`Number(!a.t)`)에서 뒤로 밀리긴 해도, 후보가 적은 동네에서는 홈에 올라온다.
- 수정: `SHOW.test(kind)`인데 시간을 못 읽었으면 `shut`으로 둔다(축제와 같은 처리).

### m5. HTML 엔티티 하나 때문에 함수 전체가 500
- `functions/_lib/culture-filter.ts:49`: `String.fromCodePoint`가 범위 밖 숫자(예: `&#99999999;`, `&#x110000;`)를 받으면 RangeError를 던진다(로컬에서 확인). `cultureItems`가 try 밖(`culture.ts:180`)에 있어서 처리되지 않은 예외 → 500, 캐시 안 됨 → 그 행이 목록에 있는 동안 요청마다 다시 훑고 매번 실패한다.
- 수정: 코드포인트가 0x10FFFF를 넘으면 원문 `m`을 그대로 돌려주고, L180-189를 try로 감싸 실패하면 204로 끝낸다.

### m6. 제목이 같으면 장소가 달라도 하나로 합쳐짐
- `functions/_lib/culture-filter.ts:99-101`: 중복을 가르는 키가 정규화한 제목뿐이다. 회차별 행은 제대로 합쳐지지만, 여러 구에서 같은 이름으로 여는 행사(구마다 여는 「찾아가는 음악회」 같은 것)는 API 순서상 처음 나온 곳만 남는다. 가까운 곳이 빠지고 먼 곳이 남을 수 있다.
- 수정: 키를 `normTitle(title) + '|' + 장소`(또는 반올림한 좌표)로 바꾼다. 같은 제목·같은 장소의 회차는 여전히 하나로 합쳐진다.

### m7. ADR-0112 본문과 코드가 다름 (문서 정합성)
- ADR 5는 「걸어서 15분 안 > 차로 15분 안」인데 `src/culture.ts:216,239`는 직선 3km/5km 구간이고 홈은 3km 안이다. `seoulMinutes(3)`이 20분이라 「차로 15분」보다 넓다. 정렬 가중치에 이름난 곳(`prominence`)이 들어간 것도 ADR 5에 없다(품질 01·02에서 바뀐 부분).
- ADR 3은 「구 불일치」 행을 뺀다고 하지만, 코드는 서울 경계 상자만 본다(`culture-filter.ts:55,81`).
- ADR 6의 「하루 한 번 훑기」는 m1 참고.
- 수정: 품질 01~03 결과를 근거로 ADR-0112를 코드에 맞게 고치거나 새 ADR로 대체한다(프로젝트 규칙: 결정은 ADR에 기록).

### m8. 자정을 넘겨 시트가 열려 있으면 어제 목록을 보여 줌
- `src/render.ts:1691-1693`: 시트 본문은 `s.culture`만 보고 `s.culture.day === s.today`나 `s.dest === 'seoul'`은 보지 않는다(홈 블록 L1405는 본다). 영향은 작다. 홈과 같은 조건을 시트에도 넣는다.

## 확인했고 문제 없는 것
- 개인정보: 요청은 `/api/culture?city=seoul`뿐이고 위치·좌표·동네 정보는 없다. 거리 계산은 기기 안에서 한다. 길찾기 링크에는 행사 좌표만 들어가고, `from`은 어떤 링크를 쓸지 고르는 데만 쓴다(`links.ts goLink`). 4개 언어 개인정보 안내 문구가 코드 동작과 맞다.
- XSS: API 문자열은 모두 `textContent`/`setAttribute`로 넣는다. `link`·`image`는 앱까지 오지만 DOM에 쓰이지 않는다(href는 지도 앱 URL이고 이름은 `encodeURIComponent` 처리). 그래서 `javascript:`나 http 이미지가 들어갈 자리가 없다. `link`·`image`는 쓰지 않는 데이터라 응답에서 빼도 된다.
- 제주·부산·다른 지역: `askCulture`, 홈 블록, 렌더 키가 모두 `NATION && dest === 'seoul'`로 막혀 있다. `s.culture`가 null이면 렌더 키도 바뀌지 않는다. `jeju-baseline.ts`에서 culture-view 청크를 뺐고, 진입 번들에는 `import type`만 들어간다.
- 뒤로 가기: `culture` overlay가 `nav.ts` OVERLAYS에 들어 있다. 새로고침한 뒤 앞으로 가기를 하면 목록이 없으므로 `state.ts:665-666`에서 null이 된다('move'와 같은 방식).
- i18n: en/ja/zh 모두 머리말·더 보기·출처·why 줄이 있다. 거리 문구는 기존 TRAVEL_TEXT를 쓴다. 제목·장소를 한국어로 두는 건 의도한 것이다.
- 320px: `.mk .txt{min-width:0}`와 `.cult .nm` 말줄임이 있고, 더 보기 버튼은 줄바꿈을 허용한다.

MAJOR: 2

## 재리뷰 (dd4e4a16)

범위: `git show dd4e4a16`(functions/api/culture.ts, functions/_lib/culture-filter.ts, src/app.ts askCulture, src/culture-view.ts, src/render.ts)와 ADR-0112 Amendment 1(e78533c9). 읽기 전용, 2026-11-04.
확인한 것: `npx vitest run tests/culture.test.ts tests/culture-fn.test.ts` 19 통과, `npm run test:nation -- tests/culture-app.test.ts` 7 통과, `npx tsc --noEmit -p .` exit 0. 로컬 CPU 측정(Node, 데스크톱): 오늘 행만 1,000개인 페이지(0.84MB)의 parse+거르기+stringify 중앙값 4.6ms·최대 7.6ms, 오늘 행 208개를 합쳐 거르는 데(목록 요청) 3.4ms, 1,000개면 13ms.

결론: 코드 논리는 맞다(재귀 막힘, 캐시 키, clone 순서, 재시도 타이머 모두 문제없음). 하지만 이 수정이 서지는 전제, 즉 「Pages Function이 자기 주소로 fetch하면 함수가 따로 한 번 더 돈다」는 것이 실제 Cloudflare에서 확인되지 않았다. 그래서 M1은 아직 해소되었다고 볼 수 없다.

### MAJOR

#### R1. 자기 주소로 다시 부르는 방식이 Cloudflare Pages에서 실제로 별도 호출로 도는지 확인 안 됨 (M1 해소의 전제)
- `functions/api/culture.ts:91-105`: 목록 요청이 `new URL(ctx.request.url)`(= `https://yeochana.com/api/culture?...&page=N`)로 fetch한다. 테스트(`tests/culture-fn.test.ts:26`)는 이 fetch를 `onRequestGet` 직접 호출로 바꿔 끼우므로 플랫폼 동작은 검증하지 않는다.
- 확실하지 않은 점(단정하지 않음): Workers는 같은 zone으로 보내는 subrequest를 기본으로 Workers를 건너뛰고 origin으로 보낸다고 알고 있다(`global_fetch_strictly_public` 호환 플래그가 이를 바꾼다. wrangler.toml에는 이 플래그가 없고 compatibility_date는 2026-09-01). Pages 커스텀 도메인에서 그 「origin」이 Pages(함수 포함)인지, 아니면 정적 파일만 나오는지, 루프 방지 오류(1042류)가 나는지 확인하지 못했다. preview 주소(`*.pages.dev`)에서는 Cache API가 아무것도 안 하는 것일 수도 있어 preview 측정이 본 도메인과 다르게 나올 수 있다. Cache API가 `s-maxage`를 TTL로 쓰는지도 문서 기억만 있고 실측은 없다.
- 시나리오: (a) 함수를 건너뛰고 SPA 대체 index.html(200)이나 404가 오면 `res.json()`이 실패해 늘 204가 된다. 기능이 계속 안 보인다(M1과 같은 결과, 조용함). (b) `s-maxage`가 무시되면 페이지는 60초, 목록은 300초만 남는다. 그러면 POP마다 5분에 한 번 서울 API를 약 20회 다시 부른다(하루 약 5,800회).
- 수정: 배포 전에 본 도메인과 같은 조건에서 1회 측정한다. 콜드 `curl -sD- 'https://<preview 또는 yeochana.com>/api/culture?city=seoul'`의 상태·소요 시간·`X-Culture-Reason`을 보고, `wrangler pages deployment tail`로 `page=N` 호출이 따로 찍히는지와 호출마다 CPU 시간을 본다. 두 번째 요청이 서울 API를 부르지 않는지도 본다. 오늘 열린 행이 전체 목록에서 몇 개인지도 그때 센다. 목록 요청의 거르기는 1,000행에 13ms 정도라 이 수가 약 700을 넘으면 그 호출 혼자 10ms를 넘길 수 있다. 자기 호출이 안 되면 대안은 Cron이 있는 별도 Worker와 KV다(ADR 개정 필요).

### MINOR

#### r1. 실패를 캐시하지 않아, 한 페이지만 계속 실패해도 재시도마다 31회 호출 → 무료 플랜 하루 10만 요청을 다른 함수와 나눠 씀
- `functions/api/culture.ts:41-51,103-108` + `src/app.ts:478`: 29쪽은 캐시에 있고 1쪽만 계속 실패(서울 API가 그 범위에서 시간 초과 등)하면, 앱마다 5분에 한 번 목록 요청 1회와 페이지 요청 30회가 나간다(29회 캐시 적중 + 1회 서울 호출).
- 시나리오: 서울 홈 사용자 50명 × 시간당 12회 × 31 = 시간당 약 18,600회. 5시간 남짓이면 하루 10만 요청이 끝나고, 그 뒤로는 `/api/rain`, `/api/events`, `/api/geo` 같은 함수도 같이 막힌다.
- 수정: 목록 키의 실패도 엣지에 5분 넣는다(`no-store` 대신 `s-maxage=300`인 204, 또는 따로 둔 실패 키). 이렇게 하면 POP 하나에서 5분에 한 번만 다시 훑는다. 또는 페이지 한두 개가 실패해도 나머지로 목록을 만든다.

#### r2. `cached()`가 `r.ok`로 저장 여부를 정함 → 204도 `cache.put`을 시도함
- `functions/api/culture.ts:47`: 주석은 「200일 때만」인데 `none()`의 204도 `ok === true`다. 지금은 `Cache-Control: no-store`가 저장을 막을 것으로 보이지만, 만약 저장되면 그 POP는 그날 자정까지 204만 준다. 수정: `r.status === 200`.

#### r3. 전체 마감 시간이 없고 동시 연결이 6개로 묶여, 콜드 요청이 앱의 15초를 자주 넘길 수 있음
- `functions/api/culture.ts:103-105`: 1쪽을 먼저 받고 나머지 29쪽을 `Promise.all`로 보낸다. Workers는 한 호출에서 동시에 연결을 6개까지만 여는 것으로 알고 있어서, 실제로는 1 + 5묶음으로 차례대로 간다. 한 쪽이 2.5초면(무료 플랜에서 한국 요청이 해외 POP로 가 http로 0.85MB를 받는 경우) 약 15초다. 쪽마다 시간 제한이 12초라 최악이면 1분을 넘는다.
- 시나리오: 그날 그 POP의 첫 사용자는 15초 뒤 빈 화면을 보고, 5분 뒤에야 블록이 나온다. 클라이언트가 끊긴 뒤 `waitUntil` 여유(30초로 알고 있음)를 넘기면 목록 캐시는 안 들어간다. 다만 성공한 페이지는 각자 캐시되므로 다음 시도에서는 끝난다.
- 수정: R1 측정 때 콜드 소요 시간을 같이 보고, 15초를 넘으면 기록해서 받아들이거나 목록 요청에 전체 마감(예: 13초 뒤 204)을 둔다. 이때 페이지 요청은 `waitUntil`로 계속 돌게 둔다.

#### r4. 페이지마다 캐시된 시각이 다르면 쪽 경계에서 행이 빠질 수 있음
- `functions/api/culture.ts:65`: 쪽 캐시가 따로 있다. 일부 실패한 뒤 나중에 다시 받은 쪽은 그 사이에 목록 앞쪽에 새 행이 들어오면 오프셋이 밀려 있다. 겹친 행은 제목 중복 제거로 걸러지지만, 밀려난 행은 자정까지 조용히 빠진다. 영향은 작다. 수정: 받아들이고 ADR에 적거나, 1쪽의 `total`이 바뀌었으면 나머지 쪽 캐시를 무시한다.

#### r5. 재시도 타이머를 `at`보다 먼저 걸어서, 타이머가 정확히 5분에 울리면 한 번 건너뛸 수 있음 (10분 뒤 재시도)
- `src/app.ts:474,477-478`: `later(RAIN_RETRY_MS)`를 건 뒤에 `at = clockNow()`를 읽는다. 둘 사이에 ms가 바뀌고 타이머가 늦지 않게 울리면 `at - cultureAsked.at < RAIN_RETRY_MS`가 참이 된다. 그러면 묻지 않고 타이머만 다시 걸어서 10분 뒤에 묻는다. 드물고 영향도 작다. 테스트(`culture-app.test.ts` 새 케이스)는 visibilitychange 경로만 보고 타이머 경로는 보지 않는다. 수정: `at`을 먼저 읽거나 비교에 1초 여유를 둔다.

### 확인했고 문제 없는 것
- 재귀: `page`가 있으면 페이지 경로만 타고 다시 펼치지 않는다. 깊이는 1이다. `day`가 오늘이고 1~30쪽인 요청만 받으므로, 공개된 `page` 파라미터로 다른 날이나 끝없는 쪽을 묻게 할 수 없다. 자정을 넘는 순간 쪽이 400으로 실패해도 그 요청만 204가 되고 5분 뒤 다시 묻는다.
- 캐시 키·TTL: 키에 KST 날짜가 들어가서 자정 뒤에는 새 키를 쓴다. `toMidnight` 계산이 맞다(최소 60초는 키가 날짜별이라 문제없음). 브라우저 max-age 300이라 m2(자정 뒤 어제 목록)는 길어야 5분이고, 날짜가 다르면 버린 뒤 5분 뒤에 다시 묻는다.
- clone 순서: `keep`의 `.then`이 `await build`보다 먼저 등록되어, 본문을 읽기 전에 `r.clone()`이 된다. `waitUntil`이 `keep`을 잡고 있어 클라이언트가 끊겨도 저장은 계속된다.
- subrequest 수: 목록 호출에서 fetch 최대 30회와 캐시 연산 2회, 페이지 호출에서 fetch 1회와 캐시 연산 2회다. 50 안이다. `_middleware.ts`는 yeochana.com을 그대로 통과시킨다.
- askCulture: 타이머 핸들이 하나뿐이고, 부를 때마다 지우고 다시 건다. 홈·서울·지금이 아니면 걸지 않고, abort하면 `timers`가 지운다. 새 그리기 고리도 없다(5분 넘게 차이 날 때만 dispatch하고, 그 뒤 호출에서는 차이가 0). `loadCulture`와 `fetchCulture`는 reject하지 않아 busy가 풀리지 않을 일이 없다. 응답 중에 목적지나 화면이 바뀌어도 dispatch만 되고 렌더는 `dest === 'seoul'`로 막혀 있다. 같은 날 서울로 돌아오면 그 목록을 그대로 쓴다.
- 작은 수정: `point()`는 범위 밖 숫자를 원문으로 두고, 짝 없는 서로게이트도 예외를 던지지 않는다. 날짜 먼저 거르기(`cultureItems`, `onePage`)는 `dropReason`의 no-period·not-today가 버리는 행만 버린다(형식이 틀린 날짜도 거기서 어차피 빠진다). 시트의 날짜·서울 확인은 홈 블록과 같은 조건이다.

MAJOR: 1
