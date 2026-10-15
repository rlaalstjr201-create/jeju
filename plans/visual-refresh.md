# Plan: 화면 재질 개편과 로고

Spec: `specs/visual-refresh.md`, ADR-0088.

| # | 단위 | 주로 건드리는 곳 | 검증 |
|---|---|---|---|
| R1 | 토큰·규칙 | `style.css` `:root`(밝게·어둡게), `scripts/check-slop.ts`(그림자는 `--float` 토큰 정의·사용만 허용) | check:slop 0, 기존 대비 테스트 새 값 |
| R2 | 로고 | `src/logo.ts`(심볼 SVG 문자열 하나), `index.html` 위 줄·이름 줄, `scripts/make-icons.ts` 새 심볼, 아이콘·favicon·og 다시 생성, 랜딩 머리 | 아이콘 눈으로 확인, deploy.test |
| R3 | 홈 | 오늘 판·기분 면 묶음·아무거나·칩 | 홈 e2e·스크린숏 |
| R4 | 결과 | 첫 장 버튼 줄·꼬리표·줄 카드 면·다른 3곳 바 | 카드 e2e(누름 영역·겹침), 채움 버튼 1개 |
| R5 | 나머지 | `.tbtn` 면 버튼화, 시트, 저장한 곳, 설정·설문 | 전체 e2e |
| R6 | 문서 | SPEC 1·2·5·6.x·13·14, ADR-0082 개정 표시 | 문서 대조 |

지킬 것: 동작·문구·DOM 순서는 바꾸지 않는다(시각만). 데이터 파일·`build:spots` 손대지 않는다. JS+CSS gzip ≤ 50KB. e2e는 SITE_URL 비우고 겹치지 않는 포트.
