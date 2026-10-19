# 밤 산길 부산 회차 — 사전등록 (2026-10-20, 판정 전)

근거: ADR-0091, `specs/night-trails.md` 1절, `specs/busan.md` 4절, `plans/busan.md` S6. 결과 생성 실행이라 **한 번만** 돈다. 기준을 못 넘으면 붙이지 않고 수치와 가설을 적고 멈춘다(다시 돌리려면 주인 승인). 판정을 본 뒤 이 파일을 고치지 않는다.

## 1. 후보

- 입력: `public/spots-busan.json` sha256 `eee2cb7054300f2a79822e575d6dda53818f6c2dd68d034fd973b10a6995a198`(커밋 7bfd083, 994곳). 원문은 곳마다 카드 이름과 TourAPI `detailCommon2` `overview`(`review/busan/raw/detail/<contentid>.json`).
- 후보: 이름이나 원문에 아래 낱말이 있는 곳, 그리고 `mood: walk` 전부. 제주 낱말에서 제주 전용 `오름|곶자왈|올레`를 빼고 `산성`을 더했다(spec 4절).
  `악$|악\)|산$|봉$|숲|휴양림|계곡|탐방|둘레길|등반|등산|정상|트레킹|산책로|산성`
- 목록: `node scripts/busan/night.mjs --candidates` → `review/busan/night/candidates.json`(같은 입력이면 같은 파일).

## 2. 판정 (`trail-01.json`)

후보마다 `{ id, trail: true|false, basis }`. `basis`는 그 곳 원문(이름 또는 overview)에서 그대로 옮긴 한 구절, 40자 이내. 원문이 애매해 `false`로 둘 때는 `애매: ` 뒤에 원문 구절. 판정자는 아래 정의와 지어낸 예시만 받는다(실제 부산 곳을 예시로 쓰지 않는다). 판정자는 곳마다 이름과 원문만 본다(기분·점수·사진 없음).

**야외 산길**(`trail: true`): 걷는 것이 주인 곳 중, 밤에 어둡고 사람 손이 덜 닿은 자연 산길 — 산·봉우리 오르기, 숲길·숲 탐방로·자연휴양림, 계곡 탐방로, 산 위 성곽을 따라 걷는 산성 길, 산자락을 도는 둘레길.

**아님**(`false`): 해변·해안 산책로·바닷가 절벽 길·포구, 시내 공원·광장·마을 골목길, 차로 바로 닿는 전망대·타워, 정원·수목원 같은 운영 시설·테마파크, 절·사찰 경내 구경이 주인 곳, 시장·거리, 실내, 먹는 곳.

지어낸 예시:
- 「가나산 정상까지 오르는 등산로, 능선을 따라 두 시간」 → true
- 「다라봉 숲길, 편백나무 사이 흙길을 걷는다」 → true
- 「마바산성 성곽을 따라 산등성이를 걷는 길」 → true
- 「사아 계곡을 따라 오르는 탐방로」 → true
- 「자차 해안 절벽을 따라 놓인 데크 산책로」 → false (해안 산책로)
- 「카타 공원, 도심 속 산책로와 분수 광장」 → false (시내 공원)
- 「하파산 꼭대기 전망대, 주차장에서 바로」 → false (차로 바로 닿는 전망대)
- 「너더 수목원, 온실과 정원」 → false (운영 시설)
- 「러머사, 산자락의 오래된 절」 → false (절 구경이 주인)

## 3. 다시 판정 (블라인드, `audit-01.json`)

- 다른 판정자가 첫 판정을 모른 채 표본을 판정한다. 같은 정의·지어낸 예시만, 곳마다 이름과 원문만. `[{ id, trail, reason }]` → `audit-01-judgments.json`.
- 표본: 제주 회차는 true 60 + false 60이지만 부산 후보는 수백이 안 되어 true가 60에 못 미칠 수 있다. 그래서 한쪽 수 **k = min(60, true 수, false 수)**, `trail: true`에서 k곳 + `false`에서 k곳, 씨앗 `20261020`(mulberry32, `scripts/night.mjs` `drawSample` 그대로). `node scripts/busan/night.mjs --sample`.
- **통과 기준**: 2k곳 일치율 ≥ 95%, 그리고 첫 판정 `true` k곳 중 다시 판정이 `false`인 곳 ≤ ⌊3k/60⌋(제주 「60곳 중 3」과 같은 비율, 소수는 버림 — k < 20이면 0). `node scripts/busan/night.mjs --score`.

## 4. 붙이기

통과하면 `scripts/busan/build.mjs`가 `applyNight`(`scripts/night.mjs`, `loadNightCalls('review/busan/night')`)로 `trail: true`만 `public/spots-busan.json`에 붙인다. 멱등, 다른 필드 안 바꿈, 출하에 없는 id 판정이면 멈춤, 근거 구절이 원문에 없으면 멈춤. 못 넘으면 `trail`은 0곳이고 그대로 출하한다(앱은 밤에 아무것도 밀지 않음).

## 5. 앱 점검 (B12)

22시 「좀 걷고 싶어」 동래·금정 기준(동네 고르기, 차로 30분)에서 `trail` 곳이 다른 후보 앞에 오지 않음(후보가 모자란 경우 제외). `tests/night-pick.test.ts`.
