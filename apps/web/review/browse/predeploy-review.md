# 오늘 서울 둘러보기 (0bf5f0b1) 배포 전 독립 리뷰

리뷰어: Claude 독립 리뷰(읽기 전용, Codex 대신 — ADR-0058). 대상: commit 0bf5f0b1, ADR-0114.

결론: 배포 전에 고칠 것 1건(포스터 데이터량). 나머지는 MINOR.

## 확인한 것 (실행 결과)

- `npx tsc --noEmit -p .` 오류 출력 없음.
- `npx vitest run tests/browse.test.ts tests/events.test.ts tests/deploy.test.ts` 통과(170 통과, culture-app 13건은 기본 모드에서 건너뜀).
- `npm run test:nation -- tests/culture-app.test.ts` 13/13 통과.
- 실제 `https://yeochana.com/api/culture?city=seoul`(2026-11-05, 298건)로 `buildShelves`를 돌림(종로 기준점):
  10:00·14:00에는 7줄×12장, 19:40에는 near 12·today 3·week 4·stage 12·exhibit 5, 22:00에는 near 1·exhibit 1. ADR 2(최대 7줄×12장, 빈 줄 숨김, 한 항목 한 줄)와 맞음.
- 그림 주소는 전부 두 곳(culture.seoul.go.kr 120건, www.kopis.or.kr 178건). 개인정보 안내 문구와 맞음. 사이트 CSP에 `img-src` 제한이 없고, 서비스 워커는 다른 출처 요청을 건드리지 않음 → 그림이 막히거나 SW 캐시에 쌓일 위험은 없음.
- XSS: 제목·장소·종류·출연은 모두 `textContent`. `<img src>`는 https만(`imageUrl`), 자세히는 http(s)만(`linkUrl`), 두 링크 모두 `target=_blank rel=noopener`. 문제 없음.
- 이벤트: GA4·네이버로 가지 않음(`GA_NAME`에 없고 `tracker.track`만 씀). 서버 검증은 이벤트별 필드 화이트리스트, `secs` 0–600·10단위, `rows` 0–7, `cards` 0–2, `link` go|more만, 다른 이벤트에 browse 필드가 붙으면 거절. 항목 id·위치 없음. 부풀리기는 기존 이벤트와 같은 수준(배치 50개·크기 제한)이고 새 구멍은 없음. `events/aggregate.ts`는 PLACE_EVENTS만 보므로 인기 집계에 섞이지 않음.
- 제주·부산·다른 곳 회귀: 새 분기는 모두 `overlay === 'browse' | 'browse-card'`일 때만 탐. Tab 가두기의 `[inert]` 필터, 숨김 시 `endBrowse()`(둘러보기 중이 아니면 아무것도 안 함)는 다른 시트에 영향 없음.
- 320px 스크린샷(design/qa/browse/*-320-dark.png): 넘침·잘림 없음, 다음 카드가 오른쪽에 살짝 보여 가로로 넘어간다는 게 드러남.

## MAJOR

### M1. 포스터 원본을 그대로 받아 모바일 데이터·메모리가 과함
- 위치: `src/browse-view.ts:36-52`(pic), `:76-86`(IntersectionObserver), `src/browse.ts:90-98`(imageUrl)
- 실측(2026-11-05 목록에서 13장 받아 봄): KOPIS 8장 합 16.9MB(최대 10.7MB PNG, 2480×3508), 서울 문화행사 `thumb=Y` 5장 합 8.5MB(최대 7.0MB PNG). 한 장 평균 약 1.9MB, 중앙값 약 0.8MB.
- 실패 상황: 375px에서 열자마자 보이는 카드가 8~9장(줄당 2.6장 × 2~3줄)이라 첫 화면만으로 대략 7~18MB를 받는다. 7줄을 다 넘겨 보면 84장, 수십~백 MB를 넘길 수 있다. 카드는 128px 폭에 표시되는데 원본은 최대 2480×3508이라, 풀어 놓은 그림 하나가 약 35MB 메모리를 쓴다. iOS Safari·인앱 브라우저에서는 탭이 다시 로드되거나 버벅일 수 있다. 「lazy」(ADR-0114 5)로 받는 장수는 줄었지만, 한 장 크기가 문제라서 lazy만으로는 막히지 않는다.
- 고칠 방법(주인이 고를 일. 아래로 갈수록 가볍다):
  1. 크기를 줄여 주는 프록시(`/api/poster?u=`, 두 호스트만 허용 + Cloudflare 이미지 리사이즈로 폭 256px) — 개인정보 안내 문단을 「이 사이트 서버를 거쳐」로 바꿔야 함.
  2. 가로 줄 카드에서는 글자 카드만 쓰고, 그림은 카드를 눌러 연 시트에서만 받기(누를 때 1장).
  3. 가로 줄마다 앞 3장만 그림을 받고, `navigator.connection.saveData`이거나 2g/3g이면 그림 없이 보여 주기.
- 덧붙임: 데이터의 KOPIS 주소는 `www.kopis.or.kr`인데, 요청하면 `kopis.or.kr`로 301 이동한다. 그래서 그림마다 왕복이 한 번 더 생긴다. 주소를 바꿀 때 `www.`를 떼면 된다(functions/_lib/kopis.ts:137 또는 imageUrl).

## MINOR

### m1. 카드 시트를 연 채 새로고침하면, 처음 누르는 뒤로 가기가 아무 일도 하지 않음
- 위치: `src/nav.ts:190-196`(mount의 `back()` 한 번), `src/app.ts:966-975`(카드 시트는 history 항목을 하나 더 쌓음)
- 상황: 홈(depth 0) → 둘러보기(1) → 카드(2)에서 새로고침하면, 마운트가 `back()`을 한 번만 해서 둘러보기 항목(depth 1)에 멈춘다. 화면은 홈인데 history는 browse 항목에 있다. 그래서 처음 누르는 뒤로 가기가 depth 0으로 가도 화면이 그대로다(S18이 막으려던 헛누름). 이전에는 덮개가 늘 한 겹이었기 때문에 생기지 않던 경우다.
- 고칠 방법: 마운트에서 `e.overlay === 'browse-card'`이면 `traverse(-2)`로 두 칸 뒤로 가기(pendingPops 2). 또는 `back(HOME)` 다음에 남은 browse 항목을 한 번 더 `back()`.

### m2. 카드 시트의 길찾기·자세히 링크에 키보드로 갈 수 없음
- 위치: `src/app.ts:1486`(Tab 가두기 목록에 `a[href]`가 없음)
- 상황: 카드 시트를 열면 초점이 제목에 있다. 여기서 Tab을 누르면 목록이 [닫기] 하나뿐이라 닫기로 가고, 닫기와 닫기 사이만 돈다. 시트에서 하는 일이 사실상 길찾기·자세히뿐인데 키보드 사용자는 닿을 수 없다. 같은 패턴은 기존 「근처에서 하는 것」 목록 시트에도 있다(이번 커밋에서 생긴 건 아님). 모바일 화면 읽기 프로그램은 스와이프로 움직이므로 영향이 없다.
- 고칠 방법: 선택자에 `a[href]`를 더하기.

### m3. 머문 시간 10초 단위와 판정 기준 「중앙값 45초」가 맞지 않음
- 위치: `src/track.ts:91`(dwellBucket = 10초 단위로 내림), ADR-0114 7
- 상황: 40~49초는 모두 `browse:secs:40`으로 쌓여서, 중앙값이 이 칸에 들어가면 45초를 넘었는지 알 수 없다. 2026-11-18 판정이 애매해진다.
- 고칠 방법: 판정 전에 ADR에 「중앙값이 든 칸이 50 이상이면 통과, 40이면 못 미침」처럼 읽는 법을 적기(결과를 보기 전에). 아니면 5초 단위로 바꾸기.

### m4. 판정을 읽을 보고서와 명세가 없음
- 위치: `scripts/analytics-report.mjs`(browse 절 없음), `specs/usage-events.md`(browse_* 설명 없음. 시작 화면은 17행에 있음)
- 상황: 2주 뒤 열기 수, 머문 시간 중앙값, 카드 누른 비율을 D1에서 손으로 계산해야 한다. 명세와 코드도 어긋난다.
- 고칠 방법: 보고서에 「둘러보기」 절을 더하고(열기, secs 칸별 분포와 중앙값 칸, (cards:1+cards:2)÷done, go·more), 명세에 한 줄 추가.

### m5. 자동화 브라우저도 기록됨 → 판정 표본이 오염될 수 있음
- 위치: `src/app.ts:951-975`(openBrowse·openBrowseCard)
- 상황: 시작 화면은 `navigator.webdriver`를 빼는데(app.ts:1780) 둘러보기는 빼지 않는다. 판정 문턱이 열기 30회로 작아서, 운영 사이트에 Playwright QA를 몇 번만 돌려도 판정이 흔들린다.
- 고칠 방법: 시작 화면처럼 webdriver일 때는 browse_* 이벤트를 보내지 않기.

### m6. 숨김 없이 pagehide만 오는 인앱 WebView에서는 browse_done이 빠짐
- 위치: `src/app.ts:1540`(visibilitychange에서만 endBrowse)
- 상황: 트래커 주석(track.ts)대로, 인앱 WebView는 hidden 없이 pagehide만 보내고 닫히기도 한다. 이때 열기만 남고 머문 시간은 남지 않아, 「열기의 30%가 카드 누름」의 분모가 어긋난다(분모가 open이면 낮게, done이면 높게).
- 고칠 방법: `win`의 `pagehide`에서도 `endBrowse()`를 부르기(트래커의 pagehide flush보다 먼저 등록하거나, endBrowse 안에서 flush).

### m7. 목록이 바뀌는 순간 카드 시트가 보이지 않는데 상태는 남음(드묾)
- 위치: `src/culture-view.ts:145-160`(patchBrowse), `src/render.ts:1486`(sheetSig에 day 포함)
- 상황: 카드 시트를 열어 둔 채 자정이 지나 새 날 목록이 오면 화면을 다시 만든다. 그 항목이 새 목록에 없으면 카드가 만들어지지 않는데(null) 상태는 `browse-card`로 남는다. 그래서 뒤로 가기를 한 번 눌러도 화면이 바뀌지 않는다. 앞으로 가기로 지난 카드 항목에 다시 들어갈 때도 같다. 가로 줄 스크롤과 `scrolled` 집계도 이때 처음으로 돌아간다.
- 고칠 방법: 카드를 만들지 못하면 `browse`로 돌려놓기(app.ts에서 렌더 뒤 확인하고 `nav.back`). 또는 reducer의 `browse-card` 조건에 「browseId가 오늘 목록에 있음」을 더하기.

### m8. IntersectionObserver를 닫지 않음
- 위치: `src/browse-view.ts:76-86`
- 상황: 화면을 닫거나 다시 만들어도 감시자가 아직 보지 못한 img를 붙들고 있다. 보통은 GC가 치우지만 정리하는 경로가 코드에 없다. 영향은 작다.
- 고칠 방법: 화면을 지울 때(render.ts가 `replaceChildren` 하기 전, 또는 `browse` 상자에 dispose를 달아) `disconnect()`.

### m9. 진입 예산 여유 68B
- ADR-0100 60,000B 가운데 59,932B를 쓴다. 이번 수정(M1·m1·m5·m6)에서 app.ts·nav.ts에 넣는 코드도 진입 묶음에 들어가므로, 넘으면 culture 청크 쪽으로 옮겨야 한다. 결함은 아니고 알림.

## 문제 없음으로 본 것
- 두 덮개 단계의 뒤로 가기(카드 → 둘러보기 → 홈), Esc, 배경(scrim) 누름, 닫기 버튼: closeOverlay가 `browse-card`면 `browse`로 내려가고 `nav.back()`. 앞으로 가기로 browse·browse-card에 들어갈 때 목록이나 카드가 없으면 `applyRoute`가 한 칸 물러남.
- 초점: 열 때는 `#sheet-title`, 카드는 `#bc-title`, 카드를 닫으면 누른 카드로, 화면을 닫으면 여는 버튼으로(그 사이 홈 블록이 다시 그려졌으면 기준 버튼으로). 카드 시트가 떠 있는 동안 아래 화면은 `inert`. `role=dialog`·`aria-modal`·`aria-labelledby` 있음.
- 머문 시간 중복: `browsing`을 먼저 비우고 이벤트를 보내므로, 닫기와 숨김이 함께 와도 한 번만 센다.
- i18n: en·ja·zh-Hans에 browse 문구 7개가 다 있음(tsc가 Lang 타입으로 확인). 종류 이름과 제목은 한국어 그대로(ADR-0093 방침).
- 개인정보 안내 4개 언어 모두에 그림 출처 문단과 기록 항목이 추가됨.

MAJOR: 1
