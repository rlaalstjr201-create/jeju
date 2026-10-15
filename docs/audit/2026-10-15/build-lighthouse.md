# 출시 전 점검 — 라이트하우스·빌드·배포 (2026-10-15)

기준: `criteria.md` 1절(라이트하우스)·4절(빌드·배포). 측정·빌드는 한 번씩만 했다. 대상 커밋은 HEAD `48d5218`, 운영은 https://yeochana.com.

## 결론

- **라이트하우스: 확인 실패.** 9번(3쪽 × 3번) 중 홈 1번만 재고 도구가 멈췄다. 리포트는 저장됐는데, 그 뒤 Chrome 임시 폴더를 지우다가 Windows 권한 오류(EPERM)가 나서 `lh.mjs`가 통째로 끝났다. 장소 쪽 관찰은 내 실수로 측정되지 않았다. Git Bash가 경로 인자를 `C:/Program Files/Git/jeju/...`로 바꿔 버려 엉뚱한 주소를 쟀다. 규칙(실패해도 다시 돌리지 않음)에 따라 재측정은 하지 않았다. 요약 JSON 두 개(`docs/perf/lighthouse-2026-10-15*.json`)도 만들어지지 않았다. 다시 재려면 주인 승인이 필요하다(5절).
- 홈 1회분은 성능 97, 접근성 100, 권장 77(알려진 예외), SEO 100, LCP 1.93초, CLS 0.030, TBT 145ms다. 모두 기준 안이지만 중앙값이 아니어서 판정에는 쓰지 않는다.
- **빌드: 통과.** gzip JS+CSS는 **43.9KB**(기준 50KB 이하)다. 분석 ID 셋, `_headers`, 서비스워커, `spots.json?v=해시`, 새 로고 아이콘, sitemap 2,940개, 404, 랜딩 2,938쪽이 모두 맞다. `LANDING_PHOTOS=0` 빌드도 통과했다.
- **운영 = 마지막 배포 빌드: 맞다.** 배포 당시 HEAD였던 `83d13ce`(배포 기록 커밋 `1b503ec`)를 따로 빌드했다. 해시 이름(`index-Pqr93rcy.js`·`index-B61aGB53.css`)이 운영과 같고, JS·index.html·sw.js·privacy는 바이트까지 같다. HEAD와 다른 점은 아직 배포하지 않은 `8ebc596`(숙소 링크) 하나뿐이다.
- **실제 사용자에게 걸리는 것 2개** (둘 다 저장소에는 없고 Cloudflare 쪽에서 생긴다):
  1. Cloudflare가 모든 HTML에 **Cloudflare Web Analytics 비컨**을 끼워 넣는다. 저장소, ADR, 개인정보 안내 어디에도 없고 「기록 끄기」로도 꺼지지 않는다.
  2. Cloudflare 캐시가 **배포 전 옛 `og.png`**(링크 미리보기 그림)를 아직 낸다. 요청 12번 중 9번이 옛 그림이었고, 10-16 01:44(KST)쯤까지 간다.
- 정적 점검: tsc 오류 0, vitest 46파일 1,045개 통과, check:slop 0, seo:crawl 감사 0건.

## 1. 라이트하우스

### 무슨 일이 있었나

| 실행 | 시각(KST) | 결과 |
|---|---|---|
| `node docs/perf/lh.mjs docs/perf/lighthouse-2026-10-15.json https://yeochana.com` | 17:59:16~18:00:16 | 홈 1번째 리포트 저장 뒤 종료(exit 1). `chrome-launcher`의 임시 프로필 삭제(`rmSync`, 재시도 10번)가 `EPERM` → lighthouse CLI 종료 코드 1 → `execSync` 예외 → 나머지 8번 안 돎 |
| `… lighthouse-2026-10-15-place.json https://yeochana.com /jeju/aewol/dochidolhanusutbul/` | 18:01:44~18:01:57 | **내 실수.** Git Bash가 `/jeju/...`를 Windows 경로로 바꿔 `https://yeochana.comC:/Program Files/Git/jeju/...`를 잼(`CHROME_INTERSTITIAL_ERROR`). 같은 EPERM으로 종료 |

- 장소 쪽은 sitemap 순서에서 `/jeju/aewol/` 아래 첫 장소를 골랐다(골라 쓰기 방지).
- 원본: `%TEMP%\lh-raw-IR5H3i\__1.json`(홈 1번째, 유효), `%TEMP%\lh-raw-j875mS\…__1.json`(잘못된 주소, 무효).
- 가설: Chrome 하위 프로세스가 끝나기 전에 프로필 폴더를 지우려다 잠금에 걸렸다. 백신 검사나 그때 같이 돌던 다른 프로세스도 원인일 수 있다(시작 직전 CPU 50~60%, 파일 탐색 `find`가 코어 하나를 씀). 같은 폴더는 나중에 바로 지워졌다. 그러니 영구적인 권한 문제가 아니라 일시적인 잠금이다.
- 도구 버전: `npx lighthouse`가 이번에 **13.5.0**을 새로 받았다(npx 캐시의 13.4.1을 교체). Chrome은 HeadlessChrome 155다. 10-05 측정은 그 전 버전이었을 가능성이 높다.

### 홈 1회분 vs 10-05 중앙값 (참고용, 판정 아님)

| | 성능 | 접근성 | 권장 | SEO | LCP | CLS | TBT | FCP |
|---|---|---|---|---|---|---|---|---|
| 기준 | ≥90 | ≥95 | ≥95 | 100 | ≤2.5s | ≤0.1 | ≤200ms | — |
| 10-05 중앙값(`lighthouse-after.json`) | 98 | 100 | 77 | 100 | 1,175 | 0.058 | 157 | 1,148 |
| 10-15 홈 1번째 | 97 | 100 | 77 | 100 | 1,933 | 0.030 | 145 | 1,925 |

- `/jeju/`, `/jeju/aewol/`, 장소 쪽은 재지 못했다.
- 권장 77은 알려진 예외다(ADR-0078). 원인은 10-05와 같다: 네이버 애널리틱스 제3자 쿠키 2개(`NWB`@wcs.naver.com, `NAC`@nam.veta.naver.com)와 이 쿠키들의 inspector-issues.

### 걸린 항목(홈 1번째), 원인, 고칠 길

| 항목 | 값 | 원인 | 고칠 길 |
|---|---|---|---|
| first-contentful-paint (가중 10) | 0.86, 1.9초 | HTML → CSS 한 번 더 왕복한 뒤 첫 그림. 1번이라 흔들림인지 회귀인지 모른다(10-05는 1.15초, 그때 주소는 pages.dev) | 재측정 중앙값이 나빠졌으면 첫 화면 CSS 인라인(아래 줄) |
| render-blocking-insight | 230ms 절감 추정 | `/assets/index-B61aGB53.css`(6KB 전송, 21.8KB 원본)가 첫 그림을 막는다 | CSS를 `index.html`에 인라인. 대가: HTML이 no-cache라 방문마다 CSS 약 5KB(br)를 다시 받는다 |
| third-party-cookies / inspector-issues | 0 / 0 | 네이버 애널리틱스(wcslog.js → NAC 모듈) | ADR-0078을 지키면 못 고침(알려진 예외) |
| unused-javascript | 70KiB | GA4 `gtag.js`(174KB 중 41% 안 씀) | 우리 쪽에서 줄일 수 없음. 이미 `load` 뒤에 불러온다 |
| legacy-javascript-insight | 23KiB | 네이버 `synchronizer.js`, **Cloudflare 비컨** | 우리 번들은 해당 없음(es2020). Cloudflare 비컨을 끄면 10KB 준다 |
| cache-insight | 21KiB | 제3자 스크립트 TTL(네이버 1시간·1일, Cloudflare 비컨 1일) | 제어 불가. 비컨을 끄면 하나 준다 |
| image-delivery-insight | 599KiB | 비짓제주 사진이 표시 크기보다 크다. 기분 버튼 사진은 높이 84px인데 원본은 288~480px, 동네 타일은 높이 212px인데 원본은 317~360px | 핫링크라 크기를 줄여 받을 방법이 없다(이미지 리사이즈는 유료). 점수 가중 0이라 그대로 둔다 |

- 참고(렉 점검용): 이 실행의 긴 작업 중 우리 코드는 214ms(0.95초 시점)·51ms 두 개였다(라이트하우스 시뮬레이션, CPU 4배). 나머지는 gtag 173·102ms와 출처 불명 104·59·53ms였다.

## 2. 빌드 (`$env:SITE_URL='https://yeochana.com'; npm run build`, 1회씩)

| 점검 | 결과 |
|---|---|
| 기본 빌드 | 통과(15.1초). JS 100.6kB(gz 38.66), CSS 21.8kB(gz 5.28), index.html 16.2kB(gz 6.04) |
| gzip JS+CSS | **43,929B = 43.9kB(42.9KiB) ≤ 50KB** 통과. br로는 38,865B |
| `LANDING_PHOTOS=0` 빌드 | 통과(13.7초). 2,938쪽, 14.2MB. `/jeju/**`에 `<img>`·비짓제주 주소·JSON-LD `image` 0. `og:image`는 사이트 기본 `/og.png`(deploy.md의 「og:image 뺌」과 표현만 다름) |
| 분석 ID 셋 | `index.html`에 `<meta name="analytics" content="ga4=G-P8DN26LKBC naver-wa=1caff08e05278f0">`. JS에 두 ID와 `/api/events`·`/api/rain`·gtag·wcs 주소가 있다 |
| `_headers` | `dist/_headers` = `public/_headers`(바이트 같음). 해시 파일·`spots.json` 1년 immutable, 셸·sw·매니페스트·404·privacy no-cache, 아이콘·og·favicon·robots 하루 |
| 서비스워커 | 캐시 이름 `tomorrow-<VERSION>`. VERSION은 빌드 파일 이름·index.html·미리 담는 공개 파일·템플릿의 해시다(이번 `08459519a46b`, 운영 `bf91882db6bf`). 새 배포면 새 캐시를 만들고, activate가 다른 `tomorrow-*` 캐시를 지우고, `skipWaiting`+`clients.claim` 뒤 첫 화면이 한가하거나 숨을 때 새로고침한다(`update.ts`). 페이지 요청은 네트워크 우선(3초 넘으면 캐시 셸), `/jeju/**`·`/api/**`는 건드리지 않는다. 미리 담는 것 7개: `./`·CSS·JS·`spots.json?v=a1a9aaf6b5`·매니페스트·아이콘 192·512 |
| `spots.json?v=해시` | `a1a9aaf6b5` = sha256 앞 10자. index.html preload, `main.ts` fetch, sw 미리 담기 셋이 같은 값. 운영도 같은 값(배포 뒤 데이터 변화 없음) |
| 아이콘(ADR-0088 새 로고) | 180·192·512·maskable 512 크기와 매니페스트 선언이 일치한다. `og.png` 1200×630, `favicon.ico` 32×32(PNG). 모두 로고 커밋 `cc3173e`와 바이트가 같고, 눈으로도 「꺾이는 길」(바다색 바탕·흰 획·귤 점)을 확인했다 |
| sitemap | 2,940 URL(랜딩 2,938 + `/` + `/privacy`). 운영 sitemap과 바이트 같음. robots에 `Sitemap:` 줄 있음 |
| 404 | `404.html`(「없는 주소예요.」), `_redirects` 없음(지역 이동 0) |
| 랜딩 | 2,938쪽(허브 1·지역 15·조합 1·장소 2,921), 15.7MB, 사진 핫링크. 원문 겹침 0, 가장 닮은 쌍 0.773(<0.8), 최소 자기 본문 48.6%(≥30%) |
| 배포 한도 | 파일 2,958개(한도 20,000), 가장 큰 파일 `spots.json` 1.18MB(한도 25MiB) |

- 작은 것: `__APP_V__`(git 짧은 해시)가 JS에 들어간다. 그래서 코드가 그대로여도 새 커밋에서 배포하면 JS 이름이 바뀌고, 다시 오는 사용자는 JS 약 39KB(br)를 또 받는다. 의견 보내기 버전 때문에 일부러 넣은 것이라 그대로 둬도 된다.
- 작은 것: 빌드 결과가 작업 사본의 줄바꿈에 따라 달라진다. 깨끗한 Windows 클론(`core.autocrlf=true`)에서는 `index.html`이 CRLF가 되어 sw VERSION이 달라진다. 지금 작업 사본은 LF라 운영과 같다. 사용자 영향은 없다. 재현성이 필요하면 `.gitattributes`에 `apps/web/index.html text eol=lf`.

## 3. 운영 vs 저장소

### 어느 커밋인가

- 운영 JS `index-Pqr93rcy.js` 안의 `appVersion:"83d13ce"`. 배포 당시 HEAD가 `83d13ce`였고, 빌드가 바꾼 `lastmod.json`을 `1b503ec`로 커밋했다.
- 따로 만든 클론(`83d13ce`, 저장소·`apps/web/dist`는 건드리지 않음)에서 같은 명령으로 빌드했다. `index-Pqr93rcy.js`·`index-B61aGB53.css`가 나왔다. JS와 privacy는 바이트가 같다. index.html은 클론의 CRLF를 LF로 바꾸면 같다. sw.js는 VERSION 줄만 다른데, 운영 index.html로 VERSION을 다시 계산하면 `bf91882db6bf`로 운영과 같다. **운영은 마지막 배포 빌드 그대로다.**
- 배포 뒤 커밋: `0fb7002`(docs/partner, 앱 밖), `3022aac`(ADR), **`8ebc596`(숙소 링크: `src/` 6파일, `privacy.html` 한 줄, `events/` 수집기 검증)**, `052d9fa`·`48d5218`(문서). 그래서 HEAD 빌드와 운영의 차이는 예상대로 JS(`index-DiZU714O.js`)·sw.js·privacy 한 줄뿐이다.
- HEAD 빌드와 운영이 바이트까지 같은 것: CSS, 매니페스트, robots, llms.txt, favicon, 아이콘 180·512·maskable, sitemap.xml, `landing.css`, 랜딩 표본 46쪽(허브 1·지역 15·그 아래 쪽 100쪽마다 하나 30).
- 숙소 시범 기록표(`docs/partner/partners.md`)는 비어 있다. 카드를 내보내기 전에 `8ebc596` 배포가 먼저다. 지금 운영은 `?stay=`·`?src=`를 무시하고 보통 첫 화면을 연다.

### 저장소에 없는 차이 2개

1. **Cloudflare Web Analytics 비컨.** 브라우저 요청에만 `</body>` 앞에 `static.cloudflareinsights.com/beacon.min.js`(token `a684fcf5…`)가 붙는다. `/`, `/privacy`, `/jeju/**`, 404 모두 그렇다. curl 기본 요청에는 안 붙어서 smoke.sh로는 보이지 않는다.
   - 저장소, ADR, 개인정보 안내에 없다(안내는 「익명 기록·GA4·네이버」 셋만 적는다).
   - 「기록 끄기」를 해도 불린다.
   - 비컨 코드는 주소의 경로+쿼리를 보낸다. `8ebc596`을 배포하면 `?stay=좌표&src=꼬리표`도 Cloudflare로 간다. `#s=` 백업 해시까지 보내는지는 확인하지 못했다(의심).
   - 라이트하우스의 legacy-JS·cache 항목에도 걸린다.
   - **주인 결정**: Cloudflare 대시보드에서 Web Analytics를 끄거나(Pages 프로젝트 Metrics 또는 Web Analytics 사이트 설정), 개인정보 안내와 ADR에 넣는다.
2. **CDN 캐시에 남은 옛 그림.** 배포는 Cloudflare 존 캐시를 비우지 않았다. HKG 거점 기준이다.
   - `og.png`: 18:21에 다시 확인하니 12번 중 9번이 **옛 그림 7,386B**였다(새 그림은 4,890B). 헤더 조합과 상관없이 섞여 나왔다. `Age` 약 59,800초로 계산하면 10-15 01:44(KST)에 캐시됐고, 하루 TTL이라 10-16 01:44쯤까지 간다. 카카오톡 미리보기에 옛 로고가 보일 수 있다.
   - `icons/icon-192.png`: 처음 확인 때는 curl 기본 요청에 옛 아이콘 1,548B가 나왔다. 18:21 재확인 12번은 모두 새 아이콘 1,145B였다.
   - 저절로 풀린다. 앞으로 아이콘·og·favicon을 바꾸는 배포 뒤에는 Cloudflare 「Custom Purge → URL」로 그 주소를 비우는 단계를 `docs/deploy.md` 3절에 넣는 게 좋다(또는 이름에 해시를 넣는다).

### 응답 헤더 (운영, `Accept-Encoding: br, gzip`)

| 경로 | 상태 | Cache-Control | Content-Type | 압축 |
|---|---|---|---|---|
| `/` | 200 | no-cache | text/html; charset=utf-8 | br |
| `/assets/index-Pqr93rcy.js` | 200 | public, max-age=31536000, immutable | application/javascript | br(39,400B) |
| `/assets/index-B61aGB53.css` | 200 | public, max-age=31536000, immutable | text/css | br |
| `/spots.json?v=x` | 200 | public, max-age=31536000, immutable | application/json | br(317KB) |
| `/sw.js` | 200 | no-cache | application/javascript | br |
| `/manifest.webmanifest` | 200 | no-cache | application/manifest+json | br |
| `/privacy` | 200 | no-cache | text/html | br (`/privacy.html`은 308 → `/privacy`) |
| `/jeju/`·`/jeju/aewol/`·장소 쪽 | 200 | public, max-age=0, must-revalidate | text/html | br |
| `/nope/deep`·`/jeju/nope/` | 404 | no-store | text/html | br, 본문 「없는 주소예요.」 |
| `/robots.txt` | 200 | public, max-age=86400 | text/plain | br |
| `/api/events/health` | 200 | no-store | application/json | `{"last24h":17}` |

### 넘기기(리다이렉트)

- `http://yeochana.com/…`는 301로 https로 간다(경로·쿼리 유지).
- `https://www.yeochana.com/…`는 301로 `https://yeochana.com/…`로 간다.
- `http://www.yeochana.com/…`는 두 번 넘긴다(https://www → apex). 작다.
- `https://yeochana.pages.dev/…`는 301로 `https://yeochana.com/…`로 간다(경로·쿼리 유지). `/sw.js`만 200으로 스스로 해제하는 워커를 낸다(의도대로, `_middleware.ts`).
- 옛 `yeogwi.pages.dev`·`gwichana-jeju.pages.dev`는 301로 `yeochana.com`의 같은 경로로 간다.

## 4. 정적 점검 (`apps/web`, 1회씩)

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0 |
| `npx vitest run` | 46파일, 1,045 통과, 실패 0, 건너뜀 0 (33.8초) |
| `npm run check:slop` | 0 violations |
| `SITE_URL=https://yeochana.com npm run seo:crawl` | HTML 2,941(색인 대상 2,940·noindex 1). 감사 0건. 고아·도달 불가·3홉 초과·깨진 내부 링크·일반 앵커·크롤 불가 모두 0. sitemap 2,940(빠짐 0·남음 0). 배포 diff의 기준 스냅샷이 10-01 것이라 「+2,938쪽」은 의미 없음 |

## 5. 다시 재려면 (주인 승인 필요)

`lh.mjs`는 추적 파일이라 고치지 않았다. 제안은 다음과 같다.

1. Lighthouse는 Chrome을 끄기 **전에** 리포트를 저장한다(`cli/run.js`: `saveResults` → `launchedChrome.kill()`). 그러니 종료 코드 대신 리포트 파일로 판단하면 된다. 잘못된 주소처럼 측정 자체가 실패한 경우는 지금 있는 `lhr.runtimeError` 검사가 계속 잡는다.

   ```js
   function runOnce(url, file) {
     try {
       execSync(`npx lighthouse "${url}" --output=json --output-path="${file}" --quiet --chrome-flags="--headless=new"`, { stdio: 'inherit' });
     } catch (e) {
       if (!existsSync(file)) throw e; // Windows: 리포트를 쓴 뒤 임시 프로필 삭제가 EPERM으로 실패해도 리포트는 유효
     }
     return JSON.parse(readFileSync(file, 'utf8'));
   }
   ```

2. 요약 JSON에 `lhr.lighthouseVersion`을 남긴다(이번 13.5.0, 10-05는 기록 없음).
3. **PowerShell**에서 돌린다(Git Bash는 `/jeju/...` 인자를 경로로 바꾼다. Git Bash라면 `MSYS_NO_PATHCONV=1`):

   ```powershell
   cd C:\Users\rlaal\projects\jeju
   node docs/perf/lh.mjs docs/perf/lighthouse-2026-10-15.json https://yeochana.com
   node docs/perf/lh.mjs docs/perf/lighthouse-2026-10-15-place.json https://yeochana.com /jeju/aewol/dochidolhanusutbul/
   ```

## 실행 기록·되돌린 것

- 빌드 부수효과 `apps/web/data/landing/lastmod.json`(`/privacy` 해시 한 줄)은 `git checkout`으로 되돌렸다. 작업 트리는 깨끗하다. design/qa PNG는 건드리지 않았다.
- `apps/web/dist`는 HEAD `48d5218`의 기본 운영 빌드(`SITE_URL=https://yeochana.com`, 사진 켬) 상태로 남겼다. 순서는 `LANDING_PHOTOS=0` 빌드 다음 기본 빌드.
- `83d13ce` 대조 빌드는 세션 임시 폴더의 별도 클론에서 했다. node_modules 연결(junction)은 링크만 지웠고 원본은 그대로다.
- 내가 띄운 Chrome의 남은 임시 프로필 2개는 지웠다. npx 캐시의 lighthouse는 13.5.0으로 바뀌었다.
- 운영 사이트에는 읽기 요청만 했다. 라이트하우스 홈 1번이 운영 분석(GA4·네이버·Cloudflare)에 방문 1건으로 잡혔을 수 있다.
