# ADR-0125: apps/web/src를 기능 폴더로 나눈다

Status: Accepted (2026-11-06, 주인 요청 「새로운 걸 계속 추가하다 보니 꼬이거나 기능별로 폴더 구분이 안 된 건 아닌지」 → 구조 검수 → 「시작해」).

## Context

- `src/`에 TypeScript 파일 43개가 한 폴더에 있었다. 서울·부산·전국·제주 기능 파일이 이름만으로는 구분되지 않았다.
- 10-15 아키텍처 리뷰(루트 `architecture_review.md`)는 무게가 `app.ts`·`render.ts`에 몰린다고 보았다(그 뒤 각각 1,182→1,863줄, 1,548→2,064줄). 그 제안 2·3(두 파일 안을 기능 모듈로 덜어 내기)은 아직 하지 않았다. 폴더가 먼저 있어야 덜어 낸 모듈이 갈 자리가 생긴다.

## Decision

1. 맨 위 `src/`는 앱 뼈대만 둔다: `main`·`app`·`render`·`state`·`store`·`nav`·`effects`·`types`·`dates`·`deeplink`·`keep`·`start`·`later`·`update`·`yield`·`logo`, `style.css`·`landing.css`, `env.d.ts`.
2. 기능은 폴더로 묶는다.
   - `pick/`: 장소 고르기와 카드(`data`·`pick`·`card-text`·`hours`·`season`·`market`·`sun`·`home`·`links`)
   - `region/`: 여행지·지역과 출시 스위치(`dest`·`areas`·`busan`·`busan-part`·`nation`·`nation-part`·`release`)
   - `seoul/`: 서울 둘러보기 선반(`browse`·`browse-view`·`browse.css`·`fun`·`weekly`·`freshness`)
   - `culture/`: 오늘 근처 문화생활(`culture`·`culture-view`). 제주 홈도 쓰므로 서울 폴더에 두지 않는다.
   - `usage/`: 사용 기록·분석·설문(`track`·`analytics`·`survey`)
   - `i18n/`: 그대로
3. 파일 이름은 바꾸지 않는다. 그래서 빌드 조각 이름(`busan-part-*.js` 등)이 그대로다. 옮기기만 하고 코드는 바꾸지 않는다(상대 경로만 다시 씀).
4. 새 기능 파일은 맞는 폴더에 넣는다. 맞는 폴더가 없으면 새 폴더를 만들고 이 ADR에 Amendment로 적는다.

## Consequences

- 옛 ADR·plans·specs·review 문서에 적힌 `src/<이름>.ts` 경로는 고치지 않는다(그때의 기록). 지금 위치는 위 표와 `apps/web/design/SPEC.md` 12절에서 찾는다.
- 검증: 옮기기 전후 `tsc` 통과, vitest 기본 1853·전국 1958·부산 1876 통과(같은 수), `check:jeju` 「Jeju unchanged」, 한국어 진입 gzip 61,027→61,025 B.
- 다음 단계(따로 결정): `app.ts`·`render.ts` 안의 기능 덩어리를 이 폴더들로 덜어 낸다(10-15 리뷰 제안 2·3).

## Amendment 1 (2026-11-07)

- 폴더 셋을 더한다(ADR-0126): 그리기 구역은 `src/view/`, 기능 컨트롤러는 `src/flow/`, 화면 문구는 `src/copy.ts`.
- `scripts/` 맨 위의 제주 자료 스크립트(약 22개, `.mjs`·`.d.mts` 짝)는 옮기지 않는다.
  - 이 스크립트들은 저장소 루트를 `resolve(dirname(…), '..')`로 찾는다. 옮기면 경로 계산을 손으로 고쳐야 한다.
  - 그런데 그 중심인 `build:spots`는 실행하지 않기로 한 규칙이라, 고친 뒤 제대로 도는지 확인할 길이 없다.
  - 서울 스크립트는 이미 `seoul-*` 폴더에 있다.
- 문서 자리를 정리했다.
  - 리뷰 기록은 `docs/reviews/`로 모았다.
  - 정합성 감사는 `docs/audit/2026-10-03/`로 옮겼다.
  - 루트의 `codex_review.md`·`architecture_review.md`는 CLAUDE.md 워크플로 산출물 자리라 그대로 둔다.
  - 옛 2026-05 아키텍처 리뷰는 `docs/reviews/architecture-review-2026-05.md`로 이름을 바꿨다.
