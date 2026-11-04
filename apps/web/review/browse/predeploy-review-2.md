# 오늘 서울 둘러보기 리뷰 수정 (b85996d6) 배포 전 독립 리뷰 2

리뷰어: Claude 독립 리뷰(읽기 전용, Codex 대신 — ADR-0058). 대상: commit b85996d6(38defcb3 대비), ADR-0114 Amendment 1. 앞 리뷰: `predeploy-review.md`(M1, m1~m9).

결론: 배포를 막을 것은 없다. M1과 m1~m8은 모두 고쳐졌고, 제주·부산·강릉·다른 곳 화면은 건드리지 않았다. 남은 것은 MINOR 5건이다. 가장 급한 것은 진입 예산 여유가 15B밖에 안 남았다는 점과, 변환을 켠 뒤 서울 그림 주소(물음표 뒤 부분 포함)가 실제로 줄어드는지 한 번 확인하는 일이다.

## 확인한 것 (실행 결과)

- `npx tsc --noEmit -p .` 종료 코드 0, 출력 없음.
- `npx vitest run`: 파일 83개 통과, 8개 건너뜀. 테스트 1700개 통과, 109개 건너뜀. 종료 코드 0.
- `npm run test:nation`: 파일 91개 통과. 테스트 1808개 통과, 1개 건너뜀. 종료 코드 0.
- `SITE_URL=https://yeochana.com npm run build`: 종료 코드 0.
- `npm run check:jeju`: **Korean entry JS+CSS gzip 59,985 B (예산 60,000 B)**로 기준 안이다. 종료 코드 1은 오래된 기준선(d6bab4f5) 때문에 생긴 차이다. 개인정보 4개, sw.js, culture-view CSS 프리캐시가 다르게 나왔고, 모두 이번 커밋과 앞 커밋에서 예상한 변경이다. 켠 빌드의 인라인 블록은 +1,912 B로 상한 2,000 B 안이다.
- 운영 `/api/culture?city=seoul`(2026-11-05, 321건)의 그림 주소는 두 형태다. `https://culture.seoul.go.kr/cmmn/file/getImage.do?atchFileId=<hex>&thumb=Y`와 `https://www.kopis.or.kr/upload/pfmPoster/PF_….jpg|png`이다. `%`·`#`·공백이 든 주소는 0건이다.
- 실제 응답:
  - `www.kopis.or.kr`는 `kopis.or.kr`로 301 이동한다. 그래서 www.를 떼는 수정이 맞다.
  - 지금 `https://yeochana.com/cdn-cgi/image/width=256,quality=75,format=auto/https://kopis.or.kr/…jpg`는 404, `text/html`, 151B, `no-store`를 준다. `<img>` 오류가 나고 `brokenPicture`가 글자 카드로 바꾼다.
  - `getImage.do`를 물음표 뒤 부분 없이 부르면 200에 본문 0B, Content-Type 없음이다. Cloudflare가 물음표 뒤를 떼고 원본을 받더라도 「그림 아님」 오류가 나서 글자 카드가 된다. 다른 그림이 잘못 뜨지는 않는다.
- 보고서 판정 함수 `browseLines`를 임의 자료로 직접 돌림:
  - 나감 30 / 중앙값 칸 50 / 카드 30% → 「넓히기」
  - 나감 30 / 중앙값 칸 40 → 「못 미침」
  - 나감 5 → 「판단 보류」
  - 셋 다 ADR Amendment 1의 3·4와 맞음.

### 앞 리뷰 항목별

- **M1 고쳐짐.**
  - `imageUrl`이 https 주소에만 `RESIZE`를 앞에 붙인다. `javascript:`·`data:`·`//`·ftp는 그대로 null이다(browse.test).
  - 원본으로 돌아가는 길은 없다. 실패하면 `error`가 나고 상자는 `noimg`가 되며 img를 지운다. 오류 감시는 주소를 넣기 전에 단다. `onerror=redirect` 옵션도 쓰지 않는다.
  - culture 항목의 `image`를 쓰는 곳은 `browse-view.ts`의 `pic` 하나뿐이다(grep). 카드 시트도 같은 `pic`을 쓴다.
  - 주소 형식 `https://<영역>/cdn-cgi/image/<옵션>/<절대 URL>`은 Cloudflare 문서(Transform via URL)의 원격 그림 형식과 같다.
  - 다른 출처 허용은 「처음 주소만 검사하고 이동은 따라감」(문서 Sources)이다. 그러니 허용 목록에는 `culture.seoul.go.kr`와 `kopis.or.kr`를 넣으면 된다(ADR 그대로).
  - 한도를 넘기면 9422 오류가 나서 글자 카드가 된다. 이것도 ADR과 맞다.
- **m1 고쳐짐.** `nav.ts` 마운트에서 `browse-card`이면 `back()`을 한 번 더 부른다. 두 번째는 `run()` 대기열에 들어가 첫 popstate가 끝난 뒤에 실행된다. 그래서 `history.back()` 두 번이 겹치지 않는다. nav.test에 새로고침 → 두 항목 소비 → 다음 뒤로 가기에 떠남까지 확인하는 테스트가 있다.
- **m2 고쳐짐.** Tab 가두기 선택자에 `a[href]`를 더했다(culture-app 테스트). 다른 시트의 링크도 이제 Tab 순서에 들어가는데, 이건 나아진 것이다.
- **m3 고쳐짐.** `dwellBucket`이 5초 칸이다. 서버 `whole(secs,600,5)`, `BROWSE_IDS`의 `secs:0…600` 5 단위 121개, 보고서의 5초 칸 반복이 모두 같다. 예전 10초 값도 5의 배수라 그대로 받는다.
- **m4 고쳐짐.** 보고서에 「오늘 서울 둘러보기」 절이 있다. 분모는 나감(secs 칸 합 = done)이고 문턱은 done ≥ 30, 중앙값 칸 ≥ 45, (cards:1 + cards:2) × 10 ≥ done × 3이다. ADR Amendment 1의 3·4와 맞다. `specs/usage-events.md`에도 한 줄이 들어갔다. 다른 보고 절에서는 `BROWSE`를 빼서 섞이지 않는다.
- **m5 고쳐짐.** browse_* 네 이벤트가 모두 `countBrowse`를 거친다. webdriver면 보내지 않는다(테스트 있음).
- **m6 고쳐짐.** `win`의 `pagehide`에서도 `endBrowse`를 부른다. `endBrowse`가 직접 `tracker.flush()`를 하므로 등록 순서와 상관없다. `browsing`을 먼저 비우므로 hidden과 pagehide가 함께 와도 한 번만 센다(테스트 있음).
- **m7 고쳐짐.** 두 군데를 고쳤다.
  - reducer는 `browse-card`를 「오늘 목록에 browseId가 있을 때만」 받는다(state.test). 앞으로 가기로 지난 카드에 들어가는 길이 막힌다.
  - 목록을 다시 받았는데 카드 항목이 없으면 `closeOverlay()`로 둘러보기 화면에 돌아온다. 이 앱 쪽 경로를 직접 확인하는 테스트는 없다.
- **m8 일부 고쳐짐.** 아래 MINOR 4.
- **m9.** 아래 MINOR 1.

### 다른 화면과 다른 곳

- 서비스 워커가 `/cdn-cgi/`를 건드리지 않는다(sw.test). 다른 출처 요청은 원래 앞에서 걸러지므로 미리보기나 localhost에서 yeochana.com 그림을 불러도 캐시에 쌓이지 않는다. 옛 SW가 남아 있는 첫 방문에서도 지금의 404는 `res.ok`가 아니라 캐시에 넣지 않는다.
- 입구만 보이는 블록(Amendment 1의 2)은 `render.ts:1405`의 `NATION && dest==='seoul' && origin && 오늘 목록` 안에서만 만들어진다. 제주·부산·강릉·다른 곳은 영향이 없다(test:nation 통과). 오늘 목록이 비면 null이다(테스트 있음).
- `app.ts`의 `main` 그림 오류 처리는 `.card[data-id]`와 `#home img[data-id]`만 본다. 둘러보기 그림과 섞이지 않는다.
- 개인정보 안내 4개 언어 모두 「이 사이트(yeochana.com)를 거쳐 줄여 받음, Cloudflare가 원본을 받아 줄이고 캐시, 그 사이트들에 기기 IP가 가지 않음, 화면 가까운 것만, 위치 없음, Cloudflare 접속 기록에 그림 주소」로 바뀌었다. 코드와 맞는다. 원본으로 돌아가는 길이 없으므로 「IP가 가지 않음」도 사실이다. 다만 「자세히」 링크는 사용자가 눌러 원래 사이트로 가는 것이고, 그림과는 다른 이야기다.

## MAJOR

없음.

## MINOR

### 1. 진입 예산 여유 15B
- 근거: `check:jeju` 출력이 59,985 / 60,000 B다(앞 리뷰 때는 59,932 B).
- 상황: 다음에 app.ts·nav.ts·render.ts에 조금만 더해도 넘는다. 결함은 아니고 알림이다.
- 고칠 방법: 다음 둘러보기 관련 코드는 culture-view 청크 쪽에 두기.

### 2. 물음표 뒤가 있는 원본 주소는 Cloudflare 문서에 나오지 않음 → 켠 뒤 한 번 확인할 것
- 근거: 문서 Transform via URL·Sources·Troubleshooting 세 쪽 모두 원본 주소의 물음표 뒤 부분과 URL 인코딩을 다루지 않는다. 서울 그림 120여 건은 모두 `getImage.do?atchFileId=…&thumb=Y` 꼴이다.
- 상황: Cloudflare가 물음표 뒤를 원본 요청에 넘기지 않으면 서울 그림이 전부 글자 카드가 된다. 위에서 확인했듯 물음표 뒤가 없으면 빈 200이라 엉뚱한 그림은 뜨지 않는다. 안전하게 실패하지만 실험의 「그림 카드」 효과가 반쪽이 된다. 문서의 「경고(warning)는 200」 경우처럼, 줄이지 못한 원본이 200으로 오는 길은 코드로 막을 수 없다. 오늘 자료의 원본은 모두 jpg·png에 크기 한도 안이라 실제로 생길 가능성은 낮다.
- 고칠 방법: 주인이 변환을 켠 직후, 서울 주소 하나와 KOPIS 주소 하나에 `curl -sI`를 보내 `cf-resized` 헤더(err= 없음), `content-type: image/webp|avif`, 크기 수십 KB인지 본다. 서울 쪽이 실패하면 주소 안의 `?`를 `%3F`로 바꿔 보거나, 서울은 글자 카드로 두는 것을 결정한다. 변환을 켜기 전에 배포하면 그동안 그림은 모두 글자 카드이고, 보이는 카드마다 404 요청(151B)이 한 번씩 생긴다. 판정 기간이 시작되기 전에 켜는 편이 낫다.

### 3. 중앙값 칸을 고를 때 짝수 표본에서는 아래쪽을 고름
- 위치: `scripts/analytics-report.mjs` `browseLines`(`seen*2 >= done`).
- 상황: 나감 30회가 40초 칸 15, 45초 칸 15로 나뉘면 중앙값 칸은 40이고 판정은 「못 미침」이다(직접 실행해 확인). 보수적인 쪽이라 틀렸다고 할 수는 없지만, ADR Amendment 1의 3에는 이 경우를 어떻게 읽는지 적혀 있지 않다. 덧붙여 600초 칸은 「600~초」로 찍힌다.
- 고칠 방법: 결과를 보기 전에 ADR에 「짝수면 아래 칸」 한 줄을 적기. 600은 「600초 이상」으로 찍기.

### 4. (m8 나머지) 감시자를 다음 화면을 만들 때만 끊음
- 위치: `src/browse-view.ts:88-90`.
- 상황: 화면을 닫아도 마지막 IntersectionObserver가 모듈 변수 `watching`에 남는다. 아직 못 본 img 수십 개를 다음에 열 때까지 붙들고 있다. 「많아야 하나」라 영향은 작다.
- 고칠 방법: 둘러보기를 닫을 때 `watching?.disconnect()` 하기. 아니면 지금처럼 두고 주석대로 받아들이기.

### 5. (m7 나머지) 목록을 다시 받으면 「가로로 넘긴 줄 수」가 0에서 다시 시작됨
- 위치: `browseScreen`의 `scrolled.clear()`. 목록이 바뀌어 화면을 다시 만들 때 불린다.
- 상황: 둘러보는 도중 목록을 다시 받으면(자정, 재조회) 그 전에 넘긴 줄이 `rows`에서 빠진다. 판정 기준에는 들어가지 않는 보조 수치이고, 드문 일이다. 앞 리뷰 m7에 적혀 있었는데 이번에 다루지 않았다. 카드 항목이 사라질 때 `closeOverlay()`로 돌아오는 새 경로는 앱 단위 테스트가 없다.
- 고칠 방법: 다시 만들 때는 비우지 않고 `openBrowse`에서만 비우기. 새 경로에 culture-app 테스트 하나 더하기.

MAJOR: 0
