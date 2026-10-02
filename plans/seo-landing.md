# Implementation Plan — 정적 랜딩 + 장소 페이지

**Based on:** `specs/seo-landing.md`(결정됨) + `docs/context.md` + ADR-0072
**Status:** 구현됨(2026-10-01)

## 0. context.md 일관성

용어는 context.md 그대로: 기분 5개(화면 이름), 세부 지역 15곳(슬러그 `src/areas.ts`), 이유 문장, 카드. 새 용어 「랜딩」「장소 페이지」는 context.md에 더했다. 모순 없음.

## 1. 모양 — 빌드 후 단계 하나, 앱 코드는 import만

```
vite build ─→ dist/(앱)
tsx scripts/build-landing.mjs
   ├ 입력: dist/spots.json · data/landing/slugs.json · data/seo/keywords.json(judge) · review/input(원문, 대조용) · env SITE_URL · LANDING_PHOTOS
   ├ scripts/landing.ts (순수): buildSite() · sitemapFiles() · sourceCopies() · copiedReasons() · similarPairs() · ownShare()
   │     └ import: src/areas.ts(nearestArea) · src/links.ts(goLink, naverSearchUrl) · src/pick.ts(travel) · src/data.ts(cleanName)
   ├ 출력: dist/jeju/**/index.html · dist/jeju/landing.css(src/landing.css) · dist/sitemap.xml · dist/robots.txt Sitemap 줄 · dist/_redirects(있을 때)
   └ 품질 기준 Q1~Q6 → 어기면 exit 1
```

- 지역 배정·이동 시간·지도 링크 규칙은 앱 모듈을 그대로 import한다(두 벌 없음). 그래서 `.mjs`를 `tsx`로 돌린다.
- 장소 주소 등록부 `data/landing/slugs.json`: `npm run landing:slugs`(= `build-landing.mjs --write-slugs`)만 쓴다. 빌드는 읽기만.

## 2. 앱 셸에 닿는 곳 (최소)

| 파일 | 변경 |
|---|---|
| `index.html` | 홈 `<noscript>`, 결과 출처 아래 `<p class="landing"><a href="/jeju/">동네별로 둘러보기</a></p>` |
| `src/style.css` | `.landing` 3줄 |
| `sw/sw.js` | `/jeju/**`는 respondWith 하지 않음 |
| `public/404.html` · `public/llms.txt` | 허브 링크 |
| `vite.config.ts` | preview가 폴더 index.html을 페이지로(Pages와 같게) |

## 3. 검증

`tsc` · `vitest`(`tests/landing.test.ts`, `tests/sw.test.ts`) · `npm run build`(품질 기준) · `check:slop`(생성기 문구·CSS) · e2e LP1~LP3 · `SITE_URL=… npm run build && SITE_URL=… npm run seo:crawl`(L1~L3).
