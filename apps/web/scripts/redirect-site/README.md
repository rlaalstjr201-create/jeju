# 옛 주소 프로젝트(yeogwi, gwichana-jeju)에 올릴 것

정합성 감사 36번·D5(`docs/audit/2026-10-03/coherence-audit.md`). 옛 주소 `yeogwi.pages.dev`·`gwichana-jeju.pages.dev`에 앱 서비스워커가 깔린 기기는 301을 받아도 옛 캐시 셸을 계속 띄울 수 있다. 그래서 301 한 줄에 서비스워커 예외를 더한다.

- `_redirects`: `/sw.js`만 그대로(200) 내주고, 나머지 모든 경로는 `https://yeochana.com/:splat`으로 301(ADR-0082 6). 두 옛 프로젝트 모두 새 주소로 바로 보낸다(두 번 거치지 않는다).
- `sw.js`: 브라우저가 서비스워커 갱신을 확인할 때 옛 것을 대신한다. 설치 즉시 활성화, 캐시를 모두 지우고 자기 등록을 풀고, 열린 창을 새 주소의 같은 경로로 보낸다. 요청은 가로채지 않는다.

## 올리기

이 폴더 안에서 바로 `npx wrangler`를 부르면 안 된다. npm이 가장 가까운 `package.json`이 있는 `apps/web`로 옮겨 가서 `apps/web/wrangler.toml`(이름 yeochana, D1 바인딩)과 `apps/web` 전체를 쓴다. 저장소 밖으로 복사해서 올린다. `core.autocrlf=true`인 Windows에서는 작업 사본이 CRLF일 수 있으니 복사본의 줄 끝을 `tr -d '\r'`로 LF로 맞춘다.

```sh
rm -rf /tmp/old-redirect && mkdir /tmp/old-redirect
for f in _redirects sw.js; do tr -d '\r' < apps/web/scripts/redirect-site/$f > /tmp/old-redirect/$f; done
cd /tmp/old-redirect
npx wrangler pages deploy . --project-name yeogwi --branch master
npx wrangler pages deploy . --project-name gwichana-jeju --branch master
```

## 확인

로컬(같은 복사본에서): `npx wrangler pages dev . --port 8799` → `curl -sI localhost:8799/sw.js`가 200 `application/javascript`, `curl -sI localhost:8799/jeju/aewol/`가 301 `location: https://yeochana.com/jeju/aewol/`. 끝나면 서버를 끄고 `.wrangler/`를 지운다.

배포 뒤:

```sh
for p in yeogwi gwichana-jeju; do
  curl -sI https://$p.pages.dev/sw.js | grep -iE '^(HTTP|content-type)'        # 200, javascript
  curl -sI https://$p.pages.dev/jeju/aewol/ | grep -iE '^(HTTP|location)'     # 301, https://yeochana.com/jeju/aewol/
done
```

실기기: 옛 주소를 홈 화면에 둔 폰에서 한 번 열고, 다음에 열 때 새 주소로 넘어가는지 본다.
