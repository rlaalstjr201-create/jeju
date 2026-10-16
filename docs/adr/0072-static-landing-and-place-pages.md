# ADR-0072: 정적 랜딩과 장소 페이지 — 허브·지역 15·조합(target만)·장소마다 한 쪽, 사진은 핫링크(끄는 스위치 있음)

Status: Accepted (2026-10-01)

Updated by ADR-0092 (2026-10-16): 7의 홈 `<noscript>`와 허브의 기분 나열이 여섯 가지(「유명한 데 가 보고 싶어」 포함). 지역·조합·장소 쪽은 그대로.

## Context

앱은 JS가 `spots.json`을 그려서, JS를 안 도는 검색·AI 크롤러에게 남는 것은 홈의 161자뿐이었다(`docs/seo/audit-01.md`, `seo:crawl` P0 `site:no-landing-pages`·`page:/:thin-shell`). `specs/seo-landing.md` 초안은 허브와 지역 15쪽을 제안하고 Open Question 6개를 남겼다. 경쟁 조사(`docs/research/competitors-01.md` 4(a))는 #1 장소별 정적 페이지 + 구조화 데이터, #2 지역 × 기분 랜딩, #3 읽히는 슬러그를 권했다. seoulist 사후 분석에서 이긴 층도 개별 장소 쪽이었고(상세 446쪽 중 79% 노출), 진 층은 같은 틀로 찍은 허브 다발이었다.

사용자가 Open Question을 정했다(2026-10-01): 만든다 · 사진을 넣는다(핫링크, 출처 표시) · 결과 아래 작은 링크 + `<noscript>` · 딥링크 `/?area=&mood=` · 영문 슬러그 · 기분별 5곳. 장소 페이지를 더하고, 조합 페이지는 keyword gate를 통과한 것만.

## Decision

1. **페이지**: `/jeju/` 허브 1 · `/jeju/<지역>/` 15 · `/jeju/<지역>/<기분>/` 조합(`data/seo/keywords.json`에서 `judge()`가 target이고 landing이 그 모양인 것만, 빌드가 다시 판정 — 지금 `/jeju/seongsan/new/` 1) · `/jeju/<지역>/<장소 슬러그>/` 장소(품질 기준을 통과한 장소 전부, 지금 2,955). 내용·구조화 데이터는 `specs/seo-landing.md`.
2. **장소 주소**: 영문(로마자) 슬러그. 한글 경로는 공유하면 퍼센트 인코딩으로 깨져 보여 쓰지 않는다. `data/landing/slugs.json`에 id → 슬러그·첫 지역을 적고 **한 번 준 주소는 바꾸지도 다시 주지도 않는다**(이름이 바뀌어도, 장소가 빠져도). 겹치면 `-2`…, 기분 슬러그는 금지. 주소가 없는 장소가 있으면 빌드가 멈추고 `npm run landing:slugs`로 받는다. 지역이 바뀐 장소는 첫 주소에서 301(`_redirects`).
3. **사진(OQ2)**: 장소·지역·조합 페이지에 비짓제주 대표사진을 **API가 주는 `api.cdn.visitjeju.net` URL 그대로 핫링크**한다. 다운로드·자체 캐시·재호스팅 없음(서비스워커도 `/jeju/**`를 캐시하지 않고, 교차 출처 이미지는 원래 캐시하지 않는다), `referrerpolicy="no-referrer"`. 출처: 하단 `정보·사진: 비짓제주(제주관광공사) · visitjeju.net`, 장소 사진 바로 아래 `사진: 비짓제주(제주관광공사)`. JSON-LD `image`도 같은 URL.
   - **위험**: 제주관광공사의 서면 확인이 아직 없다(`docs/licensing-visitjeju.md` 3절 — data.go.kr 「제한 없음」과 이용약관 제14조가 충돌, 업체가 올린 사진은 권리자가 따로일 수 있음). 정적 페이지는 앱보다 **이미지 검색 색인**이 붙기 쉽다 — 제3자 사진이 우리 페이지 이름으로 검색될 수 있다. 공사가 CDN 경로를 바꾸거나 막으면 사진이 깨진다(정적 페이지에는 깨진 사진을 지우는 스크립트가 없어 빈 회색 칸이 남는다).
   - **스위치**: 빌드 환경변수 **`LANDING_PHOTOS=0`** 하나로 사진 없는 모드 — 모든 랜딩에서 `<img>`·장소 `og:image`·JSON-LD `image`가 빠지고 출처가 `정보: 비짓제주(제주관광공사)`로 바뀐다(빌드 검사가 0장을 확인). 앱의 사진(ADR-0023 갱신)과는 별개 스위치다.
   - **끄는 조건**: 공사가 사진 이용을 거절하거나 다른 조건(문구·마크·범위)을 요구할 때, 업체·권리자가 내려 달라고 할 때, 상업화(광고·유료·제휴 수익)를 결정할 때 — 서면 확인이 없으면 그 전에 `LANDING_PHOTOS=0`으로 배포한다. 회신이 오면 이 ADR과 `docs/licensing-visitjeju.md`에 반영한다.
4. **원문 금지**: 비짓제주 소개(introduction)·요약·태그 문장은 싣지 않는다. 장소 이름·좌표·우리 이유 문장·종류·실내·장날·이동 시간만. 빌드가 `review/input`의 원문(intro·summary·comment)과 20자 연속 일치를 대조해 0건을 확인하고, 이유 문장 자체가 원문과 20자 이상 겹치는 장소(지금 9곳)는 장소 페이지를 만들지 않는다(앱에는 남는다).
5. **얇은 페이지 방어(품질 기준)**: 빌드가 모든 랜딩 쌍의 `<main>` 본문 5글자 조각 Jaccard가 0.80 미만인지, 장소 페이지마다 자기 조각이 30% 이상인지, 가까운 곳이 3곳 이상인지 재고 어기면 멈춘다. 기준과 측정 이력은 `specs/seo-landing.md` 「품질 기준」. 문턱을 바꾸려면 새 ADR.
6. **구조화 데이터**: 장소 `TouristAttraction`/`Restaurant`/`CafeOrCoffeeShop` + `GeoCoordinates` + `BreadcrumbList`, `image` 허용(3의 스위치를 따른다), **`aggregateRating` 없음**(ADR-0060: 점수는 리뷰 평점이 아니고 화면에 없다). 허브 `CollectionPage`+`ItemList`, 지역 `TouristDestination`+기분별 `ItemList`.
7. **연결**: 홈 `<noscript>`(엔티티 문장·기분 5개·허브 링크)와 결과 화면 출처 아래 「동네별로 둘러보기」(OQ3) · 허브 ↔ 지역 ↔ 장소 ↔ 앱(딥링크 `/?area=<slug>&mood=<mood>`, ADR-0067) · 이웃 지역 · 가까운 곳 · `llms.txt`의 허브 링크 · `sitemap.xml`(전 URL, lastmod = spots.json 마지막 커밋일, 45,000 넘으면 색인 파일로 나눔) · SITE_URL이 있으면 robots `Sitemap:`.
8. **404**: 없는 주소는 호스트 `404.html`(ADR-0063, SPA 폴백 없음), 거기에 허브 링크를 더한다. 빠진 장소는 404(301 대상 없음). 서비스워커는 `/jeju/**`를 셸로 답하지 않는다(오프라인에서 랜딩 주소가 앱 첫 화면으로 바뀌지 않게).
9. **스타일**: 앱과 같은 토큰(ADR-0070)의 자체 CSS `src/landing.css`(→ `dist/jeju/landing.css`), 스크립트 없음. `check:slop`이 그 CSS와 생성기 문구를 검사한다.

## Consequences

- 빌드 결과가 HTML 3장 → 약 2,975장, `dist/jeju` 약 15MB(장소 쪽 평균 5KB, 지역 쪽 30~55KB — 지역 전체 이름 목록). Cloudflare Pages 파일 수 한도(2만) 안. 빌드가 약 15초 늘어난다(대부분 쌍 유사도 계산).
- `.claude/agents/seo-analyst.md` §5와 `.claude/skills/seo-geo/references/geo.md`의 「정적 페이지에는 사진을 넣지 않는다 / `image` 넣지 않는다」를 이 ADR로 바꾼다(핫링크 허용, `LANDING_PHOTOS=0` 스위치).
- 새 장소가 생기면 `npm run landing:slugs` + 커밋이 한 단계 늘어난다(잊으면 빌드가 알려 준다).
- 붙어 있는 같은 종류의 장소 두 곳(가파도 식당 등)은 쪽끼리 닮는다(최고 0.777). 데이터가 늘어 기준을 넘으면 빌드가 멈추고, 그때는 문턱이 아니라 이유 문장이나 큐레이션을 고친다.
- 이유 문장이 원문을 거의 그대로 옮긴 9곳이 드러났다 — 앱에는 그대로 보인다. 이유를 다시 쓰면 페이지가 생긴다(별도 작업).
- 홈·개인정보 페이지에 canonical이 없는 것(`page:/:no-canonical` 등)은 이 결정 밖이다(audit-01 a-2).
- 사진 위험은 3의 스위치로 되돌릴 수 있지만, 이미 색인된 이미지는 검색엔진이 다시 긁을 때까지 남는다.

## Amendment 1 (2026-10-01): 공사 확인

사용자가 제주관광공사에서 사진 이용 가능 확인을 받았다(`docs/licensing-visitjeju.md` 4절). 기본 배포는 사진 켬(`LANDING_PHOTOS` 미설정)으로 확정한다. 끄는 조건 중 「공사 거절」은 해소, 권리자 요청·상업화 조건은 그대로 둔다.
