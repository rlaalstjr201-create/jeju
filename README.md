# 여차나:제주 — P를 위한 여행동반자

제주 현지에서 기분 하나를 고르면 지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 주고, 마음에 들면 바로 길찾기(기본 네이버지도)로 보내는 폰 우선 웹 앱(PWA)이다. 로그인 없음, 고정 데이터.

## QA는 이렇게 해요

![앱의 약속: 지금 갈 수 없는 곳은 추천하지 않는다](docs/readme/qa-1-promise.png)

![약속을 정상·예외·경계 세 상황에서 시험하고 P0~P3로 급한 순서를 매긴다](docs/readme/qa-2-conditions.png)

![버그 신고는 증거·재현 방법이 있어야 받고, 고친 코드와 새 테스트가 있어야 닫는다](docs/readme/qa-3-report.png)

![일부러 고장 낸 640개 중 520개(81.25%) → 테스트 5개 추가 뒤 536개(83.75%)](docs/readme/qa-4-mutation.png)

![찾은 진짜 버그는 0개, 테스트 빈틈 5곳을 메웠다](docs/readme/qa-5-zero.png)

- QA 규칙 전문: [`.claude/agents/qa-analyst.md`](.claude/agents/qa-analyst.md)
- 돌연변이 테스트 보고서: [`docs/qa/mutation-2026-11-05.md`](docs/qa/mutation-2026-11-05.md)
- 더한 테스트: `apps/web/tests/browse.test.ts`, `apps/web/tests/weekly.test.ts`

## 프로젝트 안내

- 서비스: https://yeochana.com
- 앱 코드: `apps/web` (화면 규칙 `apps/web/design/SPEC.md`)
- 용어: `docs/context.md` · 결정 기록: `docs/adr/README.md`(색인) · 배포: `docs/deploy.md` · SEO: `docs/seo/README.md`
- `apps/api`·`apps/mobile`은 이전 방향(2026-05) 코드다(`docs/adr/0027-mobile-web-frozen-data.md`).

## apps/web 실행

```sh
cd apps/web
npm install
npm run dev      # 로컬 개발 서버
npm test         # 단위 테스트(vitest)
npm run build    # 앱 + 정적 랜딩 빌드
```

옛 API의 로컬 DB 기동: `npm run db:up`
