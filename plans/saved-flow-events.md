# Plan — 저장 목록 흐름 기록 (apps/web, ADR-0085)

근거: `specs/saved-flow-events.md`(권위), ADR-0085·0061·0078. 작성 2026-10-10.

## 목표 기준

저장 목록 열기·목록에서 연 길찾기(담은 지 며칠·지난 날 여부)·목록 정리를 시각 없이 센다. 앱 동작·화면은 그대로, `at`(담은 날)은 기기 밖으로 나가지 않는다.

## 포트·파일

| 자리 | 파일 | 바뀌는 것 |
|---|---|---|
| 도메인 타입 | `src/types.ts` | `SavedEntry.at?: Day` (기기 안에만) |
| 저장소 | `src/store.ts` | `normalizeEntries`·`parseEntries`가 `at`을 지킴(틀린 값은 버리고 항목은 살림). `toggleSaved(id, date, order?, on?)` 넷째 인자 = 담은 날. `moveToDay`는 `at`을 옮김 |
| 백업 | `src/keep.ts` | 바꾸지 않음. `encodeBackup`은 id·date·order만 쓰므로 `at`이 나가지 않음(테스트로 고정) |
| 이벤트 모양 | `src/track.ts` | 이벤트 `open`·`arrange`, 필드 `live0`·`past`·`from`·`age`·`op`, `ageOf(at, today)` |
| 앱 | `src/app.ts` | `openSaved` → `open` 1회(그리기에서 세지 않음). 목록 길찾기 → `map`+`from:'saved'`·`age`·`past`. 위로/아래로/다른 날로(실제로 옮겼을 때)/지난 날 펼치기·접기 → `arrange`. 하트는 `at = today`(되돌리기는 원래 `at`) |
| 화면 | `src/render.ts` | 저장 목록 줄 카드에 `data-date`(길찾기 클릭이 어느 줄인지 알도록). 보이는 것 변화 없음 |
| GA4 | `src/analytics.ts` | `saved_open`·`saved_arrange`, `gaParams`에 `from`·`age`·`past`·`live0`·`op` |
| 검사 | `events/validate.ts` | 새 필드는 정해진 이벤트·값에만. `open`·`arrange`는 `id` 없음 |
| 카운터 | `events/handler.ts` | `open[:live0][:past]`, `arrange:<op>`, `saved:a<0|1|2|x>:<p|->`(map), `save:dated|now`(save). 고정 목록 `FLOW_IDS` |
| 집계 | `events/aggregate.ts` | 접두어(`open`·`arrange:`·`saved:`·`save:`) id는 장소 인기에서 뺌 |
| 보고서 | `scripts/analytics-report.mjs` | 「저장 목록 흐름」 절(Q1·Q2-a·b·c·Q3), 기존 절은 흐름 id를 장소로 세지 않음 |
| 안내 | `public/privacy.html` | 보내는 항목 한 줄 |

## 성공 기준 → 테스트

| 기준 | 확인 |
|---|---|
| F1 검사 | `tests/events.test.ts` 새 필드 통과·거부 표, 시각 문자열(`21:30`, ISO 시각)을 모든 필드에 넣어 거부 |
| F2 열기 | `tests/track.test.ts` 열기 1회 = `open` 1건(다시 그리기·정리 뒤에도), ♥ 0 + 지난 날이면 `live0`·`past`; e2e `A1-analytics`에 지난 날만 있는 목록을 열어 POST에 `open`+`live0`+`past` |
| F3 길찾기 | `tests/track.test.ts` 목록 길찾기에 `from`·`age`·`past`, 카드 길찾기에는 없음 |
| F4 날 수 | `tests/track.test.ts` `ageOf` 0·1·2(사흘 전)·없음, 앱에서 `today` 주입으로 어제 담은 줄 = 1 |
| F5 `at` | `tests/store.test.ts` 하트에 `at` 저장·옛 목록 읽기·`moveToDay` 유지; `tests/keep.test.ts` 백업 문자열이 `at` 유무와 같음; 보낸 이벤트에 `at` 없음 |
| F6 기록 끄기 | `tests/track.test.ts` U3 확장(열기·정리·목록 길찾기 0건), e2e A1 끈 상태 POST 0 |
| F7 D1 | `tests/events.test.ts` 덧붙인 카운터가 표대로, 장소 카운터 수 그대로, 모든 덧붙인 id ∈ `FLOW_IDS`; 집계에서 빠짐 |
| F8 GA4 | `tests/analytics.test.ts` 새 매개변수 전달, `d`·`area`·좌표 없음 |
| F9 보고서 | `tests/analytics-report.test.ts` 고정 입력 Q1~Q3, 「참고만」·「데이터 없음」 |
| F10 | `npm test`, `npm run typecheck`, `npm run e2e`, `npm run check:slop` |

## 범위 밖

흐름 변경(B), 화면 변경, GA4 맞춤 측정기준 등록(주인 몫), 배포.
