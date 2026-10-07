# ADR-0084: 주소를 yeochana.com으로 (ADR-0082 주소 부분 대체)

Status: Accepted (2026-10-08, 주인 결정·결제). 이름(ADR-0082 1~5)은 그대로다.

## Context

2026-10-07 seo-analyst 조사: 노출·클릭·외부 링크가 모두 0인 지금이 주소를 옮기는 비용이 가장 작다. 링크가 쌓인 뒤 옮기면 그만큼 잃는다. `*.pages.dev`에 쌓이는 링크·언급은 남의 도메인에 묶인다(공유 하위 도메인이 검색에서 불리하다는 공식 문서는 찾지 못했다 — 판단 근거는 브랜드와 이전 비용이다).

가격(Cloudflare Registrar, 원가 판매, 2026-10-07): `.com` 등록·갱신 연 $10.46, `.io` 등록 $32·갱신 $50. `.com`을 골랐다.

## Decision

1. 정식 주소는 `https://yeochana.com`(Cloudflare Registrar, 2026-10-08 등록, 자동 갱신). Pages 프로젝트 `yeochana`의 커스텀 도메인으로 붙인다. `www.yeochana.com`도 붙인다.
2. `yeochana.pages.dev`와 `www.yeochana.com`은 모든 경로를 `https://yeochana.com`의 같은 경로·쿼리로 301 한다(`apps/web/functions/_middleware.ts`). 예외는 `yeochana.pages.dev/sw.js` 하나 — 거기 앱을 깐 폰의 캐시 셸을 걷어 내는 서비스워커를 200으로 낸다(감사 #36·D5와 같은 이유). Bulk Redirects는 경로 예외를 둘 수 없어 쓰지 않는다.
3. 옛 주소 `yeogwi.pages.dev`·`gwichana-jeju.pages.dev`는 새 주소로 바로 301 한다(두 번 거치지 않는다, `scripts/redirect-site/`).
4. 운영 빌드는 `SITE_URL=https://yeochana.com`. canonical·sitemap·og·JSON-LD가 모두 새 주소를 쓴다.
5. 검색엔진: GSC는 새 속성을 만들고 옛 속성에서 「주소 변경」을 쓴다. 네이버 서치어드바이저·Bing은 새 주소로 등록하고 사이트맵을 낸다. IndexNow 상태는 호스트가 바뀌었으니 새로 seed 한다.

## Consequences

- 주소를 다시 옮기지 않는다. 다음 이전 제안은 이 ADR을 대체하는 이유가 있어야 한다.
- 함수 하나가 모든 요청 앞에 선다. 새 주소 요청은 호스트만 보고 바로 넘긴다(Pages Functions 무료 한도 하루 10만 회 안).
- 연 $10.46 갱신 비용. 갱신이 실패하면 사이트가 내려간다 — Cloudflare 결제 수단을 유지한다.
