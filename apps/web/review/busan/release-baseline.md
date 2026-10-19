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
