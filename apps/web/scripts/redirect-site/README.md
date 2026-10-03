# 옛 주소 프로젝트(gwichana-jeju)에 올릴 것

정합성 감사 36번·D5(`docs/coherence-audit-2026-10-03.md`). 옛 주소 `gwichana-jeju.pages.dev`에 앱 서비스워커가 깔린 기기는 301을 받아도 옛 캐시 셸을 계속 띄울 수 있다. 그래서 301 한 줄에 서비스워커 예외를 더한다.

- `_redirects`: `/sw.js`만 그대로(200) 내주고, 나머지 모든 경로는 `https://yeogwi.pages.dev/:splat`으로 301.
- `sw.js`: 브라우저가 서비스워커 갱신을 확인할 때 옛 것을 대신한다. 설치 즉시 활성화, 캐시를 모두 지우고 자기 등록을 풀고, 열린 창을 새 주소의 같은 경로로 보낸다. 요청은 가로채지 않는다.

## 올리기

이 폴더 안에서 바로 `npx wrangler`를 부르면 안 된다. npm이 가장 가까운 `package.json`이 있는 `apps/web`로 옮겨 가서 `apps/web/wrangler.toml`(이름 yeogwi, D1 바인딩)과 `apps/web` 전체를 쓴다. 저장소 밖으로 복사해서 올린다.

```sh
rm -rf /tmp/yeogwi-redirect && cp -r apps/web/scripts/redirect-site /tmp/yeogwi-redirect && rm /tmp/yeogwi-redirect/README.md
cd /tmp/yeogwi-redirect
npx wrangler pages deploy . --project-name gwichana-jeju --branch master
```

## 확인

로컬(같은 복사본에서): `npx wrangler pages dev . --port 8799` → `curl -sI localhost:8799/sw.js`가 200 `application/javascript`, `curl -sI localhost:8799/jeju/aewol/`가 301 `location: https://yeogwi.pages.dev/jeju/aewol/`. 끝나면 서버를 끄고 `.wrangler/`를 지운다. 2026-10-03 로컬 확인 완료.

배포 뒤:

```sh
curl -sI https://gwichana-jeju.pages.dev/sw.js | grep -iE '^(HTTP|content-type)'        # 200, javascript
curl -sI https://gwichana-jeju.pages.dev/jeju/aewol/ | grep -iE '^(HTTP|location)'     # 301, https://yeogwi.pages.dev/jeju/aewol/
```

실기기: 옛 주소를 홈 화면에 둔 폰에서 한 번 열고, 다음에 열 때 새 주소로 넘어가는지 본다.
