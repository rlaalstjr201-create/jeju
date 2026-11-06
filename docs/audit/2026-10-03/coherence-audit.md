# 정합성 감사 (2026-10-03)

기준: 사용자 의도(2026-10-03) 「현지에서 내 위치 기준으로 지금 내 주변에 흥미로운 곳이 있나 보여 주고, 괜찮으면 눌러서 바로 간다」, 태그라인 「P를 위한 여행동반자」, 홈 설명 「지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.」, GPS 라벨 「내 위치 근처」(ADR-0077 Amendment 2).

방법: 읽기 전용. 파일 수정 없음(이 문서만 새로 씀). 단위 테스트는 개수 확인용으로 한 번 실행(797 통과, 2026-10-03). 실기기·배포본 확인은 하지 않았다. 「확인 필요」라고 적은 항목은 코드만 보고 추론한 것이다.

분류: **바로 고침** = 이미 내려진 결정에 문서·코드를 맞추는 일. **결정 필요** = 새 판단이 있어야 함. **그대로 둠** = 이유를 적음.

## 1. 홈: 「내 위치 근처」와 위치 모를 때의 내용 (시드 발견 검증)

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 1 | 홈 오늘 판 | GPS 기준이고 이 세션에 위치가 없으면 `homeOrigin`이 null이다. 그러면 장날 줄이 섬 전체 오일장 중 점수 1위를 「오늘 ○○ 장날 · {지역}」으로 띄운다(예: 「오늘 중문향토오일시장 장날 · 중문」). 바로 위 라벨은 「내 위치 근처」, 아래 설명은 「지금 내 위치 근처에서」라서 먼 곳이 「내 근처」로 읽힌다. **확인됨.** | `apps/web/src/state.ts:238-239`, `apps/web/src/home.ts:30-33`, `home.ts` `todayActs` 45-48, `render.ts:919-922`, SPEC `apps/web/design/SPEC.md:375` | 높음 | 결정 필요 (D1) | 아래 D1 |
| 2 | 홈 기분 줄 | 같은 조건에서 「예: A, B」와 사진 2장이 섬 전체 상위 2곳(`islandTop`)이다. ADR-0075 3은 「예:」가 약속이 아니라 보기라는 표시라고 했지만, Amendment 2의 「지금 내 위치 근처」 문장 바로 아래에서는 근처 예시로 읽힌다. **확인됨.** | `home.ts:16-21`, ADR-0075 `docs/adr/0075-home-refresh-today-and-photos.md:27-29`, SPEC:379 | 높음 | 결정 필요 (D1) | 아래 D1 |
| 3 | 홈 비 소식 | 같은 조건에서 비 소식도 뜨지 않는다(`rainArea`가 null). 지금 쓰는 사람에게 가장 유용한 줄이 첫 방문에는 늘 빠진다. | `state.ts:243-247` | 중간 | 결정 필요 (D1) | D1에서 함께 풀림 |
| 4 | 위치 묻는 시점 | 권한이 이미 `granted`인 재방문자도 홈에서는 위치를 읽지 않는다. `checkPermission`은 상태만 받고 `getCurrentPosition`은 기분 탭 뒤에만 부른다. 권한 창 없이 읽을 수 있는데 안 읽는 셈이라, 1~3이 재방문자에게도 생긴다. | `app.ts:909-923`, SPEC:387 「위치 권한은 기분을 누를 때 처음 묻는다」, ADR-0075:31 「묻는 시점은 바꾸지 않는다」 | 중간 | 결정 필요 (D1) | 「묻지 않고 읽기」는 SPEC:387 문장(권한 *요청* 시점)과 충돌하지 않는다. ADR-0075 3 보완 Amendment로 정하면 된다 |
| 5 | 기준 시트·안내 문구 | 라벨은 「내 위치 근처」인데 시트 옵션은 「지금 있는 곳」, noscript·llms.txt는 「지금 위치」, 출발지 접두는 「여기서」. Amendment 2가 라벨만 바꾸고 나머지는 그대로 두기로 했다. | `render.ts:92`, `apps/web/index.html:106`, `apps/web/public/llms.txt:10`, SPEC:582 | 낮음 | 그대로 둠(Amendment 2가 범위를 라벨로 한정. 뜻이 충돌하지 않음) | 5초 이해 시험 뒤 헷갈림이 보이면 그때 맞춤 |
| 6 | 코드 주석 | 「the label says 내 주변 again」 — 라벨은 두 번 바뀌어 지금 「내 위치 근처」. | `app.ts:915` | 낮음 | 바로 고침 | 주석 한 단어 |

## 2. ADR 상태·번호

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 7 | ADR-0029 | Consequences 「첫 화면은 그대로 조용하게」, 「첫 화면 요소: 기분 버튼 5개 + 위치 전환」을 ADR-0075가 대체했는데 0029 Status는 대체 표시 없음. | `docs/adr/0029-destination-areas-and-saves.md:3,17,22`, `0075:3` | 중간 | 결정 필요 (D3) | 0029 Status에 「일부 대체: ADR-0075」 한 줄 |
| 8 | ADR-0058 | 「외부 요청 제한」을 0076(비 소식 함수)·0078(GA4·네이버)이 예외로 넓혔는데 0058 Status에는 0073·0074만 적혀 있다. | `0058:3`, `0076:3`, `0078:3` | 중간 | 결정 필요 (D3) | Status에 0076·0078 추가 |
| 9 | ADR-0061 | 「수집 주소가 빌드 설정에 없으면 아무것도 보내지 않는다」, 「쿠키 안 보냄」을 0078이 운영 빌드에서 바꿨는데 0061 Status는 `Accepted`만. | `0061:3,12-13`, `0078:3` | 중간 | 결정 필요 (D3) | 「일부 대체: ADR-0078」 |
| 10 | ADR-0063 | 「서버 없음·쿠키 없음」에 0076이 첫 서버 코드를, 0078이 D1·쿠키를 더했는데 0063 Status는 0026 확장만. | `0063:3,17`, `0076:3`, `0078:3` | 중간 | 결정 필요 (D3) | Status에 0076·0078 |
| 11 | ADR-0068 | 1·2·4·5를 0077이 대체했는데 0068 Status는 `Accepted (2026-10-01)`만. 0068 3(부제)도 0077 Amendment 1이 대체. | `0068:3`, `0077:1,43` | 중간 | 결정 필요 (D3) | 「1·2·3·4·5 대체: ADR-0077」 |
| 12 | ADR-0025(pivot) | 「내일」 기준을 0059가, 기분 4개를 0028이 대체했는데 Status는 `Accepted`. 본문 끝 「Updated by ADR-0058」만 있음. | `0025-pivot-to-tomorrow-picker.md:3,38`, `0059:24` | 낮음 | 결정 필요 (D3) | Status에 대체 목록 |
| 13 | ADR 번호 중복 | 0025×2, 0026×3, 0027×3, 0028×2, 0029×2(옛 큐레이션 계열 vs 9-30 웹 계열). 색인 파일 없음(`docs/adr/README*` 없음, `docs/agents/domain.md`에도 언급 없음). 「ADR-0029」만 쓰면 어느 것인지 모른다(예: context.md 저장 절). 결번 0036·0039·0046·0048. | `ls docs/adr`(82파일·75번호), `docs/context.md:50` | 중간 | 결정 필요 (D3) | `docs/adr/README.md` 색인(번호·제목·상태·대체 관계)만 추가. 파일 이름은 바꾸지 않는다(참조가 깨짐) |
| 14 | measurement.md | GA4 행이 아직 「**도입 여부부터 결정**」. ADR-0078이 닫았다. | `.claude/skills/seo-geo/references/measurement.md:12`, `0078:3` | 중간 | 바로 고침 | 「도입됨(ADR-0078), 속성 여행귀:제주」 |
| 15 | ADR-0079 vs 주간 작업 | ADR-0079 3은 「사이트맵·IndexNow 갱신」을 자동 범위에 넣었고, 주간 작업 프롬프트는 IndexNow send를 금지한다. | `docs/adr/0079-weekly-seo-rank-ops.md:28`, `C:\Users\rlaal\.claude\scheduled-tasks\yeogwi-weekly-seo\SKILL.md` 「금지」 줄 | 낮음 | 그대로 둠(프롬프트가 더 엄격. 배포가 승인제라 send도 배포 뒤 사람 몫이 맞음) | 다음 ADR-0079 손볼 때 문장 정리 |

## 3. 사용자·크롤러가 보는 문구

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 16 | 기록 끄기 안내 | 저장 화면 줄 「어디가 좋았는지 익명으로 세어요.」는 ADR-0061(자체 익명 기록만) 시절 문장이다. 지금은 GA4·네이버 애널리틱스가 쿠키로 방문을 이어 센다(개인정보 안내가 그렇게 적음). 「익명으로」가 셋 모두에 대해 참이라고 하기 어렵다. 개인정보 안내도 이 문장을 그대로 인용한다. | `apps/web/index.html:143`, `render.ts:61`, `apps/web/public/privacy.html:59` | 중간 | 결정 필요 (D2) | 아래 D2 |
| 17 | SPEC 6.3 앱 이름 줄 | `여행계획짜기 귀찮아:제주`로 남아 있다(코드는 「여행귀:제주 · P를 위한 여행동반자」). 같은 절의 설명 문장은 Amendment 2로 고쳐졌는데 이 줄만 빠졌다. | `apps/web/design/SPEC.md:372`, `index.html:85` | 중간 | 바로 고침 | SPEC 한 줄 |
| 18 | SPEC 6.3 오늘 판 | 「지금은 장날만」 — 비 소식(ADR-0076)이 이미 들어갔다. | `SPEC.md:375`, `home.ts:45-48` | 낮음 | 바로 고침 | 「지금은 비 소식 → 장날」 |
| 19 | 매니페스트 색 | `background_color`·`theme_color`가 다크 `#0f1319`. 앱은 흰 바탕(ADR-0070)이고 라이트 `theme-color`는 `#ffffff`. 설치 앱 스플래시가 검게 뜬다. | `apps/web/public/manifest.webmanifest:9-10`, `index.html:9-10` | 낮음 | 결정 필요 (D7) | 의도였는지 확인. 아니면 `#ffffff` |
| 20 | llms.txt | 「공개 API·MCP 서버는 아직 없다」 — `/api/rain`, `/api/events`가 생겼다. 「공개」라는 말로 참이긴 하다. | `llms.txt:44` | 낮음 | 그대로 둠(내부 함수라 공개 API 아님) | — |
| 21 | 랜딩 설명 | 허브·지역·조합 설명은 「기분 하나만 고르세요」 중심이고 「내 위치·바로 길찾기」 목적 문장이 없다. Amendment 2 범위는 홈·검색 결과 문구였다. | `apps/web/scripts/landing.ts:350,410,442` | 낮음 | 그대로 둠(Amendment 2 범위 밖, 랜딩은 동네 단위 페이지라 「내 위치」가 맞지 않음) | — |
| 22 | 개인정보·404·OG·JSON-LD·noscript | 이름·태그라인·설명은 ADR-0077 Amendment 1·2와 일치. 옛 이름은 JSON-LD alternateName에만(의도). 「일정·코스는 짜지 않는다」는 부정문으로만 나옴. | `index.html:7-58,104-108`, `privacy.html`, `404.html:8,38`, `manifest.webmanifest:2-4` | — | 그대로 둠(정합) | — |

## 4. 에이전트·자동화가 읽는 문서

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 23 | docs/seo/README.md | 제목·포지션 문장·브랜드 검색어가 「P의 여행」. 주간 작업이 「먼저 읽을 것」으로 지정한 운영 문서다. ADR-0077 7은 `docs/seo/`를 역사 기록으로 묶었지만 README는 역사가 아니라 운영 입구다. | `docs/seo/README.md:1,3,20,22`, 주간 작업 SKILL.md 「먼저 읽을 것」 | 높음 | 바로 고침 | 포지션 절을 `positioning.md` 한 줄 정의로 바꾸고 브랜드 검색어 `여행귀:제주`. audit-01·keyword-research-01은 그대로 |
| 24 | docs/context.md 머리 | 제목 「Jeju Travel All-in-One」, Mission(8개 앱 대체·도착부터 출발까지)이 현재 제품과 다르다. 머리 배너는 이름을 「P의 여행」(ADR-0059)으로 적는다. CLAUDE.md는 context.md만 권위라고 한다. | `docs/context.md:1,3,5,7-11` | 중간 | 바로 고침 | 배너를 「여행귀:제주(ADR-0077)」로, Mission 위에 「이전 방향 기록」 표시 |
| 25 | docs/context.md 웹 절 | 목적 문장(Amendment 2)이 용어집에 없다. 「카드: 누르면 카카오맵」은 ADR-0071(네이버지도 기본)과 다르다. 오늘 판·비 소식·사용 기록·길찾기 용어가 없다. | `context.md:31-53`(특히 47) | 중간 | 바로 고침 | 목적 한 줄 + 카드 「지도 앱(기본 네이버지도)」 + 오늘 판·비 소식·사용 기록 용어 3개 |
| 26 | CLAUDE.md | 「Jeju Travel All-in-One 프로젝트」. 7단계 Codex 교차 리뷰는 ADR-0058에서 면제(계정에서 실행 불가)됐는데 표에는 그대로. | `CLAUDE.md:5,26`, `0058:33` | 낮음 | 결정 필요 (D6) | 지시 파일이라 사용자 판단 |
| 27 | seo-analyst·positioning | 이름·태그라인·엔티티 문장은 최신. 에이전트 설명의 「P·무계획 여행자의 제주 파트너」는 옛 표현이지만 엔티티 문장이 Amendment 2에서 그대로라 충돌은 아님. | `.claude/agents/seo-analyst.md:3,23-26`, `.claude/skills/seo-geo/references/positioning.md:9-29` | 낮음 | 그대로 둠(포지션 변경은 ADR로만, seo-analyst:177) | — |
| 28 | 주간·일간 작업 프롬프트 | 주소·속성·금지 목록 최신. 일간 작업은 로그를 저장소 밖에 쓴다(주간의 clean 검사와 안 부딪힘). | 두 SKILL.md | — | 그대로 둠(정합) | — |
| 29 | 인수인계 문서 | 「배포 안 함」, 「배포 직전 상태」가 역사 표시 없이 남아 있고 10-03 이후 인수인계가 없다. 새 세션이 최신으로 읽을 위험. | `docs/handoff/2026-10-01-session.md:5`, `docs/handoff/2026-10-02-local-resume.md:3` | 중간 | 바로 고침 | 두 파일 맨 위에 「역사 기록(배포 2026-10-02 완료). 최신은 docs/portfolio/FACTS.md·ADR-0075~0079」 한 줄. ADR-0077 7은 본문 수정 금지라 머리 한 줄만 |
| 30 | plans/specs home-refresh | 「기준선 706」, 「프로젝트 gwichana-jeju」, 「하나 고르면 근처 3곳」, 「여기 근처」. 출하는 끝났다. | `plans/home-refresh.md:28,36`, `specs/home-refresh.md:9,18` | 낮음 | 그대로 둠(출하된 계획의 기록. SPEC이 현재 기준) | 머리에 「완료(ADR-0075·0076 출하)」 한 줄이면 충분 |
| 31 | 옛 specs/plans | `date-mode.md`의 `여기 근처`, `tomorrow-picker.md`의 「P의 여행」, `seo-landing.md`의 「P의 여행」. | `specs/date-mode.md:12`, `specs/tomorrow-picker.md:1,24`, `plans/tomorrow-picker.md:1`, `specs/seo-landing.md:9` | 낮음 | 그대로 둠(역사 기록, 취소선 관례가 이미 있음) | — |
| 32 | 포트폴리오 FACTS | 테스트 797은 현재와 일치(재실행 797). 홈 우선순위 「비 소식 → 노을 → 장날」 중 노을은 미출하(`.scratch/home-refresh/issues/01` ready-for-agent). | `docs/portfolio/FACTS.md:90,214`, `.scratch/home-refresh/issues/01-sunset-view-attribute.md:3` | 낮음 | 바로 고침 | 「노을(예정)」 |
| 33 | 포트폴리오 GUIDE | 「ADR 82개」는 파일 수이고 번호는 75개(중복 포함). 수치 자체는 맞다. | `docs/portfolio/GUIDE.md:36` | 낮음 | 그대로 둠 | 13번 색인이 생기면 「75번(82파일)」 |
| 34 | 루트 README | 「로컬 DB 기동: npm run db:up」 한 줄뿐. 옛 apps/api 시절 안내. | `README.md:1-3` | 낮음 | 바로 고침 | 앱 이름·주소·`apps/web` 시작법 한 단락 |
| 35 | 옛 worktree 복사본 | `.claude/worktrees/` 3개에 옛 SPEC·design이 남아 있다(gitignore). 저장소 전체 grep에 섞여 옛 규칙이 근거로 인용될 수 있다. | `.claude/worktrees/*/apps/web/design/SPEC.md` | 낮음 | 결정 필요 (D6) | 쓰지 않는 worktree면 정리(사용자 확인 뒤) |

## 5. 서로 부딪힐 수 있는 장치

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 36 | 옛 주소의 서비스워커 | 옛 `gwichana-jeju.pages.dev`에 서비스워커가 깔린 기기는 이동 요청을 SW가 받는다. 이동 요청은 redirect 모드가 manual이라 301 응답이 `opaqueredirect`(status 0, ok false)로 오고, `navigate()`는 이를 실패로 보고 **옛 캐시 셸**을 돌려준다. sw.js 갱신 요청도 301이라 SW가 바뀌지 않는다. 그러면 옛 이름·옛 문구 앱이 계속 뜰 수 있다. 10-02 배포본도 같은 코드. **확인 필요(실기기 미검증)**. | `apps/web/sw/sw.js:35-44`(41행), 10-02 배포본 `git show 1f2794a:apps/web/sw/sw.js:41`, `docs/deploy.md:27-35` | 중간 | 결정 필요 (D5) | 아래 D5 |
| 37 | 새 주소의 서비스워커 | 이름·목적 변경은 VERSION 해시가 index.html을 포함해 새 캐시가 되고, 이동은 네트워크 우선 + `update.ts`가 유휴 시 새로고침. 옛 문구가 오래 남을 구조는 아님. | `sw.js:1-6,55-58`, `apps/web/src/update.ts:1-8` | — | 그대로 둠(정합) | — |
| 38 | IndexNow 대량 전송 | 사이트맵 `lastmod`가 페이지별이 아니라 데이터 날짜 하나(`dataDate`)다. 데이터를 한 번 새로 만들면 장소 2,912쪽 전부가 「변경」이 되어 send 한 번에 약 2,930 URL이 나간다(한도 10,000이라 막히지 않음). ADR-0079 4 「바뀐 URL만」의 취지와 다르다. | `apps/web/scripts/build-landing.mjs:84`, `apps/web/scripts/seo/indexnow.mjs:25,73-80`, `0079:34` | 중간 | 결정 필요 (D4) | 아래 D4 |
| 39 | 주간 작업의 clean 검사 | 저장소에 쓰는 것: `analytics:report`(docs/analytics), `seo:crawl`(data/seo/crawl), `rank-naver`(data/seo/rank), `indexnow seed/send`(data/seo/indexnow-state.json), `report`(queue.json) — 모두 추적 파일. 주간 작업 안에서 돌면 커밋되지만, 사람이 주중에 따로 돌리고 커밋하지 않으면 월요일 작업이 멈춘다. `.playwright-mcp/`, `design/qa/shots-*`, `.wrangler/`, `.claude/worktrees/`는 gitignore라 무관. `design/qa/home-refresh/`, `r2-open.json`은 추적 대상이라 QA 세션이 남기면 멈춤. 일간 작업은 저장소 밖에 씀. | `.gitignore`(QA·wrangler 줄), `apps/web/scripts/analytics-report.mjs:90-92`, `scripts/seo/crawl.mjs:91-94`, `rank-naver.mjs:121-128`, `indexnow.mjs:52` | 낮음 | 그대로 둠(멈추고 보고하는 게 의도된 안전장치) | 멈춤이 반복되면 그때 대응 |
| 40 | smoke.sh와 분석 | `POST /api/events`에 일부러 틀린 값을 보내 400을 확인한다(쌓지 않음). health는 GET. curl이라 GA4·네이버 스크립트도 안 돈다. | `apps/web/scripts/smoke.sh:40-47` | — | 그대로 둠(오염 없음) | — |
| 41 | e2e 포트 | e2e 기본 4179, 미리보기 4318(strictPort), 목업 4319. 병렬 세션이 같은 e2e를 돌리면 4179가 부딪힌다. `E2E_PORT`로 바꿀 수 있음. | `apps/web/tests/e2e/browser.e2e.mjs:13`, `.claude/launch.json` | 낮음 | 그대로 둠(환경변수 있음) | — |

## 6. 목적 없는 코드·설정

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 42 | COPY.trackNote | 화면 문구는 index.html에 하드코딩이고 `COPY.trackNote`는 어디서도 안 쓴다(유일한 미사용 키). 16번을 고칠 때 두 곳이 갈라질 수 있다. | `render.ts:61`, `index.html:143` | 낮음 | 바로 고침(16번과 함께) | 한쪽만 남김 |
| 43 | LEGACY_REGION | 4지역 빌드(af3f008, 09-30)가 저장한 값 변환. 첫 배포는 10-02라 실사용자에게는 그런 값이 없을 가능성이 크다. | `apps/web/src/areas.ts:33-38`, `store.ts:134` | 낮음 | 그대로 둠(작고 무해, 지우려면 테스트도 손봄) | — |
| 44 | 서비스워커 캐시 이름 | `tomorrow-` 접두사(「내일 뭐하지」 시절). 바꾸면 옛 캐시 정리 조건도 바꿔야 함. | `sw.js:6,30` | 낮음 | 그대로 둠(사용자에게 안 보임) | — |
| 45 | launch.json design-mockups | proto-d 목업 서버(4319). ADR-0075 출하 뒤에도 specs가 목업을 「동작 참고용」으로 가리킨다. | `.claude/launch.json`, `specs/home-refresh.md:3` | 낮음 | 그대로 둠 | — |
| 46 | BOOKING_LINKS_ENABLED | 이미 코드에 없다(ADR-0074로 정리됨). | grep 결과 0 | — | 그대로 둠(해당 없음) | — |
| 47 | apps/api·apps/mobile | 이전 방향 코드. ADR-0027(mobile-web-frozen-data)이 보존. | `docs/adr/0027-mobile-web-frozen-data.md` | 낮음 | 그대로 둠(ADR 결정) | — |
| 48 | design/shots 42장 | `apps/web/design/shots/proto-*` 추적 중. 목업 시절 스크린숏. | `git ls-files apps/web/design/shots` | 낮음 | 그대로 둠(디자인 기록) | — |

## 7. 옛 사실 (역사 기록 밖)

| # | 영역 | 무엇이 어긋나는가 | 근거(file:line) | 심각도 | 분류 | 제안 |
|---|---|---|---|---|---|---|
| 49 | 테스트 수 | 706은 `plans/home-refresh.md:28`에만(30번), 754는 FACTS 추이 표에만(역사). 현재 797 일치. | `FACTS.md:214-215` | — | 그대로 둠 | — |
| 50 | gwichana 주소 | `docs/deploy.md`(넘기기 절차, 의도), FACTS·GUIDE(301 설명, 의도), `plans/home-refresh.md:36`(30번). 현재 주소로 쓰는 곳 없음. | 위 각 줄 | — | 그대로 둠 | — |
| 51 | 「P의 여행」 | 현재 문서로는 `docs/seo/README.md`(23번), `context.md:3`(24번), 스크립트 주석 `apps/web/scripts/seo/crawl-parse.mjs:3`, `forecast.mjs:5`(「아직 배포 전」 포함). keyword-gate의 K5 예시는 의도된 사례. smoke.sh는 옛 이름 0 검사로 정상. | 각 줄 | 낮음 | 바로 고침(주석 2줄) | — |

## 결정 필요 목록 요약

- **D1 (1~4번)** 홈에서 GPS 기준·위치 없음일 때. (a) 권한이 이미 granted면 홈에서 창 없이 위치를 읽고, 위치가 올 때까지 오늘 판의 장날 줄은 빼고 기분 줄 예시는 「제주 인기: A, B」로 바꿈 (b) 위치 모르면 예시·사진·장날 줄을 아예 안 그림(ADR-0075의 밀도 목표와 충돌) (c) 홈에서 위치를 먼저 물음(SPEC:387·ADR-0075 3 정면 충돌, 첫 화면 팝업). 권고 (a). ADR-0075 Amendment로 남긴다. 아래 「오늘 장 서는 곳」 묶음은 지역 이름을 붙이므로 그대로 둬도 된다.
- **D2 (16번)** 「어디가 좋았는지 익명으로 세어요.」 (a) 「사용 기록을 남겨요(GA4·네이버 포함). 자세히」 + /privacy 링크 (b) 「익명」만 빼고 그대로 (c) 둠. 권고 (a). privacy.html 인용과 COPY 키를 함께 고친다.
- **D3 (7~13번)** 옛 ADR 처리. (a) 옛 ADR Status에 「일부 대체: ADR-xxxx」 한 줄씩 + `docs/adr/README.md` 색인 (b) 색인만 (c) 둠. 권고 (a). 파일 이름 바꾸기는 하지 않는다.
- **D4 (38번)** IndexNow. (a) 장소 페이지 lastmod를 그 장소 데이터가 바뀐 날로 (b) 데이터 갱신 때 send 상한을 두고 나눠 보냄 (c) 데이터 갱신 뒤엔 seed를 다시 하고 보내지 않음. 권고 (a).
- **D5 (36번)** 옛 주소 서비스워커. (a) 옛 프로젝트에 자기 해제하는 sw.js를 리다이렉트 예외로 함께 배포(Cloudflare `_redirects`가 정적 파일보다 먼저인지 확인 필요) (b) 출시 직후라 사용자 적음 → 받아들임 (c) 실기기로 먼저 확인. 권고 (c) 뒤 (a).
- **D6 (26·35번)** 지시 파일·작업 공간. CLAUDE.md 제목 줄·Codex 단계 정리, 안 쓰는 worktree 정리. (a) 고침 (b) 둠. 권고 (a), 사용자 확인 뒤.
- **D7 (19번)** 매니페스트 스플래시 색. (a) `#ffffff` (b) 의도면 둠. 권고 (a).

## 처리 결과 (2026-10-03, 문서 쪽 — 사용자 승인 「다 고침」)

| # | 처리 |
|---|---|
| 7~12 (D3) | 고침. 0029-destination·0058·0061·0063·0068·0025-pivot Status 아래에 대체·보완 한 줄씩(본문·파일 이름 그대로) |
| 13 (D3) | 고침. `docs/adr/README.md` 색인(82파일, 번호·파일·제목·상태·대체) + 0025~0029 중복 설명, 인용은 파일 이름으로 |
| 14 | 고침. measurement.md GA4 행 「도입됨(ADR-0078)」 + 연결 상태 한 줄. `apps/web/data/seo/config.json`의 `ga4` 옛 TODO는 apps/web 범위라 남김 |
| 23 | 고침. docs/seo/README.md 제목·포지션(엔티티 문장)·태그라인·목적·브랜드 검색어 「여행귀:제주」 |
| 24·25 | 고침. context.md 제목·현재 제품 배너(목적 문장)·이전 방향 표시, 웹 절에 목적·오늘 판·비 소식·사용 기록, 카드 → 지도 앱(기본 네이버지도, ADR-0071), 중복 번호 ADR은 파일 이름 |
| 26 (D6) | 고침. CLAUDE.md 제목 줄, 7단계 Codex 대체 규칙(ADR-0058) |
| 29 | 고침. handoff 두 파일 머리에 역사 기록 한 줄 |
| 32·33 | 고침. FACTS 홈 행 노을 「미출하·예정」·이름 줄 문구, ADR 「82개 파일(번호 75개)」(FACTS·GUIDE), GUIDE 소개에 태그라인·목적 |
| 34 | 고침. 루트 README 현재 개요 |
| 35 (D6) | 정리 안 함. worktree 4개 모두 제거 조건 불충족(아래) |
| 6·17·18·42·51 | 이 작업 범위 밖(apps/web, 다른 세션 담당) |

worktree 판단(`git worktree list`): `agent-a7e52127…` 병합됐지만 변경 17건·locked → 둠. `gracious-solomon-5876d3`(1커밋), `happy-burnell-501258`(1커밋), `quirky-cohen-29ca85`(2커밋, 오늘 20:49) 깨끗하지만 master에 없는 커밋이 있음 → 둠. 지우려면 사용자 확인.
