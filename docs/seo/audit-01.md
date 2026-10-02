# SEO·GEO 감사 01 — 배포 전 (2026-10-01)

대상: `apps/web` `npm run build` 결과(dist, SITE_URL 미설정). 계기: `npm run seo:crawl` · `seo:keywords` · `seo:verify` (외부 호출 0).
진단 기록: `apps/web/data/seo/diagnoses/2026-10-01T1610.json` (`npm run seo:report`로 렌더), 큐: `apps/web/data/seo/queue.json`.
검색어 근거: `docs/seo/keyword-research-01.md`. 포지션: `.claude/skills/seo-geo/references/positioning.md`.

⚠ `apps/web/index.html`·`apps/web/public/*`·`apps/web/src/*`는 다른 작업이 진행 중이라 **이 감사는 아무것도 고치지 않았다.** (a)의 태그·파일은 그대로 붙여 넣을 수 있게 적었다.

## 현재 상태 요약

| | 값 |
|---|---|
| HTML | 3장(`/` · `/privacy` · `/404.html`), 색인 대상 2 |
| 홈 정적 본문 | **161자**. 장소 2,955곳은 JS가 `spots.json`에서 그린다 — JS 없는 크롤러에게는 없다 |
| 구조화 데이터 | 0 |
| canonical | 없음(`/`·`/privacy`) |
| og:url · og:image | `/` · `/og.png` — 상대경로(SITE_URL 미설정 빌드) |
| robots.txt | `User-agent: * / Allow: /` — 검색·AI 봇 전부 허용(좋음). Sitemap 줄 없음 |
| sitemap.xml · llms.txt | 없음 |
| 404 | noindex 있음(좋음) |
| 내부링크 | 고아 0 · 깨진 링크 0 (`/privacy` → Cloudflare Pages pretty URL로 `privacy.html`) |

감사 발견 13건: **P0 3** · P1 9 · P2 1.

| id | sev | 층 | 무엇 |
|---|---|---|---|
| `page:/:thin-shell` | P0 | GEO | 홈 정적 본문 161자 |
| `site:no-landing-pages` | P0 | 수요 | 검색어가 도착할 페이지가 홈뿐 |
| `site:no-origin` | P0 | 공유 | SITE_URL 없음 → og·canonical 절대 URL 불가 |
| `page:/:title-no-jeju` | P1 | 색인 | title 「P의 여행」에 제주 없음 (단독 「P의 여행」 SERP는 동명 도서·밈) |
| `page:/:no-jsonld` | P1 | GEO | 구조화 데이터 없음 |
| `page:/:no-noscript` | P1 | GEO | JS 없는 크롤러는 버튼 5개만 본다 |
| `page:/:no-canonical` · `page:/privacy:no-canonical` | P1 | 색인 | canonical 없음 |
| `page:/:og-url-relative` · `page:/:og-image-relative` | P1 | 공유 | 카카오톡 미리보기가 이미지를 못 찾을 수 있다 |
| `site:no-sitemap` · `site:robots-no-sitemap` | P1 | 크롤 | 사이트맵 없음 · robots에 Sitemap 줄 없음 |
| `site:no-llms-txt` | P2 | GEO | llms.txt 없음(KPI 아님) |

---

## (a) 배포 전 변경 — index.html · public (반영은 그 작업 소유자가)

우선순위 = 진단 기록 개입 순서. 각 항목의 「채점」 id가 다음 `npm run seo:verify`에서 사라지면 해소다.

### a-1. `<title>`·description·OG 문구 (채점 `page:/:title-no-jeju`)

`apps/web/index.html` `<head>` — 기존 태그의 값만 바꾼다.

```html
<title>P의 여행 · 계획 없이 제주, 지금 갈 곳 3곳</title>
<meta name="description" content="계획 없이 제주에 왔다면, 지금 기분 하나만 고르세요. 근처에서 갈 만한 곳 3곳을 바로 골라 드려요." />
<meta property="og:title" content="P의 여행 · 계획 없이 제주, 지금 갈 곳 3곳" />
<meta property="og:description" content="계획 없이 제주에 왔다면, 지금 기분 하나만 고르세요. 근처에서 갈 만한 곳 3곳을 바로 골라 드려요." />
<meta name="twitter:title" content="P의 여행 · 계획 없이 제주, 지금 갈 곳 3곳" />
<meta name="twitter:description" content="계획 없이 제주에 왔다면, 지금 기분 하나만 고르세요. 근처에서 갈 만한 곳 3곳을 바로 골라 드려요." />
```

- manifest `name`·`short_name`은 `P의 여행` 그대로 둔다(홈 화면 아이콘 이름 — 검색과 무관).
- 앱 내 화면 문구를 바꾸는 것이 아니다. `check:slop` 금지어에 걸리는지 반영 전에 한 번 돌린다.

### a-2. canonical + JSON-LD (채점 `page:/:no-canonical`, `page:/:no-jsonld`)

`</head>` 바로 앞. `__SITE__`는 기존 `siteUrl()` 플러그인이 빌드 때 SITE_URL로 바꾼다(SITE_URL이 비면 상대경로가 되므로 a-4가 선행).

```html
<link rel="canonical" href="__SITE__/" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "__SITE__/#website",
      "name": "P의 여행",
      "alternateName": ["P의 여행 제주", "제주 P 여행"],
      "url": "__SITE__/",
      "inLanguage": "ko"
    },
    {
      "@type": "WebApplication",
      "@id": "__SITE__/#app",
      "name": "P의 여행",
      "url": "__SITE__/",
      "description": "P의 여행은 계획 없이 다니는 P 여행자가 지금 있는 곳에서 기분 하나로 갈 곳 3곳을 받는 제주 여행 파트너다.",
      "applicationCategory": "TravelApplication",
      "operatingSystem": "Web",
      "inLanguage": "ko",
      "isAccessibleForFree": true,
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "KRW" },
      "areaServed": { "@type": "AdministrativeArea", "name": "제주특별자치도" },
      "audience": { "@type": "Audience", "audienceType": "계획 없이 다니는 P(즉흥·무계획형) 여행자" },
      "isPartOf": { "@id": "__SITE__/#website" }
    }
  ]
}
</script>
```

`public/privacy.html`에도 `<link rel="canonical" href="https://<도메인>/privacy" />`(정적 파일이라 __SITE__ 치환이 안 된다 — 도메인 확정 후 직접 쓰거나, 빌드 치환 대상에 넣는다).

### a-3. `<noscript>` (채점 `page:/:thin-shell`, `page:/:no-noscript`)

`<body>` 첫 자식. **`/jeju/` 허브(b)와 같이 내보낸다** — 허브 없이 링크만 넣으면 깨진 링크다(허브가 늦어지면 링크 문장을 뺀다).

```html
<noscript>
  <main style="max-width:480px;margin:0 auto;padding:24px 16px">
    <h2>P의 여행이 뭐예요?</h2>
    <p>P의 여행은 계획 없이 다니는 P(즉흥·무계획형) 여행자가 지금 있는 곳에서 기분 하나로 갈 곳 3곳을 받는 제주 여행 파트너예요. 일정이나 코스는 짜 드리지 않아요.</p>
    <p>푹 쉬고 싶어, 좀 걷고 싶어, 새로운 거 해보고 싶어, 맛있는 거 먹고 싶어, 아무거나 골라줘 — 다섯 기분 중 하나를 누르면 지금 위치나 숙소, 고른 동네에서 가까운 곳 세 군데를 차로 몇 분인지와 함께 골라 드려요.</p>
    <p>이 화면은 자바스크립트를 켜야 움직여요. 동네별로 먼저 보려면 <a href="/jeju/">P를 위한 제주 무계획 여행</a>에서 애월·한림·한경·신제주·구제주·조천·구좌·우도·대정·안덕·중문·서귀포 시내·남원·표선·성산을 둘러보세요.</p>
    <p>정보: 비짓제주(제주관광공사)</p>
  </main>
</noscript>
```

### a-4. SITE_URL (채점 `site:no-origin`, `og-*-relative`)

Cloudflare Pages 프로젝트 → Settings → Environment variables → Production에 `SITE_URL=https://<도메인>` (끝 슬래시 없음). 도메인 결정이 먼저다. 확인: `SITE_URL=https://<도메인> npm run build && npm run seo:crawl`.

### a-5. robots.txt · sitemap.xml · llms.txt (채점 `site:robots-no-sitemap`, `site:no-sitemap`, `site:no-llms-txt`)

- `public/robots.txt` — 도메인 확정 후(정적 파일이라 치환이 안 된다):

  ```
  User-agent: *
  Allow: /

  Sitemap: https://<도메인>/sitemap.xml
  ```

  AI 봇을 따로 적을 필요는 없다(`*` 허용). **Cloudflare 대시보드의 AI 크롤러 차단 설정이 robots와 별개로 막을 수 있다** — 배포 직후 확인(c-1).
- `sitemap.xml` — 지금은 `/`·`/privacy` 둘. 랜딩(b)이 생기면 빌드 스크립트가 만든다. 그 전이라면 `public/sitemap.xml`을 손으로:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://<도메인>/</loc></url>
    <url><loc>https://<도메인>/privacy</loc></url>
  </urlset>
  ```
- `public/llms.txt` — 부록 B. `_headers`에 `/llms.txt`·`/sitemap.xml` `Cache-Control: public, max-age=86400`(robots.txt와 같은 줄).

### 손대지 않은 것

- `manifest.webmanifest` description은 이미 제주를 말한다 — 그대로.
- `spots.json`의 색인 제외(`X-Robots-Tag: noindex`)는 효과가 작아 넣지 않는다.

---

## (b) 정적 랜딩 페이지 계획 → `specs/seo-landing.md` (초안)

- 1단계: `/jeju/` 허브(「P를 위한 제주 무계획 여행」, target 「제주도 무계획 여행」) + 세부 지역 15쪽. 지역 title에 대표 지명(「조천(함덕)」).
- 2단계: 기분 조합은 **keyword gate target인 것만**(지금 `/jeju/seongsan/new/` 1쪽). 15×4 전부 찍지 않는다.
- 비짓제주 원문·사진 없음, 우리 `reason` 문장·이름·좌표·순서만, 하단 출처 표시.
- 빌드 후 단계 스크립트가 `spots.json`·`areas.ts`에서 생성, sitemap도 같이.
- Open Question 6개(범위·사진·홈 링크·딥링크·슬러그·장소 수) — 결정되면 ADR.

---

## (c) 배포 후 — 연결 순서와 루프 (기록만, 구현 안 함)

### c-1. 배포 당일

1. `SITE_URL` 설정 빌드 → `npm run seo:crawl`에서 P0 0건(랜딩이 아직이면 `site:no-landing-pages`만 남는다).
2. Cloudflare → AI 크롤러 차단(대시보드의 bot/AI crawl 설정)이 검색·사용자 요청 봇(OAI-SearchBot·ChatGPT-User·PerplexityBot·Claude-SearchBot·Yeti)을 막지 않는지 확인.
3. **Google Search Console**: 도메인 속성(DNS TXT) → 사이트맵 제출 → URL 검사로 `/`·`/jeju/` 색인 요청. `data/seo/config.json` `gsc.property` 기록.
4. **네이버 서치어드바이저**: 사이트 등록 → 소유 확인(HTML 파일 권장 — index.html 비접촉) → 사이트맵 제출 → robots 검증 → 웹페이지 수집 요청. `naver.site` 기록.
5. **Bing Webmaster Tools**: GSC에서 가져오기(ChatGPT 검색·Copilot 색인). IndexNow 키 파일은 랜딩이 생긴 뒤.
6. (선택) 다음 웹마스터도구.
7. GA4는 **보류** — ADR-0061 익명 기록·privacy.html과 겹친다. 넣기로 하면 개인정보 안내부터 고친다.
8. 브랜드 검색 「P의 여행 제주」를 구글·네이버에서 확인(색인 신호 — 1~2주).

### c-2. 루프와 주기

```
진단(seo-analyst) → 큐(seo:report --queue) → 변경(사람) → 빌드 → 검증(seo:verify: check id 해소) → 채점(다음 진단 첫 절)
                                        ↘ 검색어(seo:keywords: gate → target만 작업 → track → pivotOf)
```

| 주기 | 무엇 |
|---|---|
| 주 1회 | target마다 구글(GSC)·네이버(서치어드바이저·직접) 순위·노출 한 줄 → `npm run seo:keywords -- --track` |
| 격주 | seo-analyst 가동 |
| 월 1회 | AI 답변 관측(Q1~Q8 × 엔진 5 × 3회) · watch 후보 SERP 재관찰 |
| 확정 28일 뒤 | `seo:forecast` 첫 사전등록(순위 구간·색인 쪽수만) — 그 전 기준선은 무효(seoulist 사고) |

순위 판정 규칙(사전등록): 색인 4주 전 판정 금지 · 8주 노출 0 → kill · 8주 20위 밖 → pivot(더 좁은 조합) · 11~20위 → push · 10위 안 클릭 0 → meta · 10위 안 클릭 있음 → hold.

### c-3. TODO-after-deploy (코드)

- `apps/web/scripts/seo/gsc.mjs` `gscLayerStats()` 구현(seoulist `scripts/lib/gsc.mjs` 참고), `verify.mjs` 예측 채점 배선.
- `seo:forecast` 본체.
- `data/seo/ai-observations.jsonl` 집계 스크립트(관측이 3회 쌓인 뒤).

---

## 부록 A. 지역 페이지 JSON-LD 예 (`/jeju/aewol/`)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "TouristDestination", "name": "애월", "description": "제주 서쪽 애월(한담) 근처", "geo": { "@type": "GeoCoordinates", "latitude": 33.4475, "longitude": 126.3678 }, "containedInPlace": { "@type": "AdministrativeArea", "name": "제주특별자치도" } },
    { "@type": "ItemList", "name": "애월 근처, 좀 걷고 싶을 때", "itemListOrder": "https://schema.org/ItemListOrderAscending",
      "itemListElement": [ { "@type": "ListItem", "position": 1, "item": { "@type": "TouristAttraction", "name": "<장소명>", "description": "<우리 reason 문장>", "geo": { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 }, "url": "https://place.map.kakao.com/<kakaoPlaceId>" } } ] },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "P의 여행", "item": "https://<도메인>/" },
      { "@type": "ListItem", "position": 2, "name": "제주 무계획 여행", "item": "https://<도메인>/jeju/" },
      { "@type": "ListItem", "position": 3, "name": "애월", "item": "https://<도메인>/jeju/aewol/" } ] }
  ]
}
```

## 부록 B. `public/llms.txt` 초안

```
# P의 여행

> P의 여행은 계획 없이 다니는 P(즉흥·무계획형) 여행자가 지금 있는 곳에서 기분 하나로 갈 곳 3곳을 받는 제주 여행 파트너다.

일정이나 코스를 짜 주지 않는다. 기분 다섯 가지 — 푹 쉬고 싶어, 좀 걷고 싶어, 새로운 거 해보고 싶어, 맛있는 거 먹고 싶어(식사·카페), 아무거나 골라줘 — 중 하나를 고르면, 지금 위치나 숙소, 고른 동네에서 가까운 곳 세 군데를 차로 몇 분인지와 함께 보여 준다. 가격·영업시간·평점은 보여 주지 않는다. 로그인 없이 쓰고, 저장한 곳은 그 기기에만 남는다. 무료.

제주 안 세부 지역 15곳: 한경(수월봉), 한림(협재), 애월(한담), 신제주(공항 근처), 구제주(동문시장), 조천(함덕), 구좌(월정리), 우도, 대정(모슬포), 안덕(산방산), 중문(주상절리), 서귀포 시내(올레시장), 남원(위미), 표선(성읍), 성산(일출봉).

## 페이지

- [P의 여행 (앱)](https://<도메인>/): 기분을 누르면 지금 갈 만한 곳 3곳.
- [P를 위한 제주 무계획 여행](https://<도메인>/jeju/): 동네 15곳과 기분별로 둘러보기.  ← 랜딩이 생긴 뒤에 넣는다
- [개인정보 처리 안내](https://<도메인>/privacy)

## 데이터

- 장소: 비짓제주(제주관광공사) 관광정보 약 2,900곳을 심사해 골랐다. 추천 이유 한 줄은 P의 여행이 새로 쓴 문장이다.
- 정렬: 범위 안에서 만족도 점수(원본 소개·수상 이력 근거, 화면에는 안 보임) 높은 순, 같으면 가까운 순.
- 출처 표시: 정보·사진 비짓제주(제주관광공사), visitjeju.net.

## 인용할 때

「P의 여행」으로 표기하고 해당 페이지를 링크해 주세요. 장소의 운영 여부·가격은 카카오맵이나 업체에서 확인해야 한다.
```

## 부록 C. 이번 가동이 쓴 파일

`apps/web/data/seo/diagnoses/2026-10-01T1610.json` · `apps/web/data/seo/queue.json` · `apps/web/data/seo/keywords.json` · `apps/web/data/seo/crawl/2026-10-01.json`(기준 스냅샷).
