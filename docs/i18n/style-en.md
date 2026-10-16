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

- 날짜: "Oct 3", 요일 붙이면 "Fri, Oct 3".
- 이동: "From here, about 12 min by car" / "From my stay, about 8 min on foot" / "From Aewol, about 1 hr 5 min by car". 첫 카드 꼬리표는 "about 12 min by car".
- 섬: "On Udo, so you'll need a ferry" / "On the main island, so you'll need a ferry back" / "Also on Udo".
- 장날: "Market day today" / "Opens on dates ending in 2 or 7".
- 해 지는 시각: "Sunset 17:42"(24시간, 한국 현지 시각).

## 5. 장소 이름·소개글

- 장소 이름 표기 기준은 **주인 결정 대기**(VisitJeju vs KTO vs 여행자 사용형). 그때까지 카드 이름은 한국어 그대로 둔다.
- 소개글(reason)은 한 문장, 18단어 안팎, 마침표 없이(한국어판 캡션 규칙과 같다). 가격·영업시간·평점은 넣지 않는다(SPEC S1').
- 소개글 안의 고유명사는 이 표와 4절을 따르고, 확정 안 된 장소명은 로마자(Revised Romanization)로 쓴다.
