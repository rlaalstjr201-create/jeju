# Plan: 유명한 데 가 보고 싶어

Spec: `specs/famous-places.md`. ADR-0092.

## 단위 (순서대로. 단위마다 검증 → 커밋)

| # | 단위 | 주로 건드리는 곳 | 검증 |
|---|---|---|---|
| U1 | 문서 | `docs/adr/0092`·README·0028·0072·0075 머리 줄, `docs/context.md`, `specs/famous-places.md`, `specs/seo-landing.md`, 이 파일 | grep |
| U2 | 붙이기 스크립트 + spots.json | `scripts/famous.mjs`·`.d.mts`, `build-spots.mjs`(밤 산길 다음 한 줄), `public/spots.json`, `src/data.ts`(형식 검사), `src/pick.ts`(타입) | `tests/famous-data.test.ts`: 규칙과 출하본이 같음, 멱등, 카페 3곳 아님, 먹기 0, 올레 코스 0 |
| U3 | 앱: 버튼·고르기·예시·기록 | `src/pick.ts`, `src/home.ts`, `src/render.ts`, `src/app.ts`, `src/store.ts`, `src/deeplink.ts`, `index.html`, `events/validate.ts`, `scripts/analytics-report.mjs` | `tests/famous-pick.test.ts`(성산·서귀포·비·밤·아무거나), 기존 테스트 기대값(기분 목록) 바꿈 |
| U4 | 랜딩·llms·SPEC | `scripts/landing.ts`(허브 목록), `public/llms.txt`, `apps/web/design/SPEC.md` | `tests/landing.test.ts`, `seo:crawl` 감사 0 |
| U5 | 전체 검증 + 첫 화면 숫자 | — | tsc, vitest, `check:slop`, build gzip, e2e, 375×812 측정 → spec 4절 |

## 지킬 불변식

- `build:spots`를 돌리지 않는다. `famous.mjs`만 출하본에 적용한다.
- 장소의 `mood`는 바뀌지 않는다. `famous`는 고르는 버튼일 뿐이다.
- 새 글자 크기·색·CSS 규칙은 없다. 기분 줄 부품을 그대로 쓴다.
- 개인정보: 새 필드·새 이벤트가 없다. `mood` 값 하나만 는다.
- JS+CSS gzip 50KB 이하.
