# 배포 전 최종 점검 — apps/web "P의 여행"

점검일 2026-10-01. 범위: 코드·빌드·데이터·법/라이선스·호스팅. 등급: **막힘**(배포 전 필수) / **권장**(배포 직후~1주) / **참고**.
측정: `vite build` 성공(JS 55KB·gz 21KB, CSS gz 4KB, spots.json 1.08MB), vitest 484 통과, tsc 0 오류, headless Chromium(390px, 위치 허용)으로 `vite preview` 실행 — 콘솔 오류 0(정상 경로), 카드 3장 표시, alt 없는 img 0, 이름 없는 버튼 0, SW 제어 ✓, `navigator.storage.persisted()` = false.

## 1. 로그인 없는 저장 유지

현재: 하트·날짜별 보관·숙소 등 모두 `localStorage`(`src/store.ts`), 실패 시 메모리로 계속. `persist()` 호출 없음, 설치 유도(`beforeinstallprompt`·iOS 안내) 없음, 백업/복원 없음. 저장 목록 각주 "이 브라우저에만 저장돼요"는 있음.

| 상황 | 저장이 살아남나 | 근거 |
|---|---|---|
| iOS Safari 탭 | 7일간 사이트 사용(탭) 없으면 스크립트 저장소 전부 삭제 | WebKit ITP[^itp], MDN[^mdn] |
| iOS 홈 화면 앱 | 7일 규칙 사실상 제외(앱 자체 사용일 기준). **단 Safari와 저장소가 분리** — Safari에서 저장한 하트는 홈 화면 앱에 안 보임 | WebKit[^itp], Apple 포럼·WebKit 버그[^ios-split] |
| `persist()` | Chrome/Safari 17+: 프롬프트 없이 휴리스틱 승인(Safari는 홈 화면 앱이면 승인 경향). Firefox: 팝업 | MDN[^mdn], WebKit Storage Policy[^wk-storage] |
| 카카오톡·인스타·네이버 인앱 | 각 앱 WebView 별도 저장소 — Safari/Chrome과 공유 안 됨, 앱 업데이트·캐시 정리로 사라질 수 있음 | Apple 포럼[^ios-split], 카카오 데브톡[^kakao-inapp] |
| 사생활 보호 모드 | 탭 닫으면 삭제(코드는 throw 대비돼 있음) | MDN[^mdn] |

여행 기간(3~7일)·"카톡 링크로 처음 연다"는 사용 형태상 **인앱에서 저장 → 나중에 Safari/홈 앱에서 못 찾음**이 가장 흔한 손실 경로다.

- **권장 A** `navigator.storage.persist()`를 첫 하트 저장 시 1회 호출(무프롬프트, 실패 무해). 5줄.
- **권장 B** 인앱 감지(`/KAKAOTALK|Instagram|NAVER\(inapp/i`) 시 저장 목록 각주를 "카톡 안에서 저장한 곳은 카톡에만 남아요 · 브라우저로 열기"로 바꾸고, 카카오톡은 `kakaotalk://web/openExternal?url=`[^kakao-ext] 버튼. 첫 하트 **전에** 알려야 의미가 있음.
- **권장 C** 저장 3개 이상에서 한 번, "홈 화면에 추가하면 오래 남아요" 안내(Android는 `beforeinstallprompt`, iOS는 공유→홈 화면 그림 한 줄). 단 iOS는 Safari→홈 앱으로 하트가 **옮겨지지 않음**을 같이 해결해야 함(→ D).
- **권장 D** 백업/복원 링크: 저장 목록에 "다른 곳에서 열기" → `#s=` 해시에 `{id,date,order}`를 압축(base64url)해 공유시트/복사. 해시라 서버·로그에 안 남음(로그인·서버 0, ADR-0026 유지). 2,959곳 id를 짧은 인덱스로 바꾸면 하트 30개도 URL 수백 자. 기기 변경·인앱→Safari·Safari→홈 앱 모두 해결. 비용 중간(파싱·병합 UI).
- **참고 E** 익명 동기화(무작위 코드 + KV): 서버 상태·남용 대응 생김. 첫 반응 본 뒤 결정.
- **참고 F** 로그인: ADR-0026이 거부. "선택 로그인"은 기기 간 동기화 수요가 확인될 때 새 ADR로.
- 결정 필요: A·B는 배포 전, C·D는 ADR(0026 보강) 후 1주 내 추천.

## 2. 법·라이선스

- **막힘 — 사진·문구 출처와 이용 근거.** 2,959곳 사진 전부 `api.cdn.visitjeju.net` 핫링크. 비짓제주 사이트 약관은 콘텐츠의 무단 복제·배포·상업 이용 금지[^vj-terms]. 반면 공공데이터포털의 "제주관광공사_비짓제주 관광정보 오픈API"는 이용허락범위 "제한 없음"[^datagokr]. ADR-0023의 "공공누리 1유형"은 출처가 확인되지 않음. 앱 어디에도 출처 표시 없음(`grep 비짓제주` 0건).
  - 조치: (1) 저장 목록 아래·첫 화면 하단에 "장소 정보·사진: 비짓제주(제주관광공사) 오픈API" 한 줄 + 링크. (2) 제주관광공사(064-740-6000)에 오픈API 이미지 URL 직접 표시(핫링크) 가능 여부를 메일로 확인·보관. (3) 이유 문장은 원문 재작성이라 그대로 두되, 원문 문장을 그대로 옮긴 곳이 없는지 S9-3 감사로 이미 확인됨.
  - 부수 위험: 핫링크라 비짓제주 CDN이 이미지 경로 변경·차단하면 사진 전부 깨짐. 현재 다른 Referer로도 200(`referrerpolicy=no-referrer` 사용 중). 깨진 사진 대체 UI가 있는지 E2E로 확인 권장.
- **참고 — 카카오맵 링크.** `place.map.kakao.com/{id}`·`map.kakao.com/link/search/`는 공개 URL로 이동만 하고 API 키·지도 임베드·데이터 복제 없음. 별도 약관 의무 확인 안 됨. 장소 ID를 카카오 페이지에서 수집한 것(팩트체크 33회)은 소량·수작업이라 문제 낮음, 반복 크롤링은 하지 말 것.
- **참고 — 마이리얼트립.** 현재 제휴 ID 없는 일반 검색 링크라 의무 없음. 제휴(파트너스) 수익 링크로 바꾸면 "광고/제휴 링크" 표기 필요(공정위 추천·보증 심사지침).
- **권장 — 익명 사용 기록과 개인정보보호법.** 보내는 값(장소 id·이벤트·기분·범위·지역명·날짜)은 식별자·좌표·시각 없음 → 그 자체는 익명정보(법 제58조의2 적용 제외)[^pipa]에 가깝다. 다만 호스트(Cloudflare 등)는 기본적으로 접속 IP 로그를 남기고, "서버는 IP 저장 안 함"(ADR-0061)은 우리 코드 한정이다.
  - 조치: 짧은 "개인정보 처리 안내" 페이지(수집 항목 없음·기기 저장만·익명 카운트 내용·호스트 접속 로그·위치는 기기 밖으로 안 나감·끄기 방법·문의 이메일)를 두고 저장 목록 각주에서 링크. 의무 여부가 애매할 때 비용이 가장 작은 쪽. `VITE_EVENTS_URL` 미설정 배포면 기록 고지·버튼이 숨고 전송 0(코드 확인: `track.ts`, 커밋 596ee19).
- **참고 — 위치정보법.** GPS 좌표는 기기 안에서 거리 계산에만 쓰이고 서버·이벤트·외부 링크로 나가지 않음(`track.ts`는 좌표 미포함, 카카오 링크는 장소 좌표·이름만). 위치기반서비스사업 신고는 "개인위치정보를 수집·이용·제공"하는 경우가 대상이고, 서버로 보내는 순간 대상이 된다는 해석이 일반적[^lbs]. → 지금 구조는 신고 대상 아님으로 보는 게 합리적. **이 성질을 유지하는 것이 조건**: 이벤트에 좌표·가까운 지역(GPS 유래) 넣지 말 것(현재 `area`는 사용자가 고른 지역일 때만 — 유지). 처리 안내에 "위치는 기기 밖으로 보내지 않음" 명시.

## 3. 운영 준비

| 항목 | 등급 | 현재 | 조치 |
|---|---|---|---|
| 하위 경로 진입 | **막힘(호스트 설정)** | `base: './'`. headless로 `/nope/deep` 열면 SPA 폴백이 index.html을 주고 `./assets/*.js`가 `/nope/assets/…`로 풀려 HTML이 와서 **빈 화면**(MIME 오류) | 호스트에서 SPA 폴백을 켜지 말고 404 그대로 두거나(앱은 라우트 없음), `base: '/'`로. 간단한 `404.html`(홈 링크) 추가 |
| HTTPS | 막힘(호스트) | geolocation·SW 모두 보안 컨텍스트 필요 | 모든 후보 기본 HTTPS. 커스텀 도메인 시 HSTS |
| 캐시 헤더 | **막힘(호스트)** | 없음 | `/assets/*`: `public, max-age=31536000, immutable` · `/spots.json`(항상 `?v=` 해시로 요청): 1년 가능, CDN 캐시 키에 쿼리 포함 확인 · `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`: `no-cache` · 아이콘: 1일 |
| SW 갱신 | 참고(양호) | 빌드 해시 VERSION, 이전 캐시 삭제, 화면 한가할 때 reload(`update.ts`) | `sw.js`가 HTTP 캐시되지 않게 위 헤더만 지키면 됨 |
| OG/트위터 메타 | **권장(사실상 필수)** | `og:*` 없음 → 카톡 공유 미리보기가 제목·설명만 또는 빈 카드 | `og:title`·`og:description`·`og:image`(1200×630 절대 URL)·`og:url`·`twitter:card=summary_large_image`. 카톡 캐시는 카카오 디버거로 초기화 |
| 아이콘 | 권장 | 192·512 `purpose:any`만, `favicon.ico` 404 | `purpose:maskable` 512 별도(안전영역 80%), apple-touch-icon 180, `favicon.ico` 또는 32px png |
| robots/sitemap | 참고 | 없음(preview가 index.html로 응답) | `robots.txt`(Allow 전체) 한 줄, 검색 노출 원하면 sitemap 1줄 |
| 오류 모니터링 | 권장 | 없음(`onerror`·`unhandledrejection` 수집 없음) | 무료 Sentry 또는 이벤트 수집기에 `e:'err'` 카운트(메시지 해시만) — ADR-0061 범위 밖이면 새 결정 필요 |
| `VITE_EVENTS_URL` 미설정 | 참고 | 전송 0, 고지·끄기 버튼 숨김 | 수집기는 `events/store.ts` `memoryStore`뿐 — 영속 저장소(D1/KV) 어댑터·요청 크기/빈도 제한 없음. 붙일 때 같은 출처 경로(`/e`)로 두면 CORS 고민 없음 |
| 성능 | 참고 | FCP 약 0.5s(로컬), 탭→카드 0.3s(캐시). 첫 방문 spots.json gz 331KB(ADR-0057) | 호스트 brotli 켜기. 이후 Lighthouse 단계 |

## 4. 데이터

- **막힘(결정 필요) — 팩트체크 5곳 미반영.** `review/audit/factcheck-01.md` 제안이 `public/spots.json`에 아직 안 들어감(확인함):
  - `박물관은 살아있다(2026.03.03~05.28:임시휴관)` — **이름 그대로 카드에 노출**. 꼬리표 삭제, 2→3.
  - `이중섭미술관` — 휴관(2027.2까지), 현재 점수 1로 남아 있음 → 제거 권장.
  - `제주오누이` — 존재 확인 불가인데 점수 4로 상위 노출 가능 → 제거.
  - `대향연탄구이` — 이유 문장 틀림(국숫집) → 이름·좌표·kakaoPlaceId 교체 또는 제거.
  - `함덕백사장 & 서우봉` — 3→2 또는 제거.
- **막힘(재현성) — spots.json을 빌드 스크립트로 재생성 불가.** `scripts/build-spots.mjs`가 읽는 `review/out/`이 저장소에 없음. 위 5곳을 손으로 고치면 git 기록이 유일한 근거. 조치: 5곳은 `review/` 아래 작은 보정 파일(예: `review/fix/factcheck-01.json`)과 적용 스크립트로 반영하고, `review/out` 부재를 README/ADR에 "동결본 = public/spots.json, 이후 보정은 overlay"로 명시(ADR-0058 MODIFY 조건 충족).
- **권장 — comment 필드 불일치(약 716건, 의뢰자 수치).** 채점은 summary 기준이라 이유·점수 영향은 제한적. 다만 같은 원인(다른 가게 comment)이 `data-issues.md` 10곳 중 6곳. 배포 후 `save`/`map` 이벤트가 적은 고득점 장소부터 표본 점검. 배포 차단은 아님.
- 참고: 2,959곳, 예약 링크 385곳, 이름에 휴관 꼬리표 1곳(위 항목).

## 5. 알려진 작은 문제·기타

- 참고 — 첫 저장 안내(`hintFor`) 경계 사례, 320×200%에서 기준 라벨 3줄(design/SPEC.md 324·476행, QA r4 기록, 버튼 높이 유지·말줄임 없음). 배포 차단 아님.
- 참고 — 코드에 TODO/FIXME/console 0건. 정상 경로 콘솔 오류 0. 테스트 484 통과, 타입 오류 0.
- 참고 — 사진 `alt=""`(이름이 옆에 있어 장식 처리) 적절.

## 6. 호스팅

| | SW·헤더 | 이벤트 수집기 | 한국 지연 | 판단 |
|---|---|---|---|---|
| Cloudflare Pages | `_headers` 파일, brotli 자동 | Pages Functions + D1/KV, 같은 출처 | 서울 PoP(30~50ms 벤치)[^bench]. 무료 플랜은 ISP에 따라 도쿄 등으로 우회된 사례가 있어 배포 후 실측 | **추천** |
| Netlify | `_headers`, 쉬움 | Functions + Blobs | 아시아 엣지 약함(US 기본 경로 사례)[^bench] | 가능 |
| Vercel | `vercel.json` headers | Edge/Serverless + KV(유료 성향) | 도쿄·서울 80~120ms[^bench] | 가능 |
| GitHub Pages | **커스텀 헤더 불가**(max-age 10분 고정), 함수 없음 | 별도 필요 | 서울 PoP 없음 | 비추천 |

Cloudflare Pages 선택 시 `_headers`에 §3 캐시 규칙, SPA 폴백 끔(`404.html` 존재 시 자동으로 404 처리), `/e`는 Functions.

## 배포 전 체크리스트 (우선순위)

1. [막힘] 팩트체크 5곳 반영(최소: 박물관 이름 꼬리표, 제주오누이·이중섭미술관 제거) — overlay 파일로.
2. [막힘] 출처 표시 한 줄(비짓제주·제주관광공사) + 공사에 이미지 이용 확인 메일.
3. [막힘] 호스트 결정(Cloudflare Pages 추천) + `_headers` 캐시 규칙 + SPA 폴백 끄기/`404.html`.
4. [권장·배포 전] OG/트위터 메타 + og 이미지, maskable 아이콘, favicon, robots.txt.
5. [권장·배포 전] `navigator.storage.persist()` 첫 하트 시 호출, 인앱 브라우저 안내 + 외부 브라우저 열기.
6. [권장] 개인정보 처리 안내 페이지(위치 비전송·익명 카운트·호스트 로그·끄기).
7. [권장] `VITE_EVENTS_URL`은 수집기(영속 저장·크기/빈도 제한) 붙인 뒤에 설정. 그 전엔 미설정 배포.
8. [권장·1주] 백업/복원 공유 링크(#해시), 홈 화면 추가 안내 — ADR-0026 보강 ADR 먼저.
9. [권장] 오류 카운트 수집(새 결정 필요), 실기기(iPhone Safari·카톡 인앱·Galaxy 삼성인터넷) 스모크.
10. [참고] Lighthouse·brotli, comment 불일치 표본 점검, 200% 라벨·첫 저장 안내.

## 출처

[^itp]: WebKit, Full Third-Party Cookie Blocking and More (7일 상한, 홈 화면 앱 별도 계산) — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
[^mdn]: MDN, Storage quotas and eviction criteria — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
[^wk-storage]: WebKit, Updates to Storage Policy (Safari 17, persist 휴리스틱) — https://webkit.org/blog/14403/updates-to-storage-policy/
[^ios-split]: Apple Developer Forums (홈 화면 앱·WKWebView 저장소 분리) — https://developer.apple.com/forums/thread/684351 , https://developer.apple.com/forums/thread/765680 , WebKit bug 181849 — https://bugs.webkit.org/show_bug.cgi?id=181849
[^kakao-inapp]: 카카오 데브톡 InAppBrowser — https://devtalk.kakao.com/t/in-app/133486
[^kakao-ext]: 카카오톡 인앱→외부 브라우저 — https://burndogfather.com/271
[^vj-terms]: 비짓제주 이용약관 — https://www.visitjeju.net/kr/common/terms
[^datagokr]: 공공데이터포털, 제주관광공사_비짓제주 관광정보 오픈API — https://www.data.go.kr/data/15076361/openapi.do , 비짓제주 API 안내 — https://www.visitjeju.net/kr/visitjejuapi
[^pipa]: 개인정보 보호법 제58조의2(적용제외) — https://casenote.kr/법령/개인정보_보호법/제58조의2 , 김앤장 FAQ — https://www.kimchang.com/ko/insights/detail.kc?sch_section=4&idx=21101
[^lbs]: 위치기반서비스사업 신고 대상 해설 — https://www.catchsecu.com/archives/14060 , 방통위 위치정보법 해설서(2022) — https://webzine.mynewsletter.co.kr/newsletter/kcplaa/202207-2/4_%EB%B0%A9%EC%86%A1%ED%86%B5%EC%8B%A0%EC%9C%84%EC%9B%90%ED%9A%8C_%EC%9C%84%EC%B9%98%EC%A0%95%EB%B3%B4%EC%9D%98_%EB%B3%B4%ED%98%B8_%EB%B0%8F_%EC%9D%B4%EC%9A%A9_%EB%93%B1%EC%97%90_%EA%B4%80%ED%95%9C_%EB%B2%95%EB%A5%A0_%ED%95%B4%EC%84%A4%EC%84%9C.pdf
[^bench]: Hosting comparison 2026 (벤치 수치, 참고용) — https://github.com/Wasserpuncher/hosting-platforms-comparison-2026 , https://tech-insider.org/vercel-vs-netlify-vs-cloudflare-pages-2026/
