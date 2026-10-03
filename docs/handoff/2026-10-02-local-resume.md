# 로컬에서 이어가기 (2026-10-02)
> 역사 기록(2026-10-02 시점). 현재 상태는 docs/deploy.md·docs/adr/README.md

앞선 정리: `2026-10-01-session.md`(제품·ADR 0057~0072). 이 문서는 그 뒤 일어난 일과 **배포 직전 상태**, 로컬에서 바로 이어가는 방법만 적는다.

## 한눈에

- 코드는 `master` 14d91c4(PR #1 합침)에 있고 **배포는 아직 안 했다.**
- 클라우드 세션에서 Cloudflare Pages 올리기가 막혔다. 이유: 클라우드 프록시가 `api.cloudflare.com` 요청의 `Authorization` 헤더를 사용자 API 토큰으로 바꿔 끼워, Pages 파일 업로드가 쓰는 임시 JWT가 거부된다(`Authorization failed 8000013`). 파일을 배포 요청 한 번에 담는 우회는 「성공」으로 표시되지만 파일이 저장되지 않아 주소가 500을 낸다. 프록시 우회는 하지 않았다.
- 그래서 **로컬(사용자 PC)에서 배포**한다. 아래 「로컬 배포」.

## 이번 세션에서 바뀐 것 (ADR 0073~0074 + 위 문서 이후)

| 항목 | 결정 |
|---|---|
| 이름 | 「여행계획짜기 귀찮아:제주」(콜론 뒤는 지역, 확장 시 「:부산」). 홈 화면 이름 `계획귀찮아`(5자). 「여행귀」는 뜻이 안 읽혀 반려. 「P의 여행」은 「P의여행:국도편」과 겹쳐 폐기(ADR-0068, `docs/research/name-01.md` §8) |
| 색 | 바다·귤(ADR-0070). 이후 변경 없음 |
| 지도 앱 | 네이버지도 기본, 카카오맵·TMAP 선택(ADR-0071) |
| 예약 링크 | 마이리얼트립 **검색** 링크는 맞은 곳 17%라 폐기(ADR-0073, `BOOKING_LINKS_ENABLED=false`). 체험 카드마다 확인된 경로 하나(네이버 124·마이리얼트립 9·비짓제주 1·홈페이지 22·전화 114), 경로 없는 체험·폐업 의심 26곳은 숨김(ADR-0074, `specs/booking-routes.md`, `docs/research/booking-links-02.md`) |
| 사진 | 제주관광공사가 이용 가능 확인(`docs/licensing-visitjeju.md` 4절, ADR-0072 Amendment 1). 회신 원문은 사용자가 보관 |
| 데이터 | 체험 313곳 중 270곳 노출, 장소 페이지 2,912쪽, sitemap 2,931 URL |
| 검증(최종) | tsc 0, vitest 705, build, check:slop 0, e2e 66/66, 장소 페이지 유사도 0.777(<0.8) |

## 로컬 배포 (Windows PowerShell)

```powershell
git clone https://github.com/rlaalstjr201-create/jeju.git   # 이미 있으면: git checkout master; git pull
cd jeju
npm ci
cd apps\web
$env:SITE_URL = "https://gwichana-jeju.pages.dev"   # 프로젝트 이름·도메인에 맞춰 바꾼다, 끝에 / 없이
npm run build
npx wrangler pages deploy dist --project-name gwichana-jeju --branch master
```

- Cloudflare 로그인 안 돼 있으면 `wrangler`가 브라우저를 연다. 첫 실행 때 프로젝트 생성 질문에 Production branch는 `master`.
- 이 방식은 직접 업로드라 `master`에 합쳐도 자동 배포되지 않는다. 자동 배포는 대시보드 Create → Pages → Connect to Git(`rlaalstjr201-create/jeju`, branch `master`, Build `npm run build -w @jeju/web`, Output `apps/web/dist`, 환경 변수 `NODE_VERSION=22`·`SITE_URL`, `VITE_EVENTS_URL`은 넣지 않음). 두 방식은 한 프로젝트에서 같이 못 쓴다.
- 계정에는 다른 프로젝트 `seoul-dangol`이 있다(건드리지 않음). 클라우드 세션에서 만든 시험 프로젝트 `gwichana-jeju`는 삭제했다.
- 환경 변수 `LANDING_PHOTOS`는 넣지 않는다(사진 켬).

## 배포 직후 (로컬 Claude Code에서 바로 가능)

1. `SITE=https://… bash apps/web/scripts/smoke.sh` (Git Bash/WSL) — 캐시 규칙·404·og:image·canonical·robots·llms.txt·옛 이름 0건. 실패 항목이 있으면 `docs/deploy.md` §3 기준으로 확인.
2. 실기기 점검 `docs/device-check.md`(5분, 12칸) + `npm run check:links`(안정된 네트워크에서, 지난번엔 카카오 18건을 못 돌림).
3. 검색엔진 등록(`docs/deploy.md` 검색엔진 절): 서치어드바이저·GSC 소유 확인은 파일이 아니라 `index.html` 메타 태그(Pages가 `.html`을 확장자 없는 주소로 308 이동시키기 때문). 커스텀 도메인이면 GSC는 DNS TXT.
4. Cloudflare API 토큰(10월 16일 만료)은 배포가 끝나면 삭제한다.

## 사용자 할 일 (코드와 무관)

1. 상표 출원: 9·39·42류, 「여행계획짜기 귀찮아」(글자+로고)와 「계획귀찮아」. `:제주`는 뺀다. 문장형이라 식별력 거절 가능(변리사 확인). 선출원 불확실.
2. 도메인: gwichana.com·.kr·.app, 방어용 gwichanha.com. 구입 후 `SITE_URL` 변경하고 한 번 더 배포.
3. 개인정보 문의처(지금 `privacy.html`은 GitHub 이슈 임시 링크).
4. `short_name` 「계획귀찮아」 확인(홈 화면에 추가해 잘리지 않는지).
5. 이름만 보여 주고 「무슨 앱 같아? 써 보고 싶어?」를 5~10명에게 물어 보기(귀찮아 어감이 추천 신뢰에 미치는 영향은 검증 안 됨).
6. 로컬에서 `apps/web`의 `npm run build:spots`를 원본(`review/out`)이 있을 때 한 번 돌려 출하 `spots.json`과 일치하는지 확인(클라우드엔 원본이 없어 못 돌림. 출하본은 `indoor.mjs`·`new-sub.mjs`·`markets.mjs`·`booking.mjs`·`apply-corrections.mjs` 멱등 스크립트로 수정).

## 남은 작업 (우선순위 순)

| # | 일 | 근거 |
|---|---|---|
| 1 | 로컬 배포와 스모크 | 위 |
| 2 | 데이터 오류 103건 중 안전한 것 정리(`review/booking/data-issues.json`: 카카오 id 다른 업체 9곳은 이미 삭제, 좌표 의심 11곳·비짓제주에서 사라진 곳 등) | `docs/research/booking-links-02.md` |
| 3 | 이유 문장이 원문과 거의 같아 장소 페이지가 없는 9곳 다시 쓰기(연정식당, 귤하르방 동문시장점, 무지개요트, 한라생태숲, 제주올레 20코스, 하도해변, 제주빅볼랜드, 라온골프클럽, 바다다이브) | ADR-0072 |
| 4 | 「가져올 것」 남은 것: 날씨 한 줄(새 ADR 필요, Open-Meteo), 무장애 정보(TourAPI 키 필요, data.go.kr), 네이버 서치어드바이저·Bing | `docs/research/competitors-01.md` |
| 5 | 배포 후 관찰: 오류 집계, 수집기 저장소, GA4 결정, 「가는 길에」(진행 방향 우선) 여부 | ADR-0067 |
| 6 | design.md 5·6(다크 회색 글자, 본문 크기), 200% 날짜 라벨 3줄, comment 716건 점검 | 이전 문서 |
| 7 | Klook·KKday 예약 경로(클라우드에서 403) | `booking-links-02.md` |
| 8 | 예약 링크 분기별 재확인(링크 노후) | ADR-0074 |
| 9 | 수익화(광고·제휴)는 제주관광공사에 상업 이용 확인 후 | `docs/licensing-visitjeju.md` |

## 로컬 개발 메모

- 프로젝트 지침은 저장소 `CLAUDE.md`(워크플로: Light Spec → Plan → 서브에이전트 빌드, 새 결정은 `docs/adr/`에 새 ADR). 공유 지식 위치 `C:\Users\rlaal\knowledge\`.
- 검증 명령(`apps/web`): `npx tsc --noEmit` · `npx vitest run` · `npm run build` · `npm run check:slop` · `npm run e2e`(Playwright; 로컬엔 `E2E_CHANNEL`·`NODE_PATH` 없이 기본 브라우저로 시도).
- 빌드가 만드는 `dist`는 파일 2,948개·약 37MB(Pages 한도 20,000개·파일당 25MiB 이내). 새 장소를 추가하면 `npm run landing:slugs` 뒤 `data/landing/slugs.json`을 커밋해야 빌드된다.
- 클라우드 세션 전용이던 것(프록시·토큰 주입·`E2E_CHANNEL=chromium`)은 로컬에서 필요 없다.
- 이전 목업 링크(비공개)와 실제 앱 단일 파일 미리보기는 클라우드 스크래치패드에만 있어 이어지지 않는다. 필요하면 `npm run build` 뒤 `npx vite preview`로 본다.
