# Plan: 앱 — 자동 지역 (N4) + 검수한 곳 올리기 자리

근거: ADR-0101(두 층), `plans/nationwide.md` N4, ADR-0094·0096·0097·0098·0100, `specs/busan.md`, `specs/home-v2.md`. 용어는 `docs/context.md`의 **검수한 곳 / 자동 지역**·**여행지**·**시작 화면**·**이름 줄**·**오늘 판**·**지금 여기서**. 제주·부산 데이터 파일은 바꾸지 않는다. 주인이 없는 동안 고른 기본안은 **[기본안]**(아침에 뒤집을 수 있고, 모두 스위치로 되돌린다).

설계: Opus 5.5 Plan 에이전트(읽기 전용, 2026-10-30). 총괄이 저장하면서 고친 것: R1(강원·전북 누락)은 0b52b42f에서 이미 고침. 0절 「`do`는 내지 않는다」 → 자동 지역의 새로운 것은 모두 `sub: 'sight'`로 낸다(체험·온천이 빠지지 않게. 예약 경로 규칙 ADR-0074는 검수한 곳의 체험 카드 규칙이고, 측정은 기분만 쟀다).

## 0. 입력 계약 (N3이 내는 것)

- `public/nation/<lDongRegnCd>.json?v=<hash>`: 시도 하나에 레코드 배열. `{ id:'nt-<contentid>', name, lat, lng, sgg:'<lDongRegnCd><lDongSignguCd>', cat:[lclsSystm1,2,3], image, moods:Mood[], sub, indoor?:true }`. reason 없음.
  - `moods`는 `walk|new|food` 중 하나 이상. `rest`·`famous`는 오지 않는다(ADR-0101 2).
  - 먹기는 `sub: 'meal'|'cafe'` 필수(`src/data.ts:67`이 sub 없는 먹기를 버린다). 새로운 것은 `sub: 'sight'`(위 고침).
- `public/nation/index.json?v=<hash>`:
  ```
  { "v":1, "rules":{"moods":["walk","new","food"],"indoor":true},
    "sido":[{"c":"51","n":"강원특별자치도","s":"강원"}, …],
    "sgg":[{"c":"51150","n":"강릉시","s":"51","lat":37.75,"lng":128.88,"f":"51"}, …],
    "files":{"51":"a1b2c3d4e5", …} }
  ```
  - `sgg[].lat/lng`는 그 시군구 레코드의 중앙값 점. `f`는 레코드가 든 파일 키(지금은 시도 코드; 나중에 시군구 단위로 쪼개도 index만 바꾼다).
  - `rules`는 N2 측정을 통과한 것만(`indoor:false`면 앱은 「실내만」을 내지 않는다).
- 시도 코드는 측정값 그대로(전남광주 `12`, 세종 `36110`). 시군구 코드 검사는 `/^\d{4,8}$/`.

## 1. 여행지·지역 모델

### 1.1 한 점이 어디로 가는가 (`regionOf(p)`)

```
inJeju(p)                     → { k:'dest', dest:'jeju' }    // areas.ts:68-73
inBusan(p)                    → { k:'dest', dest:'busan' }   // busan.ts:45-54
nearestSgg(p) (≤ 35km)
   └ sgg ∈ CURATED[d].sgg     → { k:'dest', dest:d }         // 나중에 올리는 서울·강원 (1.3)
   └ 그 밖                    → { k:'auto', sgg }
그 밖                         → null (한국 밖)
```

- 가장 가까운 시군구 중심으로 판정(경계 다각형 없음, context.md 세부 지역 규칙과 같음). 부산(26xxx)·제주(50xxx) 중심은 후보에서 뺀다. 35km 넘으면 `outside`.
- 판정은 `src/nation.ts`(순수). 진입은 import하지 않고 `release.ts`가 받아 둔 함수로만 쓴다(`installBusan` 방식, `release.ts:100-106`).
- `release.ts:130-132` `releasedDestOf(p)`가 제주·부산 다음에 `NATION && part?.regionOf(p)`를 보고 자동 지역이면 `'nation'`. 스위치를 끄면 지금과 같다.

### 1.2 Dest 일반화 — 새 검수한 곳은 표 한 줄

- `src/dest.ts:6-10`: `type Curated = 'jeju' | 'busan'`, `type Dest = Curated | 'nation'`. `'nation'`은 자동 지역 층 전체, 어느 시군구인지는 `State.sgg`.
- 같은 파일에 순수 여행지 표 `DEST`:
  ```
  { name:'부산', file:'spots-busan.json', idPrefix:'bs-', cityHall:{…}, credit:'tour',
    moods:['rest','walk','new','famous','food'], any:['rest','walk','new'], sgg?: readonly string[], part?: 'busan' }
  ```
  제주: `idPrefix` 없음(UUID), `credit:'visitjeju'`. nation: `moods:['walk','new','food']`, `any:['walk','new']`, `credit:'tour'`.
- 표로 바꿀 자리(동작 그대로, U3에서 한 번에): `main.ts:51` `spotsUrl`, `home.ts:13-20` `CITY_HALL`·`BUSAN_CITY_HALL`·`sunPoint`, `render.ts:218-230` `BUSAN_COPY`, `render.ts:1724-1737` `renderDest`, `render.ts:1324` 「부산 인기:」, `render.ts:1338-1343`, `store.ts:54` `destKey`(→ `` `${key}.${dest}` ``), `store.ts:160-165` `parseStay`, `links.ts:17-19` `scope`, `dest.ts:10` `destOfId`, `start.ts:84`, `app.ts:985-986`·`1060-1062`.
- 스위치: `release.ts`에 `export const NATION = typeof __NATION__ !== 'undefined' && __NATION__`. 스위치를 읽는 곳은 여기 하나(`plans/busan.md` M2).

### 1.3 검수한 곳으로 올리기 (서울·강릉·속초·양양·춘천·평창)

- `DEST`에 한 줄: `{ seoul: { sgg:[서울 25구], file:'spots-seoul.json', part:'seoul' } }`. `regionOf`가 `sgg` 목록으로 판정하므로 다각형이 필요 없다.
- [기본안] 강원은 한 여행지 `gangwon`(`sgg:[강릉, 속초, 양양, 춘천, 평창]`). 이름 줄은 `여차나:강릉`처럼 시군구. `DEST[d].label: 'sgg' | 'name'`.
- 자동 지역 파일에 올린 시군구 레코드가 남아 있어도 정규화가 `sgg ∈ 어느 DEST.sgg`이면 버린다.
- id는 `nt-<contentid>` 그대로([기본안]). 자동 지역에서 저장한 곳이 올린 뒤에도 남는다. 각 검수 도시 몫은 `busan-part`처럼 자기 청크.

### 1.4 시군구를 자동 지역의 「동네」로

- `areas.ts:29-30`:
  ```ts
  export interface SggArea { name: SggCode; slug: SggCode; label: string; landmark: string; lat: number; lng: number; group: 'nation' }
  export type SggCode = `${number}`;
  export type Area = (typeof AREAS)[number] | (typeof BUSAN_AREAS)[number] | SggArea;
  export type RegionName = AreaName | SggCode;
  ```
  `name`이 코드인 이유: `중구`·`고성군`처럼 겹치는 이름. `label`은 `강릉시`, `landmark`는 시도 짧은 이름.
- `installNation`이 index 시군구를 `OPEN_AREAS`에 넣는다(`release.ts:97,104` 방식) → `staticOrigin`(`state.ts:292`)·`areaByName`·`parseRegion`(`store.ts:152-157`)·기준 라벨(`render.ts:288`)이 그대로 받는다. `State.region`·`Stay.area`·`types.ts`는 `RegionName`.
- **꼭 같이**: `i18n/apply.ts:91-93`이 `OPEN_AREAS`를 돌며 `w.areas[a.name]`을 읽는다 → `group === 'nation'`은 건너뛴다.

### 1.5 이름 줄 글자 (`sggShort`)

1. 끝 `시|군|구`를 떼되 남는 글자가 2자 이상일 때만(`강릉시→강릉`, `중구→중구`).
2. 뗀 이름이 다른 시군구와 겹치거나 원래 2자 이하면 시도 짧은 이름을 붙인다(`대구 중구`, `강원 고성`).
3. 6자를 넘으면 붙인 시도를 뺀다. 그래도 넘으면 그대로(ADR-0094 Amendment 3 「로고 몸이 먼저 비킨다」).
- 문서 제목 `여차나:{짧은 이름} · P를 위한 여행동반자`. GPS 기준이면 읽은 점의 시군구, 지역 기준이면 고른 시군구, 아직 못 읽었으면 `jeju.sgg`.

## 2. 데이터 받기·조각·서비스 워커

- `loadIndex()`: `nation/index.json?v=__NATION_V__`(vite.config에서 index 해시, `BUSAN_V` 방식).
- `filesFor(sgg)`: 그 시군구 중심 40km 안에 중심이 있는 시군구들의 `f`, 자기 파일 먼저, 최대 3개(drive60 직선 반경 ≈ 30.8km + 여유 10km).
- 파일마다 `SpotSource`(`data.ts:118`). `normalizeNation(raw, curatedSgg)`: reason `''`, `mood = moods[0]`, `moods` 유지, `score` 3, `kakaoPlaceId` null, `http://`→`https://`, 검수 sgg 레코드 버림, 섬 군(울릉·옹진)은 출발점이 그 군일 때만.
- `app.ts:140-157` `sources`의 `'nation'`은 합친 소스(키 `nation:<sgg>`, `get()` = 파일들 이어 붙임, 같은 키 동안 같은 배열 → `state.ts:338-359` WeakMap 캐시 그대로).
- 위치 읽기 전 nation의 `data.get()`은 `jeju.sgg` 파일, 읽은 뒤 시군구가 다르면 `followGps`(`app.ts:523-526`)처럼 한 번 더 받는다.
- 크기: N3에서 잰다. gzip 300KB 넘는 시도는 index `f`만 바꿔 시군구 단위로 쪼갠다.
- SW: 미리 받기(`vite.config.ts:9` `PUBLIC_SHELL`)에 nation 파일·`nation-part` 넣지 않음. `?v=`는 cache first(`sw.js:12`). `sw-build.ts:29` `withBusanFile` → `withCarry(template, files)`(옛 캐시에 있던 nation 파일·청크를 새 `?v=`로, 따로 `.catch`). `_headers`에 `/nation/*` immutable(nation 빌드만). 끈 빌드는 dist에서 `nation/` 지움.

## 3. state.ts / pick.ts

- `State.sgg: SggCode | null`. `'dest'` 행동(`state.ts:198`, `677-698`)에 실음. 시군구가 바뀌면 `histories`·`shown`을 비운다.
- 기분 제한: `'dest'`·`'restore'`·`'mood'`에서 `DEST[s.dest].moods`에 없는 기분은 `'any'`.
- `rainArea`(`state.ts:304-309`): nation이면 시군구 코드.
- `homeOrigin`: nation·GPS 기준인데 위치를 못 읽었으면 `jeju.sgg` 중심을 약한 출발점으로(머리말 `{짧은 이름} 근처:`). 인기순은 자동 지역에 근거가 없다(점수 모두 3).
- `Spot`(`pick.ts:21-58`)에 `moods?: Mood[]`, `candidates` `kind`(`pick.ts:233`) = `s.mood === mood || !!s.moods?.includes(mood)`.
- `pickCards`(`pick.ts:340`) 끝 인자 `anyMoods = ANY_MOODS`. 길이 < 3이면 셋째 장은 두 풀을 합쳐 `byRank` 첫 미선택([기본안]: 걷기 1 + 새로운 것 1 + 다음 1, 먹기 0). `resolveCards`(`state.ts:490`)·`nowSpot`(`home.ts:47-54`)은 `DEST[s.dest].any`.
- 점수가 같으므로 `byScore`(`pick.ts:221-223`)는 가까운 순 → id. 범위 안 3곳 미만이면 받은 파일 전체에서 가까운 3곳. 비 와요 실내 보충(`pick.ts:237-239`) 그대로, `rules.indoor === false`이면 「실내만」 행동 없음.

## 4. 시작 화면·이름 줄·화면

- 인라인 2,000 B: 지금 약 1,766 B. 시도·시군구 고르기는 앱 코드로. 인라인은 `index.html:17` `dest=(jeju|busan)` → `dest=([a-z]{2,10})`, 기억값 검사 → `/^[a-z]{2,10}$/`만(+약 10 B). 앱이 `DEST`로 다시 검사(`app.ts:190-192`). `index.html:91` 바디 인라인은 그대로.
- `start.ts` `mountStart`(`start.ts:51`)가 두 칸 줄 아래에 인기 칸 6개([기본안] 서울·강릉·경주·전주·여수·속초, index로 풀고 없으면 숨김)와 `다른 곳` 글자 버튼. 누르면 `loadNation()` → 시도 17 → 시군구 목록(`← 뒤로`, 칸 높이 ≥ 48, 2열). 고르면 `choose('nation','pick',why,undefined,sgg)`. GPS가 한국 안·검수한 곳 밖이면 바로 그 시군구. 한국 밖 문구: `지금은 한국 밖이에요. 여행지를 골라 주세요.`(네 언어). 375×812 스크롤 없이 큰 버튼·칸 8·다른 곳, 320 넘침 0.
- render.ts: 이름 줄 `:${sggShort}`, 출처 `정보·사진: 한국관광공사`, `#results > .landing` 숨김. 기분 타일 중 `DEST.moods`에 없는 것과 받은 데이터에서 3곳 미만인 기분은 `hidden`. `cardEl`(`render.ts:680`)은 reason이 빈 글이면 `<p class="reason">` 없음. `noPhoto`(`render.ts:582`)는 `destOfId !== 'jeju'`. 결과 `#how`에 nation일 때 `공공 데이터로 가까운 순으로 골랐어요.`. 둘러보기 숨김. 밖 문구 `지금은 한국 밖이에요.`(`render.ts:797`, `1569`). 기준 시트 여행지 줄에 `다른 곳`, 동네 칸은 지금 시도의 시군구 + `다른 시도`(그리기는 `nation-part`).

## 5. 오늘 판

- `functions/api/rain.ts`: `area`가 있으면 지금 경로 그대로. 없고 `grid=<nx>,<ny>`(정수, 1≤nx≤149, 1≤ny≤253)면 그 격자, 캐시 키 `https://rain.cache/g<nx>-<ny>/<base>`, 답 `{ grid, pop, rain, base, from }`. 둘 다 없거나 틀리면 `400 bad area`. **제주 15 slug 답·격자·캐시 키는 바이트까지 그대로.**
- 앱 `fetchRain`(`effects.ts:54-59`): `area`가 시군구 코드면 `gridOf(sgg)`(시군구 중심 → `kmaGrid`)로 `?grid=`. 기기 밖으로 나가는 것은 시군구 중심 격자뿐(GPS 점 아님, ADR-0076과 같은 거칠기).
- 해: `sunPoint`(`home.ts:19-20`) 출발점 있으면 그 점, 없으면 `DEST[d].cityHall`, nation은 `jeju.sgg` 중심 → 서울시청(37.5663, 126.9779).

## 6. 저장 키 (ADR-0097 Amendment)

| 키 | 값 | 비고 |
|---|---|---|
| `jeju.dest` | `'jeju'\|'busan'\|'nation'` | 끈 빌드가 `'nation'`을 읽으면 null → 제주 |
| `jeju.basis.nation`·`jeju.region.nation`·`jeju.stay.nation` | 기준·시군구·숙소 | `destKey` `.<dest>` |
| `jeju.sgg` (새) | 마지막 시군구 코드 | 자동 지역에서만 |
| `jeju.saved.v2`·`jeju.visited` | 그대로 | `nt-` id 섞임, 다른 여행지 id 안 지움 |
| `jeju.nf` (U18, 선택) | `{[nt-id]: f}` | 저장한 곳 파일 키 |

U18 전에는 nation 저장한 곳 화면에 받은 파일의 곳만, 나머지는 `다른 곳에 저장한 곳 N곳` 한 줄.

## 7. 딥링크·사용 기록

- 공개 딥링크 키는 새로 만들지 않는다. `?stay=`가 한국 안·검수한 곳 밖이면 자동 지역 숙소(`deeplink.ts:57-61` `releasedDestOf`). `?area=<시군구>`는 `dest=nation`과 같이 올 때만. `keep.ts:163-167` `handoffUrl`은 `dest=nation&area=<sgg>`, `main.ts`는 `__dest==='nation'`이면 몫을 마운트 전에(4초, 실패하면 제주).
- `contextOf`(`track.ts:84-110`): `dest:'nation'`, 지역 기준일 때만 `sgg`. `events/validate.ts`: `DESTS`(26행)에 `'nation'`, `FIELDS`(32행)에 `'sgg'`(`/^\d{4,8}$/`, nation+area 기준일 때만). **수집기가 앱보다 먼저 또는 같은 배포.** GA4 `sgg` 등록은 주인 몫. 개인정보 안내 네 언어: 고른 시군구, 비 소식은 시군구 격자.

## 8. i18n

화면 글은 번역, 장소·분류·시군구 이름은 한국어 + 그 언어로 한 줄 안내(ADR-0094 Amendment 1 D4). 시도 17 이름은 번역(ADR-0093 Amendment 1 표기). `NATION_COPY`(nation-part) + 각 언어 `nation:` 절, `whenNation`. 한국어 진입은 늘지 않는다. `tests/i18n.test.ts`가 키 일치·외국어 표 한글 0.

## 9. 번들 예산 (≤ 60,000 B)

지금 50,014 B. 진입에 더하는 것 ≤ 1.5KB(DEST 표, 기분 제한·sgg, moods·anyMoods, 타일 숨김·빈 reason·#how, grid 갈래·track). `src/nation-part.ts`(동적 import, ADR-0098 방식)에 index·파일 받기, `regionOf`, `normalizeNation`, `sggShort`, `kmaGrid`, 고르기 그리기, `NATION_COPY`(어림 gzip 4~6KB, 진입 밖). 받는 때: 시작 화면 GPS가 검수한 곳 밖 또는 `다른 곳`, `__dest==='nation'`, 위치가 제주·부산 밖, 기준 시트 `다른 곳`.

## 10. `check:jeju`

- U1~U18: 기본 운영 빌드는 nation 스위치 끔. 허용 목록을 늘리지 않고 통과.
- U19(출시): `jeju-baseline.ts`에 nation 정규화 — `_headers`의 `/nation/*` 줄 지움, `files()`가 `nation/` 건너뜀, `assets`·`swList`에서 `nation-part-*.js` 거름. 인라인 gzip ≤ 2,000. 제주 기기 두 대 홈·walk DOM·스타일·저장소·요청 차이 0. 데이터 해시 그대로. 허용 변경은 U19 커밋 하나에 이유와 함께.
- 되돌림 빌드 `--mode busan`·`--mode jeju` 유지, `e2e:busan`(BS-B3 「서울 → 밖 문구」 포함) 그대로.

## 11. 시험

vitest(`npm test`, `test:busan`, 새 `test:nation`): `nation-region`(성산→제주, 해운대·김해공항·가덕도→부산 B4 10점, 김해시청→자동, 강릉역→자동, 울릉도→울릉군, 쓰시마·도쿄→null, 35km), `nation-data`(정규화·index 형식·fixture `tests/fixtures/nation/`), `nation-short`, `pick`(moods 다중, anyMoods [walk,new] 3장·먹기 0·중복 0, 길이 3이면 기존 그대로, 가까운 순), `state`(전환 때 rest·famous→any, sgg 바뀌면 순환 비움, rainArea, 약한 출발점), `store`(`'nation'` 왕복, `.nation` 키, 옛 코드 null, `nt-` 보존), `rain-fn`(grid 정상·범위 밖·소수·음수 400, area가 이김, 캐시 키, 15 slug 답 그대로), `events`, `track`, `start`(인라인 `?dest=nation`, 기억값, 모르는 값 → 제주, gzip ≤ 2,000), `sw`(이어받기), `i18n`, `wayfinding`, `dest`(`__NATION__`은 release.ts만).

e2e(`E2E_NATION=1`, `npm run e2e:nation`, 기존 전부 + NT-*): NT-1 GPS 강릉 → `여차나:강릉 ▾`, 쉬기·유명한 데 없음, 아무거나 3장, `.reason` 없음, `#how`, 출처, `/nation/51.json` 1회 / NT-2 도쿄 → 한국 밖 / NT-3 거절 → 다른 곳 → 강원 → 속초 / NT-4 인기 칸 서울·경주 / NT-5 grid 비 → 실내만, 요청에 GPS 좌표 없음 / NT-6 해 지는 시각, 노을·장날 없음 / NT-7 제주 기기 `/nation/` 요청 0, 홈 DOM 그대로 / NT-8 자동 지역 ↔ 부산 전환 / NT-9 기준 시트 다른 시도 → 전주 / NT-10 외국어 / NT-11 375·320 넘침 0, 200% 잘림 0 / NT-12 브라우저로 열기 / NT-13 오프라인 / NT-14 되돌림 빌드 / NT-15 열 때 위치 읽기 0.

## 12. 단위 (순서대로, 단위마다 검증 → 커밋. U19 전까지 운영 동작 그대로)

공통 검증: `npm run typecheck`, `npm test`, `npm run test:busan`, `npm run check:slop`, `SITE_URL=https://yeochana.com npm run build && npm run check:jeju`(허용 추가 0). U4부터 `test:nation`.

| # | 단위 | 건드리는 곳 |
|---|---|---|
| U1 | 수집기 `dest:'nation'`, `sgg` | `events/validate.ts:26,32,73`, `events.test.ts` |
| U2 | `/api/rain?grid=` | `functions/api/rain.ts`, `rain-fn.test.ts` |
| U3 | `DEST` 표 리팩터(동작 같음) | 1.2 목록 |
| U4 | 스위치 `__NATION__` + 빌드(기본 끔) | `release.ts`, `env.d.ts`, `vite.config.ts`, `sw-build.ts` `withCarry`, `package.json`, 빈 `nation-part.ts` |
| U5 | 데이터 계약 + 정규화 | `src/nation.ts`, fixture |
| U6 | 지역 판정·짧은 이름·청크 | `nation.ts`, `nation-part.ts`, `areas.ts`, `types.ts`, `i18n/apply.ts:91` |
| U7 | 고르기 `moods`·`anyMoods` | `pick.ts`, `home.ts:47-54` |
| U8 | 상태·저장소 | `state.ts`, `store.ts`, ADR-0097 Amendment 1 |
| U9 | 앱 연결 | `app.ts`, `main.ts` |
| U10 | 화면 | `render.ts`, `style.css` |
| U11 | 시작 화면 다른 곳·인기 칸 | `start.ts`, `index.html:17` |
| U12 | 오늘 판 | `effects.ts`, `home.ts` `sunPoint`, `gridOf` |
| U13 | 길찾기 링크 | `links.ts` |
| U14 | i18n | `i18n/*` |
| U15 | 사용 기록 + 개인정보 안내 | `track.ts`, `public/privacy*.html`, `analytics-report.mjs` |
| U16 | SW·캐시 | `vite.config.ts`, `sw-build.ts`, `_headers`, `sw.test.ts` |
| U17 | e2e NT-* | `tests/e2e/browser.e2e.mjs` |
| U18 | (선택) 저장한 곳 파일 지도 | `store.ts`, `app.ts` |
| U19 | 출시: 기본 켬 | `vite.config.ts`, `jeju-baseline.ts`, `release-baseline.json`, `docs/context.md`, `design/SPEC.md`, `public/nation/*` → 독립 리뷰 → 배포 → smoke |

## 13. 위험 ([기본안], 모두 스위치로 되돌림)

| # | 위험 | [기본안] |
|---|---|---|
| R2 | 비 소식에 좌표를 보내면 위치 약속이 깨진다 | 시군구 중심 격자만 |
| R3 | 시군구 경계 판정 오차(이름 줄) | 받아들임, 카드는 거리로만 고름 |
| R4 | 큰 시도 파일 | N3에서 재고 300KB 넘으면 시군구 조각 |
| R5 | N2 미달 | 해당 규칙 안 냄(N2는 통과, `rules-REPORT.md`) |
| R6 | 아무거나 셋째 장 | 걷기 1 + 새로운 것 1 + 다음 1 |
| R7 | 이유 없는 카드 | 분류 줄 없음, `#how` 한 줄 |
| R8 | 다른 시도 저장한 곳 | 한 줄 안내 |
| R9 | 섬 군 | 울릉·옹진은 그 군 출발일 때만 |
| R10 | 되돌림 때 `jeju.dest='nation'` | 제주로 열림, 저장소 유지 |
| R11 | 올리는 도시 id | `nt-` 유지 |
| R13 | 폐업(카카오 대조 없음) | `#how`로 알림 |
| R14 | 인기 칸 | 서울·강릉·경주·전주·여수·속초 |
| R16 | 자동 지역 색인 | 넓히지 않음 |
| R17 | 서버 함수가 `__NATION__` 읽음 | 스위치는 release.ts만 |
| R18 | 진입 예산 | 넘으면 청크로 |
| R19 | 이웃 파일 3개 | 자기 파일 먼저 그림 |
