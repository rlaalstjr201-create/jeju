# Plan: 노을 볼 곳

Spec: `specs/sunset-view.md`. ADR-0083.

## 단위 (순서대로. 단위마다 검증 → 커밋)

| # | 단위 | 주로 건드리는 곳 | 검증 |
|---|---|---|---|
| U1 | 해안선 고정 + 기하 + 후보 + 판정 기준 | `data/coast/`, `scripts/coast-freeze.mjs`, `scripts/sunset-geo.mjs`, `review/sunset/candidates.json`·`criteria.md` | `tests/sunset-geo.test.ts`(합성 섬: 서쪽 해안·내륙·만 건너 본섬·작은 섬 뒤·작은 섬 위). 기준을 판정 전에 커밋 |
| U2 | 판정 + 5% 블라인드 감사(1회) | `review/sunset/sunset-01.json`·`audit-01.json`·`REPORT.md` | basis 원문 대조 스크립트, 후보 전부 기록, 일치율 |
| U3 | 붙이기 스크립트 + spots.json | `scripts/sunset.mjs`·`.d.mts`, `build-spots.mjs`(철 뒤 한 줄), `public/spots.json`, `src/data.ts`(형식 검사), `src/pick.ts`(타입) | `tests/sunset-data.test.ts`: 멱등, 감사 미달 0곳, 출하 안 된 id면 멈춤, basis 원문 대조, spots.json에 basis 없음 |
| U4 | 앱: 방위·창·줄·묶음·출처 | `src/sun.ts`(방위), `src/home.ts`(`sunsetSpots`·`todayActs`), `src/state.ts`(`clock`), `src/app.ts`(시각·경계 타이머·누름), `src/render.ts`, `index.html`(about 출처), `style.css`는 기존 규칙만 | `tests/home.test.ts`·`sun.test.ts` 추가, e2e 한 항목, 스크린숏 `design/qa/sunset/` |
| U5 | 문서 | `docs/context.md` 오늘 판 줄, ADR-0075 개정 줄 | grep |

## 지킬 불변식

- 줄이 없으면 홈 DOM이 지금과 같다(기존 홈 테스트 그대로). 새 글자 크기·색 없음, 기존 `.act`·`.more-sec`·`.mk` 규칙만.
- `build:spots`를 다시 돌리지 않는다(이유 문장 516곳 기존 차이). `sunset.mjs`만 출하본에 적용.
- 원문 비공개: `basis`는 `review/`에만.
- 감사는 한 번. 못 넘으면 싣지 않고 기록.
- JS+CSS gzip 50KB 이하.
