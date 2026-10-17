# 외국어 검색 노출 진단 — 랜딩 착수 전 (2026-10-17)

seo-analyst 가동 `2026-10-17T2310` — 기록 `apps/web/data/seo/diagnoses/2026-10-17T2310.json`, 큐 `apps/web/data/seo/queue.json`, 검색어 판정 `apps/web/data/seo/keywords.json`(외국어 후보 29건, `lang` 칸). 직전 기록과 3일 안이라 `rerun_reason`을 남겼다. 구글·바이두 결과 화면은 보지 않았다. 경쟁 판단은 WebSearch(미국 엔진) 24회 프록시이고, 수요는 구글 자동완성(언어별 hl·gl)과 바이두 자동완성이다.

## 결론

**지금 외국어 검색에서 잡힐 수 있는 주소는 0개다. 그런데 노릴 만한 외국어 검색어도 거의 없으므로(target 1개), 랜딩을 번역해 늘리기 전에 「노릴지와 범위」부터 정하고, 그보다 먼저 한국어 홈이 구글에 영어로 읽히는지 5분 안에 확인해야 한다.**

## 1. 지금 막혀 있는 것

| 층 | 상태 | 근거 |
|---|---|---|
| 크롤 | 막힘 없음 | robots `Allow: /`(Baiduspider·Googlebot 포함). 이번에 실제 주소에 두 크롤러 UA로 요청했고 모두 200을 받았다(한국 망에서 UA만 바꿔 보낸 것) |
| 색인 | **외국어 URL 0** | 사이트맵 2,940쪽이 모두 `<html lang="ko">`이고 `<link rel=alternate hreflang>`은 0이다. `/privacy-en·ja·zh-Hans`는 noindex다. `/?lang=en`은 canonical이 `/`이고 원본 HTML은 한국어다. 번역 2,938곳은 JS가 받는 `/i18n/places.*.json`에만 있다 |
| 정책 | 의도된 상태 | ADR-0093 결정 3: 「랜딩을 건드리지 않는 조건 안에서는 외국어 검색 유입을 노리지 않는다」. 외국어 주소를 만들려면 이 결정부터 고쳐야 한다 |
| GEO | 얇음 | 홈 JSON-LD는 `inLanguage: "ko"`인데 화면은 4개 언어다. llms.txt에는 영어 문장이 없고 `lang` 행만 있다 |
| **위험** | 확인 실패 | 언어 고르기 스크립트는 `navigator.languages`에 ko·-KR이 없으면 영어로 그리고 문서 제목도 바꾼다. Googlebot은 미국에서 Accept-Language 없이 크롤한다(구글 문서). 렌더러의 언어 값은 확인하지 못했다. 영어라면 한국어 브랜드 검색을 받는 홈 `/`가 영어 내용으로 색인될 수 있다 |

## 2. 먼저 할 일 (정렬 규칙순 4건 + 확인 3건)

**1. 외국어 검색을 노릴지 주인이 정한다 (P1, ADR)**
- 노린다면 ADR-0093 결정 3을 고친다. 주소는 경로형 `/<lang>/jeju/<지역>/`으로 하고, 쪽마다 자기 canonical과 한국어 쪽과 서로 가리키는 hreflang, 언어별 사이트맵을 둔다. 앱 `?lang=`은 그대로 둔다.
- 범위는 keyword gate target이 있는 지역 쪽만이다. 지금은 `/zh-Hans/jeju/seongsan/` 하나다. 장소 2,921쪽 × 3언어(8,763쪽)는 만들지 않는다.
- 기대 효과: 외국어 색인 URL이 0에서 1~수십이 된다. 유입 규모는 예측하지 않는다(규칙).
- 비용: 주인 결정 하나, ADR 개정 한 쪽.
- 근거: GSC 색인은 514/2,940(10-16)이다. 새 도메인에서 쪽을 3배로 늘리면 한국어 쪽(국내 방문 약 84%) 크롤 순서를 밀어낸다. 그리고 gate가 내준 외국어 target은 1개뿐이다.

**2. 홈이 구글에 무슨 언어로 읽히는지 확인한다 (P1, 사람 5분)**
- 순서: GSC URL 검사 → `https://yeochana.com/` → 실시간 테스트 → 렌더된 HTML의 `<html lang>`과 h1. Bing URL 검사로도 한 번 본다. 결과는 `data/seo/console/`에 적는다.
- 영어로 나오면 ADR-0093 개정 안건으로 올린다. 안: 홈 `/`는 첫 방문에도 자동 전환하지 않고 늘 한국어로 열고, 다른 언어는 권유 줄로 고르게 한다(구글 권장: 브라우저 언어로 자동 전환하지 말 것). 한국어로 나오면 닫는다.
- 기대 효과: 외국어 이득이 아니라 한국어 홈 색인을 지키는 일이다. 비용은 5분이다.
- 근거: dist/index.html 15행 스크립트, 구글 locale-adaptive 문서.

**3. 홈 JSON-LD `inLanguage`를 4개 언어로, llms.txt에 고정 영어 엔티티 문장 1줄 (P2, 제안만)**
- WebApplication의 `inLanguage`를 `["ko","en","zh-Hans","ja"]`로 바꾼다. WebSite는 쪽 글이 한국어라 `"ko"` 그대로 둔다.
- llms.txt 제안 문장: 「In English: Yeochana:Jeju is a travel companion for spontaneous (MBTI P) travelers — wherever you are in Jeju right now, pick one mood and get 3 places to go. The app also runs in English, Simplified Chinese and Japanese (?lang=en|zh-Hans|ja).」 주인이 승인하면 이 문장을 고정하고, 어디서나 같은 말로 쓴다.
- 기대 효과: 영어 AI 답변이 「영어로 되는 제주 앱」을 말할 근거가 생긴다. 1회 관측을 성과로 읽지 않는다.
- 비용: 두 줄. ADR-0093 결정 3(JSON-LD 한국어 그대로)의 작은 개정이 필요하다.
- 근거: P 의도의 외국어 말(jeju no plan·済州 ノープラン·济州 不做攻略)은 자동완성이 모두 0이다. 이 말들은 페이지로 노릴 것이 아니라 엔티티 문장으로만 닿는다.

**4. (1번이 「노린다」일 때만) 중국어 간체 성산 지역 쪽 1개 시범 (P2, landing)**
- 검색어는 「城山日出峰附近景点」(8/10, 외국어 유일 target)이다. 구글 zh-CN과 바이두 자동완성 양쪽에 있다(바이두: 附近景点推荐·附近有什么景点). 프록시 1쪽은 bendibao·qunar·dcfever 같은 집계·커뮤니티라 포털 벽이 아니다. 재고는 성산의 식사·카페를 뺀 59곳이다.
- 기대 효과: 외국어 쪽 틀(hreflang·언어별 사이트맵)이 실제로 색인되는지 쪽 하나로 재 본다. 기대 유입은 작다. 본토 사용자는 구글을 못 쓰고, 바이두 도달은 확인 실패다. 그래서 받을 수 있는 사람은 해외 간체 사용자(싱가포르·말레이시아·화교·VPN)로 좁다.
- 비용: landing.ts의 언어 분기, 테스트, 중국어 제목 문구 승인. 색인 8주 동안 노출이 0이면 `pivotOf`대로 접는다.

**확인할 것(investigate)**
- **바이두**: 본토에서 열리는지, 얼마나 느린지, 색인이 되는지 모두 확인 실패다. 다음 확인으로 주인이 세 가지를 1회씩 한다. ① 본토 다지점 측정(17ce·boce 같은 무료 서비스) ② GreatFire 검사 요청(지금은 「아직 검사 안 됨」) ③ 바이두 `site:yeochana.com`. 그 전에는 바이두용 작업을 하지 않는다.
- **영어 동네 검색어 실제 구글 1쪽**: 대상은 things to do in seogwipo(8/10, SERP 미관측)와 things to do near seongsan ilchulbong·things to do in aewol(프록시상 Expedia·hotels.com 벽)이다. 주인이 시크릿 창에서 1회 보면 경쟁 점수를 다시 매긴다. 영어 지역 쪽을 1번 범위에 넣을지가 이 결과로 정해진다.
- **GSC 국가별 실적**: 중국·일본·미국·대만에서 지금 한국어 쪽 노출이 있는지 본다. 이것이 외국 유입 기준선이다. 아직 읽지 않았다.

## 3. 언어별 keyword gate (29개 — target 1 · watch 15 · kill 13)

경쟁 점수는 모두 최대 1이다(결과 화면 미관측, 프록시). 상세는 keywords.json에 있다.

**영어(12)**
- kill: jeju itinerary(K1, 자동완성 전부 N days) · things to do in jeju(K3, Agoda·Expedia·여행 매체) · aewol cafe street(K3, OTA 9/9) · seongsan ilchulbong(K1·K3, 명소 정보 의도) · jeju solo travel(K1)
- watch: jeju rainy day activities·jeju indoor activities(7, 수요는 있으나 섬 전체 목록 의도) · things to do in seogwipo(8, SERP 미관측) · things to do near seongsan ilchulbong·things to do in aewol(6, 의도는 우리 것인데 OTA 벽) · what to do in jeju today(5, 「today」여도 결과는 섬 전체 목록) · jeju no plan(수요 0)

**일본어(8)** — 수요가 세 언어 중 가장 얇다. 동네 단위 자동완성은 「西帰浦 観光」 하나뿐이다.
- kill: 済州島 観光(K3, エアトリ·HIS·NEWT) · 済州島 観光 モデルコース(K1) · 済州島 カフェ(K3) · 城山日出峰(K1·K3) · 済州島 一人旅(K1)
- watch: 済州島 雨の日(6) · 西帰浦 観光(7, SERP 미관측) · 済州 ノープラン(수요 0)

**중국어 간체(9)**
- kill: 济州岛攻略(K1·K3, 携程) · 济州岛景点(K3) · 济州岛自由行(K1)
- target: **城山日出峰附近景点(8)**
- watch: 济州岛下雨天怎么玩(7, 바이두 자동완성 10개로 비 오는 날 수요가 가장 두껍지만 섬 전체 의도) · 涯月邑景点(8, SERP 미관측) · 咸德海水浴场附近景点(7) · 济州岛小众景点(6) · 济州 不做攻略(수요 0)

읽는 법:
- 외국어에서도 한국어와 같은 모양이 나온다. 섬 전체 머리는 OTA·여행사 벽이고, 남는 자리는 대표 지명 근처(일출봉·성산·서귀포·애월·함덕)다.
- 장소명 + 언어에서 수요가 보이는 것은 대표 명소뿐이고, 모두 정보 의도라 kill이다. 작은 가게의 외국어 표기 이름은 자동완성 신호가 없다. 한국어 쪽처럼 가게 이름으로 들어오는 길은 외국어에서는 보이지 않는다.
- 비 오는 날은 세 언어 모두 수요가 있다. 다만 섬 전체 목록 의도라 watch다. 동네 단위 말(예: what to do in seogwipo when it rains, 자동완성에 있음)로 좁혀 다시 본다.

## 4. 바이두 — 현실적 평가

- **점유율**: 중국 모바일 검색에서 바이두는 대략 65~78%다(StatCounter 2025, 2차 출처). 그러나 여행 계획은 샤오훙수(小红书)로 옮겨 갔다. 플랫폼 자체 수치로 사용자 80% 이상이 출발 전에 그곳에서 여행 가이드를 검색한다. 제주의 중국 본토 방문객은 2026년 1~5월 외국인 도착의 64.2%다.
- **ICP 비안**: 색인 자격 조건은 아니라는 출처(Chinafy)가 있다. 사실상 필요하다는 출처(WE Interactive·The Egg)도 있는데, 둘 다 본토 호스팅을 파는 회사다. 공통된 지적은 비안보다 국경 너머 속도와 방화벽 차단이 실제 장애라는 것이다.
- **Cloudflare 일반 망**: 본토 거점이 없다. Cloudflare는 본토 전달에 별도 China Network(JD Cloud, 비안 필요)를 요구한다. pages.dev가 막힌다는 보고가 있지만 일화 수준이다. yeochana.com은 GreatFire에서 아직 검사되지 않았다.
- **렌더링**: 바이두는 JS 렌더링이 약하다. 앱(`/?lang=zh-Hans`)은 바이두에게 사실상 빈 쪽이다. 바이두가 읽을 수 있는 것은 정적 랜딩뿐이다.
- **사이트맵**: 바이두가 2025년 12월 XML 사이트맵 직접 제출을 끝냈다는 보고가 1건 있다(The Egg). 확인 실패.
- **판단**: 해외 호스팅·비안 없음·중국어 정적 쪽 0·중국 쪽 링크 0이다. 이 조건에서 바이두 색인과 순위는 기대하기 어렵다. 다만 「색인 불가」를 확정할 근거도 없다. 본토 도달 측정 3가지(2절 investigate)가 나오기 전까지는 **확인 실패**로 남긴다. 중국 본토 방문객에게 닿는 현실적인 길은 바이두 검색보다 샤오훙수 같은 앱 안 배포일 가능성이 크다. 이것은 검색 개입이 아니라 주인의 배포 결정이라 큐에 올리지 않았다.

## 5. 손대지 않는 것
- 섬 전체 머리 검색어(세 언어 모두)와 명소 이름 + 언어: kill.
- 장소 2,921쪽의 외국어판: 한국어 색인 대기(2,413쪽)가 풀리기 전에는 만들지 않는다.
- 홈 meta description·OG·noscript·manifest의 한국어: 그대로 둔다(ADR-0093 3·11).
- `?lang=` 주소에 hreflang alternate 달기: 하지 않는다. canonical이 `/` 하나라 충돌한다.

## 출처 (WebSearch·WebFetch)
- [Google — Locale-adaptive pages](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages?hl=ko) · [Google — Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?authuser=6) · [Google 2015 locale-adaptive 블로그](https://developers.google.com/search/blog/2015/01/crawling-and-indexing-of-locale)
- [Chinafy — ICP 없이 바이두 순위](https://www.chinafy.com/blog/do-you-need-an-icp-license-to-rank-on-baidu) · [WE Interactive — 2026 China SEO](https://we-interactive.com/insights/how-to-get-on-baidu-search-results-the-2026-china-seo-strategy) · [The Egg](https://www.theegg.com/?p=48029) · [The Egg — 바이두 순위 요인](https://www.theegg.com/seo/china/5-seo-ranking-factors-for-global-brands-in-china) · [MS Advisory — ICP](https://msadvisory.com/icp-license-china/)
- [Cloudflare China Network 문서](https://developers.cloudflare.com/china-network/index.md) · [LowEndSpirit — Pages 차단 보고](https://lowendspirit.com/discussion/8352) · [Kinsta — Great Firewall](https://kinsta.com/blog/great-firewall-of-china-cloud-platforms/) · [GreatFire yeochana.com](https://en.greatfire.org/yeochana.com)
- [StatCounter 중국 모바일 검색](https://gs.statcounter.com/search-engine-market-share/mobile/china) · [Marketmechina 2025-07](https://www.marketmechina.com/baidu-search-engine-market-share-in-china-jul-2025/) · [i-click — 샤오훙수 여행](https://kr.i-click.com/iclick-news/interest-led-journeys-how-cultural-travel-trends-are-shaping-chinas-outbound-travel-on-xiaohongshu/) · [Sigma — 제주 외국인 2026](https://sigma.world/pt-br/news/chegadas-de-turistas-estrangeiros-a-jeju-aumentam-em-2026/) · [JoongAng Daily — 중국인 관광객](https://www.koreajoongangdaily.com/lifestyle/chinese-tourists-to-jeju-show-changed-travel-tendencies/10559304)
- SERP 프록시(대표): [Agoda 7일 일정](https://www.agoda.com/travel-guides/south-korea/jeju-island/ultimate-7-day-itinerary-for-jeju-island-explore-the-best-of-south-koreas-hidden-gem) · [ivisitkorea 비 오는 날](https://www.ivisitkorea.com/things-to-do-in-jeju-on-a-rainy-day/) · [Expedia Aewol](https://www.expedia.com.hk/cn/Jeju-City-Aewol.dx6337943) · [hotels.com 성산 근처](https://hotels.com/de1682474/hotels-near-seongsan-ilchulbong-seogwipo-south-korea) · [airtrip.jp](https://www.airtrip.jp/travel-column/26883) · [trvlogue 雨の日](https://www.trvlogue.com/ja/jeju-rainy-day-east-travel) · [携程 济州](https://gs.ctrip.com/html5/you/gsdestination/juhe/21411/d1.html) · [bendibao 城山日出峰](https://m.bendibao.com/show553872_2.html) · [qunar](https://touch.travel.qunar.com/comment/4539391)

---

# seo:report 렌더 (그대로)


> ⚠ 이 기록에 문제가 있다:
> - 주의 개입 1: post-deploy인데 affected_impressions가 null
> - 주의 개입 1: check 없음 — verify.mjs가 자동 채점할 감사 id가 없다(사람이 채점해야 한다)
> - 주의 개입 2: post-deploy인데 affected_impressions가 null
> - 주의 개입 2: check 없음 — verify.mjs가 자동 채점할 감사 id가 없다(사람이 채점해야 한다)
> - 주의 개입 3: post-deploy인데 affected_impressions가 null
> - 주의 개입 3: check 없음 — verify.mjs가 자동 채점할 감사 id가 없다(사람이 채점해야 한다)
> - 주의 개입 4: post-deploy인데 affected_impressions가 null
> - 주의 개입 4: check 없음 — verify.mjs가 자동 채점할 감사 id가 없다(사람이 채점해야 한다)

## 지난 진단 채점
`2026-10-16T0614` 기록의 항목별 판정:

| # | 판정 | 근거 |
|---|---|---|
| 1 | **채점 불가** | 이행됐다(e6b019c). verify 조건 충족 — dist/jeju/aewol/ h2#rain 절에 장소 링크 5개와 /?area=aewol&indoor=1, dist/jeju/udo/에는 없음. 효과(애월 실내 놀거리 순위)는 4주 전이라 판정하지 않는다(pivotOf) |
| 2 | **이행 안 됨** | config.json naver.collect_requested가 빈 배열이고 sitemap_submitted_at도 비어 있다(2026-10-17 확인) |
| 3 | **맞았다** | 이행됐다(09752de). tests/landing.test.ts 단추 문구만 다른 두 장소 쪽 해시가 같다는 검사 통과(21/21, 2026-10-17 실행), 이번 빌드의 오늘 lastmod는 2쪽(/ · /privacy)뿐 — 단추 문구가 lastmod를 흔들던 원인이 진단대로였고 고쳐졌다 |
| 4 | **채점 불가** | 이행됐다(602d312). verify 조건 충족 — dist/sitemap.xml이 sitemapindex, core 19 URL에 /jeju/와 지역 15쪽, 16파일 합 2,940 = seo:crawl 색인 대상. 효과(GSC 사이트맵별 색인 수)는 주인 재제출 뒤 GSC 화면으로 본다 — 아직 기록 없음 |

## 판정 요약
단계 **post-deploy** · 창 2026-10-06 ~ 2026-10-13

| 계기 | 결과 |
|---|---|
| `build` | ✔ SITE_URL=https://yeochana.com npm run build — 2,938쪽(허브 1·지역 15·조합 1·장소 2,921), 사이트맵 색인 + 16파일 2,940 URL(core 19). 빌드가 data/landing/lastmod.json(/ · /privacy 2줄)을 바꿔 git checkout으로 되돌렸다 |
| `seo:crawl` | ✔ 감사 0건 · 고아·도달 불가·3홉 초과·깨진 링크 0 · 사이트맵 2,940 = 색인 대상. 외국어 관련 감사 항목은 없다(이 계기는 언어를 재지 않는다) |
| `seo:verify` | ✔ 큐 4건 모두 사람 채점(check 없음) · 게이트 오류 0 · 감사 P0 0 · gsc API 미연결 · bing 등록됨(조회 없음) |
| `seo:keywords` | ✔ 검증 오류 0 · 주의 1(城山日出峰附近景点 target인데 landing 없음 — 외국어 랜딩이 없어서다) · 외국어 후보 29 추가(en 12·ja 8·zh-Hans 9): target 1·watch 15·kill 13 |
| `자동완성(구글 언어별 hl·gl + 바이두)` | ✔ 저장소 밖 일회 스크립트 2묶음(겹치지 않는 검색어 44+19개). seo:keywords --suggest는 hl=ko·gl=kr 고정이라 쓰지 않았다. 0건: jeju spontaneous·jeju without plan·jeju no plan·済州 ノープラン·済州 涯月·涯月 観光·済州 城山 観光·咸徳 ビーチ 周辺·济州 不做攻略 |
| `WebSearch(SERP 프록시)` | ✔ 24회(상한 30). 미국 엔진 결과이지 구글·야후재팬·바이두 결과 화면이 아니다 — 경쟁 점수 최대 1 |
| `dist 언어 신호(grep)` | ✔ html lang=ko 2,940/2,940 · link rel=alternate hreflang 0 · privacy-en/ja/zh-Hans noindex · 홈 canonical / · 홈 JSON-LD inLanguage ko 2곳 · llms.txt 영어 문장 0(lang 행 1) · 언어 스위치 a hreflang 4개(/?lang=…) |
| `live 응답(curl)` | ✔ https://yeochana.com/jeju/seongsan/ — Baiduspider·Googlebot UA 모두 200(39,023B, cloudflare). 한국 망에서 UA만 바꾼 것이라 실제 바이두 크롤러·본토 망 도달은 확인 실패 |
| `google-serp` | — ADR-0079 — 구글 결과 화면을 긁지 않는다 |
| `baidu-serp·본토 도달` | ✘ 바이두 결과 화면·site: 조회·본토 측정을 하지 않았다(이 환경에 본토 망 없음). GreatFire yeochana.com 아직 검사 안 됨. 확인 실패 |
| `gsc(화면)` | — 이번에 새로 읽지 않았다 — 창은 직전 기록(10-06~10-13) 그대로. 국가·언어별 노출은 확인 실패 |

외국어 검색에서 잡힐 수 있는 주소가 지금 0개다. 사이트맵 2,940쪽은 모두 html lang=ko이고, 외국어 개인정보 3쪽은 noindex이며, 앱의 ?lang= 주소는 canonical이 / 하나로 모이고 원본 HTML은 한국어다. 번역 2,938곳은 JS가 받는 JSON(/i18n/places.*.json)에만 있다. 고장이 아니라 ADR-0093 결정 3(외국어 검색 유입을 노리지 않는다)대로다. 언어별 keyword gate 29개는 target 1(城山日出峰附近景点)·watch 15·kill 13다. 섬 전체 머리(jeju itinerary·things to do in jeju·済州島 観光·济州岛攻略)는 OTA·여행사·携程 벽이거나 일정 의도라 버린다. 남는 자리는 한국어와 같은 대표 지명 근처 모양(things to do near seongsan ilchulbong·things to do in seogwipo·城山日出峰附近景点·涯月邑景点)인데, 영어는 프록시 결과가 Expedia·hotels.com 벽이고 중국어는 본토 사용자가 쓰는 바이두의 색인·도달이 확인 실패다. 더 급한 것은 방어다: 언어 고르기 스크립트가 navigator.languages에 ko가 없으면 영어로 그리므로, 구글·빙 렌더러가 홈 /를 영어로 읽을 수 있다(확인 실패, GSC 실시간 테스트 5분). 지난 큐 4건 중 3건이 이행됐다(75%, 상한 5).

## 개입 목록 — 정렬 규칙순

### 1. 외국어 검색을 노릴지 주인이 정한다 — 노린다면 ADR-0093 결정 3을 고쳐 경로형 외국어 주소(/zh-Hans/jeju/<지역>/ 등)·hreflang 쌍·언어별 사이트맵을 허용하고, 범위는 gate target이 있는 지역 쪽부터(장소 2,921쪽 × 3언어는 하지 않는다)
P1 · 자격 `dist 언어 신호: 색인 가능한 외국어 URL 0(html lang=ko 2,940/2,940 · hreflang alternate 0 · 외국어 개인정보 noindex) · keyword gate 외국어 29: target 1 · watch 15 · kill 13` · 원인 색인 층 · 영향 노출 — (배포 전)

- **근거** dist grep 2026-10-17: html lang=ko 2,940/2,940, hreflang alternate 0, /privacy-en·ja·zh-Hans noindex, 홈 canonical / · ADR-0093 결정 3 「랜딩을 건드리지 않는 조건 안에서는 외국어 검색 유입을 노리지 않는다」 · seo:keywords 외국어 target 1(城山日出峰附近景点 8/10) · 구글 Search Central: 언어마다 다른 URL + hreflang 권장, Googlebot은 Accept-Language 없이 미국에서 크롤
- **왜 지금** 번역 데이터(2,938곳 이름·이유 문장 × 3언어)는 이미 있는데 검색엔진이 볼 수 있는 주소가 0이다. 그러나 gate가 내준 target은 1개이고 그마저 도달이 좁다(본토는 바이두, 확인 실패). 그래서 전부 번역 쪽을 만드는 것이 아니라 노릴지와 범위를 먼저 정해야 랜딩 착수가 헛돌지 않는다. GSC 색인 514/2,940(10-16)인 새 도메인에 쪽을 3배로 늘리면 한국어 쪽 크롤 순서를 밀어낸다
- **어디** 주인 결정 → docs/adr/0093-english-chinese-japanese.md Amendment(또는 새 ADR). 제안: (1) 외국어 쪽은 /<lang>/jeju/<지역>/ 경로, 쪽마다 html lang·자기 canonical·한국어 쪽과 서로 가리키는 link rel=alternate hreflang(ko·en·zh-Hans·ja 중 있는 것 + x-default=한국어), sitemap-<lang>.xml. (2) 앱 ?lang=는 그대로(검색 대상 아님). (3) 범위: keyword gate target이 있는 지역 쪽만 — 지금은 /zh-Hans/jeju/seongsan/ 하나. 외국어 장소 쪽은 한국어 색인 대기(2,413쪽)가 풀리기 전에는 만들지 않는다. (4) 본문은 우리 이유 문장 번역(places.*.json)과 장소 이름만 — 비짓제주 원문 번역 없음(licensing). (5) 길찾기는 모든 언어 네이버지도(ADR-0071·ADR-0093 7)
- **검증** docs/adr/에 외국어 검색 범위를 정한 개정(Amendment 또는 새 ADR)이 있고, 그 안에 URL 꼴·hreflang·범위(지역 쪽 몇 개)가 적혀 있다 — 또는 노리지 않는다를 다시 확인한 기록이 있다

### 2. GSC URL 검사 실시간 테스트로 홈 /의 렌더된 HTML이 한국어인지 확인한다 — 렌더러 언어 목록에 ko가 없으면 언어 고르기가 영어로 그린다
P1 · 자격 `dist index.html 언어 고르기 스크립트(ADR-0093 2-3): ?lang·저장값이 없고 navigator.languages에 ko·-KR이 없으면 en·zh·ja, 목록이 차 있는데 셋 다 없으면 en → html lang 교체·문서 제목 교체` · 원인 색인 층 · 영향 노출 — (배포 전)

- **근거** dist/index.html 15행 언어 고르기 스크립트 — 한국어가 없는 브라우저는 영어 · 구글 Search Central locale-adaptive 문서: Googlebot은 미국 IP·Accept-Language 없음 · Googlebot 렌더러의 navigator.languages 값은 WebSearch 1회로 확인 실패 · 홈은 지금 한국어 브랜드 검색어(yeochana 1위, 10-16 기록)를 받는 쪽
- **왜 지금** 외국어 유입을 얻는 문제가 아니라 국내 84%가 쓰는 한국어 홈 색인을 잃지 않는 문제다. ADR-0093 배포(10-17)로 새로 생긴 위험이고, 확인 비용은 5분이다
- **어디** 사람 — GSC → URL 검사 → https://yeochana.com/ → 실시간 URL 테스트 → 테스트한 페이지 보기 → HTML의 html lang 값과 h1 글자, 스크린샷. Bing Webmaster URL 검사로도 한 번. 결과를 data/seo/console/<날짜>.json google.home_render_lang(·bing.home_render_lang)에 적는다. 영어로 나오면 ADR-0093 개정 안건으로 「홈 /는 첫 방문에 자동 전환하지 않고 늘 한국어, 다른 언어는 권유 줄로 고르게」 안을 올린다(구글 권장 — 브라우저 언어로 자동 전환하지 말 것). 한국어로 나오면 닫는다
- **검증** data/seo/console/에 2026-10-17 이후 날짜 파일이 있고 google.home_render_lang 값(ko 또는 en)이 적혀 있다

### 3. 홈 JSON-LD WebApplication의 inLanguage를 실제 화면 언어 넷(ko·en·zh-Hans·ja)으로, llms.txt에 고정된 영어 엔티티 문장 한 줄을 더한다
P2 · 자격 `dist index.html JSON-LD inLanguage ko(WebSite·WebApplication) — 화면은 4개 언어 · llms.txt 영어 문장 0 · keyword gate jeju no plan·済州 ノープラン·济州 不做攻略 수요 0(P 의도는 엔티티로만 닿는다)` · 원인 GEO 층 · 영향 노출 — (배포 전)

- **근거** dist grep 2026-10-17: inLanguage ko 2곳 · llms.txt에 Jeju·English 0회 · seo:keywords 외국어 P 의도 3개 모두 자동완성 0
- **왜 지금** 외국어 쪽을 만들지 않더라도, 영어 AI 답변이 「제주 앱, 영어 되나」에 답할 사실이 지금 정적 글에 없다. 화면과 같은 사실만 더하므로 비용이 작고 되돌리기 쉽다
- **어디** index.html 홈 JSON-LD WebApplication: inLanguage를 [ko, en, zh-Hans, ja] 배열로(WebSite는 ko 그대로 — 쪽 글이 한국어). public/llms.txt 엔티티 문단 바로 아래 한 줄 제안: 「In English: Yeochana:Jeju is a travel companion for spontaneous (MBTI P) travelers — wherever you are in Jeju right now, pick one mood and get 3 places to go. The app also runs in English, Simplified Chinese and Japanese (?lang=en|zh-Hans|ja).」 영어 문장은 주인 승인 뒤 고정해 다른 곳에서도 같은 말로 쓴다. 사람이 반영(ADR-0093 결정 3 「JSON-LD는 한국어 그대로」에 대한 작은 개정 — description 글은 한국어 그대로)
- **검증** dist/index.html WebApplication JSON-LD의 inLanguage가 ko·en·zh-Hans·ja 네 값을 가진 배열이고, dist/llms.txt에 In English: 로 시작하는 줄이 하나 있다

### 4. (1번이 노린다일 때만) 중국어 간체 성산 지역 쪽 하나를 시범으로 낸다 — /zh-Hans/jeju/seongsan/, 한국어 /jeju/seongsan/과 hreflang 쌍
P2 · 자격 `keyword gate target 城山日出峰附近景点 8/10(수요 2: 구글 zh-CN·바이두 자동완성 · 경쟁 1: 프록시 1쪽 bendibao·qunar·dcfever, 포털 벽 아님 · 의도 2 · 재고 성산 식사·카페 뺀 59곳)` · 원인 경쟁 층 · 영향 노출 — (배포 전) · 검색어 「城山日出峰附近景点」

- **근거** seo:keywords 2026-10-17 외국어 target 1건 · 바이두 자동완성 城山日出峰附近景点推荐·附近有什么景点 · WebSearch 프록시 1쪽 집계·여행 커뮤니티 · dist/jeju/seongsan/ 150곳(식사·카페 91)
- **왜 지금** gate를 통과한 외국어 검색어가 이것 하나뿐이라, 외국어 쪽 틀(hreflang·언어별 사이트맵)이 실제로 색인되는지 한 쪽으로 재 보는 가장 작은 실험이다. 기대는 작다 — 본토 사용자는 구글을 못 쓰고 바이두 도달은 확인 실패다. 색인 8주 노출 0이면 pivotOf대로 접는다
- **어디** scripts/landing.ts(사람 반영, ADR 뒤). title 꼴 「城山日出峰附近，现在去哪儿 · 여차나:제주」(최종 문구는 docs/i18n/style-zh-Hans.md 문체·주인 승인), H1·기분 절은 한국어 지역 쪽과 같은 구조, 장소 이름·이유는 places.zh-Hans.json, 길찾기 네이버지도, 앱 단추 /?lang=zh-Hans&area=seongsan. sitemap-zh-Hans.xml. 장소 링크는 한국어 장소 쪽으로(외국어 장소 쪽은 만들지 않는다)
- **검증** dist/zh-Hans/jeju/seongsan/index.html이 있고 html lang=zh-Hans, 자기 canonical, /jeju/seongsan/을 가리키는 hreflang=ko alternate가 있으며, dist/jeju/seongsan/index.html에는 반대쪽 hreflang=zh-Hans alternate가 있고, 이 주소가 사이트맵 색인 아래 파일에 있다

## 더 봐야 할 것 — 원인이 안 갈렸다
- 바이두 — 본토에서 yeochana.com이 열리는지·얼마나 느린지(Cloudflare 일반 망은 본토 거점이 없다, Cloudflare 문서), 바이두가 색인할지 모두 확인 실패다. 다음 확인: 주인이 본토 다지점 측정 서비스(17ce.com·boce.com 같은 무료 측정) 1회, GreatFire에 yeochana.com 검사 요청, 바이두에서 site:yeochana.com 1회. 바이두 검색자원플랫폼 등록에 본토 휴대폰 인증이 필요한지도 확인 실패. 이 셋이 나오기 전에는 바이두용 작업을 하지 않는다. ICP 비안이 색인 자격 조건은 아니라는 출처(Chinafy)와 사실상 필요하다는 출처(WE Interactive·The Egg — 본토 호스팅 판매사)가 갈린다
- 영어 동네 검색어(things to do in seogwipo 8/10 · things to do near seongsan ilchulbong · things to do in aewol)와 중국어 涯月邑景点 8/10 — 프록시 결과가 Expedia·hotels.com 벽이거나 SERP 미관측이라 watch다. 주인이 구글(시크릿 창, 영어·미국 / 중국어 간체) 결과 1쪽을 1회 보고 serp에 적으면 경쟁 점수를 다시 매긴다. 이것이 1번 결정의 범위(영어 지역 쪽을 넣을지)를 정한다
- GSC 국가별 노출 — 외국어 주소가 없어도 한국어 장소 쪽이 외국에서 노출되는지(실적 → 국가: 중국·일본·미국·대만·홍콩). 다음 주간 점검에서 1회 읽는다. 읽기 전에는 외국 유입 기준선이 없다

## 손대지 않기로 한 것
- 섬 전체 머리 — jeju itinerary · things to do in jeju · 済州島 観光 · 済州島 カフェ · 济州岛攻略 · 济州岛景点 · 济州岛自由行: keyword gate kill(K1 일정 의도 또는 K3 OTA·여행사·携程 벽, 프록시 1회)
- 대표 명소 이름 + 언어(seongsan ilchulbong · 城山日出峰): kill(K1·K3) — 명소 정보(시간·입장·등산) 의도이고 Wikipedia·공식·OTA 자리. 작은 가게의 외국어 표기 이름(예: Dalkomhan Hyusik)은 자동완성 신호가 없어 후보로 올리지 않았다 — 한국어처럼 가게 이름으로 들어오는 길이 외국어에서는 보이지 않는다
- jeju rainy day activities · jeju indoor activities · 済州島 雨の日 · 济州岛下雨天怎么玩: watch — 수요는 있으나 섬 전체 목록 의도(intent 1). 중국어 下雨天은 바이두 자동완성 10개로 세 언어 중 가장 두껍다 — 동네 단위 말이 나오면 가장 먼저 다시 본다
- 장소 2,921쪽의 외국어판(8,763쪽): 만들지 않는다 — gate target이 없고, 한국어 쪽 색인 대기 2,413쪽(10-16)이 풀리기 전에 쪽 수를 늘리면 한국어 크롤을 밀어낸다
- 홈 meta description·OG·noscript·manifest의 한국어: 그대로 둔다(ADR-0093 결정 3·11). 외국어 검색을 받을 쪽은 홈이 아니라 1번 결정의 외국어 주소다
- 앱 ?lang= 주소에 hreflang alternate를 다는 것: 하지 않는다 — canonical이 / 하나라 hreflang 대상이 자기 canonical이 아니게 되어 충돌한다(ADR-0093 결정 3과 같은 이유)

## 확인 실패
- 구글·야후재팬 결과 화면 — 보지 않았다(ADR-0079). WebSearch(미국 엔진) 24회는 프록시다 — 영어·일본어·중국어 경쟁 점수는 모두 최대 1
- 바이두 결과 화면·site: 조회·본토 망 도달 — 이 환경에서 할 수 없었다. 확인 실패(경쟁 없음이 아니다)
- Googlebot·Bingbot 렌더러의 navigator.languages 값 — WebSearch 1회로 출처를 못 찾았다. 확인 실패(개입 2가 확인한다)
- GSC 국가별 실적 — 이번에 읽지 않았다

## 저장소 변경
- M apps/web/data/seo/keywords.json — 외국어 후보 29건 추가(lang·cluster foreign-<lang>), updated 2026-10-17
- ?? apps/web/data/seo/diagnoses/2026-10-17T2310.json — 이 기록
- ?? docs/seo/2026-10-17-foreign-search.md — 주인 요청 보고서
- M apps/web/data/seo/queue.json — seo:report --queue 산출
- (되돌림) apps/web/data/landing/lastmod.json — npm run build가 / · /privacy lastmod를 바꿔 git checkout으로 되돌렸다

