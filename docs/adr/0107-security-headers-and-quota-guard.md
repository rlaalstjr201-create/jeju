# ADR-0107: 보안점검 2026-11-02 — HSTS·하드닝 CSP를 넣고, API 쿼터 가드는 그대로 둔다

Status: Accepted (2026-11-02, 주인 지시 「2번 3번 넣어서 배포해줘」, 1번은 「그냥 둔다」 쪽 설명 뒤 지시 없음). 배포 fe684b2a, 커밋 09103906. 독립 리뷰 MAJOR 0.

## Context

- 주인 요청으로 본인 사이트 보안 점검(방어 목적)을 했다. 서버 함수 코드 감사, 클라이언트 코드 감사, 실제 사이트 헤더 확인, 의심 가는 곳만 정상 요청으로 거동 확인. 대량·파괴적 요청은 보내지 않았다.
- 데이터 유출·주입 구멍은 없었다. 사용자·장소 글은 모두 `textContent`로 들어가고, `innerHTML`은 고정 SVG 아이콘에만 쓴다. D1 쿼리는 모두 파라미터 바인딩이다. 오류 응답(`X-*-Reason`)에 키·검색어가 실리지 않는다. 빌드 번들에 키가 없다.
- 빠진 것: `Strict-Transport-Security`와 `Content-Security-Policy`가 없었다.
- `/api/geo`·`/api/addr`의 `sameSite` 가드는 다른 사이트의 방문자 브라우저만 막는다. 스크립트가 `Origin: https://yeochana.com`을 위조하면 통과한다(실측: 헤더 없음 403, 남의 Origin 403, 위조한 내 Origin 200). 남는 보호는 아이솔레이트별 메모리 레이트리밋(분당 20)뿐이다. 세 API(카카오 로컬·행안부 도로명주소·기상청)는 모두 무료라 비용은 없다. 최악은 누가 하루 한도를 소진해 그날 숙소 검색·날씨가 멈추는 것이다.

## Decision

1. **HSTS**: `/*`에 `Strict-Transport-Security: max-age=31536000; includeSubDomains`를 단다. `preload`는 달지 않는다(되돌리기 어려운 목록 등록). yeochana.com과 www(301), http(301)는 모두 HTTPS로 간다.
2. **하드닝 CSP**: `/*`에 `Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests`를 단다. `default-src`·`script-src`·`img-src`·`connect-src`·`style-src`는 두지 않는다. 페이지가 인라인 부트스트랩 스크립트로 돌고, GTM/GA4·네이버 분석이 런타임에 스크립트를 끼워 넣기 때문이다. 스크립트를 막는 CSP는 빌드마다 인라인 해시를 계산해야 해서 이번 범위가 아니다. 이 CSP는 인라인 스크립트 주입(XSS)을 막지 못한다. 막는 것은 base 태그 주입·플러그인·클릭재킹이다.
3. **쿼터 가드는 그대로**: 무료 공공 API의 하루 한도 소진은 가용성 문제이고 심각도는 낮다. 실피해도 없다. 실제로 한도에 닿으면 Cloudflare 엣지 레이트리밋 규칙(코드 수정 없음, 대시보드에서 주인이 설정)을 먼저 쓴다. 숙소 검색에 Turnstile을 붙이는 것은 그다음이다.

## Consequences

- 스크립트를 막는 CSP(빌드 해시 또는 nonce 미들웨어)를 하려면 새 ADR로 연다. GTM이 런타임에 끼워 넣는 스크립트까지 감당해야 한다.
- `_headers`의 `/*` 블록은 Pages Functions 응답(`/api/*`)에는 붙지 않는다. API 응답은 JSON이라 CSP의 실익이 없다.
