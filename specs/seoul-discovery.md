# Light Spec — 서울 매일 발굴 (ADR-0123)

## 출처 (무료만)

| 무엇 | API | 키(.env 이름만) | 쓰는 곳 |
|---|---|---|---|
| 글 모으기·근거 | 네이버 검색 블로그·뉴스 | NAVER_CLIENT_ID·NAVER_CLIENT_SECRET | 후보 재료, 후보별 근거, 신상 8주·폐업 확인 |
| 공식 사이트 | 네이버 검색 지역 `v1/search/local.json`의 `link` | 같음 | 그림 출처 페이지 |
| 장소 | 카카오 로컬 키워드 | KAKAO_REST_API_KEY | 서울 주소·좌표·링크·체인 수·폐업 신호 |

키는 출력·파일·커밋 어디에도 남기지 않는다. 카카오는 모든 `review/*/kakao-calls.log` 합산 하루 3,000회.

## 명령 (`apps/web`에서, 하루 한 번씩 순서대로)

| 명령 | 하는 일 | 호출 |
|---|---|---|
| `node scripts/seoul-discovery/discover.mjs collect` | 검색어 표 → `days/D/raw.json`, 옮겨 적기 묶음 `days/D/extract/in-NN.txt` | 네이버 188 |
| (하위 에이전트, 기계적) | `extract/in-NN.txt` → `extract/out-NN.json` | — |
| `… queue` | 장부·체인·유흥 거르기, 하루 60곳 → `days/D/pick.json`, 남은 것 `queue.json` | 없음 |
| `… enrich` | 근거 → `days/D/judge/in-NN.json` | 네이버 120, 카카오 ≤ 120 |
| (새 Opus, 묶음마다) | `judge/in-NN.json` + 기준 → `judge/out-NN.json` | — |
| `… ship` | 형식·같은 상호 → `data/seoul/discovery-seoul.json`, 장부 | 없음 |
| `… images` | 그날 실린 것의 og:image | 네이버 지역·페이지·그림 |
| `… sweep` | 끝남·신상 8주·폐업 | 네이버·카카오 (실린 수만큼) |
| `… audit-sample` (7일마다) | 지난 감사 뒤 실린 것 40 + drop 20 → `audit/in-W.json` | 없음 |
| (새 Opus) | `audit/in-W.json` + 기준 → `audit/out-W.json` | — |
| `… audit-result` | 게이트, 미달이면 되돌림 → `audit/result-W.md` | 없음 |

첫 회차만 `ship --hold`(자료에 넣지 않고 `days/D/hold.json`) → 감사 → 통과하면 `ship --release`. 즐길 거리 그림 일괄 1회: `node scripts/seoul-discovery/fun-images.mjs`(→ `review/seoul-discovery/fun-images-01.json`, `fun-seoul.json`의 `img`·`imgFrom`·`imgPage`).

## 장부 (`review/seoul-discovery/ledger.json`)

- `names`: 이름(공백·기호 뺀 것, 소문자) → `{ status, day, cid? }`. status: `shipped`·`dropped`·`reverted`·`ended`·`retired`·`closed`·`known`(이미 즐길 거리)·`seed`(이번 주 서울 01회 후보)·`bad`(형식 어긋남).
- `kakao`: 카카오 id → `{ status, day, name }`(새로 연 곳·가게만).
- `posts`: 글 링크 → 본 날(30일 뒤 지움).
- `audits`: 감사 날짜·게이트·되돌린 수. `lastAudit`: 마지막 감사 날짜.

## 자료 (`data/seoul/discovery-seoul.json`의 `items[]`)

`이번 주 서울`(`weekly-seoul.json`)의 칸에 더해:

| 칸 | 뜻 |
|---|---|
| `id` | `dc-` + 카카오 id + 시작일 |
| `kind` | 팝업·전시·마켓·축제·행사·새로 연 곳 |
| `word` | 새로 연 곳의 업종 낱말(카페·베이커리·…·칵테일바), 그 밖 `""` |
| `line`·`hood` | 새로 연 곳의 카드 줄 「<낱말> · <동네 또는 구>」, 동네(hoods-01 중심 700m 안) |
| `stay` | 8주 뒤 올라간 갈래(`G8`·`G4`·`G10`), 없으면 칸 없음 |
| `img`·`imgFrom`·`imgPage` | 그림 주소(https), 출처 이름, 출처 페이지 — 없으면 칸 없음 |
| `added` | 실린 날 |

## 앱

- `weekly.ts`: 두 파일의 기간 있는 항목(새로 연 곳 아닌 것)을 이번 주 항목으로. 종류 「행사」의 보통 시간 11–20시.
- `fun.ts`: 발굴 자료의 새로 연 곳을 즐길 거리 항목으로 — 문 연 날 전이면 없음, `end`까지 갈래 `NEW`(선반 `fresh` 「새로 생긴 곳」), 그 뒤엔 `stay`가 있으면 그 갈래, 없으면 없음. 보통 시간은 낱말로(가게 낱말 12–20시를 더함).
- 카드 그림(`browse-view.ts`): `img`가 있으면 그 주소를 직접(`loading=lazy`, 화면에 가까워질 때만, `referrerpolicy=no-referrer`, 서울 홈에선 시작 화면 동안 `data-later`), 실패하면 타일. 상자 크기는 즐길 거리·이번 주 4:3, 행사 포스터 5:7 그대로.
- 타일(그림 없음·실패): 종류 아이콘 + 동네 이름 + 노선 줄과 역 동그라미. 이름은 타일 밑 글자.
- 카드 시트: 그림이 있으면 「그림: <출처 이름>」.
- 개인정보 안내 4개 언어: 카드 그림을 출처 사이트에서 직접 받는다는 문단.

## 성공 기준

- 첫 회차: 수집 → 판정 → 감사 1회씩, 게이트(실린 표본 keep 일치 90%) 통과일 때만 자료에 넣는다.
- 테스트: 자료 형식, 장부 거르기·하루 상한·같은 상호 한 곳(엔진 순수 함수), 8주 뒤 올림·내려감·폐업, 끝난 것 0장, `fresh` 선반과 순서표, 그림 있는 카드·실패 시 타일·no-referrer·지연.
- 한국어 진입 gzip ≤ 70,000 B, tsc·vitest 기본·nation·busan 실패 0, check:jeju 기준선 그대로.
