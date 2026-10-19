# 부산 체험 예약 경로 S4b — 사전등록 (booking-01)

등록: 2026-10-19, 조사 호출 전 커밋. 근거: `plans/busan.md` S4b(M8, 웹 검색 60회 이하), `specs/busan.md` 3.3(「체험은 확인된 예약 경로가 있어야 보인다」), ADR-0074(판정 규칙), 제주 조사 `docs/research/booking-links-02.md` 1절(방법·판정 기준), ADR-0094·0095(파일 파이프라인). 주인 지시 2026-10-19 「부산 영역 완성까지 진행」. 이 문서는 결과를 본 뒤 바꾸지 않는다. 한 번 돌린다.

## 1. 대상

`public/spots-busan.json`(S4, 7bbb001)의 체험(`mood: new`, `sub: do`) **52곳 전부**. 다른 곳은 보지 않는다.

## 2. 출처와 호출 (`scripts/busan/booking-routes.mjs`)

| 출처 | 곳마다 | 읽는 것 |
|---|---|---|
| TourAPI `detailIntro2`(무료, 개발 한도 안, `raw/calls.log`에 셈) | 1회 | 문의 전화(`infocenter`·`infocenterculture`·`infocenterleports`), 예약 안내(`reservation`·`reservationinfo` 등 이름에 `reserv`가 든 칸)의 URL. 원문은 `raw/intro/<contentid>.json`에 그대로 |
| TourAPI `detailCommon2`(S2 원문, 다시 부르지 않음) | 0회 | `homepage` 칸의 URL |
| 네이버 모바일 검색 `m.search.naver.com/search.naver?query=` (**웹 검색으로 센다**) | 1회 | `__APOLLO_STATE__`의 장소: 이름, 좌표, 전화(`phone`, 없으면 `virtualPhone`), 네이버 예약 주소(`naverBooking.naverBookingUrl`·`bookingUrl`), 대표 홈페이지(`homepages.repr.url`) |
| 경로 주소 GET(검색 아님) | 후보마다 1회 | HTTP 상태, 최종 주소, 제목, 본문 |

- 검색어 = 이름에서 괄호와 그 안 글자를 지우고 공백을 하나로 줄인 것 + ` 부산`(제주 `{이름} 제주`와 같은 꼴). 다른 검색어로 다시 찾지 않는다.
- 마이리얼트립·카카오 장소 상세·Klook은 이번에 보지 않는다(검색 상한 60회 안에 곳마다 1회만 남는다). 제주 순위의 두 번째 종류(`mrt`)는 그래서 부산에 없다.
- **웹 검색 상한**: 60회. 이 문서를 쓰기 전 제주 검색어(`더마파크 제주` 2회, `제주 서핑` 1회 — 한 곳 결과와 여러 곳 결과의 꼴)로 파서를 맞춰 보느라 3회를 썼다(부산 장소는 보지 않음). 남은 57회 = 52곳 1회씩 + 응답을 못 받은 곳(HTTP 429·5xx·네트워크 오류)만 한 번 더(최대 5회). 그래도 못 받으면 그곳 네이버는 「확인 실패」로 둔다. 요청 간격 2.5초. 401·403이 오면 바로 멈춘다.
- 호출마다 `review/busan/booking/calls.log`에 `KST날짜\t시각\t종류\tid\t결과`를 한 줄. 응답 본문은 저장하지 않는다(경로 근거 문장만 `routes.json`에).

## 3. 판정 (ADR-0074·제주 조사 1절 그대로, 사람·모델 판단 없음)

이름 다듬기 = NFKC, 괄호와 그 안 글자 지움, 공백·`·,./&'-_`·`&` 지움, 영문 소문자, 앞의 `부산광역시`·`부산`·`주식회사`를 뗀 값도 함께 본다. **이름이 맞다** = 다듬은 두 이름이 같거나, 한쪽이 다른 쪽을 품고 짧은 쪽이 두 글자 이상.

- **네이버 장소 맞음**: 이름이 맞고 TourAPI 좌표와 300m 이내. 여럿이면 가장 가까운 곳. 맞은 곳이 없으면 네이버에서 나온 경로는 쓰지 않는다.
- **naver**(네이버 예약): 맞은 장소의 예약 주소가 `booking.naver.com` 안이고, GET이 200이며 제목이 `네이버 예약 :: <이름>`(이름이 맞음)이거나 본문에 TourAPI 주소의 도로명·지번 낱말(시·구 다음 두 낱말)이 있으면 `accepted`. 제목이 `네이버 예약`뿐이고 본문에 주소가 없으면 `rejected-dead`.
- **homepage**: 후보 순서 TourAPI `homepage`의 URL들 → TourAPI 예약 안내 칸의 URL → 맞은 네이버 장소의 대표 홈페이지. `http`·`https`만, 스킴 없는 `www.`는 `https://`를 붙여 본다(지어낸 주소 아님: 원문 글자 그대로). 판정:
  - SNS·블로그·링크 모음(`instagram.com`, `facebook.com`, `blog.naver.com`, `cafe.naver.com`, `youtube.com`, `litt.ly`, `linktr.ee`, `inpock`, `open.kakao.com`, `pf.kakao.com`, `smartstore.naver.com`, `tiktok.com`)과 관광 안내·지자체 누리집(`visitbusan.net`, 부산시 `busan.go.kr`·`www.busan.go.kr`, 구·군 16곳 `bsjunggu`·`bsseogu`·`bsdonggu`·`yeongdo`·`busanjin`·`dongnae`·`bsnamgu`·`bsbukgu`·`haeundae`·`saha`·`geumjeong`·`bsgangseo`·`yeonje`·`suyeong`·`sasang`·`gijang` `.go.kr`)은 `rejected-sns`. 시설 자체 하위 도메인(예: `safe119.busan.go.kr`)은 누리집이 아니라 홈페이지로 본다.
  - 주차 도메인·DNS 실패·연결 실패·5xx·404는 `rejected-dead`. 403·429는 `uncertain`.
  - 200이고 제목·본문(태그 지운 글 앞 20만 자)에 이름이 맞는 낱말(다듬은 이름, 또는 맞은 네이버 장소 이름)이 있으면 `accepted`. 없으면 `uncertain`.
- **phone**: TourAPI 문의 전화 → 맞은 네이버 장소의 전화. 번호 꼴(`0`으로 시작 9~11자리, 네이버 안심번호 `050x` 12자리, 또는 `15xx·16xx·18xx` 8자리)만 확인한다(통화하지 않음). 칸에 번호가 여럿이면 첫 번호. `tel:` + 숫자. 꼴이 맞으면 `accepted`.
- **best**: `naver` → `homepage` → `phone` 가운데 `accepted`가 있는 첫 종류, 그 종류의 첫 `accepted` 경로. 출하는 `book: { k, u }`(ADR-0074 1).
- **경로 없음**(best 없음):
  - `closed`: 맞은 네이버 장소에 `폐업`·`휴업`·`폐점` 표시(이름 또는 영업 상태)가 있으면. → `hide: 'closed'`.
  - `noroute`: 그 밖 전부. 열려 있을 수 있으나 확인된 경로가 없다(못 찾음·확인 실패 포함). 장소는 출하하고 `book` 없이(앱 `listed`가 체험·섞어서에서 뺀다). 못 찾은 것을 폐업으로 보지 않는다.

## 4. 저장과 빌드

- `review/busan/booking/routes.json`: 머리에 `criteria`, 호출 수(검색·GET·TourAPI), 종류별 수. 곳마다 `{ name, routes: [{ kind, url, evidence, verdict }], best, call?, reason? }`. 경로 없는 곳은 `call`(`closed`|`noroute`)과 이유(규칙 이름 + 본 것). 네이버를 못 받은 곳은 이유에 「네이버 확인 실패」.
- `scripts/busan/build.mjs`가 이 파일을 읽어 체험마다 `book`(best) 또는 `hide: 'closed'`를 붙이고, `noroute`는 둘 다 없이 둔다(제주 `scripts/booking.mjs`와 같은 규칙). 판정이 없는 체험이 있으면 빌드가 멈춘다(ADR-0074 2).
- 테스트(`tests/busan-data.test.ts`): 체험은 모두 `book`이거나 `hide: 'closed'`이거나 `routes.json`에 `noroute` 판정이 있다. `book.u`는 `routes.json`의 `accepted` 주소와 같다.

## 5. 통과·멈춤

- 이 회차는 결과로 통과·실패를 가르지 않는다(제주도 경로 비율에 문턱이 없었다). 다만 네이버 응답을 못 받은 곳이 10곳을 넘으면 호출이 고장 난 것으로 보고 빌드 입력으로 쓰지 않고 수치와 가설을 보고하고 멈춘다.
- 결과를 보고 검색어·거리·이름 규칙을 바꿔 다시 돌리지 않는다. 사람 손으로 경로를 붙이지 않는다.
- 탭 숨김(「보일 곳이 3곳 미만이면 탭 숨김」, spec 5절)은 이 단위가 아니다. 계획의 S5 `render.ts` 몫이다. 이 단위는 보이는 체험 수만 보고서에 적는다.
