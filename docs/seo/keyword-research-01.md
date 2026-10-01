# 검색어 조사 01 — P의 여행 (2026-10-01)

판정 기록: `apps/web/data/seo/keywords.json` (`npm run seo:keywords`로 표 보기). 루브릭: `.claude/skills/seo-geo/references/keyword-gate.md`.

## 1. 방법과 한계 (먼저 읽을 것)

| 무엇 | 어떻게 | 한계 |
|---|---|---|
| SERP | WebSearch 도구로 20개 검색어 조회 | **미국 엔진이다. 구글 KR·네이버 SERP가 아니다.** 상위 도메인 성격(포털·OTA·블로그·커뮤니티)을 보는 프록시로만 쓴다 |
| 네이버 SERP 직접 | `search.naver.com` WebFetch | **막힘**(도구가 이 도메인을 가져오지 못함) |
| 구글 KR SERP 직접 | `google.com/search?hl=ko&gl=kr` WebFetch | 응답이 깨져 판독 불가 |
| 수요 | 네이버 자동완성(`ac.search.naver.com`)·구글 자동완성(`suggestqueries`, `hl=ko&gl=kr`) curl 조회 약 40건 | 검색량이 아니라 「그 말을 치는 사람이 있다」는 존재 신호. 이 컨테이너에서는 node fetch가 egress 정책에 막혀 curl로 조회했다(사용자 기기에서는 `seo:keywords --suggest`가 된다) |
| 재고 | `public/spots.json` 2,955곳을 가장 가까운 세부 지역 중심(`src/areas.ts`)에 배정해 기분별로 셈 | 지역 경계가 아니라 최근접 중심 — 경계 근처 장소는 옆 지역으로 갈 수 있다 |

그래서 **competition 점수는 전부 최대 1**이다(네이버를 직접 보지 못했으므로 — 검증기가 강제). 네이버 SERP를 사람이 보고 채우는 것이 다음 할 일이다(§6).

## 2. SERP 표본 (WebSearch 프록시, 2026-10-01)

| 검색어 | 상위 결과(순서대로, 위키·무관 결과 제외) | 읽기 |
|---|---|---|
| 제주 즉흥 여행 | yongwookha.github.io(개인 블로그) · kr.trip.com(즉흥여행 가이드) · tripsoda.com(동행 커뮤니티) | 약하다. 정확한 의도 페이지 없음 |
| 계획 없이 제주 여행 | travie.com(차 없이 여행) · 82cook.com · kkday.com 블로그 · tripskorea.kr(차 없이) | 엔진이 「계획 없이」를 **뚜벅이**로 읽는다 |
| 제주 P 여행 즉흥 무계획 코스 | brunch.co.kr(P가 여행하는 방법) · triple.guide(코스 짜는 법·「PPPP 둘의 무계획 즉흥 여행」) · kr.trip.com · kkday · funjeju.com | 콘텐츠 매체·OTA 블로그. 「무계획」 도구는 없음 |
| P 여행 코스 없이 제주 | heypop.kr · triple.guide x2 · kr.hotels.com · kkday · clien.net · klook | 코스 콘텐츠가 차지 |
| MBTI P 여행 제주 | triple.guide(P와 J의 여행) · brunch.co.kr(MBTI별 여행지) · gnews.gg.go.kr · tiktok · myrealtrip(「제주 MBTI 여행」 상품) | 성향 이야기 — 장소 목록 의도 아님 |
| P 여행 무계획 여행 뜻 | brunch x2 · allurekorea.com · triple.guide · clien x2 · tripdoor.kr · teamblind | 뜻풀이·잡담 |
| "P의 여행" | brunch.co.kr · allurekorea.com · artinsight.co.kr · triple.guide · bizforms.co.kr(계획표) · clien · **yes24.com(동명 도서 『P의 여행』)** · ruliweb(짤) · nate 연예 | **브랜드 충돌.** 단독 검색어로는 우리가 못 뜬다 |
| 무계획 여행 추천 앱 | wannago.oopy.io · blogsabo.ahnlab.com · triple.guide · roamless.com · 앱스토어(트랩플랜·Trip AI) | 「여행 계획 앱」 의도. 무계획 도구 범주가 비어 있다 |
| 제주 즉흥 여행 추천 앱 지금 위치 근처 | skyscanner.co.kr(앱 가이드) · triple.guide · kr.trip.com · 플레이스토어(TRUE 제주·젠트립) · 블로그(제주 필수앱) · 앱스토어(제주페이·젠트립) | 「제주 여행 앱」 정리 글이 오프사이트 제보 대상 |
| 지금 제주 뭐하지 | kr.hotels.com x2(Go Guides) · nocutnews · accuweather · visitjeju.net · **jigeumjeju.com(언론사 「지금제주」)** | 포털·공식 + 이름이 겹치는 언론사 |
| 제주 오늘 뭐하지 기분 | 항공기상청 · 운세 기사 · accuweather · msn 날씨 · todayjeju.kr · **onuljeju.com(「오늘제주 — 오늘 제주에서 뭐 하지?」)** · news1 | 날씨 의도 + 같은 개념 서비스 |
| 제주 근처 갈만한 곳 지금 위치 | kr.hotels.com x3 · banksalad.com · tripadvisor · kkday · forourtour.com | 일반형 헤드 |
| 제주 가볼만한곳 | triple.guide · kr.hotels.com x2 · tripadvisor · visitjeju.net · kr.trip.com · korean.visitkorea.or.kr · forourtour.com | 포털·OTA·공식 벽 |
| 애월 비 오는 날 실내 갈만한 곳 | triple.guide(비 오면 좋은 제주) · kr.trip.com(실내 관광지 총정리) · gguge.com · 블로그 | 수요는 큰데 우리 데이터에 실내 속성이 없다 |
| 성산 근처 체험 | brunch.co.kr(@klook) · kr.hotels.com · namu.wiki · kr.trip.com x2 · 블로그 | 혼합. 정확한 「지금 여기서 체험 몇 곳」 페이지 없음 |
| 제주 혼자 쉬기 좋은 곳 | v.daum.net · headlinejeju · brunch · visitjeju.net · hub.zum(kkday) · kr.trip.com x2 · kkday | 「혼자」 판정은 우리 데이터에 없다 |
| 구좌 근처 산책하기 좋은 곳 | triple.guide x2 · visitjeju.net · expedia · sibmanwon.com · visitkorea · komoot x2 | 혼합 |
| 중문 근처 카페 디저트 | siksinhot(무관) · triple.guide(오또 도넛) · diningcode · 무관 해외 | 맛집 DB(다이닝코드·식신) — 네이버에서는 플레이스가 위일 것 |
| 애월 근처 맛집 | siksinhot · brunch · youtube · forourtour · mindbridge · travelocity(숙소) | 맛집 헤드 |
| 우도 지금 갈만한 곳 혼자 | kr.hotels.com · triple.guide · visitjeju.net · tripadvisor · tourtoctoc(배편·전기차 총정리) | 이동·배편 실용 의도 |

### 직접 경쟁자: onuljeju.com (WebFetch 요약, 2026-10-01)

제목 「오늘제주 — 오늘 제주에서 뭐 하지?」. AI 자연어 검색, 날씨·물때·배편 실시간, **기분/상황별 추천**(데이트·비 오는 날 실내·가족), **GPS 근처 2km**, 읍면동별 둘러보기, 리뷰 300건 이상 기준 검증, 음식점 1.2만·관광지 2천 등 약 2.5만 곳. 「지금·오늘 제주 + 뭐하지 + 기분 + 근처」라는 문장을 이 사이트가 먼저 갖고 있다.
우리와 다른 점: P·무계획 포지션, 고르는 수를 3곳으로 줄이는 것, 이동 시간 문구, 저장/날짜 보관. **이 차이를 문장으로 쓰지 않으면 검색과 AI는 둘을 같은 범주로 묶고 큰 쪽을 고른다.**

## 3. 자동완성 (2026-10-01, N = 네이버, G = 구글 KR)

| 씨앗 | 결과 |
|---|---|
| 제주도 무계획 | G: 제주도 무계획 여행 · N: 없음 |
| 무계획 여행 | N: 무계획 여행 · 무계획여행가 · G: 무계획 여행 · 국내 무계획 여행 · **제주도 무계획 여행** · 일본/도쿄/유럽 무계획 여행 |
| 즉흥 여행 | N: 즉흥 여행지 추천 · 즉흥 여행 뜻 · 즉흥여행 국내 · 전현무 즉흥여행 · G: 즉흥 여행 추천 · 즉흥 여행 디시 · 즉흥여행 뜻 |
| 제주 즉흥 · 제주 즉흥여행 · 제주 계획 없이 · 제주 아무데나 | 없음(G「제주 즉흥」은 「제주 국제 즉흥 춤 축제」) |
| P 여행 / p의 여행 | N: p여행 · p의 여행 뜻 · p의여행계획짜는법 · G: p 여행계획 · p 여행계획 짤 · p 여행 계획표 · j p 여행 · 극 p 여행 · mbti p 여행 · 진짜 p의 여행 |
| mbti p | N: mbti p j 차이 · mbti p 뜻 · G: mbti p 여행 · mbti p 여행 계획 |
| 제주 지금 | N: 제주 지금 가볼만한곳 · **제주 지금 갈만한곳** · 제주 지금 날씨 · 제주 지금 연 약국 · G: 제주 지금 가볼만한곳 · 제주 맛집 지금 영업 중 |
| 제주 뭐하지 / 제주 오늘 뭐하지 | G: 제주 뭐하지 / 없음 |
| 제주 비오는날 | N: 제주 비오는날 카페 · 아기랑 · 애견동반 · **서쪽** · 가볼만한곳 · 카페 동쪽 · 오름 · 드라이브 · G: 갈만한곳 · 카페 · 드라이브 · 동쪽 비오는날 · 비오는날 제주 서쪽 |
| 애월 비오는날 | N: 애월 비오는날 놀거리 |
| 애월 근처 | N: 맛집 · 횟집 · 시장 · 카페 · 흑돼지 … · G: **애월 근처 가볼만한 곳** · 놀거리 · 오름 · 해수욕장 · 관광지 |
| 애월 산책 | N: 애월 산책로 · 애월 산책로 추천 · G: 애월 산책로 · 애월 한담 해안 산책로 |
| 성산 근처 | N: 맛집 · 가볼만한 · 숙소 · 카페 · 오름 · 아침식사 · G: **성산 근처 가볼만한 곳** · 놀거리 · 카페 |
| 성산 체험 | N: 성산 체험 농장 · G: 성산 체험 · 해녀체험 · 승마 체험 · 감귤 체험 · 일출봉 보트 체험 |
| 함덕 근처 | N: 맛집 · 물회 · **가볼만한곳** · 카페 · G: 함덕 근처 가볼만한 곳 · 놀거리 · 오름 |
| 표선 근처 | N: 맛집 · **놀거리** · 카페 · 가볼만한곳 · 오름 · G: 표선 근처 가볼만한 곳 · 오름 |
| 서귀포 산책 / 서귀포 근처 | N: 서귀포 산책로 추천 · G: **서귀포 산책하기 좋은 곳** · 서귀포 산책 코스 · 서귀포 밤산책 / G: 서귀포 근처 가볼만한 곳 · 오름 · 바다 |
| 중문 카페 / 구좌 카페 | 양쪽 다수(추천·오션뷰·아기랑) |
| 제주 혼자 | N: 제주 혼자 여행 · 혼자 카페 · 혼자 놀기 · 혼자 숙소 |
| 우도 혼자 | N: 우도 혼자여행 · G: 우도 혼자 여행 |
| 구좌 산책 · 조천 갈만한곳 · 한경 갈만한곳 · 제주 조용한 곳 · 제주 기분 | 없음 또는 1건 |

## 4. 재고 — 세부 지역 × 기분 (spots.json 2,955곳)

| 지역 | 쉬기 | 걷기 | 새로운 거 | 식사 | 카페 |
|---|---|---|---|---|---|
| 한경 | 20 | 27 | 27 | 32 | 13 |
| 한림 | 19 | 17 | 18 | 75 | 24 |
| 애월 | 36 | 34 | 41 | 81 | 30 |
| 신제주 | 35 | 24 | 46 | 210 | 55 |
| 구제주 | 24 | 30 | 45 | 269 | 90 |
| 조천 | 22 | 57 | 55 | 81 | 20 |
| 구좌 | 37 | 34 | 35 | 43 | 33 |
| 우도 | 14 | 10 | 15 | 36 | 20 |
| 대정 | 19 | 29 | 20 | 58 | 11 |
| 안덕 | 13 | 33 | 36 | 44 | 13 |
| 중문 | 17 | 19 | 39 | 78 | 14 |
| 서귀포 시내 | 24 | 52 | 48 | 139 | 36 |
| 남원 | 10 | 32 | 31 | 25 | 9 |
| 표선 | 11 | 33 | 33 | 32 | 14 |
| 성산 | 16 | 23 | 19 | 76 | 15 |

최소는 남원 카페 9곳(K4 경계). 나머지 조합은 전부 10곳 이상 — 재고는 문제가 아니다. **문제는 수요와 경쟁이다.**

## 5. 판정 (keywords.json, 후보 25)

| 판정 | 수 | 검색어 |
|---|---|---|
| **target** | 2 | 제주도 무계획 여행(8/10 → `/jeju/`) · 성산 근처 체험(7/10 → `/jeju/seongsan/new/`) |
| brand | 1 | P의 여행 제주 |
| watch | 9 | 제주 즉흥 여행 · 계획 없이 제주 여행 · 구좌 산책하기 좋은 곳 · 우도 혼자 여행 · **SERP 미관측 5건**: 서귀포 산책하기 좋은 곳 · 표선 근처 놀거리 · 함덕 근처 가볼만한곳 · 성산 근처 가볼만한 곳 · 애월 산책로 |
| kill | 13 | 헤드(제주 가볼만한곳 · 제주 지금 가볼만한곳 · 제주 뭐하지 · 제주 근처 갈만한 곳 · 애월 근처 맛집 · 중문 카페) · 의도(mbti p 여행 · p 여행 계획 · 즉흥 여행 추천 · P의 여행) · 데이터(제주 혼자 쉬기 좋은 곳 · 애월 비오는날 놀거리) · 브랜드 충돌(제주 오늘 뭐하지) |

## 6. 무엇을 알았나

1. **P·무계획 의도는 「우리만의 것」이지만 작다.** 자동완성에 「제주」와 붙는 것은 구글 「제주도 무계획 여행」 하나다. 경쟁은 약하다(블로그·커뮤니티·코스 글). → 허브 1장으로 받고, 기대는 유입보다 **엔티티 연결**(AI가 「P 여행/무계획 + 제주」를 물을 때 우리를 떠올리게)이다.
2. **「P」 단독 말은 밈이다.** 「p 여행 계획 짤」「J가 보고 기절한 P의 여행계획」 — 웃자고 치는 검색이다. 페이지로 받지 않는다. 브랜드 검색어는 「P의 여행 제주」로 정하고 모든 자리에 「제주」를 붙인다.
3. **「지금 제주」 자리는 이미 찼다.** 「지금」은 계절로 읽히고, 「오늘 제주에서 뭐 하지?」는 onuljeju.com의 브랜드 문장이다. 우리 문구에서 이 표현을 쓰지 않는다.
4. **실제 수요는 「{지역} 근처 가볼만한곳/놀거리/산책로/체험」에 있다.** 지역 이름보다 **대표 지명**(함덕·한담·일출봉)으로 들어온다. 이 롱테일이 검색 유입의 본선이고, 네이버에서는 블로그·플레이스와 싸운다 — 네이버 SERP 관측이 다음 할 일이다.
5. **가장 두꺼운 묶음은 「비 오는 날」이다**(네이버·구글 모두 방향(동쪽·서쪽)·카페·아기랑까지 갈라진다). 우리 데이터에 실내 속성이 없어 K2로 접었다. 실내 여부를 데이터에 더하는 것은 SEO 밖의 제품 결정이다 — 결정이 나면(새 ADR) 이 묶음이 1순위 후보다.
6. **먹기(맛집·카페)는 버린다.** 네이버 플레이스·블로그와 맛집 DB가 차지하고, 우리는 평점·리뷰가 없다(ADR-0060).

## 7. 다음 할 일 (사람)

- 시크릿 창에서 네이버·구글(KR)로 watch 5건과 target 2건을 보고 `keywords.json` 각 후보의 `serp`에 `naver_observed: true`, `naver_sections`(블록 순서), 상위 10을 적는다. 그 뒤 `npm run seo:keywords`로 재판정.
- 지역 페이지 제목에 대표 지명을 넣는 것을 `specs/seo-landing.md` 결정 사항으로 확인.

## 출처 (WebSearch·WebFetch, 2026-10-01)

- https://yongwookha.github.io/LifeAndTravel/2021-11-17-jeju-healing · https://kr.trip.com/guide/theme/spontaneous-travel.html · https://tripsoda.com/community/accompany/detail/16856
- https://triple.guide/articles/7ef0287a-1fae-4e96-b806-cc6720d75584 · https://brunch.co.kr/@travie/1306 · https://www.myrealtrip.com/offers/103061
- https://www.travie.com/news/articleView.html?idxno=17326 · https://www.kkday.com/ko/blog/34881/asia-korea-jeju-alone · https://tripskorea.kr/
- https://kr.hotels.com/go/south-korea/kr-best-things-to-do-jeju · https://www.visitjeju.net/kr · https://www.jigeumjeju.com/ · https://onuljeju.com/
- https://wannago.oopy.io/2565f166-77b1-4ba1-96e5-75f5f8e5b7a3 · https://triple.guide/trips/lounge/itineraries/2f0160f6-07c7-4af8-b34f-071403941232
- https://heypop.kr/n/132732/ · https://triple.guide/articles/841db340-ffb6-4774-8265-45f559f37e2b · https://www.clien.net/service/board/park/18153933
- https://www.tripadvisor.com/Attractions-g297885-Activities-Jeju_Jeju_Island.html · https://kr.trip.com/toplist/tripbest/jeju-city-best-things-to-do-100000012168/ · https://forourtour.com/
- https://triple.guide/articles/d5b830cf-17cd-4529-8365-0f5791793906 · https://kr.trip.com/blog/jeju-indoor-tourist-attractions-on-a-rainy-day/
- https://brunch.co.kr/@klook/149 · https://namu.wiki/w/%EC%84%B1%EC%82%B0%EC%9D%8D/%EA%B4%80%EA%B4%91
- https://v.daum.net/v/PIbdJ2bYzo · https://www.headlinejeju.co.kr/news/articleView.html?idxno=552947 · https://hub.zum.com/kkday/107700
- https://triple.guide/articles/d1ecf38c-7618-41da-b31a-a51d1dd30916 · https://www.sibmanwon.com/2024/07/15/ · https://www.komoot.com/ko-kr/guide/4164531
- https://www.siksinhot.com/theme/magazine/11817 · https://www.diningcode.com/profile.php?rid=aau0XTjEz4x2 · https://triple.guide/restaurants/45318df6-51b0-4861-b498-d2b422a1fc0a
- https://brunch.co.kr/@readcontents/18 · https://www.allurekorea.com/2023/07/18/p%EC%9D%98-%EC%97%AC%ED%96%89/ · https://www.yes24.com/product/goods/145334049 · https://www.artinsight.co.kr/news/view.php?no=60091
- https://www.skyscanner.co.kr/destinations/advice/5-best-travel-guide-apps · https://www.tourtoctoc.com/news/articleView.html?idxno=3894
