# 배포 — Cloudflare Pages (apps/web 「여차나:제주」)

ADR-0063 1. 정적 사이트 하나에 서버 코드는 Functions 둘(`apps/web/functions/`): 비 소식 `/api/rain`(ADR-0076)과 익명 기록 수집기 `/api/events`(ADR-0061·ADR-0078, D1 `yeogwi-events`). 이름·주소는 ADR-0082(ADR-0077 대체), 정적 랜딩(`/jeju/**`)은 ADR-0072. 분석은 GA4·네이버 애널리틱스·자체 기록 셋이고, 꺼진 채로는 운영 빌드가 되지 않는다(ADR-0078).

## 1. Pages 프로젝트 설정

### 실제 배포: 직접 업로드 (wrangler)

프로젝트 `yeochana`(https://yeochana.com, ADR-0084 — `yeochana.pages.dev`·`www`는 `functions/_middleware.ts`가 301)는 Git 연결 없이 직접 업로드로 올린다. `apps/web`에서:

```sh
# 처음 한 번, 그리고 migrations/에 새 파일이 생길 때: D1 테이블 만들기
npx wrangler d1 migrations apply yeogwi-events --remote

SITE_URL=https://yeochana.com npm run build   # dist/ (표 참고)
# 부산·자동 지역 스위치는 켠 빌드가 기본(plans/busan.md S7, plans/nationwide-app.md U19).
# 자동 지역만 끄기: SITE_URL=https://yeochana.com npx vite build --mode busan && npx tsx scripts/build-landing.mjs
# 제주만으로 되돌리기: SITE_URL=https://yeochana.com npm run build:jeju
npx wrangler pages deploy dist --project-name yeochana
SITE=https://yeochana.com bash scripts/smoke.sh                                                               # 아래 3
```

- `VITE_EVENTS_URL`은 `SITE_URL`이 있으면 기본 `/api/events`라 넣지 않아도 된다. 셋(`VITE_GA4_ID`·`VITE_NAVER_WA`·`VITE_EVENTS_URL`) 중 하나라도 비면 빌드가 이름을 대고 실패한다(`scripts/analytics-env.ts`). 공개 ID(GA4 `G-P8DN26LKBC`, 네이버 `1caff08e05278f0`)는 `scripts/analytics-env.ts` `SITE_IDS`에 있어 `SITE_URL`만 주면 채워진다. 같은 이름 환경 변수가 있으면 그것이 이긴다.
- `apps/web/wrangler.toml`이 프로젝트 이름·`pages_build_output_dir`·D1 바인딩(`EVENTS_DB` → `yeogwi-events`)을 정한다. 비밀은 넣지 않는다.

- `apps/web/functions/`(비 소식 `/api/rain`, ADR-0076)는 이 명령을 돌린 디렉터리 기준으로 찾아 같이 올라간다. 그래서 반드시 `apps/web`에서 돌린다. 함수는 앱 번들과 별개라 50KB 예산에 들어가지 않는다.
- 기상청 키(data.go.kr 「기상청_단기예보 조회서비스」, **디코딩 키**)는 비밀로 한 번 넣는다: `npx wrangler pages secret put KMA_SERVICE_KEY --project-name yeochana`. 키가 없으면 함수가 204를 돌려주고 앱은 비 줄을 숨긴다(다른 기능은 그대로).
- 로컬에서 함수까지 보기: `npx wrangler d1 migrations apply yeogwi-events --local` 뒤 `npx wrangler pages dev dist --port 8788`(D1은 `wrangler.toml` 바인딩의 로컬 사본, `apps/web/.wrangler/`) → `/api/rain?area=aewol`이 키 없이 204, `?area=nope`이 400, `POST /api/events`(유효한 배열)가 204, `/api/events/health`가 `{"last24h":n}`. 끝나면 `.wrangler/`를 지운다.

### 옛 주소 넘기기 (yeogwi·gwichana-jeju → yeochana, ADR-0082 6)

옛 프로젝트 `yeogwi`와 `gwichana-jeju` 둘 다에 앱 대신 넘기기 사이트(`apps/web/scripts/redirect-site/`)를 올린다. `/sw.js`만 그 자리에서 200으로 내주고(스스로 해제하는 서비스워커), 나머지 모든 경로는 새 주소의 같은 경로로 바로 301된다. 두 번 거쳐 넘기지 않는다. 프로젝트는 지우지 않는다. 저장소 안에서 바로 올리면 `apps/web/wrangler.toml`이 끼어드니 밖으로 복사하고, Windows(`core.autocrlf=true`) 작업 사본의 CRLF는 `tr -d '\r'`로 LF로 바꾼다. 자세한 확인은 그 폴더 README.

```sh
rm -rf /tmp/old-redirect && mkdir /tmp/old-redirect
for f in _redirects sw.js; do tr -d '\r' < apps/web/scripts/redirect-site/$f > /tmp/old-redirect/$f; done
cd /tmp/old-redirect
npx wrangler pages deploy . --project-name yeogwi --branch master
npx wrangler pages deploy . --project-name gwichana-jeju --branch master
for p in yeogwi gwichana-jeju; do curl -sI https://$p.pages.dev/jeju/aewol/ | grep -iE '^(HTTP|location)'; done   # 301, location: https://yeochana.com/jeju/aewol/
```

### Git 연결로 바꿀 때

GitHub `rlaalstjr201-create/jeju` 기준. 의존성은 저장소 루트의 npm workspaces(`package-lock.json`)에 있다.

> **주의**: Git 연결 빌드는 `functions/`를 Root directory(아래 표에서는 저장소 루트) 기준으로 찾는다. 지금 위치(`apps/web/functions/`)로는 함수가 배포되지 않아 비 소식이 조용히 사라진다. Root directory를 `apps/web`로 하거나 함수를 그 빌드의 루트로 옮긴다.

| 항목 | 값 |
|---|---|
| 프로젝트 이름 | 사용자가 정한다. `<프로젝트>.pages.dev`가 된다(로마자만, 지금은 `yeochana`) |
| Production branch | `master` |
| Framework preset | None |
| Root directory (고급) | `/` (저장소 루트. Pages가 루트 `package-lock.json`으로 `npm ci`) |
| Build command | `npm run build -w @jeju/web` — `vite build && tsx scripts/build-landing.mjs`라 정적 랜딩·`sitemap.xml`까지 만든다(깨끗한 `--depth 1` 클론에서 `npm ci` → 이 명령 성공 확인, 2026-10-01) |
| Build output directory | `apps/web/dist` |
| 환경 변수 `NODE_VERSION` | `22` |
| 환경 변수 `SITE_URL` | 사이트 주소, 끝 `/` 없이. 예: `https://<프로젝트>.pages.dev` 또는 커스텀 도메인. 링크 미리보기(`og:image`·`og:url`), 모든 페이지의 `canonical`(홈·`/privacy`·`/jeju/**`), JSON-LD `url`, `sitemap.xml`, `robots.txt`의 `Sitemap:` 줄을 절대 주소로 만든다. 없으면 상대 경로(카카오톡 미리보기에 사진이 빠지고, 검색엔진은 canonical·sitemap을 못 믿는다). **커스텀 도메인을 붙이면 그 주소로 바꾸고 다시 배포**한다(`*.pages.dev`도 계속 열리지만 canonical이 도메인을 가리킨다) |
| 환경 변수 `LANDING_PHOTOS` | 보통은 **넣지 않는다**(정적 랜딩에 비짓제주 사진 핫링크). `0`이면 랜딩(`/jeju/**`)의 사진·`og:image`·JSON-LD `image`를 모두 빼고 출처를 `정보:`로 바꾼다 — 제주관광공사 회신이 거절이거나 상업화를 정했을 때(ADR-0072 3) |
| 환경 변수 `VITE_GA4_ID` | `G-P8DN26LKBC` (GA4 속성 「여차나:제주」, ADR-0078·ADR-0082 7). `SITE_URL`이 있으면 필수 |
| 환경 변수 `VITE_NAVER_WA` | 네이버 애널리틱스 사이트 ID. 기본값 `1caff08e05278f0`(`SITE_IDS`), 다른 사이트에 쓸 때만 넣는다 |
| 환경 변수 `VITE_EVENTS_URL` | `/api/events`(같은 출처 수집기). `SITE_URL`이 있으면 이 값이 기본이라 생략해도 된다. 비워 두면 빌드가 실패한다 |

Production·Preview 두 환경에 같은 값을 넣는다(Preview의 `SITE_URL`은 비워도 된다 — Pages가 미리보기 주소에 `X-Robots-Tag: noindex`를 붙인다).

빌드 결과에 함께 나가는 것(`apps/web/public/`):

- `_headers`: 캐시 규칙. 해시 파일(`/assets/*`)과 `/spots.json`(늘 `?v=해시`로 요청) 1년 immutable, `/`·`/index.html`·`/sw.js`·`/manifest.webmanifest`·`/404.html`·`/privacy` no-cache, 아이콘·`og.png`·`favicon.ico`·`robots.txt` 하루. `/*` 규칙에는 `X-Frame-Options: DENY`(다른 사이트의 틀 안에 넣지 못하게)와 `Permissions-Policy: camera=(), microphone=(), payment=()`만 둔다 — Cache-Control은 넣지 않는다(같은 헤더가 둘이면 Pages가 값을 이어 붙인다, 2026-10-15 출시 전 점검 F14). 규칙이 없는 파일(`/jeju/**` HTML·`/jeju/landing.css`·`sitemap.xml`·`llms.txt`)은 Pages 기본값 `public, max-age=0, must-revalidate`(매번 ETag로 확인)라 새 배포가 바로 보인다 — 이름에 해시가 없으니 그게 맞다.
- `404.html`: 있으면 Pages가 SPA 폴백을 끄고 모르는 경로에 이 페이지를 404로 준다. `/jeju/` 아래 없는 주소도 같은 404(`dist/jeju/`에 404.html 없음, 허브 링크 있음). 서비스워커는 `/jeju/**`를 캐시하지도 셸로 답하지도 않는다. `public/`에 `_redirects`는 두지 않는다(빌드가 지역을 옮긴 장소 페이지의 301만 `dist/_redirects`에 쓴다, ADR-0072).

빌드가 만드는 것(`scripts/build-landing.mjs`, `vite build` 뒤): 정적 랜딩 `dist/jeju/**`(허브·지역 15·조합·장소 페이지, `landing.css`), 사이트맵 색인 `sitemap.xml`과 하위 `sitemap-core.xml`·`sitemap-<지역>.xml`, `SITE_URL`이 있으면 `robots.txt`의 `Sitemap:` 줄. 품질 기준(원문 0건·쌍 유사도·자기 본문 비율, `specs/seo-landing.md`)을 어기거나 주소 없는 장소가 있으면 빌드가 실패한다 — 새 장소는 `npm run landing:slugs -w @jeju/web` 뒤 `apps/web/data/landing/slugs.json`을 커밋한다.
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
- [ ] `privacy.html`의 문의처가 맞는지(운영자 메일 `studiofilm.app@gmail.com`(2026-10-15 주인 결정) + 답장 없는 의견은 앱의 ‘의견 보내기’. 저장소가 비공개라 GitHub 이슈 링크는 쓰지 않는다).
- [x] 제주관광공사 사진 이용 가능 확인(2026-10-01, 회신 사용자 보관).
- [ ] 빌드 환경 변수: `SITE_URL`, `VITE_GA4_ID=G-P8DN26LKBC`, `VITE_NAVER_WA`(네이버 ID), `VITE_EVENTS_URL=/api/events`(생략 시 기본). `LANDING_PHOTOS`는 넣지 않는다(사진 켬, 공사 확인 완료).
- [ ] D1 마이그레이션 적용: `npx wrangler d1 migrations apply yeogwi-events --remote`(이미 적용됐으면 `No migrations to apply`).

## 3. 배포 뒤 스모크 (`SITE`=사이트 주소)

명령어 점검은 한 번에: `SITE=https://yeochana.com bash apps/web/scripts/smoke.sh` (아래 명령 목록을 자동화한 것). 분석 셋도 본다: 홈 HTML에 GA4 ID와 `naver-wa=`, `/api/events/health` 200 JSON, 작은 배열 `POST /api/events` 204(확인용 기분 탭 1건이 기록에 더해진다).

명령으로:

- [ ] `curl -sI $SITE/` → `200`, `cache-control: no-cache`. `/sw.js`, `/manifest.webmanifest`도 `no-cache`.
- [ ] `curl -s $SITE/ | grep -o 'assets/index-[^"]*\.js'`로 찾은 파일 → `cache-control: public, max-age=31536000, immutable`.
- [ ] `curl -sI "$SITE/spots.json?v=x"` → 1년 immutable, `curl -sI -H 'accept-encoding: br' …`에 `content-encoding: br`.
- [ ] `curl -sI $SITE/nope/deep` → `404`, 본문에 `없는 주소예요.`. `curl -sI $SITE/privacy` → `200`.
- [ ] `curl -s $SITE/ | grep og:image` → `$SITE/og.png` 절대 주소. `curl -sI $SITE/og.png` → `200 image/png`.
- [ ] `curl -s $SITE/robots.txt` → `User-agent: *` / `Allow: /` / `Sitemap: $SITE/sitemap.xml`.
- [ ] `curl -s $SITE/ | grep canonical` → `$SITE/`. `/privacy`도 `$SITE/privacy`.
- [ ] `curl -sI $SITE/jeju/` → `200`, `curl -sI $SITE/jeju/aewol/`·장소 한 쪽 → `200`. `curl -sI $SITE/jeju/nope/` → `404`. `curl -s $SITE/sitemap.xml` → `<sitemapindex>`에 하위 사이트맵 16개(`sitemap-core.xml` + 동네 15). `curl -s $SITE/sitemap-core.xml | grep -c '<loc>'` → 빌드 로그의 `core N`(지금 19), 하위 파일 `<loc>` 합 → 빌드 로그의 `sitemap N URLs`와 같다.

브라우저로(데스크톱 Chrome):

- [ ] 첫 화면 → 기분 → 카드 3장, 콘솔 오류 0. DevTools Application: 서비스워커 활성, 매니페스트에 maskable 아이콘 경고 없음.
- [ ] 저장한 곳 아래에 `정보·사진: 비짓제주(제주관광공사)`, `개인정보 처리 안내`, `링크로 백업`. 결과 화면 맨 아래에도 출처 한 줄. `어디가 좋았는지 익명으로 세어요.`와 `기록 끄기`가 **보여야** 한다.
- [ ] `링크로 백업` → 다른 브라우저(또는 시크릿 창)에 붙여 넣기 → `합치기` → ♥ N이 같다. 주소창에서 `#s=…`가 사라진다.
- [ ] Network 탭: 이 주소·`api.cdn.visitjeju.net`(사진) 말고는 `load` 뒤 `googletagmanager.com/gtag/js`·`google-analytics.com/g/collect`·`wcs.pstatic.net`뿐. 기분을 누르고 탭을 숨기면 `POST /api/events` 204. GA4 실시간 보고서와 네이버 애널리틱스 실시간에 방문 1이 보인다.
- [ ] `기록 끄기` → 새로고침: GA4·네이버 요청 0, `/api/events` 0.
- [ ] 새 배포 한 번 더(문구 하나 바꿔서) → 열어 둔 탭이 첫 화면에서 새 코드로 바뀐다(S65).

실기기(ADR-0063 Consequences):

- [ ] 아이폰 Safari: 위치 허용 → 카드, 하트, 저장한 곳에서 홈 화면 안내 한 번(`공유 버튼에서 ‘홈 화면에 추가’…`), 홈 화면에 추가 → 홈 앱에서 `링크로 백업` 링크를 열어 합치기.
- [ ] 카카오톡으로 주소 보내고 열기: 링크 미리보기에 제목·설명·사진(카카오 공유 디버거 developers.kakao.com/tool/debugger/sharing에서 캐시 초기화). 인앱 첫 화면에 `카카오톡 안에서 저장한 곳은 카카오톡에만 남아요.` → `브라우저로 열기`가 Safari/Chrome으로 연다(저장한 곳이 있으면 합치기 안내까지).
- [ ] 인스타그램 DM 링크: 안내 → `브라우저로 열기`가 링크를 복사하고 붙여 넣는 곳을 알려 준다.
- [ ] 갤럭시 삼성 인터넷·Chrome: 저장 뒤 저장한 곳에서 `홈 화면에 추가` 버튼 → 설치 창, 설치한 앱 아이콘이 잘리지 않음(maskable).
- [ ] 다크 모드에서 404·개인정보 페이지도 어두운 바탕.
- [ ] 길찾기(자동차·도보·배 타는 곳) × 지도 앱 3개 점검: `docs/device-check.md`(ADR-0069·0071). 그 전에 `npm run check:links`(네이버·카카오 링크가 그대로인지).

검색(배포 당일~1주): 네이버 서치어드바이저·GSC 등록과 사이트맵 제출(위 「검색엔진 소유 확인」). 주간 점검은 `docs/seo/README.md`.

대시보드 설정(2026-10-16, 출시 전 점검 뒤 주인 승인으로 바꿈 — 다시 켜지 않는다):
- Cloudflare Web Analytics(RUM) `yeochana.com`은 **Disable**. 켜져 있으면 Cloudflare가 모든 HTML에 `static.cloudflareinsights.com` 비컨을 끼워 넣어, 개인정보 안내의 「세 곳」과 어긋나고 「기록 끄기」로도 멈추지 않는다. 확인: `curl -s https://yeochana.com/ | grep -c cloudflareinsights` → 0.
- GA4 향상된 측정의 **이탈 클릭은 끔**. 켜져 있으면 길찾기 링크 주소(가려는 곳 좌표·이름)가 GA4로 간다(안내 「좌표는 이 세 곳 어디로도 보내지 않아요」).

분석(ADR-0078): 매일 `npm run analytics:health -w @jeju/web`(로컬 예약 작업)이 자체 기록 지난 24시간 0건이거나 수집기에 닿지 않으면 한 줄 이유와 함께 실패한다. 주간 점검에서 `npm run analytics:report -w @jeju/web`(`wrangler login` 필요, D1 읽기만)로 `docs/analytics/YYYY-MM-DD.md`를 만들고, GA4·네이버 대시보드의 지난 7일 사용자 수를 같이 적는다.

남은 일(배포 직후~1주): 오류 집계(새 결정 필요), Lighthouse, 한국 통신사별 응답 지연 실측(무료 플랜 우회 사례).

- 2026-10-20: GA4 속성 「여차나:제주」(p557193654)에 이벤트 범위 맞춤 측정기준 3개 등록 — 여행지(dest), 시작 방법(how), 시작 사유(why). ADR-0094, specs/usage-events.md. 기존 「철 종류」(season)와 합쳐 4개.
