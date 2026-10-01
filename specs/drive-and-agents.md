# Light Spec: 차로 바로 길찾기 · 차 안 사용 전제 · AI 에이전트용 딥링크

근거: ADR-0067, ADR-0069(걸어서 도보 길찾기 · 섬 카드 배 타는 곳 · 링크 실측, 5·6절). 부품은 카드 `.tbtn`(예약 링크), 기준 시트 동작(ADR-0060·0065), 백업 링크 주소 정리(ADR-0063)를 그대로 쓴다.

## 1. 길찾기

- `directionsUrl(spot)`(`src/links.ts`): 좌표가 유한수이고 제주 안이면 `https://map.kakao.com/link/to/{이름},{위도},{경도}`. 이름 = `cleanName(name)`의 쉼표를 공백으로, 공백 정리, `encodeURIComponent`. 좌표가 없으면 지금의 검색 링크(`kakaoUrl`의 검색 분기)와 같다.
- 카드(결과 3장·저장한 곳 줄): 메타 줄 아래, 예약 링크 위에 `<a class="tbtn go" href="{goLink.href}" target="_blank" rel="noopener" aria-label="{이름}, 카카오맵 자동차 길찾기">길찾기</a>`. 도보·섬은 5절(ADR-0069).
  - grid 영역 `go`, 카드 폭 전체 줄(줄 카드도 사진 아래까지). 그린 높이 44(`.tbtn`), 누름 영역 48×48(`::before { inset: 0 0 -4px -4px }`, 둥근 모서리까지), `z-index: 1`(카드 전체 링크 위), 왼쪽 마진 -8.
  - 카드 이름·사진 링크(`card-link`)와 첫 카드 메타의 `카카오맵`은 그대로(장소 페이지).
  - 누르면 사용 기록 `map`(같은 카드의 `card-link`와 같은 400ms 두 번 탭 규칙).
- 320/390, 기본 글자: 결과·저장한 곳 가로 넘침 0, `길찾기` 누름 영역 ≥ 48×48(e2e T2-hit), 예약 링크·하트와 겹치지 않음.

## 2. 차 안 사용 전제

- design/SPEC.md 1절 원칙 13: 고르는 사람은 동승자, 운전자는 길 안내만 본다. 운전 중 읽거나 입력할 기능 없음, 첫 탭 한 탭, 카드에서 길 안내 한 탭, 자주 누르는 대상 48px.
- 지금 UI 점검 결과(작은 것만 고치고 나머지는 ADR-0067 Consequences에 기록).

## 3. 딥링크

`src/deeplink.ts` `readDeepLink(search, today)` → `{ mood?, area?, reach?, when?, indoor? } | null`.

| 키 | 받는 값 | 결과 |
|---|---|---|
| `mood` | `rest` `walk` `new` `food` `any` | `mood` |
| `area` | 슬러그 15(`AREAS[].slug`) · 한글 키 · `here` | `area: AreaName \| 'here'` |
| `reach` | `walk` `drive30` `drive60` | `reach` |
| `date` | 오늘 ~ 오늘+365의 `YYYY-MM-DD` | 오늘 = `'now'`, 그 뒤 = 그날 |
| `indoor` | `1` `0` | `true` `false` |

- 값은 소문자·앞뒤 공백 정리 뒤 비교한다(한글 키는 그대로). 같은 키가 여럿이면 첫 값.
- 틀린 값은 그 키만 뺀다. 남은 키가 없으면 `null`.

앱(`mountApp`, `takeBackup` 다음):
- 주소에 쿼리가 있으면 쿼리만 지운다(`replaceState`, 해시와 history 상태 유지).
- 마운트 경로가 첫 화면일 때만 적용(결과·저장한 곳 항목으로 마운트 = 새로고침이면 무시).
- 적용 순서: 얼마나(저장) → 실내(세션) → 언제(저장) → 기준(`here` = `gps`, 지역 = `region` + 지역 저장) → `mood`가 있으면 기분 탭과 같은 흐름(결과 항목 push, 요청, 세션 기록, `tap`). `mood`가 있으면 일찍 누른 기분(`__tap`)보다 앞선다.

## 4. 기계용 설명

- `public/llms.txt`: 역할 한 줄 · 쓰는 법 · 딥링크 표·예시 · 데이터 출처(비짓제주, 공공누리 유형 미확인) · 하지 않는 것.
- `index.html` JSON-LD `@graph`: `WebSite`, `WebApplication`(+ `potentialAction` `SearchAction`, `target` `EntryPoint` `urlTemplate` `__SITE__/?mood={mood}&area={area}&reach={reach}&date={date}&indoor={indoor}`, `query-input` 키마다 `required name=mood` / `optional name=…`).
- `robots.txt` 그대로(`*` 허용 = AI 크롤러 허용).
- `.claude/agents/seo-analyst.md` §4에 한 줄.

## 성공 기준

- D1: `directionsUrl` — 좌표 있음 → `link/to` 모양, 쉼표·괄호 별칭 정리, 좌표 없음·제주 밖 → 검색 링크. 출하 2,964곳 모두 `link/to`.
- D2: 결과 카드 3장·저장한 곳 줄마다 `a.go` 하나, href = `directionsUrl`, 카드 링크 href·`카카오맵` 문구 그대로, 누르면 `map` 기록.
- D3: e2e 320/390 결과·저장한 곳 가로 넘침 0, `a.go` 한 줄·그린 높이 44·누름 영역 48×48(T2-hit에 포함), 기존 44/48 검사 통과.
- D4: `readDeepLink` — 각 키 정상·틀린 값·빈 값·대소문자·한글 지역·날짜 경계(어제·오늘·+365·+366).
- D5: 앱 — `/?mood=walk&area=aewol&reach=drive60&indoor=1`로 열면 결과 화면에 애월 기준 걷기 실내 카드(pickCards와 같은 3곳), 주소에 쿼리 없음, 저장된 기준·얼마나·실내, 뒤로가기 = 첫 화면. `mood` 없음 → 첫 화면에 설정만. 틀린 값 → 무시. 결과 항목으로 새로고침 → 세션 복원(링크 무시). `area=here` → 위치 요청.
- D6: llms.txt·JSON-LD 파싱 가능, `seo:crawl` 감사에서 `site:no-llms-txt`·`page:/:no-jsonld` 사라짐.
- D7: tsc·vitest·build·check:slop·e2e 통과.

## 5. 걸어서 · 섬 (ADR-0069)

`goLink(spot, from, walk, isPoint)`(`src/links.ts`) → `{ href, text, mode: 'car' | 'foot', terminal? }`. `from` = 결과의 기준점(`cards.origin`) 또는 저장한 곳의 기준점(`savedList.origin`), 모르면 null. **`from`은 고르는 데만 쓰고 링크에 넣지 않는다.**

1. **섬**: `islandOf(spot)`이 섬이고 `from`이 그 섬 위가 아니면(또는 null) 도착지 = 그 섬의 배 타는 곳(`TERMINALS`), `text` = `배 타는 곳까지 길찾기`, `terminal` = 터미널 이름.
2. **도보**: `from`이 있고, (`walk`(얼마나 = 걸어서)이고 도착지가 걸어서 범위 안(`withinReach('walk')`)) 또는 (`isPoint`이고 1km 안 — 카드의 `걸어서 약 N분`과 같은 규칙)이면 `walkDirectionsUrl`.
   - `https://m.map.kakao.com/scheme/route?ep={위도},{경도}&en={cleanName}&by=foot`. `sp` 없음(앱이 현재 위치에서 출발). 좌표 없음 → 이름 검색.
3. 그 밖은 `directionsUrl`(자동차, 1절).

스크린리더 이름: `{이름}, ` + (섬이면 `배 타는 곳 {터미널}까지 `) + `카카오맵 ` + (`도보` | `자동차`) + ` 길찾기`. 저장한 곳 줄은 재사용되므로 그릴 때마다 `href`·이름·글자를 고친다(목록 서명에 얼마나 포함).

### 섬 → 배 타는 곳

| 섬 | 상자(위도 · 경도) | spots.json | 배 타는 곳 | 좌표 | 카카오 장소 id |
|---|---|---|---|---|---|
| 우도 | 33.48–33.53 · 126.93–126.98 | 65 | 성산포항 종합여객터미널 | 33.47342, 126.93369 | 17561678 |
| 비양도 | 33.40–33.42 · 126.22–126.24 | 5 | 한림항 비양도행 도선대합실 | 33.41909, 126.26255 | 13723625 |
| 가파도 | 33.16–33.18 · 126.26–126.28 | 4 | 운진항 가파도·마라도 여객터미널 | 33.21007, 126.25828 | 1292299003 |
| 마라도 | 33.11–33.125 · 126.26–126.275 | 10 | 운진항 가파도·마라도 여객터미널 | 33.21007, 126.25828 | 1292299003 |
| 차귀도 | 33.305–33.32 · 126.135–126.155 | 1 | 자구내포구 차귀도 유람선 | 33.30931, 126.16537 | 25046666 |
| 추자도 | 33.90–34.00 · 126.25–126.40 | 0 | 제주항 연안여객터미널 | 33.51959, 126.53500 | 18376658 |

출처: 카카오맵 장소 검색(`search.map.kakao.com`) 2026-10-01, 소수 다섯째 자리. 상자는 본섬 가장자리(성산포항·종달리·협재·금능·모슬포·자구내)를 넣지 않는다(pick.test S33).

## 6. 링크 실측 · 실기기

- `npm run check:links`(`scripts/check-links.ts`, 네트워크 필요, vitest 밖): iOS Safari · Android Chrome · 삼성 인터넷 · 카카오톡 인앱(iOS·Android) UA로 자동차·도보·배 타는 곳 링크를 Playwright로 따라가 카카오 연결 페이지 `applink.map.kakao.com/route?…`의 도착지(`ep`)·이름·수단(`by=car`/`by=foot`)과 `sp`가 비었음을 고정. 앱 호출 `kakaomap://route?…`는 보이면 출력. PC Chrome: 자동차·배 타는 곳은 `map.kakao.com/?map_type=TYPE_MAP&target=car&rt=,,X,Y&rt2=이름`, 도보는 같은 연결 페이지.
- 실기기: `docs/device-check.md`(5분, 8칸).

## 성공 기준 (ADR-0069)

- D8: `walkDirectionsUrl` 모양, `sp` 없음, 좌표 없음 → 이름 검색.
- D9: `goLink` — 걸어서 범위 안 → 도보, 범위 밖 → 자동차, 1km 안 진짜 위치 → 도보, 위치 모름 → 자동차. 섬 85곳 모두 본섬·위치 모름에서 배 타는 곳, 같은 섬에서 장소. 터미널은 섬 밖·제주 안. 어떤 링크에도 출발 좌표·`sp=` 없음.
- D10: 앱 — `?mood=food&area=here&reach=walk` 카드는 도보 링크·`도보` 이름. `?mood=new&area=hangyeong&reach=drive30`의 차귀도 카드는 `배 타는 곳까지 길찾기` → 자구내포구. 우도 기준의 우도 카드는 `길찾기`.
- e2e `DR-ferry`: 320·390에서 `배 타는 곳까지 길찾기` 한 줄·높이 44·가로 넘침 0, 걸어서 카드 도보 링크.
- `check:links` 18건(UA 5 + PC × 자동차·도보·배 타는 곳). 2026-10-01 이 환경(프록시 경유)에서 네 번 돌려 18건 모두 한 번 이상 통과, 한 번에는 15~16건 — 나머지는 카카오 페이지 사이에서 멈춘 것(`STOP`, 네트워크)이고 다른 곳으로 간 것(`FAIL`)은 0건. 도보 6건은 매번 통과(302 두 번).
