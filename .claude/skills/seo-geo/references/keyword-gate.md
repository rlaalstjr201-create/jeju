# keyword gate — 루브릭 v1

코드: `apps/web/scripts/seo/keyword-gate.mjs` (`judge`·`validateKeywords`·`pivotOf`). 이 표와 코드가 어긋나면 코드가 맞고 이 문서를 고친다.
기록: `apps/web/data/seo/keywords.json`. 표 보기: `npm run seo:keywords`.

## 절차 (후보 하나)

1. **수요** — `npm run seo:keywords -- --suggest "<후보>,<변형>"`. 네이버·구글 자동완성에 그 말(또는 아주 가까운 변형)이 뜨는가. 배포 후에는 GSC query 노출도 본다.
2. **SERP** — 사람이 브라우저(로그아웃·시크릿)로 구글(`hl=ko&gl=kr`)과 네이버를 본다. 기록:
   - 구글 상위 10 도메인과 성격(포털·OTA·공식·언론·위키·블로그·커뮤니티·같은 개념 서비스), AI 개요 유무.
   - 네이버 섹션 순서(파워링크·플레이스·지도·블로그·카페·인플루언서·웹문서·동영상·AI 브리핑)와 웹문서 칸의 위치.
   - 에이전트가 WebSearch만 쓸 수 있으면 `source: "WebSearch(미국 엔진 프록시)"`, `naver_observed: false`. 못 봤으면 `observed: false`.
3. **점수** — 아래 다섯 축, 0~2.
4. **킬 기준** — 해당하면 `kills`에.
5. **판정** — `judge()`가 낸 값을 `verdict`에 그대로. `rationale` 한두 문장. target이면 받을 URL을 `landing`에.

## 축

| 축 | 2 | 1 | 0 |
|---|---|---|---|
| demand | 네이버·구글 자동완성 둘 다 | 한쪽만 | 없음 |
| competition | 상위가 개인 블로그·커뮤니티뿐, 이 의도를 정확히 받는 페이지 없음 (**네이버를 직접 봤을 때만**) | 블로그·OTA 글·위키 혼합, 큰 매체가 있어도 정확한 의도 페이지는 없음 | 포털·OTA·공식·같은 개념의 큰 서비스가 상위를 차지 / 네이버 플레이스·블로그 블록이 웹문서를 밀어냄 |
| intent_fit | 「지금 여기서(그 지역에서) 갈 만한 곳 몇 곳」을 원한다 | 반만 맞다(특정 한 곳·코스·이동 수단 정보를 원함) | 밈·뜻풀이·뉴스·예약·가격 |
| uniqueness | P·무계획·지금·기분·이동 시간 중 둘 이상이 의도에 들어 있다 | 하나 | 없다(일반 목록) |
| inventory | 그 조합 장소 30곳↑ | 10~29곳 | 10곳 미만 (= K4) |

## 판정 규칙

1. 점수 누락·범위 밖 → invalid.
2. `brand: true` → brand (경쟁이 아니라 존재 확인 대상).
3. kills가 하나라도 → kill.
4. `head: true` 이고 competition 0 → kill (K3).
5. `serp.observed === false` → watch (SERP 안 보고 target 금지).
6. demand 0 → watch.
7. 합계 ≥7 · competition ≥1 · intent_fit 2 → **target**.
8. 나머지 → watch.

`head`는 「지역(또는 제주) + 일반형(가볼만한곳·맛집·카페·관광지)」, 「즉흥 여행 추천」처럼 지명·조건 없는 넓은 말에 붙인다.

## 킬 기준

| id | 뜻 | 예 |
|---|---|---|
| K1_intent | 검색 의도가 우리가 줄 수 없는 것 | mbti p 여행(성향 이야기), p 여행 계획(짤), 즉흥 여행 추천(목적지 고르기) |
| K2_data | 데이터에 없는 속성이 필요 | 비오는날·실내, 혼자 가기 좋은, 영업 중, 반려동물, 가격 |
| K3_portal_wall | 헤드 + 포털 벽 | 제주 가볼만한곳, 애월 근처 맛집, 중문 카페 |
| K4_thin | 조합 장소 10곳 미만 | (재고표 `docs/seo/keyword-research-01.md` §4) |
| K5_brand_collision | 더 강한 주체가 같은 말을 쓴다 | P의 여행(동명 도서), 제주 오늘 뭐하지(onuljeju.com) |

## 바꿀 때

가중치·문턱을 데이터를 보고 바꾸면 사후 맞춤이 된다. 바꿔야 하면 `RUBRIC_VERSION`을 올리고, keywords.json `rubric_version`도 올리고, 이유를 이 파일 아래에 날짜와 함께 적는다.
