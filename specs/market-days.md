# Light Spec: 오일장 「오늘 열려요」

근거: ADR-0066. 부품은 결과 카드 메타 줄(`실내`, ADR-0065)을 그대로 쓴다.

## 데이터

- 오일장 9곳(비짓제주 `쇼핑` 중 오일장): `review/input/batch-900.json`(원문) → `review/market/verdicts.json`(keep·기분·이유) → `review/score/score-07.json` → `review/copy/indoor.json`(실외) → `review/copy/market-days.json`(장날·출처·카카오 확인). 모두 `mood: new`, `sub: sight`, `bookable: false`, `indoor: false`.
- spots.json의 오일장에만 `market: { days: number[], label: string, noFirstAfter31?: true }`. `days`는 그달의 장날(1~31), `label`은 `2·7일`처럼 보이는 그대로.
- `scripts/markets.mjs`: `market-days.json`을 오일장에 붙인다(빌드와 출하본 모두, 다시 돌려도 같음). 장날 규칙 없는 오일장이나 출하되지 않은 규칙이 있으면 멈춘다.

## 장날 판정 (`src/market.ts`)

- 입력: 규칙, 날짜(`YYYY-MM-DD`, 제주 날짜). 결과: `open`(장날) / `off`(장날 아님) / `closed`(출처가 그날 닫는다고 함).
- `noFirstAfter31`이고 그날이 1일이며 지난달이 31일까지 있으면 `closed`. 그 밖에는 그날의 일(day of month)이 `days`에 있으면 `open`, 없으면 `off`.
- 날짜: 지금 모드 = 오늘(`today`, KST), 날짜 모드 = 고른 날(`when`).

## 동작

- 뽑기: `closed`인 오일장은 후보에서 뺀다. 정렬은 점수 → 그날 `open` → 이동 시간 → id. 넓히기·로테이션·아무거나 규칙은 같다.
- 결과 카드: 오일장이면 메타 줄 맨 앞에 `span.market` 한 줄 문구, 뒤에 `&nbsp;·`와 이동 문구. `open`이면 `오늘 장 서는 날`(날짜 모드 `이날 장 서는 날`), 아니면 `장날: {label}`. 이동 문구가 `아니면` 줄로 묶인 줄 카드는 메타 줄에 장날 문구만. 저장 목록 줄에는 없다.
- 운영시간: 표시하지 않는다(조건에 맞는 곳 0곳, ADR-0066 6).

## 성공 기준

- M1: 2,964곳(오일장 9곳 추가), 오일장은 모두 `new`·`sight`·실외·점수·이유 규칙 통과, `market` 규칙이 `market-days.json`과 같고, 규칙마다 비짓제주 URL·확인일·카카오 확인이 있다. 오일장이 아닌 곳에는 `market`이 없다.
- M2(날짜 경계, KST): 제주민속 2·7 — 2일·7일·12일·27일 `open`, 1일·3일·28일·31일 `off`. 세화 5·10 — 30일 `open`, 31일 `off`. 대정 — 10/31 `open`, 11/1 `closed`, 10/1(9월은 30일) `open`, 3/1(2월은 28·29일) `open`, 1/1(12월 31일) `closed`, 8/1(7월 31일) `closed`, 2/28·2/29 `off`. 함덕 31일 `off`. KST 경계: 2026-10-01T14:59:59Z는 10/1, 15:00:00Z는 10/2.
- M3(뽑기): 장날에 점수가 같은 카드 중 오일장이 먼저, 점수는 그대로(점수가 높은 카드보다 앞서지 않음). 대정 `closed`인 날 대정 카드 0. 그날도 15지역 × 3범위 × 새로운 거 3탭에서 서로 다른 3장(빈손 0).
- M4(화면): 지금 모드의 장날 → `오늘 장 서는 날`, 날짜 모드의 장날 → `이날 장 서는 날`, 아닌 날 → `장날: 2·7일`. 오일장이 아닌 카드·저장 목록에는 없음. 날짜 모드에서 날짜를 바꾸면 문구가 그 날로, 자정이 지나면 새 오늘로. 320/390에서 가로 넘침 0.
- M5: tsc·vitest·build·check:slop·e2e 통과.
