# 영어(en) 문체 가이드·용어집 — 여차나:제주

근거: `docs/i18n/research-en.md`(2026-10-17, 이하 「R」). 「판단」은 R에 직접 근거가 없어 원칙에서 끌어낸 것이고, 「확인 실패」는 R이 찾지 못한 것이다. 둘 다 원어민 검수 대상이다. 결정: ADR-0093.

## 1. 말투

- 미국식 철자, 짧고 다정한 앱 말투(Google Maps·Airbnb 쪽). 버튼·라벨은 sentence case(첫 단어만 대문자, R 1절 Microsoft). Title Case 버튼 금지(R 3절).
- 기분 버튼은 사용자가 앱에 하는 말이다. 대명사 없는 짧은 동사구로 쓴다(R 1절 My/Your 원칙). 안내문은 앱이 사용자에게 하는 말이라 "you"·"we"를 쓴다. 한 문장 안에서 I/you를 섞지 않는다.
- 한국어의 「~해요」 문장을 한 줄씩 옮기지 않는다. 같은 뜻을 영어 앱이 쓰는 순서로 다시 쓴다. 예: 「이 근처는 다 봤어요. 처음 본 곳부터 다시 보여 드려요.」 → "You've seen everything nearby. Starting over from the top."
- 「약」은 "About"으로 살린다(직선거리 추정이라 정직하게). 숫자는 아라비아 숫자, 시간은 "12 min", "1 hr 10 min".
- 느낌표는 쓰지 않는다(한국어판과 같은 절제).

## 2. 한국에만 있는 개념

| 개념 | 처리 | 근거 |
|---|---|---|
| P(MBTI, 무계획형) | 바꾼다: "spontaneous", "no-plan" | 판단. 영어권에서 MBTI 「P」는 여행 말로 통하지 않는다 |
| 여차나(브랜드) | 로마자 `Yeochana` 유지, 뜻은 부제로 | 판단 |
| 숙소 | "stay"(Airbnb 말) | 판단 |
| 동네 | "area" | 판단 |
| 오일장·장날 | "five-day market", 장날은 "open today / dates ending in 2 or 7" 설명형 | R 2절(Wikipedia·Culture Trip·Hotels.com). 「장날」 직역 관용구는 확인 실패 |
| 오름 | "oreum" + 처음에 "(volcanic cone)" | R 2절 VisitJeju·LP |
| 올레 | "Jeju Olle Trail", 구간은 "Route n" | R 2절 jejuolle.org(VisitJeju는 Course, 갈림) |
| 해녀 | "haenyeo (women divers)" | R 2절 UNESCO·FAO |
| 귤 따기 | "tangerine picking" | R 2절 GetYourGuide·Klook |
| 해안도로 | "coastal road" | R 2절 VisitJeju |
| 곶자왈 | "Gotjawal forest" | R 2절 VisitJeju |
| 기상청 | "KMA"(Korea Meteorological Administration) | 판단 |
| 비짓제주(제주관광공사) | "Visit Jeju (Jeju Tourism Organization)" | 판단 |

## 3. UI 용어집

| 한국어 | 영어 | 근거 |
|---|---|---|
| 푹 쉬고 싶어 | Just relax | R 4절, 판단 |
| 좀 걷고 싶어 | Go for a walk | R 4절, 판단 |
| 새로운 거 해보고 싶어 | Try something new | R 4절, 판단 |
| 유명한 데 가 보고 싶어 | See the famous spots | R 4절, 판단("must-see"는 VisitJeju 말) |
| 맛있는 거 먹고 싶어 | Eat something good | R 4절, 판단 |
| 아무거나 골라줘 | Surprise me | R 4절, 판단(선례 "I'm Feeling Lucky"; 실사용 앱 확인 실패) |
| 저장 / 저장한 곳 | Save / Saved | R 4절 Google Maps |
| 가 봤어요 | Been there | R 4절, 판단(Google 대응어 확인 실패) |
| 내 위치 근처 / 숙소 근처 / ○○ 근처 | Near me / Near my stay / Near ○○ | R 4절 "Near…", 판단 |
| 비 와요(실내만) | Raining? Indoors only | R 1절 Google "rainy day" |
| 실내 | Indoor | 판단 |
| 다른 3곳 보기 | Show 3 others | R 4절, 판단 |
| 길찾기 | Directions | R 1절 Google "get directions"(버튼 문구 자체는 확인 실패) |
| 배 타는 곳까지 길찾기 | Directions to the ferry | 판단 |
| 아니면 | Or | 판단 |
| 지금 / 내일 / 날짜 고르기 | Now / Tomorrow / Pick a date | 판단 |
| 언제 / 어디 / 얼마나 / 날씨 | When / Where / How far / Weather | 판단 |
| 걸어서 / 차로 30분 / 차로 1시간 | On foot / Up to 30 min by car / Up to 1 hr by car | 판단 |
| 노을 볼 곳 | Sunset spots | R 2절 VisitJeju "ocean sunsets" |
| 오늘 장 서는 곳 | Markets open today | 판단 |
| ○○ 철 | ○○ season (Tangerine picking season, Canola flower season) | 판단 |
| 다시 넣기 / 되돌리기 | Put back / Undo | 판단 |
| 설정 · 지도 앱 · 의견 | Settings · Map app · Feedback | 판단 |
| 의견 보내기 | Send feedback | 판단 |
| 링크로 백업 | Back up as link | 판단 |
| 기록 끄기 / 켜기 | Turn off stats / Turn on stats | 판단 |
| 네이버지도 / 카카오맵 / TMAP | Naver Map / KakaoMap / TMAP | 판단(각 앱 영문 표기) |

## 4. 날짜·시간·이동 시간

- 날짜·시각: 값은 늘 한국 시각, 꼴은 브라우저 로캘이 정한다(ADR-0093 Amendment 3, `Intl.DateTimeFormat`, 예: en-US `Sat, Oct 17`·`5:58 PM`, en-GB `Sat 17 Oct`·`17:58`, ja `10月17日(土)`·`17:58`, zh-CN `10月17日周六`·`17:58`).
- 이동: "From here, about 12 min by car" / "From my stay, about 8 min on foot" / "From Aewol, about 1 hr 5 min by car". 첫 카드 꼬리표는 "about 12 min by car".
- 섬: "On Udo, so you'll need a ferry" / "On the main island, so you'll need a ferry back" / "Also on Udo".
- 장날: "Market day today" / "Opens on dates ending in 2 or 7".


## 5. 장소 이름·소개글

- 장소 이름 기준(주인 승인 2026-10-17): 그 언어 원어민·여행 매체가 실제 쓰는 꼴이 먼저, 출처가 갈리거나 근거가 없으면 VisitJeju 그 언어판의 꼴, 6절(한국 문화·영토 용어)이 늘 먼저. 카드 이름과 소개글 속 같은 곳의 이름은 똑같이 쓴다. 이름에 한글은 넣지 않는다(지도 링크가 한국어 이름으로 찾는다).
- 가게·업체 이름: 고유 부분은 로마자(Revised Romanization, 업체가 쓰는 영문 이름이 확실하면 그것), 일반 부분은 영어(식당 → Restaurant, 해수욕장 → Beach, 오름 → Oreum, 포구 → Port, 본점 → Main Branch). 예: 해송갈치 제주성산일출봉점 → Haesong Galchi, Seongsan Ilchulbong Branch. 이미 영어인 이름은 그대로.
- 소개글(reason)은 한 문장, 18단어 안팎, 마침표 없이(한국어판 캡션 규칙과 같다). 가격·영업시간·평점은 넣지 않는다(SPEC S1').
- 소개글 안의 고유명사는 이 표와 4절을 따르고, 확정 안 된 장소명은 로마자(Revised Romanization)로 쓴다.

## 6. 한국 문화·영토 용어 (주인 규칙 2026-10-17, 원어민 관용보다 우선)

주인 말: 「절대 김치를 파오차이라고 하던지 이런거는 안돼. 신치라고 제대로 쓰고 중국이 동북공정하는 거를 도우면은 안돼. 우리는 우리의 위치를 지켜야지 비굴할 필요는 없어」. 이 표가 1~5절의 「원어민이 실제 쓰는 말」 원칙과 부딪히면 이 표를 따른다. 장소 이름 표기 기준이 정해져도 이 규칙이 먼저다. 금지어는 `tests/i18n-terms.test.ts`가 출하 번역 파일 전부에서 막는다.

| 한국어 | en | zh-Hans | ja | 쓰지 않는 말 |
|---|---|---|---|---|
| 김치 | kimchi | 辛奇 (김치찌개 辛奇汤, 묵은지 老辛奇, 보쌈김치 包肉辛奇) | キムチ | 泡菜, pao cai, パオツァイ |
| 백두산 | Baekdusan (천지 Heavenly Lake) | 白头山 (천지 白头山天池) | 白頭山 | 长白山, 長白山, Changbai |
| 한복 | hanbok | 韩服 | 韓服（ハンボク） | 汉服, Hanfu, 漢服, 朝鲜族服饰 |
| 동해 | East Sea | 东海（韩国东海） | 東海（トンヘ） | Sea of Japan, 日本海 (단독·주 명칭으로) |
| 독도 | Dokdo | 独岛 | 独島（トクト） | Takeshima, 竹島, 竹岛, Liancourt Rocks |
| 고구려·발해 | Goguryeo, Balhae (Korean kingdoms) | 高句丽、渤海（韩国古代国家） | 高句麗、渤海 | 중국 지방정권·중국사 프레임 |
| 한국 음식·옷·풍습 | 한국 것으로 | 「朝鲜族」 프레임 금지. 参鸡汤·拌饭 같은 통용 한자 이름은 써도 된다 | 한국 것으로 | 朝鲜族, 朝鮮族 |

근거:
- 문체부 훈령 제427호 「공공 용어의 외국어 번역 및 표기 지침」(2020-07-15 제정) 제4조제2항제3호나목, 김치 → 辛奇(농식품부 선정 중국어 표기): 문체부 보도설명자료 2021-01-11 https://www.mcst.go.kr/kor/s_notice/expPress/expPressView.jsp?pSeq=18605 . 같은 자료는 제4조제2항제5호로 泡菜를 관용 표기로도 인정했으나, 2021년 7월 개정으로 辛奇를 명시했다는 보도가 있다(서울신문 2021-09-27 https://m.seoul.co.kr/news/2021/09/27/20210927030014 , 헤럴드경제 2026-03-11 https://www.heraldk.com/article/2026031116475831765). 개정 조문 원문은 확인 실패. 이 앱은 주인 규칙에 따라 泡菜를 쓰지 않는다.
- 동해: 정부는 1992년 East Sea를 공식 영문 명칭으로 정했고 국내 제작 영문 지도에는 East Sea만 쓴다(검색 요약, 매일신문 https://www.imaeil.com/page/view/2014021316014477361 , Korea JoongAng Daily https://www.koreajoongangdaily.com/korea/govt-goes-easy-on-east-sea-renaming-demand/11882820).
- 독도: 외교부 일본어 페이지는 「独島」로 쓰고 영유권 분쟁은 없다고 적는다 https://dokdo.mofa.go.kr/m/jp/dokdo/government_position.jsp (검색 요약 경유, 본문 직접 열람은 실패).
- 백두산: 「长白山/창바이산」은 중국 측 명칭이고 백두산의 중국화가 동북공정의 일환으로 비판된다(서울신문 https://www.seoul.co.kr/news/plan/2006/08/10/20060810012003 , YTN 2024 https://www.ytn.co.kr/_ln/0104_202403281300011316). 정부의 백두산 중국어 공식 표기는 확인 실패, 한자 「白頭山」의 간체 「白头山」을 쓴다.
- 한복: 외교부 당국자 「한복은 전 세계의 인정을 받는 우리의 대표적인 문화」(2022, 세계일보 https://www.segye.com/newsView/20220206508479). 「汉服」은 다른 옷(한푸), 「조선족 의복」 프레임은 중국 측 주장으로 보도됨(노컷뉴스 https://nocutnews.co.kr/news/5706271). 영어 hanbok은 OED 등재(같은 보도).
- 동북공정: 고구려·발해를 중국사로 보는 주장이 핵심(경기일보 https://kyeonggi.com/article/200808260295027).
