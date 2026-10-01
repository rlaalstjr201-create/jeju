# Light Spec (초안): 정적 랜딩 — P를 위한 제주 무계획 여행

상태: **초안 — 결정 전.** Open Question이 풀리면 ADR을 발행하고(CLAUDE.md 워크플로 3단계) `plans/seo-landing.md`로 간다.
근거: `docs/seo/audit-01.md` (b), `docs/seo/keyword-research-01.md`, `.claude/agents/seo-analyst.md` §0·§2·§5.

## 왜

앱은 JS가 `spots.json`을 읽어 카드를 그린다. 빌드 결과에는 HTML이 홈·개인정보 안내 2장뿐이고 홈의 정적 본문은 161자다(`npm run seo:crawl`).
그래서 검색어가 도착할 페이지가 없고, JS를 실행하지 않는 AI 크롤러(OAI-SearchBot·PerplexityBot·ClaudeBot 등)는 P의 여행이 무엇이고 어떤 곳을 추천하는지 읽을 수 없다.

## 무엇을 (단계)

| 단계 | 페이지 | 수 | 조건 |
|---|---|---|---|
| 1 | `/jeju/` 허브 — h1 「P를 위한 제주 무계획 여행」 | 1 | keyword gate target 「제주도 무계획 여행」 |
| 1 | `/jeju/<지역>/` 세부 지역 | 15 | 구조(허브 → 지역 → 앱). 특정 헤드 검색어를 노리지 않는다 — 제목은 포지션 문장 |
| 2 | `/jeju/<지역>/<기분>/` 기분 조합 | target 수만큼(지금 1: `/jeju/seongsan/new/`) | 그 조합의 검색어가 keywords.json target일 때만. 15×4 전부 만들지 않는다 |

15 × 4 = 60쪽을 한꺼번에 만들지 않는 이유: 같은 틀로 찍은 얇은 페이지 다발은 seoulist가 이미 졌던 모양이다(이중언어 950쪽 중 허브 층 다수 lost-shape, `docs/seo/seoulist-postmortem.md`). 수요·경쟁이 확인된 조합만 쪽을 준다.

지역 슬러그: hangyeong · hallim · aewol · sinjeju · gujeju · jocheon · gujwa · udo · daejeong · andeok · jungmun · seogwipo · namwon · pyoseon · seongsan.
기분 슬러그: rest · walk · new · food (화면 이름과 1:1, `docs/context.md`).

## 페이지 내용

**허브 `/jeju/`**
- 첫 문단 = 엔티티 한 줄 정의 그대로(`references/positioning.md`). 이어서 2~3문장: 일정·코스를 짜 주지 않는다 · 지금 있는 곳과 기분 하나로 3곳 · 이동 시간으로 고른다.
- 기분 5개 설명(화면 이름 그대로).
- 세부 지역 15곳 링크 — 이름 + 대표 지명(「조천(함덕)」).
- 「앱에서 지금 3곳 받기」 → `/`.
- 하단 출처 표시.

**지역 `/jeju/<지역>/`**
- title: `{지역}({대표 지명}) 근처, 지금 갈 만한 곳 · 여행계획짜기 귀찮아:제주`
- h1: `{지역} 근처에서 지금 뭐 할까`
- 첫 문단: 그 지역 한 문장(우리가 쓴 문장 — 비짓제주 원문 금지) + 「기분 하나만 고르면 근처 3곳」.
- 기분별 절 4개(쉬기·걷기·새로운 거·먹기[식사·카페 합쳐서]): 만족도 점수 순(ADR-0060) 상위 **6곳**, 각 `이름 — 이유 문장(reason)`, 카카오맵 링크. 점수·평점은 보이지 않는다.
- 이웃 지역 2~3곳 링크(지리 순), 허브 링크, 앱 링크(그 지역 기준으로 여는 딥링크는 OQ4).
- 하단 출처 표시 + 데이터 갱신일(spots.json 버전).

**기분 조합 `/jeju/<지역>/<기분>/`** (2단계)
- 지역 페이지의 그 절을 넓힌 것: 상위 **12곳**, 「지금 여기서 차로 N분」 대신 지역 중심 기준 거리 문구(정적 페이지에는 사용자 위치가 없다).
- 제목은 target 검색어의 말을 쓴다(예: 「성산 근처 체험, 지금 할 만한 곳 · 여행계획짜기 귀찮아:제주」).

## 지킬 것

- **라이선스**(`docs/licensing-visitjeju.md`): 비짓제주 소개·태그 원문 금지. `name`·좌표·우리 `reason`·순서만. **사진 넣지 않음**(OQ2). 하단 `정보: 비짓제주(제주관광공사) · visitjeju.net`.
- **화면과 같은 구조화 데이터**: 허브 `CollectionPage`+`ItemList`+`BreadcrumbList`, 지역 `TouristDestination`+기분별 `ItemList`(ListItem → `TouristAttraction`/`Restaurant`/`CafeOrCoffeeShop`, name, geo, url=카카오맵)+`BreadcrumbList`. `aggregateRating`·`image` 없음.
- canonical 자기참조(절대 URL), `lang="ko"`, description ≤ 80자 안팎.
- 앱 셸과 같은 토큰의 자체 CSS(404.html·privacy.html과 같은 방식), 스크립트 없음.
- `sitemap.xml`에 `/`·`/jeju/`·지역 15·조합 페이지. `lastmod` = spots.json 갱신일.
- 문구는 `check:slop` 규칙을 통과한다(같은 금지어).

## 어떻게 만들까 (구현 후보 — plan 단계에서 정한다)

- 빌드 후 단계 스크립트 `scripts/build-landing.mjs`: `public/spots.json` + `src/areas.ts`의 지역 표를 읽어 `dist/jeju/**/index.html`·`dist/sitemap.xml`을 쓴다. `npm run build`에 이어 붙인다(`"build": "vite build && node scripts/build-landing.mjs"`).
- 장소 → 지역 배정은 앱과 같은 「가장 가까운 지역 중심」 규칙(`nearestArea`)을 쓴다. 규칙을 두 벌 두지 않는다.
- 순서는 앱과 같은 정렬(점수 → id)을 쓴다. 지역 중심 기준이라 앱의 「가까운 순」과 다를 수 있다 — 페이지에 「앱에서는 지금 위치 기준으로 다시 고른다」를 적는다.
- 서비스워커는 `/jeju/**`를 캐시하지 않는다(앱 셸이 아니다).

## Open Questions

| # | 질문 | 후보 |
|---|---|---|
| OQ1 | 정적 랜딩을 만든다(제품 범위가 「앱 1장」에서 넓어진다) | 만든다(이 초안) / 안 만든다 — 그러면 GEO·롱테일 검색은 포기하고 브랜드 검색만 |
| OQ2 | 랜딩에 사진을 넣나 | 넣지 않는다(권장 — 재호스팅·이미지 색인 쟁점 회피) / 핫링크 썸네일 |
| OQ3 | 홈(앱 첫 화면)에서 `/jeju/`로 가는 보이는 링크 | 하단 작은 텍스트 링크 / `<noscript>`에만 / 없음(사이트맵만 — 고아에 가까워진다) |
| OQ4 | 랜딩의 「앱에서 3곳 받기」가 그 지역을 기준으로 열리나 | `/?area=애월` 같은 파라미터(앱 변경 필요) / 그냥 `/` |
| OQ5 | URL을 영문 슬러그로 | 영문(권장 — 공유 시 깨지지 않음) / 한글 경로 |
| OQ6 | 지역 페이지 상위 몇 곳 | 기분별 6곳(권장) / 3곳(앱과 같은 수 — 정적 본문이 얇아진다) |

## 성공 기준

- L1: `npm run seo:crawl`에서 `site:no-landing-pages`·`page:/:thin-shell`이 사라진다(홈 `<noscript>` 포함).
- L2: 랜딩 전부 `page:*` 감사 발견 0(title에 제주, canonical 절대, JSON-LD 유효, h1).
- L3: 고아 0, 홈에서 3홉 안, 사이트맵 대조 불일치 0.
- L4: 랜딩 HTML에 비짓제주 `introduction` 원문 문장이 0건(빌드 검사로 대조), `api.cdn.visitjeju.net` 이미지 0건, 출처 표시 100%.
- L5: 기존 vitest·e2e·check:slop 통과, 앱 셸 크기·첫 화면 동작 변화 0.
