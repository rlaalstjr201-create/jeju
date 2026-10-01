# 배포 — Cloudflare Pages (apps/web "P의 여행")

ADR-0063 1. 정적 사이트 하나, 서버 코드 없음. 익명 기록 수집기(ADR-0061)는 나중에 같은 주소의 Functions로 붙인다(그 전엔 `VITE_EVENTS_URL` 미설정).

## 1. Pages 프로젝트 설정

Git 연결(GitHub `rlaalstjr201-create/jeju`) 기준. 의존성은 저장소 루트의 npm workspaces(`package-lock.json`)에 있다.

| 항목 | 값 |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Root directory (고급) | `/` (저장소 루트. Pages가 루트 `package-lock.json`으로 `npm ci`) |
| Build command | `npm run build -w @jeju/web` |
| Build output directory | `apps/web/dist` |
| 환경 변수 `NODE_VERSION` | `22` |
| 환경 변수 `SITE_URL` | 사이트 주소, 끝 `/` 없이. 예: `https://p-trip.pages.dev` 또는 커스텀 도메인. 링크 미리보기(`og:image`·`og:url`)를 절대 주소로 만든다. 없으면 상대 경로(카카오톡 미리보기에 사진이 빠질 수 있음) |
| 환경 변수 `VITE_EVENTS_URL` | **넣지 않는다.** 없으면 익명 기록을 모으지도 보내지도 않고, 저장한 곳의 기록 문구·`기록 끄기`도 숨는다. 수집기(영속 저장·크기/빈도 제한)를 붙인 뒤 새 결정으로 켠다 |

Production·Preview 두 환경에 같은 값을 넣는다(Preview의 `SITE_URL`은 비워도 된다).

빌드 결과에 함께 나가는 것(`apps/web/public/`):

- `_headers`: 캐시 규칙. 해시 파일(`/assets/*`)과 `/spots.json`(늘 `?v=해시`로 요청) 1년 immutable, `/`·`/index.html`·`/sw.js`·`/manifest.webmanifest`·`/404.html`·`/privacy` no-cache, 아이콘·`og.png`·`favicon.ico`·`robots.txt` 하루. `/*` 규칙은 두지 않는다(같은 헤더가 둘이면 Pages가 값을 이어 붙인다).
- `404.html`: 있으면 Pages가 SPA 폴백을 끄고 모르는 경로에 이 페이지를 404로 준다. `_redirects`는 두지 않는다.
- `privacy.html`(`/privacy`), `robots.txt`, `og.png`(1200×630), `favicon.ico`, maskable 아이콘.

HTTPS는 Pages 기본. 커스텀 도메인을 붙이면 대시보드에서 "Always Use HTTPS"를 켠다. 압축(brotli)은 Pages가 알아서 한다.

로컬에서 같은 동작 보기: `cd apps/web && npm run build && npx vite preview` — preview 서버가 Pages처럼 모르는 경로에 `404.html`을 404로 준다(`vite.config.ts` `pagesNotFound`). `_headers`는 preview에서 적용되지 않는다(`tests/deploy.test.ts`가 내용을 검사).

## 2. 배포 전

- [ ] `apps/web`에서 `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run check:slop`, e2e(`npm run e2e`) 모두 통과.
- [ ] `privacy.html`의 문의처가 맞는지(지금은 GitHub 이슈 링크).
- [ ] 제주관광공사(064-740-6000)에 오픈API 사진 직접 표시 가능 여부 문의·회신 보관(ADR-0063 3, 사용자).
- [ ] Pages 환경 변수: `SITE_URL` 있음, `VITE_EVENTS_URL` 없음.

## 3. 배포 뒤 스모크 (`SITE`=사이트 주소)

명령으로:

- [ ] `curl -sI $SITE/` → `200`, `cache-control: no-cache`. `/sw.js`, `/manifest.webmanifest`도 `no-cache`.
- [ ] `curl -s $SITE/ | grep -o 'assets/index-[^"]*\.js'`로 찾은 파일 → `cache-control: public, max-age=31536000, immutable`.
- [ ] `curl -sI "$SITE/spots.json?v=x"` → 1년 immutable, `curl -sI -H 'accept-encoding: br' …`에 `content-encoding: br`.
- [ ] `curl -sI $SITE/nope/deep` → `404`, 본문에 `없는 주소예요.`. `curl -sI $SITE/privacy` → `200`.
- [ ] `curl -s $SITE/ | grep og:image` → `$SITE/og.png` 절대 주소. `curl -sI $SITE/og.png` → `200 image/png`.
- [ ] `curl -s $SITE/robots.txt` → `User-agent: *` / `Allow: /`.

브라우저로(데스크톱 Chrome):

- [ ] 첫 화면 → 기분 → 카드 3장, 콘솔 오류 0. DevTools Application: 서비스워커 활성, 매니페스트에 maskable 아이콘 경고 없음.
- [ ] 저장한 곳 아래에 `정보·사진: 비짓제주(제주관광공사)`, `개인정보 처리 안내`, `링크로 백업`. 결과 화면 맨 아래에도 출처 한 줄. `기록 끄기`는 **보이지 않아야** 한다(수집 꺼짐).
- [ ] `링크로 백업` → 다른 브라우저(또는 시크릿 창)에 붙여 넣기 → `합치기` → ♥ N이 같다. 주소창에서 `#s=…`가 사라진다.
- [ ] Network 탭: 이 주소·`api.cdn.visitjeju.net`(사진) 말고는 요청 없음, POST 없음.
- [ ] 새 배포 한 번 더(문구 하나 바꿔서) → 열어 둔 탭이 첫 화면에서 새 코드로 바뀐다(S65).

실기기(ADR-0063 Consequences):

- [ ] 아이폰 Safari: 위치 허용 → 카드, 하트, 저장한 곳에서 홈 화면 안내 한 번(`공유 버튼에서 ‘홈 화면에 추가’…`), 홈 화면에 추가 → 홈 앱에서 `링크로 백업` 링크를 열어 합치기.
- [ ] 카카오톡으로 주소 보내고 열기: 링크 미리보기에 제목·설명·사진(카카오 공유 디버거 developers.kakao.com/tool/debugger/sharing에서 캐시 초기화). 인앱 첫 화면에 `카카오톡 안에서 저장한 곳은 카카오톡에만 남아요.` → `브라우저로 열기`가 Safari/Chrome으로 연다(저장한 곳이 있으면 합치기 안내까지).
- [ ] 인스타그램 DM 링크: 안내 → `브라우저로 열기`가 링크를 복사하고 붙여 넣는 곳을 알려 준다.
- [ ] 갤럭시 삼성 인터넷·Chrome: 저장 뒤 저장한 곳에서 `홈 화면에 추가` 버튼 → 설치 창, 설치한 앱 아이콘이 잘리지 않음(maskable).
- [ ] 다크 모드에서 404·개인정보 페이지도 어두운 바탕.

남은 일(배포 직후~1주): 오류 집계(새 결정 필요), Lighthouse, 한국 통신사별 응답 지연 실측(무료 플랜 우회 사례).
