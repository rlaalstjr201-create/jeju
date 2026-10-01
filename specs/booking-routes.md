# Light Spec: 체험 예약 경로 — 장소별로 확인된 경로 하나

근거: ADR-0074(ADR-0058의 마이리얼트립 `bookable`을 대체, ADR-0073의 계획을 확정). 조사: `docs/research/booking-links-02.md`. 원자료: `apps/web/review/booking/routes.json`.

## 동작

- 체험 카드(`mood: new`, `sub: do`)에 확인된 예약 경로 하나를 단다. 자리는 길찾기 아래, 카드 폭 전체 줄이다.
  - `naver`, 또는 목적지가 네이버 예약인 `visitjeju`: 「네이버로 예약하기」
  - `mrt`: 「마이리얼트립에서 예약」(상품 페이지, 검색 아님)
  - `homepage`: 「홈페이지에서 예약 확인」
  - `phone`: 「전화로 예약」(`tel:`)
- `aria-label` = `{이름}, {문구}`, `rel=noopener`. 웹 링크는 새 탭으로 연다. `.tbtn`은 그린 높이 44, 누름 영역 48×48이다.
- 경로가 없는 체험은 체험·섞어서·아무거나 후보에서 빠진다. 폐업·이전 의심(`hide: 'closed'`)은 어디에도 나오지 않는다(저장 목록, 랜딩·장소 쪽, sitemap 포함).
- 체험 장소 쪽(ADR-0072)에도 지도 링크 줄에 같은 링크를 둔다.
- 사용 기록: 누르면 `book` 이벤트를 보낸다(`specs/usage-events.md`, 필드 변경 없음).

## 데이터

- `book: { k, u }`: `routes.json` `best`(그 종류의 첫 `accepted` 경로). 체험에만 둔다.
- 경로가 없는 체험의 판정은 `review/copy/booking.json`에 둔다: `closed` → `hide: 'closed'`, `noroute` → 필드 없음. 판정이 없으면 빌드가 멈춘다.
- 운영자가 없는 포구·해변·항구·기념관 9곳은 구경으로 옮겼다(`review/copy/new-sub.json`, 근거 포함).
- 적용: `node scripts/booking.mjs`(출하본, 멱등). `build-spots.mjs`도 마지막에 같은 규칙을 적용한다.
- 다른 업체·없는 장소를 가리키던 카카오 id 9곳은 지웠다(`review/copy/corrections-03.json`). 나머지 데이터 문제는 `review/booking/data-issues.json`에 남겨 두었다.

## 성공 기준 (2026-10-01 측정)

- B1: 체험 313곳 = 경로 있음 270(네이버 124 · 마이리얼트립 9 · 비짓제주 1 · 홈페이지 22 · 전화 114) + closed 26 + noroute 17. 구경으로 옮긴 곳 9곳.
- B2: 보이는 체험 카드는 모두 경로 링크가 하나 있다. 섞어서·아무거나에도 경로 없는 체험이 나오지 않는다.
- B3: 15지역 × 3범위 × 체험 탭에서 3장씩 나온다(빈손 0). 범위 안 체험 수: 차로 30분 최소 28(우도), 차로 1시간 최소 94(우도). 걸어서는 구제주(6) 말고는 3곳 미만이라 섬 전체에서 가까운 3곳 규칙을 쓴다.
- B4: 320·390에서 링크는 한 줄, 그린 높이 44, 누름 영역 ≥ 48×48(겹침·가림 없음), 가로 넘침 0(e2e `3-18`).
- B5: 마이리얼트립 검색 링크 0. `bookingUrl`·`BOOKING_LINKS_ENABLED`는 코드에서 지웠다.
- B6: 랜딩 품질 기준(중복 < 0.8, 고유 글 ≥ 30%)이 계속 통과한다. 장소 쪽은 2,938곳 중 2,912곳에 만든다(원문 반복 9곳, noroute 17곳 제외).
- B7: tsc, vitest(`tests/booking.test.ts` 포함), build, check:slop, e2e가 모두 통과한다.

## 남은 일

- 분기마다 `routes.json`의 accepted URL을 다시 확인한다.
- 범위 밖이던 카페·식당 체험 14곳의 경로를 조사한다. 카카오 예약을 순위에 넣을지는 별도로 결정한다.
