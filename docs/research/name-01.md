# 이름 조사 01 — 「P의 여행」 겹침 현장 조사 (2026-10-01)

조회일: 모든 출처 **2026-10-01**. 방법: iTunes Search/Lookup API(KR 스토어), Google Play 검색·상세 HTML(curl, hl=ko·gl=KR), KIPRIS 상표 검색(www.kipris.or.kr 검색 화면이 쓰는 요청을 curl로 직접 호출), 네이버 통합검색 HTML(curl), YouTube 채널 검색 HTML(curl), WebSearch(미국 엔진), RDAP(.com Verisign · .app Google Registry · .kr KISA).
관련 문서: `docs/adr/0059-p-trip-now-first.md`(이름 결정, 2026-09-30), `docs/research/competitors-01.md`, `docs/seo/keyword-research-01.md`.

---

## 0. 결론

**권고: 이름 변경(rename). 출시 전인 지금 바꾸는 비용이 가장 작다.** 사용자가 이름을 유지하겠다면 최소한 「P의 여행 제주」로 고정하고 상표 출원부터 한다(§5).

| 축 | 판정 | 한 줄 근거 |
|---|---|---|
| (a) 법(상표 침해) | **현재 낮음 / 장래 중간** | KIPRIS에 「P의 여행」「P들의 여행」「피의 여행」「P여행」 출원·등록이 **0건**. 다만 같은 이름의 앱이 이미 영업 중이고, 한국은 먼저 출원한 사람이 권리를 가진다. 남이 먼저 출원하면 우리는 등록을 못 하고 분쟁 위험이 생긴다 |
| (b) 검색(브랜드 검색 확보) | **못 이김** | 네이버 「P의 여행」 = 광고 → 인플루언서 → 블로그·카페 밈 → 클립 → **네이버 도서 『P의 여행』**. YouTube에 「P의 여행」 이름 채널 **5개 이상**. App Store 「P의 여행」 1위는 **「P의여행:국도편」**, 2위는 「P들의 여행」 |
| (c) 혼동 | **높음** | **「P의여행:국도편」(App Store, 2026-09-03 출시)**: 이름이 같고, 「지금 내 주변」을 카드 한 장으로 띄우고 「오늘만 볼 수 있는 것」(5일장·일몰)을 보여 주는 개념까지 겹친다. 「P들의 여행」도 P 여행자 대상에 제주 항공권을 다룬다. **둘 다 우리보다 먼저 나왔다**(우리 이름은 2026-09-30 결정, 아직 출시 전) |

이번 조사의 새 발견: **「P의여행:국도편」**. competitors-01에는 없던 앱이다.

---

## 1. 앱스토어

### 1-1. 이름이 겹치는 앱

| 앱 | 스토어 | 판매자/개발자 | 출시·최근 업데이트 | 규모 | 개념 | 겹침 | 출처 |
|---|---|---|---|---|---|---|---|
| **P의여행:국도편** | App Store(Play에서는 못 찾음) | Tae Yong Park | 출시 2026-09-03, v1.0.4 2026-09-17 | 평가 0 | 「P의 여행」은 목적지를 묻지 않는다. 국도를 고르면 **앞쪽 3~7분 거리에 무엇이 있는지 카드 한 장**, 「지금 내 주변만」, 오늘 장이 서는 시장·일몰 40분 전 전망 | **이름이 같다(띄어쓰기만 다름). 개념도 가장 가깝다** | https://apps.apple.com/kr/app/id6806749553 (iTunes Lookup API `?id=6806749553&country=kr`) |
| (위 앱과 관련 추정) GitHub `Hyee0ne/p-trip` | — | Hyee0ne | 커밋 약 270 | 별 0 | 「P의 여행 — 국도 위의 우연한 발견을 설계하는 '발견 레이더' 앱. Flutter · Supabase · 한국관광공사 OpenAPI」 | 이름·저장소 이름(`p-trip`)이 같다. 국도편 앱과 같은 팀인지는 **미확인** | https://github.com/Hyee0ne/p-trip |
| **P들의 여행** | App Store·Google Play | 이지티켓(easyticket.co.kr). 스토어 판매자는 개인 이름 표기 | iOS 출시 2026-06-09, 두 스토어 모두 2026-09-18 업데이트(v2.81.0) | Play 100+ 다운로드, iOS 평가 4 | 지구본 다트로 여행지 뽑기, AI 일정, 동행 편집, 성향 유형, 게임, **제주 국내선 항공권** | 이름 한 글자 차이. P 여행자 대상. 패키지 이름 `com.ptrip.p_trip` → **「ptrip」 문자열도 이미 쓰고 있다** | https://apps.apple.com/kr/app/id6777857291 · https://play.google.com/store/apps/details?id=com.ptrip.p_trip&hl=ko · https://easyticket.co.kr/apps/ptrip/ |

### 1-2. 검색어별 상위(KR)

| 검색어 | App Store(iTunes Search API) | Google Play |
|---|---|---|
| P의 여행 | ① P의여행:국도편 ② P들의 여행 … 무계획의 계획 | ① P들의 여행, 그 뒤 Polarsteps·트리플·마이리얼트립 등 일반 여행 앱 |
| P의여행 | ① P의여행:국도편 ② P들의 여행 | ① P들의 여행 |
| P들의 여행 | ① P들의 여행 | ① P들의 여행 |
| 피의 여행 | 관련 앱 없음 | 관련 앱 없음 |
| P여행 / P 여행 | 대형 OTA 사이 3위 P들의 여행, **플랜:P — AI 여행 코스 플래너**(2026-09-05), **J플래너**(2026-08-06) | ① P들의 여행 |
| 무계획 여행 | 무계획의 계획(2024-08-21, 평가 2) | 랜덤 여행(500+), DAILY TRIP 등 |
| 즉흥 여행 | P들의 여행, **Doing — 즉흥으로 떠나는 랜덤 여행**(2026-09-03), 무계획의 계획, 돌리GO, 플랜:P, 한가로이, 픽앤고 | 즉흥여행(`com.acroj.random_travel`, 50+), 지금고고(10+) |

읽기: 2026년 6~9월에 「P·즉흥·무계획」 이름을 단 개인 개발 앱이 몰려 나왔다. 「P」 접두어는 이미 붐비는 범주다.

출처(모두 2026-10-01): `https://itunes.apple.com/search?term=<검색어>&country=kr&entity=software`, `https://play.google.com/store/search?q=<검색어>&c=apps&hl=ko&gl=KR`,
https://apps.apple.com/kr/app/id6806508654 (플랜:P) · https://apps.apple.com/kr/app/id6805714195 (Doing) · https://apps.apple.com/kr/app/id6651825231 (무계획의 계획) · https://play.google.com/store/apps/details?id=com.acroj.random_travel · https://play.google.com/store/apps/details?id=com.reed.random.travel · https://play.google.com/store/apps/details?id=com.bridge.hittheroad

---

## 2. 상표(KIPRIS)

### 2-1. 접근

- `www.kipris.or.kr` 상표 검색(`/kdtj/grrt1000a.do?method=searchTM`)에 직접 요청했다. 연결이 자주 끊겨서(프록시 기록 `ws_closed_mid_exchange`) 다시 시도했다. 결과 코드 `98` = 「DataNotFound」(사이트 JS `searchResult.js` 주석 기준).
- **대조 검사**: 「야놀자」 868건, 띄어 쓴 상표 「P의 거짓」(네오위즈, 9·41류 등록)은 붙여 쓴 검색어 「P의거짓」으로 1건이 나왔다 → **붙여 쓴 검색어로도 띄어 쓴 상표를 찾는다.** 따라서 아래 0건은 의미가 있다.
- `plus.kipris.or.kr` Open API는 서비스 키가 필요하다(`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`). 쓰지 못했다.
- 한계: 출원 직후 아직 공개되지 않은 건은 보이지 않을 수 있다(공개까지 걸리는 기간 **미확인**). 아래 결과는 류를 거르지 않은 전체 검색이므로 9·35·39·42·43류를 모두 포함한다.

### 2-2. 결과 (2026-10-01)

| 검색어 | 건수 | 메모 |
|---|---|---|
| P의여행 | **0** | |
| P들의여행 · P들의*여행 | **0** | |
| 피의여행 | **0** | |
| P여행 | **0** | |
| "P의 여행"(따옴표 구문) | 0 | |
| P의*여행 (`*` = AND) | 4,904 | 「P」나 「여행」만 맞는 결과. 상위권: 파아란여행사 (P)(39류 출원) · 꽃보다 여행(CJ ENM 9·35·39·41류) 등. 「P의 여행」과 같거나 비슷한 상표는 없음 |
| P*여행 | 94,494 | 단일 문자 「P」 상표가 다수. 참고: **주식회사 카카오 「P」 35·39·41·43류 등록**(4020170067352). 글자 하나짜리 표장이라 우리 이름과 유사로 볼지는 **미확인**(전문가 판단 필요) |
| PTRIP | 16 | Deeptrip(9·35·39·42·43류 출원) 등. 「PTRIP」 그대로인 상표 없음 |
| 피트립 | 3 | 해피트립(5류) 등. 무관 |

### 2-3. 사용자가 직접 확인하는 방법

1. https://www.kipris.or.kr → 상단 「상표」 탭.
2. 검색창에 차례로 넣는다: `P의여행`, `P들의여행`, `피의여행`, `P여행`, `피여행`. (붙여 써도 띄어 쓴 상표가 걸린다.)
3. 결과 화면 왼쪽 필터 「상품분류」에서 **09, 35, 39, 42, 43**만 체크한다. 「행정처분」은 출원·공고·등록을 모두 켠다.
4. 발음이 비슷한 것도 보려면 「스마트 검색」에서 칭호(발음) 항목에 `피의여행`을 넣는다.
5. 결과가 0건이면 결과 화면을 캡처하고 날짜를 적어 둔다(먼저 썼다는 기록용).

---

## 3. 검색 점유 — 「P의 여행」을 치면 무엇이 나오나

| 채널 | 관찰 | 출처 |
|---|---|---|
| 네이버 「P의 여행」·「P의여행」 | 블록 순서: **AI 브리핑** → 파워링크(교원투어·쿠팡·클룩) → 인플루언서(「대문자P의 여행」 등) → 블로그·카페(「P의 여행계획법」 등 밈) → 클립 → **네이버 도서 『P의 여행』(옥이, BOOKK, 2025-03-30)** → 이미지(「J가 보고 혼절한 P의 여행계획」) | `https://search.naver.com/search.naver?query=P의 여행` (curl HTML) |
| 네이버 「P들의 여행」 | 카페 글 「P들의여행」, **이지티켓 앱 소개 페이지·Google Play가 웹 결과에 올라와 있음** | 같은 방식, https://easyticket.co.kr/apps/ptrip/ |
| 네이버 「P의 여행 제주」 | 광고 뒤로 제주 카페(jejutip)·블로그의 「P인데 제주…」 글. **주인이 없는 검색어** | 같은 방식 |
| 구글(WebSearch 프록시, 미국 엔진) | brunch·allurekorea·클리앙·인스티즈·다음 카페(밈), **yes24 동명 도서**, **GitHub Hyee0ne/p-trip** | https://www.yes24.com/product/goods/145334049 · https://www.allurekorea.com/2023/07/18/p%EC%9D%98-%EC%97%AC%ED%96%89/ · https://brunch.co.kr/@readcontents/18 · https://github.com/Hyee0ne/p-trip |
| YouTube 채널 | 이름이 「P의 여행」인 채널 **5개**(@P-ravelling 20명, @travelofP-korea 20명, @Aurora_0202 12명, @P-vo2yu 1명, 「p 의여행」 1명), 「P의 여행〡이 서툰여정이…」(@peacetrip-k2h 46명), **「P의 여행이란」(1.37천 명)** 등. 모두 작지만 이름이 같다 | `https://www.youtube.com/results?search_query="P의 여행"&sp=EgIQAg%3D%3D` |
| YouTube 핸들 | `@ptrip`·`@pjourney`·`@ptravel` 사용 중(200), `@p_trip`·`@p.trip`·`@p_journey`·`@p_travel` 비어 있음(404) | `https://www.youtube.com/@<handle>` |
| Instagram | 로그인 벽(302)으로 확인 못 함 → **미확인**. 확인 방법: 앱에서 「P의 여행」·`ptrip`·`p_trip`·`pjourney`를 계정 검색 |
| 책 | 『P의 여행』 옥이, BOOKK(POD), 2025-03-30, 110쪽 — MBTI P 주인공의 즉흥 국내 여행(대천·충주·영주) | https://www.yes24.com/product/goods/145334049 |

읽기: 「P의 여행」 단독 검색은 **밈·책·동명 채널·동명 앱**이 나눠 갖고 있다. keyword-research-01의 판정(「P의 여행」 = kill, 브랜드 검색어는 「P의 여행 제주」)과 같다. 「P의 여행 제주」는 비어 있지만 검색량이 작다.

---

## 4. 도메인 (RDAP, 2026-10-01)

| 이름 | .com | .kr | .app | 메모 |
|---|---|---|---|---|
| pjourney | 등록됨(2020-07-24, The Language Place) | 비어 있음 | 비어 있음 | |
| ptravel | 등록됨(1997-04-25) | 비어 있음 | 등록됨(2026-04-13) | |
| ptrip | 등록됨(2004-11-01) | 비어 있음 | 등록됨(2026-08-17, 404 페이지) | 「P들의 여행」 패키지 이름이 `ptrip` |
| p-trip | 등록됨(2025-12-03, 응답 없음) | 비어 있음 | 비어 있음 | 우리 배포 예시 `p-trip.pages.dev`(docs/deploy.md)와 GitHub `Hyee0ne/p-trip`이 같은 문자열 |
| pdeul | 비어 있음 | 비어 있음 | 비어 있음 | |
| pdeultrip · pyeohaeng | 비어 있음(.com) | pyeohaeng.kr 비어 있음 | — | |

- 「비어 있음」 = RDAP 404. 등록 가능하다는 보증은 아니다(예약어·프리미엄 가격은 등록 대행사에서 확인 — **미확인**). 대조: naver.kr·ptrip.app은 200으로 나와 조회 방식은 정상이다.
- `p-trip.pages.dev`는 이 환경에서 응답 코드 000(연결 실패). 이름을 선점할 수 있는지는 **미확인**(Cloudflare 대시보드에서 프로젝트를 만들 때 확인).
- 출처: `https://rdap.verisign.com/com/v1/domain/<name>.com`, `https://pubapi.registry.google/rdap/domain/<name>.app`, `https://rdap.nic.or.kr/domain/<name>.kr` (IANA 부트스트랩 https://data.iana.org/rdap/dns.json)

---

## 5. 위험 평가와 권고

### (a) 법 — 상표 침해

- 지금 「P의 여행」·「P들의 여행」 출원·등록은 없다 → **지금 당장 침해할 상대 권리는 없다**.
- 다만 「P의여행:국도편」·「P들의 여행」은 **우리보다 먼저 쓰고 있다**. 누가 먼저 출원하느냐로 갈린다(선출원주의). 그들이 9·39·42류로 먼저 출원해 등록되면, 우리는 등록을 못 하고 사용 중지 요구를 받을 수 있다. 미등록 선사용자 쪽의 부정경쟁방지법 주장 가능성도 있다(양쪽 모두 아직 작아서 「널리 알려진 표지」 요건에 못 미칠 가능성이 크다 — **미확인, 변리사 판단 필요**).
- 「P」(MBTI)와 「여행」은 식별력이 약한 말이라 「P의 여행」 자체가 등록될지도 **미확인**. 같은 꼴의 「P의 거짓」이 등록된 사례는 있다.
- 카카오 「P」(35·39·41·43류) 등록과의 유사 여부는 **미확인**(글자 하나짜리 표장).

### (b) 검색 — 브랜드 검색

- 「P의 여행」 단독: **못 이긴다**(네이버 도서 블록, 밈 콘텐츠, 동명 채널 5개 이상, 동명 앱 2개).
- 「P의 여행 제주」: 주인은 없지만, 사람들이 그대로 쳐야 한다. 입소문으로는 「P의 여행」까지만 전해지고, 그 검색은 남이 가져간다.

### (c) 혼동

- **「P의여행:국도편」**: 같은 이름, 같은 카테고리(여행), 같은 핵심 장면(「지금 내 주변」을 카드로 띄우기, 「오늘만」 정보). 사용자가 스토어나 검색에서 둘을 구별할 단서가 「국도편」 세 글자뿐이다. **혼동이 가장 크다.**
- 「P들의 여행」: 이름 한 글자 차이에 P 여행자 대상, 제주 항공권까지 다룬다. 그들이 업데이트를 잦게 해(v2.81) 노출도 우리보다 앞선다.

### 권고: **변경(rename)**

- 이유: 법은 지금은 깨끗하지만 먼저 출원하는 쪽이 이긴다. 검색은 이길 수 없고, 혼동 위험은 높다. 출시 전이라 바꾸는 비용(manifest·title·문구·og 이미지)이 가장 작다.
- 유지하려면(차선): 「P의 여행 제주」를 정식 이름으로 하고, **이번 주 안에 9·39·42류(필요하면 35·43류) 상표 출원**을 한다(비용·출원 전략은 변리사 상담 — **미확인**). 국도편 개발자와의 공존은 별도 판단이 필요하다.
- 이 권고는 ADR-0059 1번(이름)을 바꾸는 결정이다. 사용자가 정하면 새 ADR로 기록한다.

### 이름 후보 (빠른 겹침 점검, 2026-10-01)

| 후보 | 뜻 | KIPRIS | App Store / Play | 도메인(.com/.kr/.app) | 웹 | 판정 |
|---|---|---|---|---|---|---|
| **딱셋** | 「딱 세 곳만」 — 3장 원칙을 이름으로 | 「딱셋」 1건: 35류(청소 광고), 2023 출원 **포기** → 살아 있는 권리 없음 | 같은 이름 없음 | ttakset 셋 다 비어 있음 | WebSearch에서 같은 이름의 앱·서비스 없음(네이버는 **미확인**) | **1순위.** 지역에 묶이지 않아 ADR-0062(지역 확장)와 맞다. 「P」 포지션은 부제(「P를 위한 …」)로 옮긴다 |
| **기분제주** | 기분 하나 → 제주 | 0건 | 같은 이름 없음(검색 결과는 루미컵 등 무관 앱) | gibunjeju .com/.kr 비어 있음(.app 미조회) | WebSearch에서 브랜드 없음(네이버 **미확인**) | 2순위. 기분 1탭과 바로 이어진다. 지역 확장 때 「기분부산」처럼 늘려야 하는 부담이 있다 |
| **P의 제주** | P 자산 유지 + 지역 | 0건 | 같은 이름 없음 | pjeju .com/.kr/.app/.co.kr 비어 있음 | WebSearch에서 같은 이름 없음 | 3순위. 「P의 ○○」 꼴이라 국도편과 **부분 혼동**이 남는다 |
| **아무데나 제주** | 무계획 감성 | 0건 | 「어디든지 - Anywhere」(2026-09-15)가 뜻이 비슷 | amudena.com 등록됨, amudena.kr·amudenajeju.com 비어 있음 | keyword-research-01: 자동완성 없음 | 4순위. 이름이 길고, 「아무데나」는 대충이라는 인상이 있을 수 있다 |
| (탈락) 세곳 | 3곳 | 「세곳간」(35류, 화훼)만 | **「세곳 - 오늘의 장소 추천」(App Store, 2026-07-14) — 분위기 고르면 장소 3곳 추천** | — | — | 개념까지 겹쳐 탈락 |
| (탈락) 발길 | 발길 닿는 곳 | 「발길」 43류 출원(2026-03), 「발길따라」 35류 등록 | — | balgil.com 등록됨(2026-07-08) | — | 탈락 |
| (탈락) 무작정 제주 | 무계획 | 0건 | — | mujakjeong .com/.kr 비어 있음 | YouTube 「GOGOjeju[무작정_제주]」, 책 『제주도, 무작정 오지 마라』 | 탈락(검색 겹침) |

후보 공통 미확인: 네이버 통합검색 결과, Instagram 계정, 발음 기준 유사 상표(칭호 검색). 최종 1~2개를 고르면 §2-3 방법으로 KIPRIS를 다시 보고, 네이버를 시크릿 창에서 확인한다.

---

## 6. 한계

- 네이버 결과는 curl로 받은 HTML 1회 표본이다(개인화·지역·시간에 따라 바뀐다). AI 브리핑 본문은 스크립트로 불러와서 읽지 못했다.
- 구글은 WebSearch(미국 엔진) 프록시일 뿐, 구글 KR SERP가 아니다.
- KIPRIS는 화면용 요청을 직접 호출한 결과다. 공개 전 출원과 유사군 판단은 반영하지 못한다. 법적 판단이 아니다.
- 「P의여행:국도편」과 GitHub `Hyee0ne/p-trip`이 같은 팀인지는 미확인이다.
- 앱 규모는 스토어 표기(평가 수, Play 다운로드 구간)일 뿐이다.

## 7. P 느낌 후보 2차 (2026-10-01)

목표: 「계획 없는 P」 느낌(즉흥·그냥 간다). 앱은 제주 우선, 나중에 지역 확장 가능, 기분 1탭 → 장소 3곳. 방법은 §2~§4·§3과 같다(KIPRIS 화면 요청 curl, iTunes Search API `country=kr`, Google Play 검색 HTML `hl=ko&gl=KR`, RDAP, 네이버 통합검색 HTML curl). 조회일 모두 **2026-10-01**.
후보: 요청 10개 + 새 3개(**일단제주 · 되는대로 · 어쩌다제주**). 새 후보는 「일단」 계열 느낌을 지역과 합치거나(일단제주), 지역과 무관한 구어체(되는대로), 우연(어쩌다)을 노린 것이다.

### 7-1. 결과표

KIPRIS는 전체 류 검색 후 결과의 류 표시로 9·35·39·42·43류를 따로 읽었다. 유사 발음은 붙여 쓴 변형·한 음절 차이 검색어(예: 일단Go, 걍가자, 그냥고, 일단가자, 지금가자, 당기는대로, 피맘대로, 노플랜제주, 즉흥여행)로 확인했다. 「없음」 = 해당 류에 살아 있는 출원·등록 없음.

| 후보 | KIPRIS 9/35/39/42/43류 살아 있는 권리 (유사 발음 포함) | App Store(KR) / Google Play | 도메인 .com/.kr/.app (로마자) | 네이버 통합검색 점유 | 판정 |
|---|---|---|---|---|---|
| **일단가** | 정확히 같은 상표 0건. **유사 발음 「일단고」 9류 출원(박선일, 2026-07-30, 「교육용 소프트웨어」)** 1건 | 같은 이름 없음. 비슷한 이름 앱: 「일단고」(JLPT 일본어 앱, 두 스토어), 「일단(日単)」(JLPT), 「일단: 일정 관리」(Play), 「일단해 챌린지」. **여행 개념 앱 없음** | ildanga: 셋 다 비어 있음 | 국악 힙합 곡 「일단 가」(YouTube), 유튜브 채널 「일단가보는거지」, 블로그 후기 한 줄. 브랜드 주인 없음 | **1순위.** 「일단 가」가 P 느낌을 그대로 말한다. 지역 이름이 없어 확장에 맞다. 위험은 「일단고」 출원과의 유사(같은 9류, 한 음절 차이)와 스토어에서 JLPT 앱과 섞이는 것 |
| **일단제주** | 0건 (「일단」 단독은 다른 류에 117건이나 제주 결합은 없음) | 같은 이름 없음, 여행 개념 겹침 없음(Play 검색은 젠트립·탐나오 등 일반 제주 앱) | ildanjeju: 셋 다 비어 있음 | 「카페 일단 제주」(한림 월령리 카페, 클립)가 일부 점유. 브랜드 검색어를 쥔 서비스는 없음 | **2순위.** 가장 깨끗하다. 지역이 이름에 박혀 확장 때 「일단부산」처럼 늘려야 하는 부담(기분제주와 같은 약점) |
| **그냥가자** | 0건 (유사 「그냥고냥」 35류 포기, 「그냥 고로케」 43류 거절 — 모두 죽은 권리) | 같은 이름 없음. **개념이 가까운 「제주가자 - 제주 코스 여행 추천」(Play, PartyPeople)**, 「지금고고 : 즉흥 랜덤 여행」(BRIDGE Labs) | geunyanggaja: 셋 다 비어 있음 | TikTok 계정 「그냥가자」 2개, 카페 글 「영감님 그냥 가자」. 브랜드 주인 없음 | **3순위.** 이름은 깨끗하고 구어체라 P 느낌이 강하다. 흔한 말이라 식별력이 약하고 「~가자」 꼴 앱(제주가자)과 인상이 겹친다 |
| 즉흥제주 | 0건 (「즉흥여행」 0건) | 같은 이름 없음. 「즉흥」 개념 앱은 많다(Doing·돌리GO·픽앤고·즉흥여행 등 — §1-2) | jeukheungjeju: 셋 다 비어 있음. 한글 로마자 표기가 갈린다(jeukheung/jeugheung/jeukhung) — 표기 확정 필요 | 일반 글만 있다(카페 「즉흥 제주 여행」 글, 블로그). 주인 없음 | 4순위. 법·검색은 깨끗하나 「즉흥 여행」 개념 앱이 붐비고, 뜻 그대로의 설명어라 식별력이 약하다. 지역 고정 |
| 되는대로 | 0건 | 같은 이름 없음(검색 결과는 맞춤법·메모 앱 등 무관) | doeneundaero: 셋 다 비어 있음 | 국어사전 뜻풀이가 점유 | 5순위. 법은 깨끗하나 앱 이름으로는 뜻이 퍼져 있고 여행·장소 느낌이 없다 |
| 마음가는대로 | 「마음가는대로」 **16류 등록**(강태희, 문구류로 추정, 우리 류 밖) · 「마음가는 마켓」 35류 등록(박종건) · 「마음가는대로 나뚜라길」 39류는 소멸 | 같은 이름 없음 | maeumganeundaero: 셋 다 비어 있음 | 노래(멜론)·책·카페 글 점유. 브랜드 주인 없음 | 6순위. 35류에 가까운 등록(마음가는 마켓)이 있고 감성형이라 「계획 없는 P」보다 「힐링」 쪽으로 읽힌다. 글자가 길다 |
| P맘대로 | 0건 (유사 「피맘대로」도 여행·앱 관련 없음) | 같은 이름 없음 | pmamdaero: 셋 다 비어 있음 | 「맘대로」 노래·사전 뜻으로 해석되고 「P」는 무시된다 | 7순위. 읽는 법이 갈린다(피맘대로/P맘대로), 검색이 「맘대로」로 흘러 브랜드 검색이 안 된다 |
| ✗ **일단고** | **정확히 같은 「일단고」 9류 출원(박선일, 2026-07-30)**, 「일단고」 41류 등록(이진우, 2016) | **같은 이름의 앱**: 「일단고」(App Store 2026-07-21, SEON-IL PARK, Education) · 「일단고: 일본어 단어·문법·상용한자·JLPT」(Play `app.ildango`) | ildango.com 등록(2020-06-08), ildango.app 등록(2026-06-11), .kr 비어 있음 | 네이버 블로그 「일본어공부앱 JLPT공부 일단고」가 1위 | **탈락.** 같은 이름·같은 류(9류)·같은 스토어 |
| ✗ **노플랜** | **「노플랜(NOPLAN)」 20류·41류·42류 등록**(남선현·신서희, 2018; 42류는 디자인업) | 같은 이름 없음(검색은 플래너·메모 앱 일색). 「J플랜」 등 「플랜」 계열 앱은 붐빈다 | noplan.com 등록(2000-01-22), noplan.app 등록(2026-06-22) | 「노플랜 신림점」 혼술바, 평촌 「노플랜커피」, 「노플랜프로젝트」 등 이미 여러 업장이 쓴다 | **탈락.** 42류 등록과 동명 업장 다수. .com·.app 모두 선점됨 |
| ✗ **지금갈래** | **「세상의 모든 예약은, 지금갈래」 39·43류 공고**(주식회사 시즈더데이, 2024-06-18, 관광여행 예약·알선) | **같은 이름의 앱**: 「지금갈래 - 펜션·캠핑·카라반 예약」(App Store 2026-09-21, seizetheday, Travel). 「지금고고」(Travel)·「지금고」도 근접 | jigeumgallae: 셋 다 비어 있음 | 네이버 1위 **letsnowgo.app 「지금갈래 | 전국 펜션·캠핑·숙소 예약」** | **탈락.** 같은 이름·같은 류(39·43)·같은 카테고리 |
| ✗ **일단출발** | 0건 | 같은 이름 없음 | ildanchulbal: 셋 다 비어 있음 | **아름방송 TV 여행 프로그램 「일단 출발」(시즌 1, 24회 이상)**이 상위 점유. 사자 팬 카페 글 「일단 출발합니다」 | **탈락(검색·개념 점유).** 법은 깨끗하나 이름이 이미 TV 여행 프로그램이다 |
| ✗ **땡기는대로** | 「땡기는대로」 0건. 단 「땡기는」 계열 171건, 43류(음식점) 다수(땡기는 붕어빵 공고 등) | 같은 이름 없음 | ttaenginundaero: 셋 다 비어 있음 | **네이버 블로그·클립 「땡기는대로」**(구독 약 1.8천, 클립 140개)가 브랜드 검색을 이미 가졌다. 뜻도 「음식이 땡긴다」로 읽힌다 | **탈락.** 브랜드 검색 점유 + 음식 뜻 |
| ✗ **어쩌다제주** | 「어쩌다제주」 0건. 그러나 **「어쩌다 집」 12~45류 등록(어쩌다 주식회사, 39·42·43류 포함)**, 「어쩌다」 43류 등록 다수 | 같은 이름 없음 | eojjadajeju: 셋 다 비어 있음 | **「어쩌다 제주 혼술바」**(제주시 일도일동)·인스타 `eojjeoda_jeju` | **탈락.** 「어쩌다」 상표 밀집 + 동명 업장 |

### 7-2. 순위

1. **일단가** — 「일단 가」는 계획 없는 P의 말 그대로이고 지역이 없어 확장에 맞다. 정확히 같은 상표·앱·여행 개념 겹침이 0이다. 단 **「일단고」 9류 출원과 한 음절 차이**(유사 판단은 변리사 — **미확인**)와 JLPT 앱과의 스토어 혼동이 남는다.
2. **일단제주** — 어느 축에서도 걸리는 것이 없는 가장 깨끗한 이름. 제주 우선인 지금은 적합하나, 지역 확장 시 이름을 늘리거나 바꿔야 한다.
3. **그냥가자** — 깨끗하고 말투가 가장 가볍다. 흔한 말이라 식별력이 약하고 「제주가자」(코스 추천 앱)와 인상이 겹친다.

(참고) 「일단」이라는 말 자체는 KIPRIS에 117건, 앱스토어·Play에서 일정·암기·게임 앱에 흔히 쓰여 「일단」 단독으로는 식별력이 약하다. **1·2순위는 둘 다 「일단」을 쓰니 최종 선택 전에 하나로 정해 출원 범위를 정해야 한다.**

### 7-3. 미확인·한계

- 「일단가」 vs 「일단고」(9류 출원) 유사 여부, 「일단고」 출원이 등록될지 여부 — **미확인**(변리사·KIPRIS 심사 경과 확인 필요). 「일단고」의 상품은 「교육용 소프트웨어」로, 여행 앱과 유사군이 같은지는 **미확인**.
- 「노플랜」 20류·41류·42류 등록 외에 9·35·39·43류 상태는 1페이지(상위 결과)만 읽었다. 이미 탈락이라 더 보지 않았다.
- KIPRIS 요청은 §2와 같은 화면용 요청이며, 공개 전 출원은 안 보일 수 있다(§2-1). 일부 검색은 연결이 끊겨 재시도했다. `어쩌다제주`는 첫 시도에서 응답 실패 후 재시도로 0건을 확인했다.
- App Store 확인은 iTunes Search API 상위 6~8건, Google Play는 검색 HTML 상위 5건을 읽었다. 하위 결과는 미확인. Play에서 「일단 떠나는 제주 여행」·「제주 즉흥 여행」 같은 서술형 검색의 개념 겹침은 상위 5건만 읽었다.
- 도메인 「비어 있음」 = RDAP 404이며 등록 가능 보증이 아니다(§4와 같음). .com/.app은 RDAP 정상 응답(naver 등록 확인으로 대조).
- 네이버는 curl HTML 1회 표본(순서·개인화 변동 있음). Instagram·TikTok·YouTube 핸들 점유는 이번에 확인하지 않았다 — **미확인**.
- 법적 판단이 아니다.

### 7-4. 출처 (조회 2026-10-01)

- KIPRIS: `POST https://www.kipris.or.kr/kdtj/grrt1000a.do?method=searchTM` (§2-1 방식, 검색어: 후보 13개 + 일단Go·일단GO·걍가자·그냥고·당기는대로·땡기는·즉흥여행·노플랜제주·일단가자·지금가자·일단·어쩌다·피맘대로·일단간다·일단갈까·일단고고·되는대로)
- App Store: `https://itunes.apple.com/search?term=<검색어>&country=kr&entity=software` (후보 13개 + 일단 제주·제주 즉흥 여행·노플랜 여행·마음 가는대로 여행·일단 출발·그냥 가자·지금 갈래·지금고·지금고고)
- Google Play: `https://play.google.com/store/search?q=<검색어>&c=apps&hl=ko&gl=KR` (후보 13개 + 일단 떠나는 제주 여행). 앱: `app.ildango` · `com.poptato.app` · `com.bridge.hittheroad` · `com.jigeumgo.app` · `com.travelgo.letsgohere`
- 도메인 RDAP: `https://rdap.verisign.com/com/v1/domain/<이름>.com` · `https://rdap.nic.or.kr/domain/<이름>.kr` · `https://pubapi.registry.google/rdap/domain/<이름>.app`
- 네이버: `https://search.naver.com/search.naver?query=<후보>` (curl HTML) — 근거 페이지: https://letsnowgo.app/ · https://blog.naver.com/taekstory/224372054995 · https://www.abn.co.kr/tv/tvProgramEndView.do?progseq=13 · https://blog.naver.com/iamdesigner · https://www.siksinhot.com/P/1905005

## 출처 목록 (조회 2026-10-01)

- App Store: https://apps.apple.com/kr/app/id6806749553 · https://apps.apple.com/kr/app/id6777857291 · https://apps.apple.com/kr/app/id6806508654 · https://apps.apple.com/kr/app/id6805714195 · https://apps.apple.com/kr/app/id6651825231 · https://apps.apple.com/kr/app/id6790246818 (세곳) · iTunes API https://itunes.apple.com/search · https://itunes.apple.com/lookup
- Google Play: https://play.google.com/store/apps/details?id=com.ptrip.p_trip&hl=ko · https://play.google.com/store/search?q=P%EC%9D%98%20%EC%97%AC%ED%96%89&c=apps&hl=ko&gl=KR · https://play.google.com/store/apps/details?id=com.acroj.random_travel · https://play.google.com/store/apps/details?id=com.reed.random.travel · https://play.google.com/store/apps/details?id=com.bridge.hittheroad
- 이지티켓: https://easyticket.co.kr/apps/ptrip/
- GitHub: https://github.com/Hyee0ne/p-trip
- KIPRIS: https://www.kipris.or.kr/khome/search/searchResult.do?tab=trademark (요청 `POST /kdtj/grrt1000a.do?method=searchTM`) · https://plus.kipris.or.kr/
- 네이버: https://search.naver.com/search.naver?query=P%EC%9D%98%20%EC%97%AC%ED%96%89 · `query=P%EC%9D%98%EC%97%AC%ED%96%89` · `query=P%EC%9D%98%20%EC%97%AC%ED%96%89%20%EC%A0%9C%EC%A3%BC` · `query=P%EB%93%A4%EC%9D%98%20%EC%97%AC%ED%96%89`
- YouTube: https://www.youtube.com/results?search_query=%22P%EC%9D%98+%EC%97%AC%ED%96%89%22&sp=EgIQAg%253D%253D · https://www.youtube.com/@P-ravelling · https://www.youtube.com/@travelofP-korea
- 도서: https://www.yes24.com/product/goods/145334049
- 웹: https://brunch.co.kr/@readcontents/18 · https://www.allurekorea.com/2023/07/18/p%EC%9D%98-%EC%97%AC%ED%96%89/ · https://www.clien.net/service/board/park/18400453 · https://www.youtube.com/channel/UC3ApmZZ7rKbRuCrzQ48NnMg/videos (무작정_제주) · https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=39691431
- RDAP: https://rdap.verisign.com/com/v1/domain/ · https://pubapi.registry.google/rdap/domain/ · https://rdap.nic.or.kr/domain/ · https://data.iana.org/rdap/dns.json
