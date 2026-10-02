# 배포 — Cloudflare Pages (apps/web 「여행계획짜기 귀찮아:제주」)

ADR-0063 1. 정적 사이트 하나에 서버 코드는 비 소식 함수 `/api/rain` 하나뿐(ADR-0076, `apps/web/functions/`). 이름은 ADR-0068, 정적 랜딩(`/jeju/**`)은 ADR-0072. 익명 기록 수집기(ADR-0061)는 나중에 같은 주소의 Functions로 붙인다(그 전엔 `VITE_EVENTS_URL` 미설정).

## 1. Pages 프로젝트 설정

### 실제 배포: 직접 업로드 (wrangler)

프로젝트 `gwichana-jeju`는 Git 연결 없이 직접 업로드로 올린다. `apps/web`에서:

```sh
npm run build                                          # dist/ (빌드 환경 변수는 아래 표와 같다)
npx wrangler pages deploy dist --project-name gwichana-jeju
```

- `apps/web/functions/`(비 소식 `/api/rain`, ADR-0076)는 이 명령을 돌린 디렉터리 기준으로 찾아 같이 올라간다. 그래서 반드시 `apps/web`에서 돌린다. 함수는 앱 번들과 별개라 50KB 예산에 들어가지 않는다.
- 기상청 키(data.go.kr 「기상청_단기예보 조회서비스」, **디코딩 키**)는 비밀로 한 번 넣는다: `npx wrangler pages secret put KMA_SERVICE_KEY --project-name gwichana-jeju`. 키가 없으면 함수가 204를 돌려주고 앱은 비 줄을 숨긴다(다른 기능은 그대로).
- 로컬에서 함수까지 보기: `npx wrangler pages dev dist --port 8788` → `/api/rain?area=aewol`이 키 없이 204, `?area=nope`이 400.

### Git 연결로 바꿀 때

GitHub `rlaalstjr201-create/jeju` 기준. 의존성은 저장소 루트의 npm workspaces(`package-lock.json`)에 있다.

> **주의**: Git 연결 빌드는 `functions/`를 Root directory(아래 표에서는 저장소 루트) 기준으로 찾는다. 지금 위치(`apps/web/functions/`)로는 함수가 배포되지 않아 비 소식이 조용히 사라진다. Root directory를 `apps/web`로 하거나 함수를 그 빌드의 루트로 옮긴다.

| 항목 | 값 |
|---|---|
| 프로젝트 이름 | 사용자가 정한다. `<프로젝트>.pages.dev`가 된다(로마자만, 예: `gyehoek-gwichana`) |
| Production branch | `master` |
| Framework preset | None |
| Root directory (고급) | `/` (저장소 루트. Pages가 루트 `package-lock.json`으로 `npm ci`) |
| Build command | `npm run build -w @jeju/web` — `vite build && tsx scripts/build-landing.mjs`라 정적 랜딩·`sitemap.xml`까지 만든다(깨끗한 `--depth 1` 클론에서 `npm ci` → 이 명령 성공 확인, 2026-10-01) |
| Build output directory | `apps/web/dist` |
| 환경 변수 `NODE_VERSION` | `22` |
| 환경 변수 `SITE_URL` | 사이트 주소, 끝 `/` 없이. 예: `https://<프로젝트>.pages.dev` 또는 커스텀 도메인. 링크 미리보기(`og:image`·`og:url`), 모든 페이지의 `canonical`(홈·`/privacy`·`/jeju/**`), JSON-LD `url`, `sitemap.xml`, `robots.txt`의 `Sitemap:` 줄을 절대 주소로 만든다. 없으면 상대 경로(카카오톡 미리보기에 사진이 빠지고, 검색엔진은 canonical·sitemap을 못 믿는다). **커스텀 도메인을 붙이면 그 주소로 바꾸고 다시 배포**한다(`*.pages.dev`도 계속 열리지만 canonical이 도메인을 가리킨다) |
| 환경 변수 `LANDING_PHOTOS` | 보통은 **넣지 않는다**(정적 랜딩에 비짓제주 사진 핫링크). `0`이면 랜딩(`/jeju/**`)의 사진·`og:image`·JSON-LD `image`를 모두 빼고 출처를 `정보:`로 바꾼다 — 제주관광공사 회신이 거절이거나 상업화를 정했을 때(ADR-0072 3) |
| 환경 변수 `VITE_EVENTS_URL` | **넣지 않는다.** 없으면 익명 기록을 모으지도 보내지도 않고, 저장한 곳의 기록 문구·`기록 끄기`도 숨는다. 수집기(영속 저장·크기/빈도 제한)를 붙인 뒤 새 결정으로 켠다 |

Production·Preview 두 환경에 같은 값을 넣는다(Preview의 `SITE_URL`은 비워도 된다 — Pages가 미리보기 주소에 `X-Robots-Tag: noindex`를 붙인다).

빌드 결과에 함께 나가는 것(`apps/web/public/`):

- `_headers`: 캐시 규칙. 해시 파일(`/assets/*`)과 `/spots.json`(늘 `?v=해시`로 요청) 1년 immutable, `/`·`/index.html`·`/sw.js`·`/manifest.webmanifest`·`/404.html`·`/privacy` no-cache, 아이콘·`og.png`·`favicon.ico`·`robots.txt` 하루. `/*` 규칙은 두지 않는다(같은 헤더가 둘이면 Pages가 값을 이어 붙인다). 규칙이 없는 파일(`/jeju/**` HTML·`/jeju/landing.css`·`sitemap.xml`·`llms.txt`)은 Pages 기본값 `public, max-age=0, must-revalidate`(매번 ETag로 확인)라 새 배포가 바로 보인다 — 이름에 해시가 없으니 그게 맞다.
- `404.html`: 있으면 Pages가 SPA 폴백을 끄고 모르는 경로에 이 페이지를 404로 준다. `/jeju/` 아래 없는 주소도 같은 404(`dist/jeju/`에 404.html 없음, 허브 링크 있음). 서비스워커는 `/jeju/**`를 캐시하지도 셸로 답하지도 않는다. `public/`에 `_redirects`는 두지 않는다(빌드가 지역을 옮긴 장소 페이지의 301만 `dist/_redirects`에 쓴다, ADR-0072).

빌드가 만드는 것(`scripts/build-landing.mjs`, `vite build` 뒤): 정적 랜딩 `dist/jeju/**`(허브·지역 15·조합·장소 페이지, `landing.css`), `sitemap.xml`, `SITE_URL`이 있으면 `robots.txt`의 `Sitemap:` 줄. 품질 기준(원문 0건·쌍 유사도·자기 본문 비율, `specs/seo-landing.md`)을 어기거나 주소 없는 장소가 있으면 빌드가 실패한다 — 새 장소는 `npm run landing:slugs -w @jeju/web` 뒤 `apps/web/data/landing/slugs.json`을 커밋한다.
- `privacy.html`(`/privacy`), `robots.txt`, `og.png`(1200×630), `favicon.ico`, maskable 아이콘.

한도(2026-10-01 빌드): 파일 2,991개(Pages 무료 한도 20,000), 가장 큰 파일 `spots.json` 1.16MB(한도 25MiB), 전체 약 37MB(랜딩 15.5MB, `LANDING_PHOTOS=0`이면 13.9MB). 장소가 늘면 장소당 파일 하나씩 늘어난다.

### 검색엔진 소유 확인

Pages는 `/이름.html`을 `/이름`으로 308 이동시킨다(확장자 없는 주소). 확인 파일 방식은 이 이동 때문에 실패할 수 있어 **메타 태그**를 쓴다.

- 네이버 서치어드바이저: 사이트 등록 → 소유 확인 「HTML 태그」 → `<meta name="naver-site-verification" content="…" />`를 `apps/web/index.html` `<head>`(`og:` 메타 위)에 넣고 배포.
- Google Search Console: 커스텀 도메인이면 **도메인 속성 + DNS TXT**(Cloudflare DNS에 TXT 한 줄, 코드 변경 없음). `*.pages.dev`만 쓰면 URL 접두어 속성 + 「HTML 태그」 `<meta name="google-site-verification" content="…" />`를 같은 `<head>`에.
- 두 태그는 홈(`/`)에만 있으면 된다. 등록 뒤 `<SITE>/sitemap.xml`을 둘 다에 제출. 주소와 속성은 `apps/web/data/seo/config.json`(`site_url`·`gsc.property`·`naver.site`)에 적는다(확인 값은 메타 태그에만).
- 파일 방식을 꼭 써야 하면 `apps/web/public/`에 두고 `curl -sI $SITE/<파일>.html`이 200인지(308이 아닌지) 먼저 본다.

HTTPS는 Pages 기본. 커스텀 도메인을 붙이면 대시보드에서 "Always Use HTTPS"를 켠다. 압축(brotli)은 Pages가 알아서 한다.

로컬에서 같은 동작 보기: `cd apps/web && npm run build && npx vite preview` — preview 서버가 Pages처럼 모르는 경로에 `404.html`을 404로 준다(`vite.config.ts` `pagesNotFound`). `_headers`는 preview에서 적용되지 않는다(`tests/deploy.test.ts`가 내용을 검사).

## 2. 배포 전

- [ ] `apps/web`에서 `npx tsc --noEmit`, `npx vitest run`, `npm run build`(기본·`LANDING_PHOTOS=0` 둘 다), `npm run check:slop`, e2e(`npm run e2e`), `SITE_URL=… npm run seo:crawl`(감사 0건) 모두 통과. 최근 결과는 `docs/predeploy-review.md` 0절.
- [ ] `privacy.html`의 문의처가 맞는지(지금은 GitHub 이슈 링크).
- [x] 제주관광공사 사진 이용 가능 확인(2026-10-01, 회신 사용자 보관).
- [ ] Pages 환경 변수: `SITE_URL` 있음, `VITE_EVENTS_URL` 없음. `LANDING_PHOTOS`는 넣지 않는다(사진 켬, 공사 확인 완료).

## 3. 배포 뒤 스모크 (`SITE`=사이트 주소)

명령어 점검은 한 번에: `SITE=https://… bash apps/web/scripts/smoke.sh` (아래 명령 목록을 자동화한 것).

명령으로:

- [ ] `curl -sI $SITE/` → `200`, `cache-control: no-cache`. `/sw.js`, `/manifest.webmanifest`도 `no-cache`.
- [ ] `curl -s $SITE/ | grep -o 'assets/index-[^"]*\.js'`로 찾은 파일 → `cache-control: public, max-age=31536000, immutable`.
- [ ] `curl -sI "$SITE/spots.json?v=x"` → 1년 immutable, `curl -sI -H 'accept-encoding: br' …`에 `content-encoding: br`.
- [ ] `curl -sI $SITE/nope/deep` → `404`, 본문에 `없는 주소예요.`. `curl -sI $SITE/privacy` → `200`.
- [ ] `curl -s $SITE/ | grep og:image` → `$SITE/og.png` 절대 주소. `curl -sI $SITE/og.png` → `200 image/png`.
- [ ] `curl -s $SITE/robots.txt` → `User-agent: *` / `Allow: /` / `Sitemap: $SITE/sitemap.xml`.
- [ ] `curl -s $SITE/ | grep canonical` → `$SITE/`. `/privacy`도 `$SITE/privacy`.
- [ ] `curl -sI $SITE/jeju/` → `200`, `curl -sI $SITE/jeju/aewol/`·장소 한 쪽 → `200`. `curl -sI $SITE/jeju/nope/` → `404`. `curl -s $SITE/sitemap.xml | grep -c '<loc>'` → 빌드 로그의 `sitemap N URLs`와 같다.

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
- [ ] 길찾기(자동차·도보·배 타는 곳) × 지도 앱 3개 점검: `docs/device-check.md`(ADR-0069·0071). 그 전에 `npm run check:links`(네이버·카카오 링크가 그대로인지).

검색(배포 당일~1주): 네이버 서치어드바이저·GSC 등록과 사이트맵 제출(위 「검색엔진 소유 확인」), GA4는 도입 여부부터 결정(ADR-0061과 겹침). 주간 점검은 `docs/seo/README.md`.

남은 일(배포 직후~1주): 오류 집계(새 결정 필요), Lighthouse, 한국 통신사별 응답 지연 실측(무료 플랜 우회 사례).
