# 여행귀:제주 — P를 위한 여행동반자

제주 현지에서 기분 하나를 고르면 지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 주고, 마음에 들면 바로 길찾기(기본 네이버지도)로 보내는 폰 우선 웹 앱(PWA)이다. 로그인 없음, 고정 데이터.

- 서비스: https://yeogwi.pages.dev
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
