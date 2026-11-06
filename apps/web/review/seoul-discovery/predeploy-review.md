# 배포 전 독립 리뷰 — 서울 매일 발굴 엔진·카드 그림 (ADR-0123 + Amendment 1)

대상: `git diff 445cd52f..ab113eff`(608c32f7~ab113eff). 기준으로 ADR-0123, `specs/seoul-discovery.md`, `review/seoul-discovery/criteria-01·02.md`, `scripts/seoul-discovery/*`, `src` 변경, `public/privacy*.html` 4개 언어, `.github/workflows/deploy-weekly-seoul.yml`, `docs/discovery/routine-prompt.md`를 읽었다. 리뷰어는 Claude 독립 리뷰이고, 소스는 고치지 않았다.

결론: **MAJOR 0, MINOR 3, NIT 4.** 앱 쪽은 맞다(지연 로딩·no-referrer·실패 시 타일·흔들림 없음·가로 넘침 0·예산). 자료 주입 피해 범위와 엔진 장부 논리, 루틴 프롬프트도 맞다. 남는 것은 셋이다. 자동 배포가 「사람이 확인하지 않은 master 코드」까지 내보낼 수 있는 구조(매일 돌면서 위험이 커짐), 개인정보 안내의 「출처 사이트」 표현이 실제 그림 호스트(제3자 CDN)와 다른 점, 주소만 보고 의심되는 그림 몇 곳이다.

## 실행한 것
- `npx tsc --noEmit` exit 0. vitest 기본 1824 passed / 106 skipped, `--mode nation` 1929 passed / 1 skipped, `--mode busan` 1847 passed / 83 skipped.
- 스크래치 nation 빌드: 진입 JS+CSS gzip **60,958 B**(예산 70,000 B). 아이콘·타일·`directUrl`·발굴 자료는 문화 청크 `culture-view-*.js`(gzip 31,328 B)에만 있고 진입에는 없다.
- 실제 Chrome(playwright-core): 스크래치 빌드, 용산, 14:00 KST 가짜 시계, 375×812. 외부 그림은 로컬 PNG로 대신했고, `cdn.imweb.me` 그림은 일부러 404로 돌려줬다. 보이는 줄을 끝까지 가로로 넘긴 뒤 측정했다.
  - 문서 가로 넘침 0.
  - 선반 그림 65개 모두 `loading=lazy`·`referrerpolicy=no-referrer`. 화면에 가까워진 31개만 `src`가 생겼다.
  - 실패·없음 상자는 타일이 보였다(`visibility: visible`).
  - 4:3 상자 높이는 96px로 모두 같아서 그림이 와도 흔들리지 않는다.
- 자료·코드 대조: `fun-seoul.json` 그림 27곳의 주소·호스트를 봤다. `discovery-seoul.json`은 `items: []`다(첫 회차 게이트 미달). 테스트(`seoul-discovery.test.ts`)가 자료 형식을 검사하는지도 봤다.

## 확인 (문제없음)
- **그림 주소 안전**: `directUrl`은 `https:`만 받는다. `javascript:`·`data:`·`http:`·깨진 주소는 그림 없음이고, 그러면 타일이 나온다. 링크는 `linkUrl`(http·https만)을 거친다. 이름·출처 이름은 `textContent`로만 들어가 HTML 주입이 없다.
- **자료 주입 피해 범위**:
  - 워크플로는 이번 push가 `data/seoul/(weekly|discovery)-seoul.json`과 `review/seoul-(weekly|discovery)/` 밖을 바꾸면 배포하지 않는다.
  - 배포 전에 tsc·vitest(기본·nation)를 돈다. 테스트는 발굴 자료의 종류·날짜·서울 좌표·카카오 주소 꼴·`src` https·`img`가 `directUrl` 그대로인지 검사한다.
  - 그래서 악성 자료가 할 수 있는 일은 둘로 줄어든다. 하나는 「아무 https 호스트의 그림을 불러 사용자 IP를 그 호스트에 보이게 하기」, 다른 하나는 「https 출처 글 링크(누를 때만)」다. 스크립트 실행·다른 출처 쿠키 접근은 없다.
  - `review/` 아래 파일은 빌드·테스트에 쓰이지 않는다.
- **장부·되돌리기·만료**:
  - `once()` 표지 파일로 각 단계는 하루 한 번만 돈다.
  - 감사 대상은 `added > lastAudit`이다. 루틴 순서(sweep → … → ship → images → 감사)에서 감사일에 실린 것도 그날 감사에 들고, 감사 뒤 `lastAudit = D`가 된다. 빈틈·겹침이 없다.
  - 미달이면 그 기간 실린 것을 자료에서 빼고, 장부에 `reverted`를 남겨 다시 판정하지 않는다.
  - 새로 연 곳은 앱이 `start ≤ day ≤ end(start+55)`로만 보이고, 그 뒤엔 `stay`가 있을 때만 그 갈래로 보인다. `sweep`이 멈춰도 날짜로 빠진다.
  - 폐업 신호는 카카오 이름 검색에 id가 없거나, 블로그 제목에 상호와 폐업 낱말이 함께 있을 때다.
  - 첫 회차 `--hold` → 감사 → 미달 → `hold.json` 비움·장부 되돌림 흐름이 실제 첫 회차 기록과 맞는다.
- **루틴 프롬프트**:
  - 기준 02 고정, 「각 단계 오늘 한 번」, 판정·감사 재실행 금지, 기계적 실패 시 그날 멈추고 push하지 않음.
  - 키 값을 출력·파일·커밋에 남기지 않음. `git add -A`·amend·강제 push 금지, 자료·review 파일만 이름으로 add, push 뒤 `ls-remote` 대조.
  - 감사자에게 판정·key·장부·자료를 열지 말라고 지시한다.
  - 사전등록·1회·비밀값 규칙을 지킨다. 카카오 호출 로그도 날짜·시각·검색어·상태 코드만 남긴다.
- **시작 화면·LCP**: 선반 그림은 IntersectionObserver가 화면에 가까워질 때만 주소를 넣는다. 시작 화면 동안은 `data-later`다(기존 규칙). 「지금 여기서」 사진(LCP)의 경로는 바뀌지 않았다.
- **접근성**: 타일·그림은 `aria-hidden`·`alt=""`이고, 카드 이름은 그림·타일 밑 글자로 보인다(전에는 즐길 거리 이름이 화면 밖 글자였다). 동네 카드는 타일이 이름을 말하므로 이름을 화면 밖 글자로 둔다. 새 색(`--t-new`)은 밝게 #17653b/#e6f4ec, 어둡게 #93dfb0/#15301f로 대비가 충분하다.
- **선반 자리**: `fresh`는 아침 넷째·낮 셋째·해 질 녘 다섯째·밤 여섯째·새벽 아홉째다. 이번 주 서울(낮 맨 앞)·카페(낮 둘째)·밤 놀거리(밤 넷째)와 부딪히지 않는다. 지금은 자료가 비어 줄이 없다.
- **다른 여행지**: 바뀐 것은 서울 문화 청크(즐길 거리·이번 주·발굴)와 그 CSS뿐이다. 개인정보 안내 문단도 「서울 홈」에 한정해 적혀 있다.

## MINOR

### m1. 자료만 바뀐 push가 master의 **확인 안 된 코드까지** 운영에 내보낸다 — 매일 돌면서 위험이 커졌다
- 위치: `.github/workflows/deploy-weekly-seoul.yml`의 「Only weekly data in this push」. 검사는 `before..sha` 사이에 자료 밖 파일이 없는지만 본다. 빌드·배포는 `sha`의 전체 트리(= master HEAD의 모든 코드)로 한다.
- 시나리오: 누군가 코드를 master에 push만 하고 배포는 확인 뒤 손으로 하려 한다(워크플로 머리말: 「코드 배포는 지금처럼 사람이 확인한 뒤 손으로」). 다음 날 04:30 루틴의 자료 push가 그 코드를 함께 빌드해 내보낸다. tsc·vitest·예산은 돌지만, 실기기 확인·리뷰 MAJOR 0 같은 사람 게이트는 건너뛴다.
- 주 1회일 때도 있던 구조지만, 매일 돌면서 「push했지만 아직 배포 안 한 코드」가 하루 안에 나갈 확률이 커졌다.
- 고칠 방향:
  - (a) 사람이 배포할 때 `deployed` 태그(또는 ref)를 올리고, 워크플로는 `git diff deployed..sha`에 자료 밖 파일이 없을 때만 배포한다.
  - (b) 마지막 배포 커밋을 체크아웃하고 자료 파일만 덮어써 빌드한다.

### m2. 개인정보 안내가 「출처 사이트(공식 사이트·기사)에서 직접」이라고 하지만, 실제 그림의 절반 넘게 제3자 호스팅에서 온다
- 위치: `public/privacy*.html` 4개 언어의 새 문단.
- 근거: 그림 27곳의 호스트를 세었다.
  - `cdn.imweb.me` 10곳(아임웹 호스팅).
  - `storage.googleapis.com` 2곳.
  - `*.supabase.co`·`*.cloudfront.net`·`s3-ap-northeast-2.amazonaws.com`·`img.reserv.company`·`oopy.lazyrockets.com`(노션 이미지 프록시) 각 1곳.
  - 그래서 접속 IP와 브라우저 정보를 보는 쪽은 「그 정보의 출처 사이트」가 아니라 그 사이트가 쓰는 호스팅·CDN 업체인 경우가 많다.
- 고칠 방향: 「출처 사이트나 그 사이트가 그림을 맡긴 호스팅 업체(예: 이미지 CDN)」로 4개 언어를 함께 고친다. 안내가 실제 흐름보다 좁게 말하지 않도록 한다.

### m3. 주소로 보아 잘못 붙었을 가능성이 있는 그림 4곳 — 눈 확인 필요 (그림 파일은 내려받지 않았다)
- **프릳츠 도화점**: `fritz.co.kr/web/product/small/201801/directtrade.png`. 쇼핑몰 상품 작은 썸네일(원두 상품)로 보인다. 카페 그림이 아니다.
- **천년동안도 낙원**: `chunnyun.com/assets/venue/story-20261006/daehangno-queue.png`. 주소가 **대학로** 지점의 줄 사진을 말한다. 다른 지점 그림이다.
- **부기우기**: `oopy.lazyrockets.com/api/v2/notion/image?...`. 노션 사이트의 이미지 프록시다. 기준이 「노션·oopy 같은 플랫폼 페이지」를 거르는데, 출처 **페이지**만 검사하고 그림 **호스트**는 검사하지 않아 통과했다.
- **예그린씨어터·삼일로창고극장**: `…-screen-thumb`. 사이트 화면 캡처 썸네일로 보인다.
- 덧붙여 라티튜드32는 소피텔 호텔 공통 그림일 수 있다. 유어마인드(`ym_og.jpg`)·CJ아지트(`og/cjazit.jpg`)는 사이트 대표 그림(로고형일 수 있음)이다.
- 고칠 방향: 위 곳은 주인이 눈으로 보고 `img`를 지운다(호출 없이). 다음 회차의 `badImage`에 `/product/`, `screen-thumb`, 그림 호스트의 플랫폼 목록(`lazyrockets`·`oopy`·`notion`) 검사를 더한다.

## NIT
- n1. 장부 `names`는 정규화한 **이름만**을 열쇠로 쓴다. 「크리스마스 마켓」처럼 흔한 이름은 한 번 drop되면 다른 장소·다른 해의 같은 이름까지 영원히 다시 보지 않는다. 열쇠에 구나 카카오 id를 함께 쓰면 놓침이 줄어든다.
- n2. 실린 수가 적은 주(예: 5곳)는 감사 표본이 곧 전체다. 한 곳만 엇갈려도 80%로 그 주 전체가 되돌려진다(첫 회차가 그랬다). 기준대로이지만, 표본이 작을 때의 규칙(예: 10곳 미만이면 다음 주와 합쳐 감사)을 다음 기준에서 정할 만하다.
- n3. `BAD_IMAGE`의 `icon`·`blank`·`temp_` 같은 낱말은 경로 어디에든 걸린다(예: `…/silicon-valley.jpg`). 오탐은 그림 없음(타일)으로 끝나 해는 없다.
- n4. 카드 시트의 그림은 `later` 없이 바로 받는다(시트를 연 뒤라 맞다). 시트의 「그림: <출처>」는 즐길 거리 `imgFrom`이 도메인 문자열(`suscoop.com`, `paroot.kr`)인 곳이 많다. 사람이 읽을 이름이면 더 낫다.
