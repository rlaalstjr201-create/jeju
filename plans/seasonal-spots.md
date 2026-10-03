# Plan: 계절 명소(철) 1단계

Spec: `specs/seasonal-spots.md`. ADR-0080.

## 단위 (순서대로. 단위마다 검증 → 커밋 → 다음)

| # | 단위 | 주로 건드리는 곳 | 새 테스트·검증 |
|---|---|---|---|
| U0 | U-bloom 확인: API허브 키(주인)로 계절관측 호출 주소·응답·제주 지점별 관측 종·공개 지연·라이선스를 확인해 spec 「관측 데이터」 표를 고친다. 탐침 스크립트는 `docs/research/`에 | `docs/research/kma-season-probe.mjs`(키는 환경 변수만), spec 표 | 확인 못 한 넷이 「확인함」 또는 「없음」으로 바뀜. 제주 지점에 세 종이 모두 없으면 관측형은 0곳으로 기록하고 U-bloom을 건너뛴다 |
| U1 | 판정 데이터: 후보(해수욕장 행 제외) 다시 세기, 판정, 5% 블라인드 재판정 | `apps/web/review/season/`(`season-NN.json`·`drop-NN.json`·`audit.json`) | 대상 모두 keep/drop 기록(스크립트로 대조), keep마다 basis ≤ 40자, 원문 기간형 keep의 `months` 유무 수, 종류별 일치율 표. 일치율은 한 번만 잰다 |
| U-bloom | 관측일 받기: `fetch-blooms.mjs`(API허브 → 포털 Playwright → `failed`), `stations.json`, 주간 작업(ADR-0079)에 한 단계 추가, 주인 확인 1의 결과대로 시즌 중 매일 실행 등록 | 새 `apps/web/scripts/season/fetch-blooms.mjs`, `apps/web/data/season/`, 주간 작업 지시문 | `tests/season-blooms.test.ts`: 고정 응답으로 파싱, `none`/`failed` 구분, 기존 `firstBloom` 바뀌면 멈춤, 키 없으면 `failed`·종료 코드 0. 실제 호출은 U0 확인에서 한 번만. `git grep`으로 키 0건 |
| U2 | 붙이기 스크립트 + spots.json | 새 `scripts/season.mjs`·`season.d.mts`, `build-spots.mjs`(장날 뒤에 한 줄), `public/spots.json`, `src/data.ts`(`season` 형식 검사: `months` 또는 `from/to`, 틀리면 그 필드만 버림) | `tests/season-data.test.ts`: 멱등, 오일장·먹기 0곳, 감사 미달 0곳, 출하 안 된 id면 멈춤, `months: null` 0곳, 가장 가까운 지점·날짜 없으면 안 빌림, 창 = firstBloom+N, 지난해 파일 무시. spots.json 크기 차이를 커밋 메시지에 |
| U3 | 앱: 판정 함수, 정렬 키, 카드 메타 글자, 이벤트 필드 | 새 `src/season.ts`, `pick.ts`(`byRank`에 키 하나), `render.ts`(메타 줄), `style.css`(`.season`은 기존 메타 규칙만, 새 크기·색 없음), `track.ts`, `events/` 값 검사 | `tests/season.test.ts`(S2), 정렬 테스트(S3), 렌더 테스트(S4), e2e 한 항목: 시계 2026-03-10·철 데이터 → `유채꽃 철`, 4/10 → 없음, 고정 `from/to` 벚꽃 창 안·밖, 날짜 모드, 실내 켜짐, 320/390 |
| U4 | 문서 | SPEC §6 결과 카드(장날 줄 아래 「철」), §14 대상(새 문구), §15 e2e 목록, `specs/ranking.md` 정렬 키, `specs/date-mode.md` 두 번째 예외, `specs/usage-events.md` `season` 필드, `docs/context.md`(이미 반영) | 문서 사이 정렬 키 문장이 같은지 grep |

U1은 사람 판단이 드는 데이터 작업이다. U0·U1이 끝나 실릴 수 있는 곳(원문 달이 있는 keep + 관측 지점이 있는 관측형 keep)이 0곳이면 U2~U4를 하지 않고 주인에게 보고한다. U0은 주인의 API허브 키가 있어야 한다. 키가 오기 전에도 U1은 할 수 있다.

## 지킬 불변식

- **번들**: JS+CSS gzip 50KB 이하. 철 글자 표는 10줄 남짓이라 늘어나는 양을 측정해 적는다.
- **슬롭**: 새 문구(`… 철`)도 check:slop 대상. 이모지·배지·칩·「추천」·느낌표 없음. 새 글자 크기·색·굵기 없음.
- **메타 줄**: 카드당 하나. 철 글자는 `.nw`로 묶어 갈라지지 않는다. 320px 가로 넘침 0.
- **장날 동작 불변**: 오일장에는 철이 없다. 장날 정렬·제외·문구(M2~M4)는 기존 테스트 그대로 통과한다. 정렬 키에서 장날이 철보다 앞이다.
- **철이 없으면 그대로**: `season`이 없는 데이터에서 카드·순서·이벤트가 지금과 바이트 단위로 같다(기존 스냅샷·정렬 테스트).
- **원문 비공개**: `basis`·`quote`는 `review/`에만. spots.json·dist·랜딩에 원문 20자 일치 0건(ADR-0072 4 검사 그대로).
- **외부 요청 없음(앱)**: 앱은 정적 데이터만. 기상청 호출은 이 PC의 주기 작업에서만(주인 확인 1에서 Pages Function을 고르면 ADR-0076 개정과 함께 이 줄을 바꾼다).
- **비밀 없음**: `KMA_APIHUB_KEY`는 이 PC 환경 변수. 저장소·로그·`blooms-*.json`에 키·응답 원문 0건.
- **관측일 불변**: 한 번 적힌 `firstBloom`은 바꾸지 않는다. 지난해·평년값으로 메우지 않는다.
- **결과 생성 1회**: 재판정 일치율과 측정 중단 판정은 한 번만 잰다. 못 넘으면 그 종류를 빼고 보고한다.

## 단위마다 검증 (모두 통과해야 커밋)

1. `npx tsc --noEmit`
2. `npx vitest run` — 시작 전 통과 수를 적고 줄지 않는다.
3. `npm run check:slop` 0건
4. `npm run build` 후 JS+CSS gzip 50KB 이하(측정값을 커밋 메시지에)
5. `npm run e2e -w @jeju/web` 전부 통과(시작 전 기준선 기록. 로드맵 3번의 기존 실패가 남아 있으면 그 수를 따로 적는다)
6. U3: 320·390 스크린숏(지금 모드 3월, 날짜 모드, 실내 켜짐) → `apps/web/design/qa/seasonal-spots/`

## 확인 못 한 것

- (U0) API허브 계절관측 호출 주소·인자·응답, 제주 4개 지점별 관측 종, 관측일 공개 지연, 라이선스. 포털 파일 받기에 로그인이 필요한지.

- GA4로 가는 이벤트 매개변수에 새 필드를 더할 때 맞춤 측정기준 등록이 필요한지(ADR-0078 설정, 확인 못 함).
