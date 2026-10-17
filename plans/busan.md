# Plan: 부산 — 같은 앱의 두 번째 여행지

Spec: `specs/busan.md`(D1~D5 정함). ADR-0094 + Amendment 1. 용어는 `docs/context.md`의 **여행지**·**시작 화면**·**장소 범위**·**세부 지역**·**유명한 곳**.

## 뼈대

| 자리 | 파일 | 하는 일 |
|---|---|---|
| 여행지 표 | 새 `src/dest.ts` | `Dest = 'jeju' \| 'busan'`. 여행지마다 동네 목록, `inside(p)`, 데이터 주소, 위치 모를 때의 해(제주시청·부산시청), 머리말(`제주 인기:`·`부산 인기:`), 출처 줄. `destOf(p)`: `inJeju` → 제주, 부산 경계 안 → 부산, 아니면 `null` |
| 동네 | `src/areas.ts` | `AREAS`에 부산 12곳(`dest: 'busan'`, 묶음 머리 없음)을 더하고 `areasOf(dest)`·`nearestArea(p, dest)`. 제주 15곳의 순서·값·`inJeju`는 그대로 |
| 부산 경계 | 새 `data/geo/busan-boundary.json`(단순화 다각형, 출처·꼭짓점 수·허용 오차 기록) | 앱(`dest.ts`)과 index.html 인라인이 같은 꼭짓점을 쓴다. 일치는 테스트가 본다 |
| 여행지 정하기·시작 화면 | `index.html` `<head>` 인라인 스크립트(언어 고르기 다음) | 1.1 순서로 정해 `window.__dest`. 넷째 경우에만 덮개를 **스크립트로 만들어** 붙인다(정적 HTML에 새 요소 없음 → 제주 DOM 그대로). 큰 버튼의 위치 읽기·거절·밖·다시 시도도 인라인이 하고, 읽은 점은 `window.__fix`로 앱에 넘긴다(기기 밖으로 안 감). 고르면 `jeju.dest`에 쓰고 `yc:dest` 이벤트. 네 언어 문구는 인라인 작은 표(언어 제안 줄과 같은 방식) |
| 데이터 받기 | `src/main.ts` `loadSpots(dest)` | 제주 `spots.json?v=__SPOTS_V__` 그대로, 부산 `spots-busan.json?v=__BUSAN_V__`. `locate()`는 제주 밖 점을 버리지 않고 점을 돌려준다(판정은 앱이 `destOf`로) |
| 상태 | `src/state.ts`, `src/app.ts` | `dest`를 상태에 둔다. 자동 전환은 기준 `gps`일 때만(1.3). 전환 시 새 데이터를 받은 뒤 그리기. 세션 복원에 `dest` |
| 저장소 | `src/store.ts` | `jeju.dest` 추가. 제주 숙소·동네 키(`jeju.stay`·`jeju.region`)는 그대로 제주 것, 부산은 `jeju.stay.busan`·`jeju.region.busan`. 다른 여행지 id는 지우지 않는다: `app.ts` 백업 복원의 `idx.has(e.id)` 거르기를 「지금 여행지 데이터에 있거나 다른 여행지 머리말」로 바꾼다. 백업 링크(`keep.ts`)는 UUID 아닌 id를 이미 UTF-8로 담는다(`bs-…` 그대로) |
| 그리기 | `src/render.ts`, `src/home.ts`, `src/logo.ts` | 기준 시트 맨 위 `여행지` 줄, 동네 칸은 `areasOf(dest)`, 저장한 곳 맨 아래 `부산에 저장한 곳 N곳`, 부산 홈 머리말·출처 줄, 부산이면 문서 제목, 「다른 동네 둘러보기」 숨김, 외국어 부산 안내 한 줄. 새 글자 크기·색 없음 |
| 링크 | `src/links.ts`, `src/deeplink.ts` | `inJeju(s)` → `destOf(s) !== null`. `?area=` 부산 slug, `?stay=` 부산 좌표 |
| 비 소식 | `functions/_lib/kma.ts` | `areaBySlug`가 부산 12개도 받는다(격자는 `kmaGrid` 그대로) |
| 부산 데이터 | 새 `scripts/busan/*.mjs`, `review/busan/` | 아래 S2~S4. Postgres·`build-spots.mjs`를 쓰지 않는 파일 기반 |
| 캐시 | `vite.config.ts`, `scripts/sw-build.ts`, `sw/sw.js` | `__BUSAN_V__` 정의. 부산 파일은 미리 받기(`PUBLIC_SHELL`)에 넣지 않는다. 쓸 때 캐시(이미 `?v=`는 cache first), 새 워커 install에서 옛 캐시에 `spots-busan.json`이 있었으면 새 주소를 받아 둔다(`usedLangs`와 같은 방식) |
| 출시 스위치 | 빌드 정의 `__BUSAN__`(vite `define` + index.html 치환) | 꺼져 있으면 인라인은 늘 `jeju`, 시작 화면·여행지 줄·부산 slug 없음. S1~S6은 꺼진 채 나가고 S7에서 켠다. 테스트는 켠 빌드와 끈 빌드 둘 다 돈다 |

## 단위 (순서대로. 단위마다 검증 → 커밋. 꺼진 스위치로 각각 출하 가능)

| # | 단위 | 주로 건드리는 곳 | 검증 |
|---|---|---|---|
| S0 | 기준선 | `review/busan/release-baseline.md` | 지금 값을 적는다: `public/spots.json` sha256·`__SPOTS_V__`, `public/i18n/places.*.json` sha256, `dist/jeju/**` 해시 목록, 한국어 JS+CSS gzip(48.17KB), 제주 홈 DOM·계산 스타일 지문(375×812, 기억한 여행지 없음 = 지금 기기), 서치콘솔 `/` 노출 최근 4주(`index-check`) |
| S1 | 여행지 모델 + 데이터 나누기(제주만) | `src/dest.ts`, `areas.ts`(`dest` 필드·`areasOf`), `main.ts`(`loadSpots(dest)`), `state.ts`·`app.ts`(`dest` 늘 제주), `store.ts`(`jeju.dest` 읽기만), `links.ts`·`deeplink.ts`(`destOf`), `vite.config.ts`(`__BUSAN__`·`__BUSAN_V__`, 부산 파일 없으면 빈 값) | 기존 vitest·e2e 기대값 **안 바꾸고** 전부 통과. `tests/dest.test.ts`(제주 `inJeju` 표 그대로). 아래 「제주 그대로」 전부 |
| S2 | 부산 수집 | `scripts/busan/collect.mjs`·`.d.mts`, `review/busan/raw/list-<type>.json`·`raw/detail/<contentid>.json`·`raw/calls.log`, `review/busan/scope.json` | `tests/busan-collect.test.ts`: 범위 거르기(3.2 표, `lclsSystm3` SH060100·SH060200만), id `bs-<contentid>`, 사진 `firstimage`→`firstimage2`→`''`, 받은 것 건너뛰기, KST 하루 900회에서 멈춤, `modifiedtime` 갱신 판단. 원문 스냅숏 커밋 |
| S3 | AI 판정 + 표본 검수(**결과 생성, 1회**) | 먼저 `review/busan/criteria.md` 커밋(정의·지어낸 예시·씨앗·표본 120·통과 기준 3.3) → `review/busan/judge-01/*.json`(keep·mood·sub·reason·indoor·근거 조각 40자) → `review/busan/audit-01.json`·`REPORT.md` | 근거 조각 원문 대조 스크립트, 후보 전부 기록, 일치율. keep·기분 ≥ 90%, 실내 ≥ 95%, 사실 오류 ≤ 3/120. 못 넘으면 붙이지 않고 수치와 가설만 적고 멈춘다(재실행은 주인 승인) |
| S4 | 검색수 측정(**결과 생성, 1회**) + 부산 출하 파일 | 먼저 `docs/research/busan-popularity/criteria-01.md` 커밋(키워드 규칙, 흔한 이름 `부산 + 이름` 규칙, `< 10`=5) → `scripts/busan/measure.mjs`(`famous-measure.mjs`의 `keywordstool`·`volume03` 재사용) → `review/busan/pop-01.json`. `scripts/busan/build.mjs` → `public/spots-busan.json`(score 5등분 먹기·그 밖 따로, `famous` 60곳 D1, `pop`, 카카오 ID·폐업 `hide`) | `tests/busan-data.test.ts`(B8): S1' 전부, `bs-` 머리말, 뺀 분류 0, `famous`가 규칙과 정확히 같은 60곳, 개요·근거 원문 없음, 멱등. `check:data`를 부산 파일에도(`--dest busan`). 파일 크기 기록 |
| S5 | 시작 화면 + 여행지 바꾸기 + 부산 12동네 | 동네 중심(부산 출하 분포로, `plans/tomorrow-picker.md`와 같은 방법), 경계 다각형, index.html 인라인, `app.ts`(`__dest`·`__fix`·`yc:dest` 받기, 자동 전환, 숙소·동네 여행지별), `render.ts`(여행지 줄, 저장한 곳 다른 여행지 줄, 부산 홈), `store.ts`(부산 키, 다른 여행지 id 보존), `sw.js`(부산 파일 이어받기), `src/i18n/{en,zh-Hans,ja}.ts`(동네·대표 지명·새 줄, 한국 공식 표기 먼저) | `tests/start.test.ts`(인라인 판정 표, 가상 window: 링크·`/jeju/**` referrer·기억·이전 기기·`granted`·없음), `tests/busan-areas.test.ts`(slug 안 겹침, 대표 지명이 제 동네, 구포→동래·금정, 가덕도→다대포, 일광→송정·기장, **B7** 12×3×6×비 켬/끔 빈손 0), `dest.test.ts` **B4** 10점 + 인라인·앱 꼭짓점 일치, `store.test.ts`(B10, 백업 왕복 `bs-`), `wayfinding.test.ts`(B11), `sw.test.ts`, `i18n.test.ts`(새 키·인라인 표에 한글 없음). e2e는 켠 빌드로 |
| S6 | 오늘 판 부산 몫 | `home.ts`(위치 모를 때 부산시청 해), `kma.ts`(부산 slug), `review/busan/market-days.json`(원문 인용·URL·카카오맵 대조, 확인된 날만), 밤 산길 부산 회차(**결과 생성, 1회**): 먼저 `review/busan/night/criteria.md`(낱말 `산성` 더함, `오름\|곶자왈\|올레` 뺌) → `candidates.json`·`trail-01.json`·`audit-01.json` → `night.mjs`를 부산 파일에 적용 | `rain-fn.test.ts`(`haeundae` 답 또는 204, 제주 15 slug 격자 그대로 — **B12**), `night-data`·`night-pick`에 부산 경우(22시 동래·금정 「좀 걷고 싶어」에서 산길이 앞에 오지 않음), `market.test.ts` 부산 장날 |
| S7 | 출시 | `src/track.ts` `contextOf`에 `dest`, `events/validate.ts`·`scripts/analytics-report.mjs`(`start_view`·`start_done`, ADR-0061 목록), GA4 매개변수, `public/privacy*.html` 네 언어(7절), `public/llms.txt`(부산 slug 한 줄), `docs/partner/`(공사 답변 원문), `design/SPEC.md`·`docs/context.md`(「준비 중」 지움), `__BUSAN__` 켬 | **B14** 전부, `seo:crawl` 감사 0, 렌더 스크린숏(Googlebot 모바일 흉내, 저장소 없음) `design/qa/busan/`, B1~B13 e2e, 출시 뒤 측정 두 개를 날짜와 함께 `review/busan/release-baseline.md`에 예약 |

S2는 S1과 따로 진행할 수 있다(앱을 안 건드린다). S5는 S4의 출하 파일이 있어야 동네 중심을 정한다.

## 제주가 그대로임을 보이는 법 (S1~S6 매 단위, S7은 허용된 차이만)

- `public/spots.json`·`public/i18n/places.*.json` sha256이 S0과 같다(→ `__SPOTS_V__`·`__PLACES_V__` 같음, 서비스 워커 미리 받기 목록의 데이터 같음). `build-spots.mjs`는 돌리지 않는다.
- `npm run build` 뒤 `dist/jeju/**` 해시 목록이 S0과 같다(랜딩 안 바뀜).
- 한국어 진입 JS+CSS gzip ≤ 50KB, 단위마다 S0 대비 늘어난 바이트를 적는다. 넘치면 부산 동네 표를 `spots-busan.json` 머리로 옮긴다(spec 10).
- e2e **B6**: 제주 기기(375×812, `jeju.dest=jeju`와 `jeju.saved.v2`만 있는 기기 둘)의 홈 DOM·계산 스타일 지문이 S0과 같다(기준 시트 안 제외, S7부터). 네트워크 기록에 `spots-busan.json` 0. 위치 권한 요청 0(**B2**).
- 꺼진 스위치 빌드: 기존 e2e 84항목 기대값 그대로 통과, `/?area=gwangalli`는 지금처럼 모르는 동네.
- S7에서 제주에 보이는 차이는 spec 0절의 셋(기준 시트 여행지 줄, 저장한 곳 다른 여행지 줄, 개인정보 안내)뿐. 기록에는 `dest` 매개변수가 붙는다(안내에 적음).

## API 호출 어림

| 단위 | 대상 | 호출 |
|---|---|---|
| S2 1일차 | TourAPI `areaBasedList2`(`lDongRegnCd=26`, `numOfRows=1000`) 종류 5개 | 약 5~7 |
| S2 1일차 | `detailCommon2` 관광지 351·문화시설 123·레포츠 60·전통시장 57 | 약 591(합 ≤ 900) |
| S2 2일차 | `detailCommon2` 음식점 517 | 517 |
| S2 | 카카오 로컬 키워드 검색(ID·폐업만, ADR-0050) | 약 1,100 |
| S2 이후 갱신 | 목록 5 + `modifiedtime` 바뀐 곳만 | 수십 |
| S3·S6 판정 | 모델 판정(외부 API 아님) | 약 1,108곳 + 표본 120, 밤 산길 후보 수십 |
| S4 | 검색광고 `keywordstool`(한 번에 5개) | ⌈keep 수 × 규칙당 키워드 ÷ 5⌉, keep 약 900·평균 1.5개면 약 270. 한 번만 |
| S6 장날 | 웹 검색 | 20회 이하 |
| 출시 뒤 | `/api/rain` | 사용자 몫(엣지 캐시), 부산 slug 12개 늘어남 |

TourAPI는 개발 한도 1,000회/일 안이다. 스크립트가 KST 날짜별 `calls.log`로 900회에서 스스로 멈춘다. 운영계정 전환은 필요 없다(spec 3.1, 빌드 때 한 번 받아 고정).

## 주인 몫

- **필요 없음(첫 출시)**: TourAPI 운영계정 전환, 부산시 관광 API 활용신청(첫 출시가 쓰지 않는다. D2 쇼핑 탭을 열 때 다시 본다). 키는 `.env`의 `DATA_GO_KR_SERVICE_KEY`·`NAVER_AD_*`·카카오 키를 그대로 쓴다.
- **S7 전에 필요**: 한국관광공사 답변 원문(사진 「모두 사용 가능」) → `docs/partner/`. 원문이 출처 자리를 따로 요구하면 D3대로 따른다. 원문이 없으면 S7을 열지 않는다.
- **S7 뒤**: GA4 관리 화면에 맞춤 측정기준 `dest`·`how`·`why` 등록.
- **승인**: S3·S4·S6 판정·측정이 통과 기준을 못 넘었을 때의 재실행. 장날 주인 예시(구포 3·8일, 기장 2·7일)는 원문 확인 전까지 싣지 않는다.

## 결과 생성 실행 (사전등록 먼저, 1회)

| 실행 | 먼저 커밋할 것 | 판정 |
|---|---|---|
| S3 부산 판정 + 블라인드 120곳 | `review/busan/criteria.md` | spec 3.3 기준 |
| S4 검색수 측정 | `docs/research/busan-popularity/criteria-01.md` | 보고 나서 키워드 규칙을 고치지 않는다 |
| S6 밤 산길 부산 회차 | `review/busan/night/criteria.md` | `specs/night-trails.md` 1절 기준 |
| 출시 4주 뒤 시작 화면 | spec 7(이미 등록) | `start_view` ≥ 100이면 `start_done ÷ start_view` < 70% → 꼴 다시 열기, 미만이면 「판단 보류」 |
| 출시 4주 뒤 `/` 노출 | spec 9(이미 등록), S0 기준선 | 출시 전 4주보다 30% 넘게 줄면 ADR-0094 2를 다시 연다 |

## 검증 명령 (`apps/web`)

```
npm run typecheck
npm test
npm run check:slop
npm run check:data            # 제주, S4부터 -- --dest busan 도
npm run build                 # 뒤에 진입 JS+CSS gzip, dist/jeju 해시
npm run e2e
npm run seo:crawl             # S7
sha256sum public/spots.json public/i18n/places.*.json
```

측정·검사는 한 번 돌리고, 실패하면 출력과 가설을 보고한다.

## 위험과 되돌리기

| 위험 | 막는 법 | 되돌리기 |
|---|---|---|
| 시작 화면이 모바일 가로막기 창으로 읽혀 `/` 노출 감소 | 홈 본문 DOM 그대로, 덮개는 스크립트로만, 출시 전 `seo:crawl` 0 + 렌더 스크린숏. 크롤러를 가려내 다르게 보이지 않는다(클로킹) | `__BUSAN__`을 끄고 다시 배포하면 저장소 없는 방문은 제주 홈. 4주 기준선에 걸리면 ADR-0094 2 재론 |
| 기존 사용자가 출시 날 시작 화면을 봄 | 1.1의 3(이전 기기), e2e B1 | 같음 |
| 다른 여행지 저장·가 본 곳이 사라짐 | 복원 거르기 바꿈, `known()`은 그리기에서만, B10 | 저장소는 안 지우므로 스위치를 꺼도 id가 남는다 |
| 한국어 번들 50KB 넘침 | 인라인으로 시작 화면, 단위마다 바이트 기록 | 부산 동네 표를 부산 파일로 |
| 인라인과 앱의 경계·slug 표가 어긋남 | 꼭짓점·slug 일치 테스트 | — |
| TourAPI 한도 초과·중단 | 900회 멈춤, 받은 것 건너뛰기, 원문 커밋 | 다음 날 이어서 |
| 판정·측정 미달, 얇은 동네에서 빈손(B7) | 사전등록 기준, 미달이면 멈추고 보고 | 판정을 고쳐 통과시키지 않는다. 동네 중심 조정은 판정 전에 정한 방법으로만 |
| 옛 워커 + 새 HTML 짝 안 맞음 | `?v=` 해시, 부산 파일 이어받기, `sw.test.ts` | — |
| 사진 핫링크(TourAPI 서버) 개인정보 | 안내에 한국관광공사 서버 추가(S7) | — |

## 지킬 불변식

- `build-spots.mjs`를 돌리지 않는다. 제주 데이터·랜딩·정적 홈 HTML(`<title>`·description·OG·`<noscript>`·JSON-LD)은 바꾸지 않는다.
- 페이지가 열릴 때 위치를 묻지 않는다. 위치는 기기 밖으로 보내지 않는다.
- 원문(`overview`)과 판정 근거는 `review/`에만, 출하 파일에 없다.
- 제주 상설시장 추가(spec 5절)는 이 계획 밖, 데이터 회차를 따로 연다. 쇼핑 탭·노을·철·부산 랜딩·부산 장소 글 번역도 밖.

## ADR 후보 (이 계획의 구조 선택, 아직 쓰지 않음)

1. 여행지 표(`src/dest.ts`)를 여행지별 값의 한 자리로 — 동네·경계·데이터 주소·해 기준점·출처, `locate()`가 아닌 앱이 여행지 판정(ADR-0075 영향).
2. 시작 화면과 여행지 판정을 앱 번들 밖 인라인 스크립트로, `__dest`·`__fix`·`yc:dest`로 넘김, 덮개는 쓸 때만 만듦.
3. 부산 안 판정은 단순화 다각형 + 점-다각형 검사(출처·허용 오차), 인라인과 앱이 같은 꼭짓점.
4. 부산 데이터는 Postgres 없는 파일 파이프라인(`review/busan/raw` → `scripts/busan/build.mjs` → `spots-busan.json`), 제주 `build-spots.mjs`와 분리.
5. 여행지 파일 캐시: 미리 받지 않고 쓴 기기만, 새 워커가 이어받음(ADR-0093 Amendment 6 M1 일반화).
6. 저장소 키: 머리말 `jeju.` 유지, 여행지별 키는 꼬리 `.busan`, 다른 여행지 id 보존(ADR-0063·0087 개정).
7. 출시 스위치 `__BUSAN__` 빌드 정의 — 단계 출하와 되돌리기 수단.
