# 강원 검수한 곳(강릉) 올린 뒤 — 남은 것 (2026-10-30)

Status: needs-triage

출처: ADR-0102(C3, 강릉을 검수한 곳으로). 만들 때 하지 않고 적어 두기만 한 것이다.

## g-1 강릉 장소 이름·이유 번역

- 지금: 영·중·일 화면에서 강릉 카드는 이름·이유가 한국어이고, 결과의 고르는 방식 줄 끝에 「Place names are shown in Korean.」 한 줄(`src/render.ts` `howOf`). 첫 화면 「지금 여기서」·기분 줄 「예:」에는 그 안내가 없다.
- 계획(`plans/nationwide-app.md` 8)은 자동 지역만 말하고 검수한 곳으로 올린 도시의 번역은 말하지 않는다.
- 고칠 길: 부산 ADR-0093 Amendment 9처럼 `public/i18n/places-gangwon.<lang>.json`(id → [이름, 이유])을 만들고 `main.ts` `loadSpots`가 강원 목록과 같이 받는다. 그 뒤 #how의 한국어 안내를 뺀다.

## g-2 둘째 시군구(속초·양양·춘천·평창)를 넣을 때 이름 줄

- 지금 `DEST.gangwon.label`은 `'name'`이고 이름은 `강릉`(`BUSAN_COPY.destName.gangwon`, 네 언어). 속초를 `sgg`에 더하면 속초에서도 `여차나:강릉`이 된다.
- 고칠 길: `label: 'sgg'`로 바꾸고 `renderDest`가 강원에서 쓸 시군구(지역 기준이면 고른 시군구, 숙소·GPS면 그 점에서 가장 가까운 강원 동네, 없으면 첫 시군구)의 짧은 이름을 쓴다. 여행지 줄·인기 칸 이름(`강릉`)과 밖 문구(`지금은 강릉 밖이에요.`)도 같이 정한다.

## g-3 체험 34곳이 나오지 않음

- `data/gangwon/spots-gangwon.json`의 `new`/`do` 34곳은 `book`(확인한 예약 경로)이 없어 `listed()`가 뺀다(ADR-0074). 부산은 `scripts/busan/booking-routes.mjs`로 경로를 확인해 45곳에 `book`을 붙였다.
- 고칠 길: 같은 방식으로 경로를 확인해 출하 파일을 다시 만든다(판정·측정은 다시 하지 않음).

## g-4 「강릉에 저장한 곳 N곳」 줄 없음

- 강원 id가 자동 지역과 같은 `nt-`라 `destOfId`가 `nation`을 돌려준다. 저장한 곳 화면의 다른 여행지 줄(`src/render.ts`)은 제주·부산만 센다. 강릉에서 저장한 곳은 강릉을 쓸 때만 보인다.
- 자동 지역 m-4(`.scratch/nation-followups/issues.md`)와 같은 일이라 같이 고친다.

## g-5 개인정보 안내 적용일

- 네 언어 안내에 강릉을 넣었지만 적용일은 2026-10-30 그대로다. 이 변경을 다른 날 배포하면 그 날로 바꾼다.
