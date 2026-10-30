# 여차나:제주 — P를 위한 여행동반자

> **현재 제품**: 여차나:제주(ADR-0082·ADR-0084, https://yeochana.com). 목적: 「지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.」(ADR-0077 Amendment 2) — 현지에서 내 위치 기준으로 지금 주변에 흥미로운 곳이 있나 보고, 괜찮으면 눌러서 바로 간다.
>
> **2026-09-30 방향 전환**: 제품 방향은 `0025-pivot-to-tomorrow-picker.md`(~~"내일 뭐하지"~~ 파트너, 기준 순간은 ADR-0059로 "지금", 이름은 ADR-0082로 「여차나:제주」), `0026-no-login.md`(로그인 없음), `0027-mobile-web-frozen-data.md`(폰 우선 웹 + 고정 데이터)이 우선한다. 아래 내용 중 이와 충돌하는 부분(큐레이션·일정·로그인·데이터 수집)은 이전 방향의 기록이다.

> 아래 소개·Mission·Validation criteria·Language 절은 **이전 방향(2026-05, Jeju Travel All-in-One) 기록**이다. 현재 웹 앱 용어는 「웹 앱」 절을 본다.

A single-context app covering the entirety of a short-stay Jeju trip — from arrival to departure — replacing the 8-app stack most travellers currently use. Value is in curation and context, not inventory or payments.

## Mission

**"제주에서 머무는 시간을 돌려드린다. 여행을 잘 아는 친구가 옆에 있는 것처럼."**

Monetisation is not a v1 decision criterion. Affiliate fees, ads, and partnerships do not influence feature or design decisions in v1.

### Validation criteria

When evaluating any feature, design decision, or scope call, apply these 11 criteria. Conflict resolution order: **B5 > A5 > A1 > A4 > others**.

| ID | Criterion | Description |
|----|-----------|-------------|
| A1 | Comfortable | Is the user at ease? No friction, no overwhelm. |
| A2 | Smart | Does the app understand the user? Contextual, not generic. |
| A3 | Genuinely useful | Does it actually help with the trip? Not just pretty. |
| A4 | Partner-like | Feels like a knowledgeable friend, not a service counter. |
| A5 | Monetisation-agnostic | Revenue logic does not shape the experience. |
| B1 | Trustworthy | No hallucination, sourced claims, fresh information. |
| B2 | Lightweight | Minimum input required, minimum decision burden. |
| B3 | Immediate | Now, here, fast. Latency and friction both count. |
| B4 | Honest | No ad-copy tone. Real curation, real opinions. |
| B5 | Non-destructive | Automation never overwrites Traveller intent. |
| B6 | Familiar | Respects Korean user patterns (찜하기, 카카오, etc.). |

## 웹 앱(~~내일 뭐하지~~ ~~P의 여행~~ ~~여행계획짜기 귀찮아:제주~~ ~~여행귀:제주~~ 여차나:제주)

앱 이름 `여차나:제주`(태그라인 「P를 위한 여행동반자」, 홈 화면 아이콘 아래 `여차나`, 첫 화면 이름 줄 「여차나:제주 · P를 위한 여행동반자」. ADR-0077 Amendment 1. 주소 `yeochana.com`(ADR-0084). ADR-0082가 ADR-0077 1·2·4·5·6을 대체). 다른 지역으로 넓히면 콜론 뒤만 바꾼다(`여차나:부산`). 부산은 따로 있는 앱이 아니라 **같은 앱 안의 한 곳**이다: 주소는 yeochana.com 하나, 저장·뺀 곳·언어 설정을 함께 쓰고, 지금 고른(또는 GPS가 있는) 곳에 따라 콜론 뒤가 바뀐다(2026-10-17 주인 결정, 그릴링). 계획 없이 다니는 여행자가 "지금 여기서 뭐하지?" 할 때 켜는 파트너. 기준 순간은 "지금"이고 날짜 줄은 오늘 날짜다(`0025-pivot-to-tomorrow-picker.md`의 "밤에 내일 뭐하지?"를 대체). 날짜별 보관은 v2. 출처: ADR-0059.

`apps/web`의 용어. 아래 "Language" 절의 Traveller·Spot·Shortlist 등 정의는 이전 코드베이스(`apps/api`, `apps/mobile`)에 적용된다. 웹 앱에는 로그인·계정이 없고(`0026-no-login.md`), 데이터는 고정 JSON이다(`0027-mobile-web-frozen-data.md`, ADR-0058로 완화).

**목적**:
지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 주고, 마음에 들면 바로 길찾기로 보낸다. 홈 설명 문장과 GPS 라벨 `내 위치 근처`가 이 목적을 말한다. 일정·코스는 짜지 않는다. 출처: ADR-0077 Amendment 2.

**기분**:
첫 화면에서 한 번 누르는 버튼. 6개: 푹 쉬고 싶어(`rest`) / 좀 걷고 싶어(`walk`) / 새로운 거 해보고 싶어(`new`) / 유명한 데 가 보고 싶어(`famous`, ADR-0092) / 맛있는 거 먹고 싶어(`food`) / 아무거나 골라줘(`any`). `any`는 쉬기·걷기·새로운 것에서 한 장씩, 먹기는 섞지 않는다. 먹기는 식사 | 카페·디저트로 나뉜다. `famous`는 장소의 기분이 아니라 **유명한 곳**만 고르는 버튼이다(장소의 `mood`는 넷 그대로). 출처: `0028-include-food-and-full-review.md`, ADR-0092.

**유명한 곳(famous)**:
「여기 왔으면 보는」 이름난 경관·명소. 데이터 `famous: true`. 정하는 규칙은 고정이다. 비짓제주 원문 분류가 관광지(`sightseeing`)이고 만족도 5점이거나, 비짓제주 태그 `공영관광지`가 있고 만족도 4점 이상인 곳 중에서 먹기·식당·카페·쇼핑, 이름·태그에 카페·커피·빵·베이커리·디저트가 있는 곳, `제주올레 N코스`를 뺀다. 만족도 5점만으로 정하지 않는다(바다 보이는 카페가 섞인다). 쉬기·걷기·새로운 것 어디에 있든 상관없다. 실내도 늘 후보이고 비 와요(실내만)면 실내 곳만 고른다(실내 구경 보충 없음). 순서는 **인기**(사람들이 그곳을 검색하는 횟수: 그곳을 부르는 이름 여럿의 네이버 검색광고 월간 PC+모바일 검색수 합, 2026-10-16 측정, 로그로 0~1, Amendment 4·5)와 **가까움**(범위 안 이동 분)을 반반 더한 합 높은 순이다(ADR-0092 Amendment 2). 범위·넓히기·순환·밤 규칙은 다른 기분과 같다. 배지·카드 글자가 아니다. 출처: ADR-0092, `specs/famous-places.md`. 부산(비짓제주 태그가 없다)은 TourAPI 분류가 관광지이고 네이버 검색광고 월간 검색수 상위 60곳을 유명한 곳으로 한다(2026-10-17 그릴링, 60곳은 ADR-0094 Amendment 1). 부산 장소의 만족도도 블로그·카페 언급량이 아니라 같은 검색수로 매긴다.
_Avoid_: 랜드마크(동네의 대표 지명 `areas.ts` `landmark`와 다르다), 인기(인기 지표는 데이터에 없다), 핫플

**여행지**:
앱이 다루는 큰 단위. 지금 제주·부산·강릉(검수한 곳, 강릉은 코드 `gangwon`: 강원의 검수한 곳이고 지금은 강릉 한 시군구, ADR-0102)과 **다른 곳**(자동 지역 전체, 코드 `nation`). 이름 줄 콜론 뒤(`여차나:제주`·`여차나:부산`·`여차나:강릉`)가 지금 여행지이고, 다른 곳에서는 지금 시군구의 짧은 이름이다. 세부 지역은 여행지 안에 있다. 출처: 2026-10-17 그릴링(주인 결정), ADR-0101, `plans/nationwide-app.md` 1.2.
_Avoid_: 지역(기준의 「지역」·세부 지역과 겹친다), 도시(제주는 도), 권역, Region(이전 코드의 제주 안 5권역)

**장소 범위**:
여행지마다 같은 기준으로 넣는 곳: 관광지, 문화시설, 레포츠·체험, 음식점(카페 포함), 기간 있는 축제·행사, 그리고 쇼핑 가운데 **전통시장·백화점·아울렛·특색 있는 편집숍**만. 면세점, 체인 매장, 일반 상점, 숙박은 넣지 않는다. 시장은 구경·먹기로, 백화점·아울렛·편집숍은 「새로운 거 해보고 싶어」의 쇼핑 탭으로 보인다. 쇼핑 탭은 첫 출시 뒤로 미뤘다(두 여행지 모두, 편집숍 출처를 정한 뒤 같이 연다). 전통시장은 첫 출시에 들어간다. 출처: 2026-10-17 그릴링(주인 결정), ADR-0094 Amendment 1, `specs/busan.md`.

**시작 화면**:
여행지를 아직 모르는 첫 방문에만 홈 위에 덮는 화면. 큰 「내 위치로 시작하기」(누를 때 위치 권한을 묻고, 여행지 안이면 그 여행지로 연다) 아래에 「제주」·「부산」 칸. 권한을 거절했거나 위치가 여행지 밖이면 두 칸에서 고른다. 그 아래에 인기 칸 6개(서울·강릉·경주·전주·여수·속초, 누르면 그 시군구의 자동 지역, 강릉은 검수한 곳 강릉)와 글자 버튼 `다른 곳`(시도 17 → 시군구, `뒤로`)이 있다. 위치가 한국 안이고 검수한 곳 밖이면 그 시군구의 자동 지역으로 바로 열고, 한국 밖이면 `지금은 한국 밖이에요. 여행지를 골라 주세요.`(ADR-0101 3, `plans/nationwide-app.md` 4), 한국 안인데 가까운 시군구가 없으면 `이 근처는 아직 장소 자료가 없어요. 여행지를 골라 주세요.`(아래 **검수한 곳 / 자동 지역**의 한국 밖). 고른 여행지는 기억하고, 그 뒤로는 위치가 다른 여행지 안일 때만 자동으로 바꾼다. 숙소 링크·장소 쪽·`?area=` 같은 링크로 들어오면 그 여행지로 바로 열고 시작 화면은 없다. 페이지가 열리자마자 위치를 묻지 않는다. 출처: 2026-10-17 그릴링(주인 결정).
_Avoid_: 온보딩, 선택 페이지(별도 주소가 아니다)

**세부 지역**:
여행지 안에서 기준으로 고를 수 있는 동네. 행정구가 아니라 여행자가 「어디 가자」고 부르는 덩어리이고, 장소는 가장 가까운 동네에 든다. 제주 15곳: 제주시 쪽(구제주, 신제주, 애월, 한림, 한경, 조천, 구좌, 우도)과 서귀포 쪽(서귀포시내, 중문, 안덕, 대정, 남원, 표선, 성산). 부산 12곳(2026-10-17 그릴링): 해운대, 송정·기장, 광안리, 센텀, 서면, 원도심(남포·자갈치·국제시장), 부산역·초량, 영도, 송도·감천, 다대포, 동래·금정, 오륙도·용호. GPS를 쓸 수 없을 때도 같은 목록에서 고른다. 동네 칸에 대표 지명을 함께 보인다. 자동 지역에서는 **시군구**가 이 자리다(아래 **시군구 기준**). 출처: `0029-destination-areas-and-saves.md`, SPEC D7(ADR-0058).

**검수한 곳 / 자동 지역** (전국 확장, ADR-0101):
앱은 전국 어디서든 내 위치로 열린다. 장소의 품질은 두 층이다. **검수한 곳**은 장소마다 AI 판정과 따로 돌린 모델 표본 감사(다시 판정·사실 확인)를 거쳐 기분·이유 문장·유명한 곳을 붙인 여행지다(지금 제주·부산·강릉). 강릉은 사람 표본 검수 없이 올렸다(ADR-0102 Amendment 1). 이 정의는 ADR-0101 때 「사람 표본 검수」라고 썼으나, 부산 기록(`apps/web/review/busan/REPORT.md`)에도 사람이 본 표본은 없다(2026-10-30 확인). **자동 지역**은 그 밖의 전국이고, 한국관광공사 공공 데이터(TourAPI) 분류에서 미리 적고 블라인드 표본으로 잰 규칙으로 기분·실내를 붙인다(`plans/nationwide.md` 3). 이유 문장이 없고, 장소 id는 `nt-<contentid>`, 점수가 모두 같아 카드는 가까운 순이다(결과 머리 `공공 데이터로 가까운 순으로 골랐어요.`, 출처 줄 `정보·사진: 한국관광공사`). 자동 지역에는 기분 가운데 먹기·걷기·새로운 것·아무거나만 나오고(쉬기·유명한 곳은 검수한 곳에서만, 유명한 곳의 전국 확대는 다음 단계), 받은 데이터에 3곳 미만인 기분도 숨는다. 아무거나는 걷기·새로운 것에서 한 장씩, 셋째 장은 두 풀을 합친 다음 곳(먹기 없음). 홈의 오늘 판은 날짜·해 지는 시각·비 소식만 나온다(노을·장날·산길·철은 검수한 곳에서만). 위치를 못 쓸 때는 시작 화면에서 검수한 곳과 인기 칸 6개, 그 밖은 「다른 곳」(시도 → 시군구)으로 고른다. 이름 줄 콜론 뒤는 제주·부산은 그대로, 나머지는 시군구 짧은 이름이다(끝 시·군·구를 떼고 겹치거나 짧으면 시도를 붙임: `강릉`, `서울 중구`). 한 점이 어느 층인지는 제주·부산 안이면 그 여행지, 아니면 35km 안 가장 가까운 시군구 중심으로 정하고(경계선 아님), 그보다 먼 섬은 그 섬의 점 25km 안이면 그 시군구다(독도 → 울릉군, 백령도·연평도 → 옹진군, 흑산도·가거도 → 신안군, 거문도 → 여수시 등, 추자도는 제주). 그래도 없으면 자료가 없는 곳이고, 「한국 밖」이라고 말하는 것은 넓게 그린 한국 테두리(독도·백령도·가거도·마라도를 다 품는다) 밖일 때만이다. 한국 안이거나 확실하지 않으면 `이 근처는 아직 장소 자료가 없어요.`라고만 한다(영토를 두고 어느 쪽으로도 말하지 않는다). 출처: 2026-10-30 배포 전 리뷰 M-1. 사람이 많이 찾는 자동 지역은 나중에 검수한 곳으로 올린다(id `nt-`는 그대로). 첫째가 강릉이다(2026-10-30, ADR-0102): 한 점이 강릉시의 시군구로 판정되면 검수한 곳 강릉이고, 자동 지역 목록에서는 강릉 레코드가 빠진다. 동네 자리는 그 시군구 자체(`51150`)이고 동네 칸은 강원의 시군구 목록이라, 거기서 속초 같은 이웃을 고르면 자동 지역으로 옮긴다. 속초·양양·춘천·평창은 판정이 끝나면 같은 여행지에 더한다. 랜딩 페이지는 넓히지 않는다. 출처: 2026-10-27 그릴링(주인 「(다)」「(나)」「(나)」「(가)」「(가)」「(가)」), ADR-0101, `plans/nationwide-app.md`.
_Avoid_: 1군·2군, 정식·임시(품질 차이를 부끄럽게 부르지 않는다), 큐레이션 지역(검수한 곳이라 부른다)

**시군구 기준**:
자동 지역의 동네 자리. 기준 시트·시작 화면에서 고르는 단위가 시군구이고(값은 시군구 코드, 예 `51150` 강릉시. `중구`·`고성군`처럼 이름이 겹쳐 코드로 둔다), 동네 칸은 지금 시도의 시군구와 `다른 시도`다. 지역 기준이면 고른 시군구 중심에서, 내 위치 기준이면 그 점에서 가까운 순으로 고른다. 위치를 아직 못 읽었으면 마지막 시군구(`jeju.sgg`) 중심이 약한 출발점이다. 비 소식은 시군구 중심의 기상청 격자로 묻는다(기기 좌표는 보내지 않음). 저장 키는 ADR-0097 Amendment 1(`jeju.dest` `'nation'`, `.nation` 꼬리 키, `jeju.sgg`). 사용 기록에는 지역 기준일 때만 고른 시군구가 나간다. 출처: `plans/nationwide-app.md` 1.4·3·5·7, ADR-0097 Amendment 1.

**지금 여기서**:
첫 화면 위에 큰 사진 카드로 보이는 한 곳. 열자마자 내 위치 근처에서 지금 갈 만한 곳 하나를 보이고 길찾기가 붙는다. 고르는 규칙은 「아무거나」의 첫 장과 같다(먹기를 섞지 않는다). 자동 지역에서는 쉬기가 없어 걷기·새로운 것에서 고른다. 아래 기분 카드를 대신하지 않는다. 출처: 2026-10-27 그릴링, ADR-0101.

**공유 묶음**:
지금 보고 있는 추천 1~3곳을 링크 한 줄로 동행에게 보내는 것. 받은 사람은 같은 곳을 열고, 링크로 들어오면 시작 화면이 없다. 출처: 2026-10-27 그릴링, ADR-0101.

**기준**:
카드를 가까운 순으로 고를 출발점. 세 가지: 내 위치(GPS, 기본) / 숙소 / 지역. 라벨은 `내 위치 근처`(ADR-0077 Amendment 2) / `숙소 근처` / `{지역} 근처`, GPS 권한 거절 등이 알려지면 `지역 고르기`. 숙소는 "지금 위치를 숙소로 저장" 또는 지역 선택으로 정한다(검색 없음). 어제 고른 지역 기준은 GPS로 되돌리지 않는다. 출처: `0029-destination-areas-and-saves.md`, SPEC §6.2·§16 D1·D5, `plans/tomorrow-picker.md` OQ3, ADR-0058.

**숙소 링크**:
숙소가 체크인 안내에 넣는 주소 `/?stay=<위도>,<경도>&src=<꼬리표>`. 열면 그 점이 숙소(기준 = 숙소, `숙소 근처`)가 되고 위치 권한을 묻지 않는다. 꼬리표는 숙소마다 정한 경로 이름(사람이 아님)으로, 그 방문 동안 들어옴·기분 누름·길찾기를 꼬리표별로 센다. 숙소는 고르기에 영향이 없다. 출처: ADR-0089, `specs/partner-stay-link.md`.

**카드**:
기분을 누르면 나오는 장소 3장. 사진·이름·이유 문장·"차로 약 N분", 가격·운영시간·평점 없음(자동 지역 카드는 이유 문장 줄이 없다). 누르면 지도 앱 길찾기로 바로 간다 — 기본 네이버지도, 설정에서 카카오맵·TMAP(좌표가 없으면 그 앱의 이름 검색). 출처: ADR-0071. 기분을 다시 누르면 마지막으로 본 3장, 다음 3장은 `다른 3곳 보기`. 출처: `0025-pivot-to-tomorrow-picker.md`, `0028-include-food-and-full-review.md`, SPEC §16 D2(ADR-0058).

**저장(하트)**:
카드 이름 오른쪽 하트로 저장/해제. 기기에만(`localStorage['jeju.saved']`) 남는다. 저장이 1개 이상일 때만 상단에 `♥ N`, 누르면 저장한 곳 목록(기준에서 가까운 순). 일정·날짜 배정 아님. 출처: `0029-destination-areas-and-saves.md`, SPEC §16 D3(ADR-0058).

**뺀 곳(가 봤어요)**:
결과 카드의 `가 봤어요`로 이 기기에서만 다음 고르기부터 후보에서 뺀 곳(`localStorage['jeju.visited']`, 최대 500). 결과 카드·홈 「예:」·노을 볼 곳·오늘 장 서는 곳에서 빠지고, 저장한 곳 목록·랜딩·장소 페이지·사용 기록 집계에는 그대로다. 지금 화면의 카드는 그대로 둔다. 누른 자리 상태 줄의 `되돌리기`나 저장한 곳 화면 `설정` 아래 `가 본 곳 N곳`에서 다시 넣는다. 데이터의 `hide`(폐업·이전 의심으로 어디서나 숨김)와는 다른 것이다 — 이름·키를 섞지 않는다. 출처: ADR-0087, `specs/hide-visited.md`.
화면 이름은 **가 본 곳**(ADR-0090, 카드의 `가 봤어요`와 이어지게): 화면의 `가 본 곳` = 이 문서의 `뺀 곳`, 같은 것이다. 저장 키·이벤트·코드 이름(`jeju.visited`, `visited`·`unvisited`)은 그대로다.
_Avoid_: 숨긴 곳·숨김(데이터의 `hide`), 방문 기록, 블랙리스트

**랜딩 · 장소 페이지**:
앱 밖의 정적 HTML(`/jeju/**`, 스크립트 없음). 허브 `/jeju/`, 세부 지역 15쪽, 검색어 gate를 통과한 기분 조합 쪽, 그리고 장소마다 한 쪽(`/jeju/<지역>/<장소 슬러그>/`: 이름·이유 문장·사진·동네·기분·실내·장날·가까운 곳·네이버지도 길찾기·앱 딥링크). 앱의 카드가 아니다 — 검색·AI가 읽고 앱으로 들어오는 입구. 출처: ADR-0072, `specs/seo-landing.md`.

**이유 문장**:
카드의 추천 이유 한 줄. 보유 텍스트만 근거로 쓰고 원문에 없는 사실을 넣지 않는다. 15~70자, 끝 마침표 없음, 금지어 0건. 출처: `0028-include-food-and-full-review.md`, SPEC §10, ADR-0058.

**오늘 판**:
홈 앱 이름 줄 아래 두 줄. 첫 줄은 날짜(+회색 정보, 해 지는 시각 등), 둘째 줄은 누를 수 있는 줄 최대 하나 — 비 소식 → 노을 볼 곳 → 오늘 장날 순. 다음 14일 동안 그 줄이 서는 때를 이 기기에만(`localStorage['jeju.row']`, 여행지와 시각만, 내 위치 기준이면 쓰지 않음) 적어 두고, 다음 방문에 데이터 전에 그 자리를 잡는다. 출처: ADR-0075, 노을은 ADR-0083, 저장 키는 ADR-0097 Amendment 2.

**노을 볼 곳(sunsetView)**:
해 지는 방향(242°·264°·298°)으로 바다 위에 해가 지는 게 OSM 해안선 계산으로 보이고 원문으로 확인된 곳. 오늘 판에는 해 지기 2시간 30분 전부터 해 질 때까지, 차로 45분 안에 3곳 이상일 때만 줄로 뜬다. 출처: ADR-0083.

**야외 산길(trail)**:
걷는 것이 주인 곳 중 시내에서 떨어진, 밤에 어두운 자연 산길 — 오름, 산·봉우리 오르기, 숲길·숲 탐방로·자연휴양림·곶자왈, 계곡 탐방로, 산간 둘레길. 해변·해안 산책로·포구, 시내 공원·광장·마을 돌담길, 차로 바로 닿는 전망대, 정원·테마파크 같은 운영 시설, 실내는 아니다. 장소 원문으로 판정하고 블라인드 다시 판정을 통과한 회차만 데이터에 붙는다(`trail: true`). **밤**(「지금」이고 기준점에서 해 진 뒤 ~ 해 뜨기 전, 날짜 모드에는 없음)에는 결과 카드·`다른 3곳 보기`·홈 「예:」에서 다른 후보 뒤로 간다 — 빼지 않는다(다른 후보가 모자라면 나온다). 그래서 순서가 바뀌었으면 상태 줄에 `밤이라 산길은 뒤로 미뤘어요.`. 밤에는 기준점이 그 섬 위가 아닌 **배로 가는 섬**(비양도·우도 등, 데이터 표시 없이 판단)도 같이 뒤로 가고, 밀린 것에 맞춰 `밤이라 배로 가는 섬은 뒤로 미뤘어요.`·`밤이라 산길과 배로 가는 섬은 뒤로 미뤘어요.`(Amendment 1). 배지·필터·카드 글자가 아니다. 출처: ADR-0091, `specs/night-trails.md`.
_Avoid_: 밤에 닫는 곳(운영시간은 데이터에 없다)

**비 소식**:
기상청 단기예보로 기준 동네에 비가 오면 오늘 판에 띄우는 줄. Pages Function 하나(`/api/rain`)로 받고 동네 이름만 보낸다(자동 지역은 시군구 중심의 격자 번호 `?grid=`). 누르면 실내만 보기(ADR-0065). 출처: ADR-0076, `plans/nationwide-app.md` 5.

**사용 기록**:
세 갈래: 자체 익명 기록(`/api/events`, ADR-0061) · GA4 · 네이버 애널리틱스. 운영 빌드는 셋 중 하나라도 빠지면 배포하지 않는다. 출처: ADR-0078.

**철(시기)**:
한 장소에서 해마다 그곳을 찾을 이유가 생기는 시기(꽃·억새·단풍·귤 따기). 장소의 비짓제주 원문이 그 장소에 그것이 있다고 말할 때만 붙는다. 시기는 두 가지다. **관측형**(벚꽃·매화·단풍)은 그해 기상청 계절관측의 가장 가까운 지점 관측일부터 종류별 며칠 동안이고, 그해 관측일이 나오기 전에는 없다. **원문 기간형**(유채꽃·수국·억새·동백·귤 따기·핑크뮬리)은 그 장소 원문이 말한 달(한 달 전체가 들어갈 때만)이고, 원문에 달이 없으면 없다. 고정된 기본 달은 쓰지 않는다. 해수욕장은 철이 아니다(연중 보통 장소, 개장은 행사). 보는 날(지금 = 오늘, 날짜 모드 = 고른 날)이 그 시기 안일 때만 결과 카드 메타 줄 글자(`벚꽃 철`)로 보이고, 점수가 같은 카드 안에서 장날 다음으로 앞선다. 배지·필터·기분·오늘 판 줄이 아니다. 「피어 있다」는 약속이 아니다. 출처: ADR-0080, `specs/seasonal-spots.md`.

**행사**:
시작일·종료일이 있는 일(축제, 해수욕장 개장, 연말연시 일출 행사처럼 해마다 날짜가 바뀌는 것 포함). 장소의 성질인 철과 달리 날짜를 해마다 확인해야 한다. 2단계에서 두 출처 날짜가 맞는 것만 오늘 판 한 줄 후보가 된다(아직 없음). 출처: ADR-0080(범위 구분), `docs/research/seasonal-events-01.md`.

## Language

### Core structure

**Traveller**:
The person who uses the app. Always an authenticated account holder (Kakao social login); no guest mode. Owns a Shortlist and zero or more Trips. The domain-layer term for the human actor; distinct from the authentication-layer `User` (account credential holder).
_Avoid_: User (in domain code), member, customer, visitor, guest

**Trip**:
A Jeju visit with a fixed date range owned by one Traveller. The top-level container for a DayPlan and zero or more Bookings. Duration is variable (day-trip to 1+ weeks); 2–6 nights is the primary target but is a default, not an invariant. No hard duration validation beyond rejecting negative or physically impossible values.
`dateRange` is required — not nullable (D2). When natural-language input fails to yield a date range, the system infers a default: next weekend, 1박2일 (KST). The inferred value is shown at the top of the result screen with a one-tap edit affordance; no extra question turn is added (B2, B5).
_Avoid_: Journey, session, vacation, travel

**DayPlan**:
The day-by-day Spot grouping inside a Trip. Contains one Day per calendar date in the Trip's date range. No time slots — Spots within a Day are ordered but not time-assigned. Replaces the deprecated `Schedule` concept.
_Avoid_: Schedule, itinerary, plan, timetable

**Day**:
A first-class citizen within a DayPlan, identified by `dayIndex` (1, 2, 3, …) with an associated `date: CalendarDate`. Holds an ordered list of Spots (`pinnedSpots`). Spots are added via `pin(spot)` and removed via `unpin(spot)`. Order implies a loose visiting sequence; no time constraints are enforced.
When Trip dates shift, `dayIndex` is preserved and `date` is updated — `pinnedSpots` follow the index, not the calendar date.
When a Trip is shortened, the Traveller is warned ("Day N's M pinned Spots will be removed"); on confirmation those Days are unpinned and removed; on refusal the shortening is cancelled.
_Avoid_: Slot, block, period, time-block

**Spot**:
The atomic content unit — any place a Traveller can go or thing they can do in Jeju (restaurant, beach, attraction, activity provider, accommodation). Lives in a self-curated database; metadata (name, coordinates, hours) seeded from Kakao Local API. Carries three distinct scores (D-CUR-3):
- `curationScore` (SMALLINT, manual): curator-assigned editorial quality judgment — "thesis quality, 너 픽만". Set only after curator approval via the CurationCandidate flow; never auto-computed.
- `popularityScore` (SMALLINT, auto): refreshed by the popularity data pipeline from public data (Jeju Tourism Organization card-sales TOP15, Kakao Map ratings and review counts).
- `trendScore` (SMALLINT, auto): refreshed by the trend data pipeline from SNS mention volume and search-trend time series (NAVER datalab, visitkorea datalab, TrendSource ACL).
Also carries `embedding VECTOR(1024)` — populated at seed time for semantic similarity lookups; not used for SpotPreferences computation (D4). Photos are not stored — served at runtime via Kakao Maps Places widget embed. "Hidden Gem" is a UI label (high `curationScore`, low `popularityScore`) — not a domain type.
_Avoid_: Place, venue, location, experience, activity (as standalone nouns), HiddenGem (as a type)

**Booking**:
A time-ranged external reservation link belonging to a Trip. Shape: `{ type, deepLink, timeRange }`. No status machine — the domain does not track whether the reservation was confirmed; that is the Traveller's responsibility. Partner brands are ACL-layer concerns only. Webhook/status tracking deferred to v2.
_Avoid_: Reservation, purchase, order

**Shortlist**:
A Traveller-owned collection of Spots with no date assignment. Operates independently of any Trip. Serves as the staging area before Spots are distributed into a DayPlan. Rendered as "찜하기" in the UI; the domain term is always Shortlist.
_Avoid_: Wishlist, saved items, favourites, bookmarks, 찜 (in code)

### Value objects

**CalendarDate**:
A timezone-free date (`YYYY-MM-DD`) fixed to KST (UTC+9). No timezone conversion anywhere in the system. Used as the `date` field on Day and the time range boundaries on Booking.
_Avoid_: DateTime, timestamp, UTC date

**Region**:
A value object on Spot that classifies its geographic area within Jeju. Values: `jeju-city | eastern | seogwipo | western | hallasan`. Outlying islands (Udo, Gapado, Marado) are temporarily classified under `eastern` or `western` in v1; an `islets` value may be added in Light Spec. Used by ScheduleComposer for Day clustering.
_Avoid_: District, zone, area, 지역 (in code)

**priceRange**:
A value on Spot indicating rough cost tier: `free | budget | mid | premium`. No exact monetary values stored. No `Money` type in the domain — affiliate deepLink model means no payments are processed.
_Avoid_: Money, Price, cost, fare

### Lifecycle

**TripPhase**:
The lifecycle state of a Trip: `planning` (before departure), `active` (currently in Jeju), or `completed` (after return). Governs which features are foregrounded — curation and DayPlan building in `planning`, spontaneous recommendation in `active`. Transition triggers (date-based, GPS, manual) are deferred to Light Spec.
_Avoid_: TripStatus, TripState, TripMode

### Discovery & recommendation

**SpotPreferences**:
A derived, non-persisted value computed on demand from a Traveller's Shortlist — specifically the distribution of Spot categories (types) it contains. Format: a map from Spot category to frequency weight, e.g. `{ oreum: 0.4, cafe: 0.3, beach: 0.3 }`. The sole taste signal in v1; no separate input step. Consumed by the Recommender to weight ranked output toward the Traveller's inferred category preferences. Never stored as a separate entity. Not an embedding vector — SpotPreferences is an interpretable categorical distribution, not a dense float array (D3).
_Avoid_: TasteProfile (implies persistence), UserPreferences, interests, embedding vector

**RecommendationContext**:
A value object capturing the inputs to a recommendation call. In v1 (`recommendForShortlist`): Traveller + Trip metadata + `CalibrationProfile`. In v2 (`recommendNow`): Traveller + current GPS coordinates + remaining time + `CalibrationProfile`. The Recommender accepts a RecommendationContext and returns a `RecommendationResult` containing two `RecommendationSection`s (ADR-0017).
_Avoid_: RecommendationRequest, RecommendationInput

**Recommender**:
A domain service that ranks and surfaces Spots in two separate tracks (D-CUR-1, ADR-0017):
- `curatedPicks`: ranked by `curationScore`, filtered to categories matching `SpotPreferences`. Represents the curator's personal selection — unaffected by saturation or popularity.
- `popularSpots`: ranked by `popularityScore` weighted by `CalibrationProfile` ratio; Spots whose saturation metrics (혼잡도, TOP15 카드매출) exceed threshold are down-ranked within this track (D-CUR-6).
The Recommender never merges the two tracks into a single weighted score (ADR-0017). Consumers receive a `RecommendationResult { curatedPicks: RecommendationSection, popularSpots: RecommendationSection }`.

Two operations, scoped by version:
- v1 — `recommendForShortlist(context)`: supplements a Traveller's Shortlist with curated Spots when the ScheduleComposer needs more content to fill a DayPlan.
- v2 — `recommendNow(context)`: surfaces immediately relevant nearby Spots based on GPS and remaining time (Now Mode).
Both operations share the same service; v2 adds a new call, not a new service.
_Avoid_: RecommendationEngine, SuggestionService, ConciergeService

**ScheduleComposer**:
A domain service invoked explicitly by the Traveller to distribute Spots from a Shortlist into a DayPlan draft via geographic clustering. Returns a proposed DayPlan for the Traveller to accept or modify — does not auto-apply. Does not assign times, check conflicts, or reorder based on travel duration. DayPlan authority always stays with the Traveller.
Minimum Shortlist size: 1 Spot (D1). When `shortlist.count < trip.dayCount`, Composer calls `Recommender.recommendForShortlist` to fill empty Days; each auto-filled Spot is also added to the Shortlist (invariant: all Recommender-output Spots persist in Shortlist). The UI must label auto-filled Spots as "자동 추천으로 채움" (B1, B5).
`is_auto_filled` is a sticky flag: once set to `true` it is never reverted to `false` by subsequent saves — preserving provenance even if the Traveller removes and re-adds the Spot manually (ADR-0014).
Re-invocation behaviour: if the existing DayPlan has no manually pinned Spots, generates immediately; if manual pins exist, asks "keep existing layout and fill empty Days only, or rebuild from scratch?" — executes Fill-empty-only or Replace accordingly.
Signature: `compose(shortlist, trip) → DayPlan`
_Avoid_: Scheduler, Planner, Optimizer, TripPlanner

**CalibrationProfile**:
A non-persisted value object expressing a Traveller's preferred balance between the two recommendation tracks: `curatedRatio` (0.0–1.0) and `popularRatio` (= 1 − curatedRatio). Default values vary by persona: Tagalong default is 30:70 (curated:popular); hardcore traveller default is 70:30. The profile can be dynamically adjusted by negative meta-intent in natural-language input (e.g. "유명한 데 말고" → shifts curated ratio up) and explicitly by the Traveller via a UI calibration slider (B5, A4). Never persisted as a standalone record in v1 — derived fresh per request from user-expressed signals (D-CUR-2).
_Avoid_: TasteWeight, PreferenceRatio, UserBalance

**RecommendationSection**:
A value object representing one ranked track within a `RecommendationResult`. Shape: `{ label: 'curatedPicks' | 'popularSpots', spots: Spot[], coldStart: boolean }`. `coldStart` is true when the track fell back to score-only ranking due to an empty or insufficient Shortlist. The two sections are always returned together; the consumer (UI or ScheduleComposer) decides how to display or blend them.
_Avoid_: RecommendationGroup, SpotList, ResultBucket

**CurationCandidate**:
A domain entity in the curation pipeline representing a Spot that has been automatically discovered but not yet approved by the curator. States: `pending → approved | rejected`. On approval the curator assigns `curationScore` and optionally a `curationComment`; the Candidate is promoted to an active `Spot`. On rejection it is archived. LLM-generated tags and summary are attached at discovery time ("silver label"); curator approval is the "golden label" gate (D-CUR-5). The domain does not model the admin UI — that is an infrastructure concern.
_Avoid_: SpotDraft, CandidateSpot, PendingSpot

**TrendSource**:
An infrastructure-layer entity (ACL) representing one external data provider for trend and popularity signals. Examples: `IJTODataSource` (제주관광공사 빅데이터, `data.ijto.or.kr` — 이동통신 혼잡도, 차량 분포, 카드매출 TOP15, 슬로우로드), `VisitKoreaDataSource` (한국관광 데이터랩, `datalab.visitkorea.or.kr` — SNS 언급량·키워드), `KakaoMapRatingSource`. Each TrendSource is wrapped by an ACL adapter; raw external schemas never appear in domain code (ADR-0018). Domain only sees normalised `{ spotId, popularitySignal: number, trendSignal: number, fetchedAt: CalendarDate }` payloads.
_Avoid_: DataFeed, ExternalSource, APIProvider (in domain code)

**Now Mode**:
A GPS-triggered entry point (v2) that activates the `recommendNow` operation on the Recommender. Requires only that `isInJeju(gps)` is true — independent of TripPhase and Trip existence. A Traveller with no active Trip (or no Trip at all) can still enter Now Mode. The v1 design exposes the interface; the implementation ships in v2.
_Avoid_: Explore mode, nearby mode, live mode

## Relationships

- A **Traveller** owns one **Shortlist** and zero or more **Trips**
- A **Trip** contains one **DayPlan** and zero or more **Bookings**, and has a **TripPhase**
- A **DayPlan** contains one **Day** per calendar date in the Trip's date range
- A **Day** contains zero or more **Spots** in order (no time slots)
- A **Shortlist** belongs to a **Traveller**, not to a **Trip** — it persists across trips
- A **Booking** belongs to exactly one **Trip** and has a time range
- A **Spot** can appear in multiple **Days** across any number of **Trips**, and simultaneously in a **Shortlist** — it is shared content, not consumed when pinned
- Pinning a **Spot** into a **Day** does not remove it from the **Shortlist**; the two references are independent
- **ScheduleComposer** reads a **Shortlist** (and optionally calls **Recommender**) to populate a **DayPlan**
- **Recommender** consumes a **RecommendationContext** (derived from **SpotPreferences** + **CalibrationProfile** + trip/GPS data) and returns a **RecommendationResult** containing two **RecommendationSection**s (`curatedPicks`, `popularSpots`)
- A **CurationCandidate** is discovered automatically and promoted to a **Spot** upon curator approval
- A **TrendSource** (ACL) feeds normalised signals that update **Spot** `popularityScore` and `trendScore`

## Example dialogue

> **Dev:** "When a Traveller saves a restaurant before booking their trip, where does it go?"
> **Domain expert:** "Into their Shortlist — no Trip needed yet."

> **Dev:** "And when they build their DayPlan, the ScheduleComposer takes those Shortlist Spots and groups them by day?"
> **Domain expert:** "Yes — it clusters by location. Day 1 gets the eastern spots, Day 2 gets Seogwipo. No times assigned."

> **Dev:** "What if the Shortlist only has three Spots for a four-day trip?"
> **Domain expert:** "ScheduleComposer calls Recommender to fill the gaps. Same service, `recommendForShortlist`."

> **Dev:** "Is Now Mode part of the DayPlan flow?"
> **Domain expert:** "No — it's parallel. GPS triggers it; Recommender handles it via `recommendNow` in v2. DayPlan is untouched."

## Flagged ambiguities

- **Shortlist name resolved**: domain code uses `Shortlist`; UI renders "찜하기".
- **UI language resolved** (ADR-0093, 2026-10-17; replaces "Korean-only for MVP"): Korean (default), English, Simplified Chinese, Japanese. The app UI and the places' names and reason sentences are translated (names: the form natives use, else VisitJeju's; Korean official cultural/territorial terms always win); the `/jeju/**` landing pages stay Korean. Domain terms in code stay English/romanised as before; UI terms per language live in `docs/i18n/style-*.md`.
- **Identifier policy resolved**: translate to English when a precise single English word exists; otherwise use romanised Korean (e.g. `oreum`, `haenyeo-experience`, `olle-trail`).
- **Spot type taxonomy incomplete**: `beach | restaurant | activity | accommodation | oreum | …` — full list deferred to Light Spec.
- **Score model resolved (D-CUR-3)**: three separate fields — `curationScore` (manual, curator), `popularityScore` (auto, public data + Kakao), `trendScore` (auto, SNS/search trends). Normalisation formula for `popularityScore` deferred to Plan (OQ-CUR-1).
- **Single context confirmed**: one `docs/context.md`. External partner isolation via ACL, not context boundaries.
- **ACL modules (infrastructure only)**: `AgodaAdapter`, `SocarAdapter`, `MyrealtripAdapter`, `KakaoMapAdapter`, `KMAAdapter`. Partner brands do not appear in domain code.
- **Spot seeding method open**: target ~200 curated Spots for launch. Collection approach deferred to Plan stage.
- **"Concierge" resolved**: UI/marketing label only. Does not appear in domain code. Covered functionally by Recommender + ScheduleComposer + Now Mode.
- **Editor/Curator revised (D-CUR-5)**: `CurationCandidate` is now a domain entity (pending → approved | rejected pipeline). The curator role is still not a domain entity — it is the human operator. The admin UI is infrastructure. The domain models only the lifecycle of a candidate Spot, not who operates it.
- **Spot search resolved**: infrastructure only (`SpotRepository.search`). No domain service. Search indexing, text matching, and filtering are infrastructure concerns.
- **ScheduleComposer minimum Spot count resolved**: ≥ 1 Spot in Shortlist required; when count < Day count, Recommender fills gaps; auto-filled Spots added to Shortlist; UI labels them "자동 추천으로 채움" (D1).
- **Trip dateRange nullability resolved**: required, not nullable; `parseFreeText` failure → default next weekend 1박2일 (KST); inferred value shown with one-tap edit (D2).
- **SpotPreferences representation resolved (D3)**: categorical type distribution map `{ category: weight }`. Not an embedding vector. "왜 이 Spot?" UI 설명 가능. Resolves plan-review BLOCKER B1.
- **Spot embedding purpose resolved (D4)**: `spots.embedding VECTOR(1024)` is for semantic/similarity search infrastructure. Not used by SpotPreferences. Not used in v1 recommendation flow. Populated at seed time via batch (Voyage AI voyage-3 or equivalent). Resolves plan-review MAJOR B4. (Note: earlier docs incorrectly stated VECTOR(1536) — corrected to match actual migration 003.)
- **Recommendation response structure resolved (D-CUR-1)**: two-track output — `curatedPicks` + `popularSpots` — never merged (ADR-0017). Weighted-sum blending rejected.
- **CalibrationProfile defaults resolved (D-CUR-2)**: Tagalong default 30:70 (curated:popular); hardcore traveller 70:30. Dynamic adjustment from negative meta-intent ("유명한 데 말고").
- **Saturation penalty scope resolved (D-CUR-6)**: affects only `popularSpots` track; `curatedPicks` is saturation-immune.
- **External data source isolation resolved (D-CUR-4)**: TrendSource ACL adapters only; raw external schemas never enter domain code (ADR-0018). Sources: IJTO, visitkorea datalab, Kakao Map ratings.
- **DayPlan incomplete-spot policy**: what happens to unvisited Spots at end of day (carry over? stay in DayPlan?) deferred to Light Spec.
- **TripPhase transition triggers**: date-based vs GPS vs manual activation deferred to Light Spec.

## Deprecated (do not use)

- **Schedule** — replaced by `DayPlan`
- **ScheduleRewriter** — dropped; natural-language restructuring out of v1 scope
- **Time-slot assignment** — DayPlan is intentionally time-free
- **Conflict detection / auto-reorder** — out of scope
