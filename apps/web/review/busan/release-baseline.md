# 부산 출시 기준선 (plans/busan.md S0)

제주 방문이 받는 것을 부산 작업 전에 잰 값이다. 기계가 견주는 값은 `release-baseline.json`, 브라우저에서 본 DOM·계산 스타일·저장소 전문은 `release-baseline.detail.json`(차이를 볼 때 쓴다). 다시 재는 법:

```
cd apps/web
$env:SITE_URL='https://yeochana.com'; npm run build
npm run check:jeju            # 견주기. 다르면 무엇이 다른지 적고 exit 1
npm run check:jeju -- --write # 새 기준선(허용된 변경을 받아들일 때만)
git checkout -- data/landing/lastmod.json   # 빌드가 날짜만 바꾼 경우
```

## 잰 것 (커밋 9fa8cd3, 2026-10-18)

- 데이터: `public/spots.json`·`public/i18n/places.*.json` sha256, `__SPOTS_V__` = `c88acb8476`.
- 배포 파일: `dist/` 중 `assets/`를 뺀 전부(56항목, `dist/jeju/<폴더>`는 묶음 해시). 자산 해시 이름, `sw.js` VERSION, `sitemap-core.xml`의 `/`·`/privacy` lastmod만 지우고 견준다.
- `index.html`(자산 이름 지운 것): 바이트·gzip, 서비스 워커 미리 받기 목록.
- 한국어 진입 JS+CSS gzip **48,416 B**(예산 50,000 B, Vite가 보이는 kB와 같은 셈). 커밋마다 JS에 빌드 커밋이 들어가므로 같을 필요는 없고 예산과 차이만 본다.
- 서버 함수(Vite 정의 없이 tsx): `/api/rain` 제주 15 slug 격자·상태, 부산 slug·빈 값·모르는 값 400, 키 없음 204. `/api/events` 묶음 6개(받음 3, `dest` 필드·`광안리`·`start_view` 거절).
- 브라우저(Chrome 375×812, 2026-10-18 14:00 KST 고정, 위치 동문시장·`prompt`): 빈 저장소 기기와 `jeju.saved.v2`만 있는 기기. 첫 그리기 전 `<html>`, 홈 DOM·스타일 지문(245요소), 저장소(빈 기기는 비어 있음), 요청(`spots.json?v=c88acb8476`, 부산 파일 0), 위치 읽기 0회. `좀 걷고 싶어` 뒤 카드 방선문·어승생·사려니숲길, 위치 읽기 1회, `/api/rain?area=gujeju`.

같은 커밋에서 두 번 견주어 둘 다 통과했다. 일부러 `dist/llms.txt`와 진입 CSS를 바꾸면 해당 항목이 걸리는 것도 확인했다.

## 서치콘솔 `/` 노출

계획 2판(M5)에서 4주 판정 기준 기간을 **S7 직전 4주**로 바꿨다. 그래서 여기서는 재지 않고 S7 직전에 `/`와 대조군 `/jeju/**`를 함께 잰다.

## 단위마다 (check:jeju 결과)

| 단위 | 제주 그대로 | 한국어 진입 JS+CSS gzip | 비고 |
|---|---|---|---|
| S1 | 통과(두 번) | 48,533 B (+117 B) | e2e 88/89 — U1-indoor-label(195폭 넘침 13px)은 S1 코드를 빼고 S0 커밋에서 돌려도 똑같이 실패한다(S1과 무관) |
| S4 | 통과 | 48,547 B (+7 B, 기준선 1df5fd6 대비) | 꺼진 빌드 `dist/`에 `spots-busan.json` 없음(`vite.config.ts` `busanFile`), 켠 빌드에는 있음·미리 받기 목록에 없음. 브라우저 요청에 부산 파일 0 |
| S5 | 통과 | 49,496 B (+956 B) | 꺼진 빌드: 인라인 블록·sw.js 부산 단계·_headers 줄 없음, 부산 코드는 스위치 뒤라 번들에서 빠짐. 켠 빌드: 진입 JS+CSS gzip 약 52.2 kB(예산 넘음 — S7 전에 줄일 것), index.html gzip +2,000 B(상한 2KB). e2e 꺼진 89/89, 켠 95/95 |
| S6 | 통과 | 49,512 B (+16 B, S5 대비) | 기준선 `functions.rain.haeundae`·`gwangalli`를 `400` → `204 result 03 NO_DATA nx=99 ny=75`로 고침(계획 S6: `kma.ts`가 부산 slug를 받음 — 의도한 차이, 제주 15 slug 격자·응답은 그대로). `spots.json` 해시 그대로(밤 산길·장날 부산 경로 인자). 켠 빌드 진입 JS+CSS gzip 46.73 + 5.62 = 52.35 kB(S5 약 52.2 kB, 여전히 예산 넘음 — S7). e2e 꺼진 89/89, 켠 95/95 |
| S7 | 통과(두 번, 켠 운영 빌드) | 49,312 B (+772 B, 켠 빌드; 꺼진 빌드 47,849 B) | 스위치 켬(`vite build` 기본, 되돌리기 `npm run build:jeju`). 부산 몫 청크·terser(ADR-0098). 켠 빌드 비교: 빈 기기는 제주를 고른 기기(`jeju.dest: jeju`)로 재고, 인라인 두 블록·`_headers` 부산 줄·부산 청크는 빼고 견준다. 남은 허용 차이(`allowed`): privacy 네 언어, `llms.txt`, 수집기 `dest`·광안리·`start_view`, `sw.js`, `spots-busan.json`, 저장소 `jeju.dest`(두 기기), 인라인 gzip +1,998 B(상한 2,000 B). 홈·결과 DOM·계산 스타일·요청·위치 읽기 횟수·카드는 기준선과 같다. M5 렌더 점검(Googlebot 412×915, 저장소 없음): h1·.lede·기분 목록 모두 있음 → 통과, 덮개 비율 100%(기록만, `design/qa/busan/render-googlebot-412.png`) |
| ADR-0094 Am. 3 (2026-10-24) | 통과(켠 운영 빌드, 허용 13개 추가) | 49,555 B (+1,015 B, 기준선 1df5fd6 대비) | 이름 줄 `여차나:제주 ▾` 버튼. 허용에 넣은 것: `indexHtml.bytes·gzip`, `files.index.html`, 두 기기의 `firstPaint.html`·`home/walk.body`·`home/walk.styles`. 증명: 새 측정에서 로고 마크업만 옛 `<span class="logo">`로 되돌리면 firstPaint·body가 기준선과 글자 하나 다르지 않고, styles 차이는 로고 하위 요소(버튼·`.lw`·꺾쇠)와 `#basis`의 auto 왼쪽 여백 값뿐(자리 237.5·176.5 그대로). 이 허용은 앞으로 그 해시의 변화도 넘기므로 다음 기준선 다시 쓰기(`--write`) 때 지운다 |
| ADR-0105 (2026-10-31) | 통과(운영 빌드, 허용 41개 추가) | 57,150 B (진입 예산 60,000) | 놀러·놀거리 이름과 기분 다시 나누기 v5. 의도한 제주 차이만 허용에 넣었다(정확한 키, 접두어 아님): `data.public/spots.json`·`data.__SPOTS_V__`·`files.spots.json`(제주 20곳: 기분 13, `walkin` 7), `precache`와 홈 요청의 `spots.json?v=` 두 키(옛 c88acb8476·새 420ec9586f), `files.jeju/` 허브와 동네 15 묶음(장소 쪽 2,937 → 2,944: 새로 보이는 7곳, 그리고 쪽마다 기분 이름 「놀러 가고 싶어」·「놀거리」), `files.sitemap*.xml` 17개(새 장소 주소와 날짜). 걷기 카드(방선문·어승생·사려니숲길)·저장소·위치 읽기·서버 함수는 기준선과 같다. 첫 그리기는 같지 않다: `index.html`·두 기기의 `firstPaint.html`·`home/walk.body`(기분 이름 「놀러 가고 싶어」)와 `llms.txt`도 바뀌었고, ADR-0094 Am. 3·부산 때 넣은 옛 허용(`files.index.html`·`indexHtml.*`·`firstPaint.html`·`home/walk.body`·`files.llms.txt`)이 그것을 넘겼다(정정 2026-10-31, 독립 리뷰 M4). 이 허용은 그 해시가 다시 바뀌어도 넘기므로 다음 `--write` 때 지운다 |
| 기준선 다시 쓰기 (2026-10-31, 6b397498) | `npm run check:jeju -- --write`(운영 빌드, yeochana.com에 올린 그 `dist/`) | 57,151 B (진입 예산 60,000, 켠 빌드 인라인 +1,914 B) | ADR-0105와 리뷰 정리를 배포한 뒤의 제주를 새 기준선으로. 허용 목록(옛 72개: 부산·ADR-0094 Am. 3·ADR-0105)은 비웠다 — 다음부터 제주 차이는 모두 걸린다. 다시 쓴 뒤 `check:jeju`가 허용 없이 통과 |

## 출시 뒤 측정 (예약, 미리 등록한 기준 그대로 한 번씩)

출시일을 2026-10-20 배포로 잡은 날짜다. 배포가 늦어지면 같은 간격으로 민다.

| 날짜 | 무엇 | 기준(바꾸지 않음) |
|---|---|---|
| 2026-11-17 | 시작 화면 4주 판정(`npm run analytics:report` 「시작 화면」 지난 28일, D1 수치) | `start_view` ≥ 100이면 `start_done ÷ start_view` < 70% → 시작 화면 꼴 다시 열기. 100 미만이면 「판단 보류」(기간을 늘려 통과시키지 않음) |
| 2026-11-17 | 서치콘솔 `/` 노출 4주 판정 | 기준 기간 S7 직전 4주(2026-09-22~10-19) 대비 출시 뒤 4주(2026-10-20~11-16). 「`/` 감소율 − `/jeju/**` 감소율 > 30%p」면 ADR-0094 2 다시 열기 |
