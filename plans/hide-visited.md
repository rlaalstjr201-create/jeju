# Plan: 가 본 곳 빼기

Spec: `specs/hide-visited.md`. ADR-0087. 구현은 주인이 스펙 요지를 승인한 뒤에 시작한다.

## 단위 (순서대로, 단위마다 검증 → 커밋)

| # | 단위 | 주로 건드리는 곳 | 테스트 |
|---|---|---|---|
| V1 | 저장과 상태 | `store.ts`(키 `visited`, 읽기 검증·500 상한·실패 시 메모리), `state.ts`(`visited: string[]`), 동작 `toggleVisited`·`unvisitAll` | `tests/visited-store.test.ts`: 왕복, 잘못된 값 고쳐 읽기, 중복, 상한, `setItem` 던짐·저장소 없음에서도 상태는 바뀜 |
| V2 | 고르기 | 결과·「예:」·노을·장날이 함께 받는 장소 배열을 한 곳에서 거른다. `app.ts`·`home.ts`에서 `pool`/`islandTop`/`sunsetSpots`/장날로 넘기기 직전에 `visited`를 뺀 배열을 만든다. `pick.ts`의 `listed`와 데이터의 `hide`는 건드리지 않는다 | `pick.test`: 뺀 곳 0곳이면 기존과 같음, 뺀 곳은 안 나옴, 다시 넣으면 나옴. 15지역×3범위 빈손 조건 불변. 노을 3곳 기준이 거른 뒤 수로 정해짐 |
| V3 | 카드 버튼 | `render.ts` 카드(첫 장 `div.ctl`, 줄 카드는 길찾기 줄), `style.css`(기존 `.tbtn` 규칙만), 누름 처리는 그 노드만 바꿈, 상태 줄 문구 | `scenarios.test`: 누름 → `aria-pressed`·상태 줄, 카드 노드 동일, 다른 3곳에서 빠짐. 렌더 스냅샷: 뺀 곳 없을 때 기존과 같음(버튼 줄 추가분은 예상 변경으로 기록) |
| V4 | 해제 경로 | 저장한 곳 화면 「뺀 곳 N곳」 펼침·다시 넣기·모두 다시 넣기, 설정 쪽 입구(지금 설정 시트 구조를 읽고 「지도 앱」·「기록 끄기」 근처에 같은 `.tbtn`) | `keep-app.test`/`scenarios.test`: 1곳 이상일 때만 보임, 다시 넣기 후 수·목록, 비면 사라짐, 저장 0개에서도 설정 입구로 닿음 |
| V5 | 기록 | `track.ts` 이벤트 `visited`·`unvisited`, `events/validate.ts` 이름 목록, `aggregate.ts`는 장소 인기 집계에 넣지 않음 | `track.test`·`events` 테스트: id만, 기록 끄기 0건, 모르는 이름 거름 |
| V6 | 문서·e2e | SPEC 6.5·6.12·9·15.1, `docs/context.md`, `specs/usage-events.md`, `privacy.html`(+ `deploy.test`의 문구 검사), e2e 한 항목(빼기 → 안 나옴 → 다시 넣기 → 나옴, 저장소 던짐 상태), 320/390 스크린숏 `apps/web/design/qa/hide-visited/` | e2e 전부 통과 |

## 지킬 것

- 뺀 곳이 없으면 카드·순서·홈 DOM이 지금과 같다. 카드 버튼 줄은 예외로, 예상 변경이다.
- 새 글자 크기·색·면 없음. check:slop 0건. 확인 창·토스트·배지 없음.
- JS+CSS gzip ≤ 50KB.
- e2e는 SITE_URL을 비우고 다른 세션과 겹치지 않는 포트로 돌린다.
- 독립 리뷰(ADR-0058)를 거친 뒤 배포는 주인 승인으로 한다.

## 확인 못 한 것

- 설정 쪽 입구 자리: 최근 H5(설정 분리) 이후 구조를 V4 시작 때 읽고 정한다.
