# Light Spec: 차로 바로 길찾기 · 차 안 사용 전제 · AI 에이전트용 딥링크

근거: ADR-0067. 부품은 카드 `.tbtn`(예약 링크), 기준 시트 동작(ADR-0060·0065), 백업 링크 주소 정리(ADR-0063)를 그대로 쓴다.

## 1. 길찾기

- `directionsUrl(spot)`(`src/links.ts`): 좌표가 유한수이고 제주 안이면 `https://map.kakao.com/link/to/{이름},{위도},{경도}`. 이름 = `cleanName(name)`의 쉼표를 공백으로, 공백 정리, `encodeURIComponent`. 좌표가 없으면 지금의 검색 링크(`kakaoUrl`의 검색 분기)와 같다.
- 카드(결과 3장·저장한 곳 줄): 메타 줄 아래, 예약 링크 위에 `<a class="tbtn go" href="{directionsUrl}" target="_blank" rel="noopener" aria-label="{이름}, 카카오맵 자동차 길찾기">길찾기</a>`.
  - grid 영역 `go`, 카드 폭 전체 줄(줄 카드도 사진 아래까지). `min-height: 48px`, `z-index: 1`(카드 전체 링크 위), 왼쪽 마진 -8.
  - 카드 이름·사진 링크(`card-link`)와 첫 카드 메타의 `카카오맵`은 그대로(장소 페이지).
  - 누르면 사용 기록 `map`(같은 카드의 `card-link`와 같은 400ms 두 번 탭 규칙).
- 320/390, 기본 글자: 결과·저장한 곳 가로 넘침 0, `길찾기` 누름 높이 ≥ 48, 예약 링크·하트와 겹치지 않음.

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
- D3: e2e 320/390 결과·저장한 곳 가로 넘침 0, `a.go` 높이 ≥ 48, 기존 44/48 검사 통과.
- D4: `readDeepLink` — 각 키 정상·틀린 값·빈 값·대소문자·한글 지역·날짜 경계(어제·오늘·+365·+366).
- D5: 앱 — `/?mood=walk&area=aewol&reach=drive60&indoor=1`로 열면 결과 화면에 애월 기준 걷기 실내 카드(pickCards와 같은 3곳), 주소에 쿼리 없음, 저장된 기준·얼마나·실내, 뒤로가기 = 첫 화면. `mood` 없음 → 첫 화면에 설정만. 틀린 값 → 무시. 결과 항목으로 새로고침 → 세션 복원(링크 무시). `area=here` → 위치 요청.
- D6: llms.txt·JSON-LD 파싱 가능, `seo:crawl` 감사에서 `site:no-llms-txt`·`page:/:no-jsonld` 사라짐.
- D7: tsc·vitest·build·check:slop·e2e 통과.
