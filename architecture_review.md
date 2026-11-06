# 아키텍처 리뷰 — 여차나:제주 apps/web (워크플로 8단계)

2026-10-15 · 커밋 48d5218 · 점검 기준: `docs/audit/2026-10-15/criteria.md` 5절(제안만, 출시 전에는 코드를 고치지 않는다)

**결론: 이대로 출시해도 된다.** 버그 고치기는 지금도 기능별로 된다. 무거운 건 "새 설정·새 줄을 더하는 기능 추가" 쪽이고, 그 무게는 두 파일(app.ts·render.ts)에 몰려 있다. 출시 뒤 하나씩 덜어 낼 제안 5개를 아래에 순서대로 적었다.

> 이 문서와 `docs/reviews/architecture-review-2026-05.md`는 별개다. 그쪽은 2026-05 옛 방향(apps/api) 리뷰다.

---

## 0. 어떻게 봤나

- 읽은 것: ADR 색인(제목·상태 전부), 구조를 정한 ADR 본문(0027·0058·0086~0089, 나머지는 검색으로 확인), `docs/context.md` 「웹 앱」 절, `apps/web/design/SPEC.md` §11(흐름)·§12(구현 구조), `plans/tomorrow-picker.md` 「구조」 절, `src/`의 TypeScript 26개 파일 전부.
- 잰 것: 저장소의 TypeScript 컴파일러 API로 import 그래프·순환·export 사용처·함수 길이·클로저 변수 사용처를 셌다. git 기록으로는 커밋마다 같이 바뀐 파일을 셌다. 스크립트는 세션 scratchpad `audit-arch/`(analyze.mjs, closure.mjs, cochange.mjs)에 있다. 테스트는 돌리지 않고 개수만 셌다.
- 용어 셋. **깊은 모듈**은 작은 인터페이스 뒤에 많은 동작을 숨긴 모듈이다(반대는 얕은 모듈). **이음매(seam)**는 그 자리를 고치지 않고도 동작을 갈아 끼울 수 있는 곳이다. **국소성**은 기능 하나를 고칠 때 한 곳만 보면 되는 정도를 말한다.

## 1. 이미 정한 것 — 다시 따지지 않는다

| 정한 것 | 출처 |
|---|---|
| Vite + TypeScript, 프레임워크 없음, 런타임 의존성 0 | plans/tomorrow-picker.md 「구조」, SPEC §12 첫 줄 |
| JS+CSS gzip ≤ 50KB, 웹폰트 0 | ADR-0058(KEEP), SPEC §12.3 |
| 상태는 `state.ts`의 순수 `reduce(state, action)`, 그리기는 멱등 `render(state)`, 효과는 결과만 돌려주고 요청 id로 늦은 결과를 버린다 | SPEC §11.1·§11.2·§12 |
| `mountApp(doc, deps)` → `destroy()`, 리스너는 AbortController 하나에 묶는다 | SPEC §12 끝 문단 |
| history 경로 모델(nav.ts), 저장소 키 이름·검증 규칙(store.ts), 세션 복원 | SPEC §11.3·§11.4·§11.5 |
| 고정 데이터(spots.json), 데이터 서버 없음 | ADR-0027, ADR-0058 |
| 로그인 없음, 기기 저장 | 0026-no-login.md, ADR-0063 |
| 손으로 쓴 서비스워커(플러그인 없음) | plans 「구조」, SPEC §12.1 |
| 앱 밖 정적 랜딩(스크립트 없음) | ADR-0072 |
| 분석 셋(GA4·네이버·자체 기록), 이벤트 형식 | ADR-0061·0078·0085·0087·0089 |
| 저장·날짜 흐름은 A 유지, 실제 기록 먼저 | ADR-0086 |
| 랜딩 재질 개편은 다음 단계 | ADR-0088 Consequences |

아래 제안은 모두 이 틀 **안쪽**의 구현 배치만 다룬다.

## 2. 기능 → 파일 지도

"파일 수"는 src/와 index.html 기준이다. "실제 커밋"은 그 기능을 넣은 커밋이 건드린 파일 수다.

| 기능 | 흔한 변경 → 손대는 곳 | 실제 커밋 | 지켜 주는 테스트 |
|---|---|---|---|
| 기분·카드 고르기 | 정렬·후보 규칙은 pick.ts `pool`·`candidates`·`byRank` **1파일**. 새 거르기 조건은 pick `pickCards`·`pool` 인자, state `cardsValid`·`resolveCards`·`sessionOf`·`restore`, store 세션·키, app 설정 함수, render 시트 줄·메타, home `moodExamples`, track `contextOf`, keep 백업 표시까지 **6~8파일** | a672db6 실내만 7 · 1b5595f 새로운 거 탭 8 · bf67177 얼마나 6 | pick.test 36 · state.test 34 · app.test S3·S8-1 · scenarios 「얼마나」「새로운 거」「비 와요」 · visited-pick 9 |
| 다른 3곳 보기(회전) | 문구는 render `COPY` 1. 규칙은 pick `rotate`·`remember`(+state `resolveCards`) **1~2** | 기능 커밋 없음(고침만) | pick.test 회전 · scenarios 「다시 고르기」「QA 다른 3곳 보기」 · e2e |
| 저장(하트)·저장 목록·정리·날짜 모드 | 줄 모양·문구는 render `savedRowEl`·`savedListNodes` 1. 정리 동작은 store `moveSaved`·`moveToDay` + app `moveRow`·`moveTo` + render **3**. 흐름 자체를 바꾸면 store·state(`savedDays`·`heldDay`·`unsaved`)·app·render·dates·nav **6~8** | 7205e7f 날짜 모드 8 · 61677a1 「담아 둠」 3 | store.test 35 · state.test · app.test S8-3·S8-4 · scenarios 「하트」「날짜 모드」「뒤로가기와 저장 목록」 · heuristic-audit-01 |
| 뺀 곳(가 봤어요, ADR-0087) | 빼는 범위는 state `pickSpots` **1**(한 배열에서 거름, 잘 된 예). 버튼·목록 문구는 render 1~2. 처음 넣을 때는 store·state·app·render·track·index.html·style.css **7** + events/validate | V1~V5 f4a60c0·a0437ab·dbaaf7f·5cd9b15·91f5475(각 2~5) | visited-store 14 · visited-pick 9 · visited-app 13 · track 「가 봤어요」 |
| 기준 시트·숙소·지역·얼마나 | 시트 문구·순서는 render `buildSheet` 1. 동작은 state `staticOrigin`·`basisIsCurrent` + app `changeBasis`·`changeReach`·`stayHere`·`onSheetButton` + render **3**. 새 선택지는 + store·effects·areas **5~6** | 80dc252 SPEC 3판 화면 7 · bf67177 얼마나 6 | scenarios 「위치」「숙소」「기준과 출발지」 · app.test S8-2 · state.test · store.test |
| 오늘 판(장날·노을·비 소식)과 철 | 판정 규칙은 home `openMarkets`·`sunsetSpots`·`todayActs`, sun·market·season **1**. 줄 문구는 render `renderHome`·`*Row` 1. 새 줄(예: 행사 2단계)은 home·state(`rain`·`clock`)·app(`askRain`·`duskTimer`·`tick`)·render·effects·store·data·pick **8~9** + functions | 9a276c8 비 소식 8 · ef79833 노을 9 · c50c9a4 장날 5 · 826c716 철 5 | home 13 · market 9 · season 8 · season-data 14 · sunset-app 17 · sunset-data 12 · sunset-geo 12 · rain-app 15 · rain-fn 11 · scenarios 「오일장」「철」 |
| 딥링크·숙소 링크 | 키 하나 더하기는 deeplink `readDeepLink` + app `applyDeepLink`(+store) **2~3**. 출처 세기는 track + events/validate `SRC_ID` + app `countSrc` 3 | a84a9c5 딥링크 6 · 8ebc596 숙소 링크 6 | drive-agents D4·D5 · partner-stay-link 12 |
| 링크로 백업 | 형식은 keep `encodeBackup`·`decodeBackup` **1**. 안내는 render `renderKeep` 1. 합치기는 store `mergeEntries` + app `mergeBackup` 2 | 7b3656e 8(인앱·홈 화면 안내 포함) | keep 13 · keep-app 16 · e2e K |
| 설문·의견 보내기 | 질문 하나 더하기는 render `COPY`·`feedbackForm` + survey `PAINS` + events/feedback.ts **3**. app `sendFeedback`이 폼을 DOM에서 직접 읽는다(app.ts:316–318) | 2602c96 **11** | survey 12 · feedback 11 · feedback-report 5 |
| 사용 기록·분석 | 이벤트·필드 하나는 track + events/validate + app `count` 호출부(+analytics `GA_NAME`) **3~4** | fed8f82 9 · 5827066 6 · c7b64de 4 | track 22 · analytics 14 · analytics-env 5 · analytics-report 6 · events 15 |
| 서비스워커·갱신 | sw/sw.js·scripts/sw-build.ts·update.ts·main.ts 중 **1~2** | 9b9eba3 2 | sw 23 · deploy 13 · e2e S22·S23 |
| 랜딩 페이지 빌드 | scripts/landing.ts(678줄)·build-landing.mjs·src/landing.css **1~2**(src의 areas·links·pick·data·logo를 가져다 씀) | 43df57b·1f2794a(src 1~2) | landing 17 · seo-* 56 · e2e LP |
| 시각 토큰·로고 | 앱 색 하나는 style.css `:root` **1**. 모든 쪽에 같이 하려면 landing.css·public/404.html·privacy.html까지 **4**(랜딩 값은 일부러 다름, ADR-0088) | 8f38319 2 · cc3173e 4 · 161abf4 4 | contrast 6 · slop 9 · logo 4 · e2e VR |

읽는 법: 규칙(순수 로직)만 고치는 일은 1~2파일로 끝난다. 화면에 **새 설정**이나 **새 줄**이 생기면 5~11파일이 된다(이런 기능 커밋 15개의 중앙값 8, 목록은 3.3). 그 15개 중 13개가 app.ts와 render.ts를 둘 다 건드렸다.

## 3. 무거운 곳

### 3.1 큰 파일·함수

| 파일 | 줄 | 수치 |
|---|---|---|
| render.ts | 1,548 | `createRenderer`(449–1548) 하나가 1,100줄이다. 안쪽 함수 56개, 클로저 변수 27개(`let` 25 + Map/Set 2), `COPY` 키 143개(18–189). 다른 src 모듈 24개 중 12개를 import하고 ADR 21개를 언급한다 |
| app.ts | 1,182 | `mountApp`(96–1182) 하나가 1,087줄이다. 안쪽 함수 103개(이름 있는 것 71개), 클로저 변수 22개(`let` 19 + Map/Set 3). 다른 src 모듈 24개 중 **19개**를 import하고 ADR 18개를 언급한다. `onMainButton`(856–929) `if` 32개, `onSheetButton`(828–854) `if` 15개, `dispatch(` 77번, `store.set*` 19번 |
| state.ts | 667 | `Action` 40종 = `case` 40개, `step` 150줄(508–657), `State` 필드 45개, `initialState` 66줄 |
| store.ts | 546 | `createStore` 207줄, `Store` 인터페이스 멤버 31개, 저장 키 18개 |
| pick.ts | 298 | `pickCards` 위치 인자 8개(265), `pool` 7개(216) |
| nav.ts | 200 | `createNav` 145줄. 복잡하지만 깊은 모듈이다(nav.test 16) |

80줄 넘는 함수는 5개다: createRenderer 1,100 · mountApp 1,087 · createStore 207 · step 150 · createNav 145. 모두 클로저 공장이거나 reducer의 switch다. **그 안쪽 함수 중 80줄을 넘는 것은 없다**(가장 긴 것: onMainButton 74, render 70, cardEl 64, renderHome 62). 그러니 문제는 함수 길이보다 **스코프 크기**다. 한 함수를 고치려면 같은 스코프에 사는 변수 22~27개가 다 눈에 들어온다.

### 3.2 결합·상태·중복

- **순환 의존 0.** 타입 import까지 포함해 src 모듈 사이에 고리가 없다.
- **공유 가변 상태는 클로저 두 곳에만 있다.** 모듈 수준 `let`은 0개다(state.ts의 WeakMap 캐시 2개는 배열 identity를 키로 써서 안전하다). 그리고 클로저 변수는 이미 기능별로 나뉘어 있다(closure.mjs).
  - render.ts의 27개는 **모두 한 구역 안에서만** 쓰인다. 구역을 넘나드는 클로저 변수가 하나도 없다. 결과(`resultsSig`·`resultsShowing`·`bar`·`io`), 저장 목록(`savedSig`·`savedShowing`·`rowNodes`), 시트(`sheetSig`·`prevOverlay`·`opener`·`closeTimer`·`timers`), 뺀 곳(`visitedSig`), 안내(`noteSig`·`nudgeSig`), 홈(`homeSig`·`homeSpots`·`homeVisited`·`todayText`·`homeDated`), 설문(`surveyEl`), 틀(`announceSeq`·`revealedSeq`·`lastStatus`·`shownView`·`scrollBeforeSaved`·`patchedBroken`)이다.
  - app.ts의 22개 중 여러 기능이 같이 쓰는 것은 `state`(47개 함수가 씀)·`timers`·`srcTag`(사용 기록과 딥링크) 셋뿐이다. 나머지는 한 기능 안에서만 쓰인다. 비 소식(`rainAsked`·`rainBusy`), 노을(`duskKey`·`duskAt`), 사용 기록(`shownSeq`·`lastLink`), 설문(`mapMarked`·`surveyCounted`), 백업·홈 화면(`installSeen`·`persistAsked`·`installPrompt`), 요청(`reqSeq`·`reqTimers`), 연타 막기(`lastTap`·`quietUntil`)가 그렇다.
  - 즉 경계는 이미 있는데 파일이 그 경계를 드러내지 않는다. 그래서 나누는 위험이 낮다.
- **기능 훅이 손으로 묶여 있다.** `dispatch`(app.ts:169–177)는 매 동작마다 설문 세기·노출 세기·비 소식·노을 타이머 4개를 직접 부른다. 이 줄은 기능이 늘 때마다 길어진다.
- **render ↔ app 사이 숨은 결합이 있다.**
  - `data-action` 이름 36개를 render.ts와 index.html이 만들고 app.ts가 34개를 읽는다(`day-input`·`inapp-open` 2개는 표시용). 타입 검사가 없어서 이름이 어긋나면 버튼이 조용히 아무 일도 안 한다. 지금은 테스트가 DOM을 직접 눌러서 잡힌다.
  - app.ts가 시트 DOM을 직접 만진다. 날짜 칸 열기(779–795, 클래스 `sr`→`date-in`), 의견 폼 읽기(316–318, 이름 `fb-went`·`fb-pain`·`fb-pain-text`·`fb-wish`는 render.ts:1257–1277이 만든다), Esc·Tab 처리(1011–1032)가 그렇다.
- **중복**
  - 사용 기록 어휘가 두 벌이다. 앱 쪽 track.ts:12 `EventName`·20–51 `UsageEvent`와 수집기 쪽 events/validate.ts:13 `EVENTS`·15 `NO_PLACE`·18–24 `MOODS`·`RANGES`·`BASES`·`FIELDS`. 지금은 맞는다(10개·16필드). 그런데 ADR-0085·0087·0089가 매번 두 곳을 따로 고쳤다. 앱이 실제로 보낸 묶음을 수집기 검사에 넣어 보는 테스트는 숙소 링크 하나뿐이다(partner-stay-link.test.ts:117).
  - 설정 쓰기가 두 벌이다. `applyDeepLink`(app.ts:503–531, 저장소 쓰기 7번)가 `changeBasis`(673–682)·`changeReach`(686–692)·`setIndoor`(694–697)·`setWhen`(769–774)이 하는 일을 다시 한다.
  - 기분 목록이 src와 수집기에 5벌 있다(app.ts:88, store.ts:50, deeplink.ts:22, data.ts:7, events/validate.ts:18). 기분 이름은 3벌이다(render.ts:199 `MOOD_LABEL`, index.html:99·113, scripts/landing.ts:28 `MOOD_NAME`).
  - 색 토큰이 4벌 있다(style.css, landing.css, public/404.html, privacy.html). 랜딩 값이 다른 것은 ADR-0088에서 정한 대로다.
  - 이유 문장 정리가 두 벌이다(data.ts:14 `cleanReason` ↔ scripts/reason.mjs:6 `shipReason`). 의도된 것이고 data.test가 둘 다 묶는다.
- **안 쓰는 코드:** 진짜 죽은 것은 2개다. `isCardSafe`(card-text.ts:13, 어디서도 안 씀)와 `LocateFailure` 재export(app.ts:25). export했지만 밖에서 안 쓰는 이름 40개는 대부분 타입이거나 안에서 쓰는 것이라 지울 가치가 낮다. 테스트만 쓰는 export 31개(`parse*` 등)는 일부러 낸 내부 이음매다.

### 3.3 git 기록이 말하는 것 (9/29 이후, src/·index.html을 건드린 커밋 80개)

- 기능 커밋(feat) 45개: 파일 수 중앙값 4, 평균 4.7, 최대 16. app.ts가 56%, render.ts가 58%, 둘 다 42%에 들어 있다.
- 고침 커밋(fix·perf·refactor·revert) 30개: **20개(67%)가 1~2파일**이다. 고치기는 이미 국소적이다.
- 새 설정·새 줄을 더한 기능 커밋 15개: 5~11파일, 중앙값 8. 13개가 app.ts와 render.ts를 둘 다 건드렸다. 목록은 a672db6 실내만 7 · 1b5595f 새로운 거 탭 8 · bf67177 얼마나 6 · 0755756 지도 앱 8 · 7205e7f 날짜 모드 8 · fed8f82 사용 기록 9 · 7b3656e 백업·안내 8 · a84a9c5 길찾기·딥링크 6 · 8ebc596 숙소 링크 6(render 없음) · 6f4172f 홈 A′ 7 · 9a276c8 비 소식 8 · ef79833 노을 9 · c50c9a4 장날 5(app 없음) · 826c716 철 5 · 2602c96 설문 11.
- 가장 자주 같이 바뀐 쌍은 app.ts + render.ts(24번), 다음이 render.ts + style.css(22번)다.

### 3.4 테스트 ↔ 기능

- vitest 46파일에 `it` 836개, e2e 확인 75개(정적으로 셈).
- 기능 이름이 붙은 파일이 대부분이다: visited-* 3, rain-* 2, sunset-* 3, season* 2, market, keep* 2, survey, feedback* 2, partner-stay-link, track, analytics* 3, events, nav, sw, landing, logo, contrast, home, drive-agents, booking, deploy, seo-* 4.
- 섞여 있는 큰 파일: scenarios.test.ts(2,447줄, 133개, 기능별 describe 27개), app.test.ts(964줄, 49개), e2e(3,306줄, 구획 27개). describe 이름으로 찾을 수 있어서 쓰는 데 문제는 없다.
- **안전망:** 앱을 실제 index.html에 올려 DOM을 누르는 파일이 13개이고 약 360개 테스트가 들어 있다(scenarios·app·drive-agents·track·sunset-app·keep-app·rain-app·analytics·home·visited-app·partner-stay-link·survey·visited-pick). 이 테스트들은 `mountApp(doc, deps)`라는 바깥 이음매만 건드린다. 그래서 아래 제안 1~3처럼 안쪽 배치를 바꿔도 테스트를 고칠 일이 거의 없다.

## 4. 제안 (순위: 기능별 고치기에 주는 이득 ÷ 위험·비용)

| 순위 | 제안 | 이득 | 비용 | 위험 | ADR |
|---|---|---|---|---|---|
| 1 | 사용 기록 어휘를 한 곳에 + 계약 테스트 | 중 | S | 매우 낮음 | 불필요 |
| 2 | render.ts: 바깥 `render(state)` 그대로, 안을 화면 구역 모듈로 + copy.ts | 상 | M | 낮음 | 새 ADR |
| 3 | app.ts: 기능 컨트롤러 4개를 밖으로 + 버튼 이름 한 목록 | 상 | M | 낮음~중간 | 새 ADR |
| 4 | 고르기 조건을 한 값으로(2단계) | 중 | 1단계 S~M | 중간 | 새 ADR |
| 5 | 기기에 남는 설정을 한 모듈이 읽고 쓴다 | 중 | M | 중간 | 새 ADR |
| 보류 | 저장 목록을 깊은 모듈 하나로 | (흐름 B 때) 상 | L | 높음 | ADR-0086 재실험 뒤 |

모두 출시 뒤에 한 번에 하나씩 한다. 매 단계마다 전체 테스트를 돌리고 커밋한다. 인터페이스는 초안이다. 고르면 이 스킬의 다음 단계(grilling, 인터페이스를 세 가지로 그려 비교하기)에서 확정한다.

### 제안 1 — 사용 기록 어휘를 한 곳에 (track.ts가 출처, 수집기가 가져다 씀)

- **문제:** 3.2의 두 벌 어휘. 어긋나면 수집기는 그 묶음을 통째로 400으로 거부한다(validate.ts:2 "refused whole"). 앱은 sendBeacon이라 거부를 알 수 없고 다시 보내지도 않는다(track.ts:129). 그러면 한 묶음(최대 20건)이 조용히 사라진다. 최근 기능 ADR 다섯 중 셋(0085·0087·0089)이 이 어휘를 바꿨다.
- **해법:** track.ts가 런타임 목록을 내보낸다(`EVENT_NAMES`, `PLACELESS_EVENTS`, `RANGES`, `BASIS_KINDS`, `ARRANGE_OPS`, `USAGE_FIELDS`). 타입은 그 목록에서 뽑는다. validate.ts는 이미 src에서 `AREAS`·`isDay`·`SEASON_KINDS`를 가져오듯 이것도 가져온다. 모르는 값을 거부하는 엄격함은 그대로 둔다. 계약 테스트를 하나 더한다. track·partner-stay-link 테스트가 잡은 beacon 묶음을 전부 `parseBatch`에 넣으면 ok여야 한다.
- **인터페이스 초안:** `export const EVENT_NAMES = ['tap', …, 'unvisited'] as const; export type EventName = (typeof EVENT_NAMES)[number];`
- **지켜 주는 테스트:** events 15 · track 22 · partner-stay-link 12 · analytics 14.
- **크기:** S. 30~40줄과 테스트 하나, 반나절.
- **ADR:** 필요 없다(ADR-0061의 형식은 그대로). `specs/usage-events.md`에 "어휘의 출처는 src/track.ts" 한 줄만 더한다.
- **이득:** 이벤트·필드를 더할 때 고칠 곳이 두 곳에서 한 곳으로 준다. 어긋나면 테스트가 깨진다.

### 제안 2 — render.ts: 바깥은 그대로, 안을 화면 구역 모듈로

- **문제:** 3.1·3.2. 기능 커밋의 58%가 1,548줄짜리 한 클로저를 연다. 그런데 클로저 변수 27개는 모두 이미 한 구역 안에서만 쓰인다.
- **해법(무엇을 어디로):**
  - `src/copy.ts`: `COPY`(143개 키), `MOOD_LABEL`, `josa`, `splitName`, `dayName`, `dateLabel`, `basisLabel`, `heldText`, `homeCopy`, `visitText`, `statusOf`, `howOf`(약 270줄, DOM 없음). scripts/landing.ts의 `MOOD_NAME` 사본도 여기서 가져올 수 있다.
  - `src/render-home.ts`: `renderHome`·`todayRow`·`sunsetRow`·`rainRow`·`marketSection`·`sunsetSection`·`areasSection`·`homeSigOf`·`renderSurvey`·`setDate`(약 200줄).
  - `src/render-sheet.ts`: `renderSheet`·`buildSheet`·`patchSheet`·`focusSheet`·`feedbackForm`·`pickDay`·`sheetSigOf`(약 250줄). 지금 app.ts에 있는 시트 DOM 동작(날짜 칸 열기 779–795, 의견 폼 읽기 316–318, Tab 가두기 1019–1031)도 여기로 온다.
  - `src/render-saved.ts`: `renderSaved`·`savedListNodes`·`savedRowEl`·`savedListSig`·`refocus`·`renderVisited`·`renderKeep`(약 220줄).
  - render.ts에 남는 것: `findEls`·`Els`, 결과와 저장 목록이 같이 쓰는 카드 그리기(`cardEl`·`metaEl`·`setGo`·`setPlace`·`visitedEl`·`photoEl`·`setHeld`), `renderResults`·`moreBar`·`notice`·`areaGroups`·`option`, `patchCards`, 틀(`render`·`viewChanged`·`reveal`·`focusView`)(약 650줄).
- **인터페이스:** 바깥 `createRenderer(doc, els) → { render(s), setDate(text), dispose() }`는 그대로다. 안쪽 구역은 `createXxx(ctx) → { render(s: State): void; dispose?(): void }`이고 `ctx = { doc, els, win, later }`다. 시트 모듈만 `readFeedback(): FeedbackForm`, `openDayField(button)`, `trapTab(e)`를 더 내놓는다. 그래서 app.ts는 시트 DOM을 몰라도 된다.
- **지켜 주는 테스트:** 3.4의 앱 마운트 테스트 약 360개와 e2e 75개. render 안쪽을 직접 가져오는 테스트는 5파일뿐(`splitName` 4, `heldText`·`homeCopy` 1)이고 import 경로만 바뀐다. 테스트도 좋아진다. copy.ts는 DOM이 없어서 문구 규칙(조사, 「담아 둠」, 상태 줄)을 jsdom 없이 state.test처럼 시험할 수 있다.
- **크기:** M. 약 1,000줄을 옮기고 로직 변경은 0을 목표로 한다. 한 구역씩 옮길 때마다 전체 테스트를 돌린다.
- **위험:** 낮음. 지킬 것은 하나다. 그리는 순서(render.ts:1519–1532: 결과 → 저장 목록 → 뺀 곳 → 패치 → 홈 → 설문 → 안내 → 시트 → 알림 → 화면 전환 → 드러내기)를 그대로 둔다. 포커스와 스크롤이 이 순서에 기댄다.
- **ADR:** 새 ADR이 필요하다. 「그리기 구현을 화면 구역 모듈로 나눈다. render(state) 하나·멱등·노드 재사용(SPEC §11.1·§12)은 그대로」. SPEC §12 표도 같이 고친다.
- **이득:** 오늘 판 줄 하나를 고칠 때 1,548줄 대신 200줄 파일 하나를 본다. 문구 고침은 copy.ts 하나로 끝난다. Claude 같은 에이전트가 기능 하나를 고칠 때 읽는 양도 같은 비율로 준다.

### 제안 3 — app.ts: 기능 컨트롤러 4개를 밖으로, 버튼 이름은 한 목록으로

- **문제:** 3.1·3.2. 버튼이 하나 늘 때마다 `onMainButton`·`onSheetButton`의 `if` 사슬(32 + 15개)에 한 줄이 붙는다. 반응하는 기능이 하나 늘 때마다 `dispatch`에 훅이 한 줄 붙는다. 사용 기록 함수 `count(e, id?, day?, season?, flow?)`(248)는 `count('open', undefined, undefined, null, {...})`(624)처럼 빈자리를 채워 가며 불린다. 인터페이스가 쓰는 쪽이 아니라 구현 모양을 따라간 흔적이다.
- **해법:**
  - `src/today.ts`(오늘 판 컨트롤러): `askRain` + `duskTimer`·`duskPhase` + `tick`의 노을 부분 + `locateHome`. `createToday(ctx) → { afterDispatch(): void; onVisible(): void; onTick(now: Date): void }`.
  - `src/usage.ts`(사용 기록 컨트롤러): `createUsage({ getState, tracker, analytics, now, guardMs }) → { tap(); shown(); map(id, row?); book(id); save(id, day, added); open(); arrange(op); visit(id, on); arrived(tag) }`. 어느 이벤트가 GA4로도 가고 어느 것이 우리 수집기로만 가는지(ADR-0078·0087·0089)를 이 모듈 하나가 안다. 지금은 app.ts의 `count`·`countSrc`·`countVisit`와 analytics.ts의 `GA_NAME`에 나뉘어 있다.
  - survey.ts에 `createSurvey(ctx)`(markMap·countSurvey·open·send)를, keep.ts에 `createKeep(ctx)`(takeBackup·mergeBackup·backup·inappCopy·install·askPersist와 hashchange·beforeinstallprompt·appinstalled 리스너)를 둔다.
  - `src/actions.ts`: `data-action` 이름 36개를 `as const` 목록으로 둔다. render 쪽은 이 상수로 버튼을 만들고, app 쪽은 `Record<Act, 처리기>` 표로 받는다. KEEP_ACTIONS(564–575)가 이미 이 모양이다. 기능 컨트롤러는 자기 버튼 처리기를 표에 보탠다. index.html의 정적 버튼 이름은 테스트 한 줄로 목록과 대조한다. 기분 목록 5벌도 이때 pick.ts의 `BUTTONS` 하나로 모은다.
  - `dispatch`는 등록된 `afterDispatch`들을 차례로 돈다.
- **인터페이스:** 바깥 `mountApp(doc, deps) → { destroy, state }`는 그대로다(SPEC §12, 테스트 harness가 기댐).
- **지켜 주는 테스트:** track 22(「정확히 한 번씩」), analytics 14, rain-app 15, sunset-app 17, survey 12, keep-app 16, partner-stay-link 12, scenarios 133(연타·겹친 요청·수명주기), app 49, e2e. 테스트도 좋아진다. 비 소식 재요청·노을 타이머를 앱 전체를 올리지 않고 가짜 시계·가짜 fetch로 시험할 수 있다.
- **크기:** M. mountApp이 1,087줄에서 약 650줄로 준다. 약 450줄을 옮기고, 버튼 라우팅 약 100줄은 다시 쓴다.
- **위험:** 낮음~중간. 지킬 것이 셋 있다. (1) dispatch 뒤 순서: 그리기 → 설문 → 노출 → 비 → 노을. (2) 노을 타이머의 재진입(duskTimer → dispatch → duskTimer를 duskKey가 막는다). (3) `hush`·`guarded`는 기능마다 따로 두지 않고 하나로 둔다. 연타 창은 화면 전체가 같이 쓴다.
- **ADR:** 새 ADR이 필요하다. 「컨트롤러를 기능 모듈로, 버튼 이름은 한 목록. 상태·그리기·효과 흐름(SPEC §11·§12)과 mountApp(doc, deps)는 그대로」. SPEC §12 표에 app.ts 줄도 새로 넣는다(지금은 없다).

### 제안 4 — 고르기 조건을 한 값으로 (2단계)

- **문제:** 카드를 고르는 조건(기준점·기분·탭·얼마나·실내만·날짜)이 위치 인자와 필드로 흩어져 있다. 실내만(ADR-0065)을 넣을 때 state.ts에서 `originIndoor`(83)·`Shown.indoor`(31)·`cardsValid`(292)·회전 초기화(424)·되살리기(652)·세션 기록(665) 등 열 몇 줄이 같이 늘었다. home.ts:22와 store.ts:185도 함께 늘었다. 어느 조건이 회전을 처음부터 다시 하게 하는지(지금은 기준·얼마나·실내만이고 날짜는 아님)도 state.ts 292·424와 app.ts 769–774(언제를 바꾸면 요청 없음)에 나뉘어 있다. 게다가 app.ts:767–768 주석(「cards do not depend on the day」)은 장날·철(ADR-0066·0080) 이후로 맞지 않는다. pick.ts:196–197·221은 날짜로 거르고 정렬한다. 지금 동작은 SPEC §11.2(언제 → 요청 없음)와 맞지만, 그 이유가 코드 어디에도 한 줄로 적혀 있지 않다.
- **해법:**
  - 1단계: state.ts에 `PickConditions { originKey, point, isPoint, button, tab, reach, indoor, day }`, `conditionsOf(s, origin)`, `sameRotation(a, b)`를 둔다. 날짜를 회전 조건에서 빼는 규칙은 `sameRotation` 한 곳에 적는다. `originReach`·`originIndoor`·`Shown.reach/indoor`는 `rotation: PickConditions` 하나로 바꾼다. home.ts의 `moodExamples`도 `conditionsOf`를 쓴다. `pickCards` 시그니처는 그대로 둔다(테스트 호출 90곳 보존).
  - 2단계(선택): `pickCards(spots, cond, histories)`로 바꾸고 테스트 호출 90곳(pick.test만 57곳)을 기계적으로 고친다.
- **지켜 주는 테스트:** state.test 34, pick.test 36, visited-pick 9, store.test 세션(`reach`·`indoor` 없는 옛 기록 읽기), scenarios 「얼마나」「비 와요」「새로고침·인앱 브라우저」「QA 2026-09-30 — 새로고침·뒤로가기 정합성」. `sameRotation`은 따로 단위 테스트할 수 있다.
- **크기:** 1단계 S~M(약 80줄, state·home·store). 2단계 M.
- **위험:** 중간. 세션 기록 호환(SPEC §11.5)을 지켜야 하고 회전의 의미가 바뀌면 안 된다.
- **ADR:** 새 ADR이 필요하다(SPEC §11.1의 `originReach`·`originIndoor` 필드 정의를 바꾼다).
- **이득:** 다음 거르기 조건이 생기면 state.ts 열 몇 곳 대신 `PickConditions` 필드 하나와 pick.ts만 고친다.

### 제안 5 — 기기에 남는 설정을 한 모듈이 읽고 쓴다

- **문제:** 기준·숙소·지역·얼마나·실내만·언제·지도 앱·기록, 이렇게 8개 설정이 각자 따로 산다. state 액션(`basis`·`reach`·`indoor`·`when`·`mapApp`·`tracking`), store 세터·파서, app 설정 함수(dispatch 한 번 + store.setX 한 번)가 설정마다 하나씩 있다. app.ts의 `store.set*` 19번 중 7번은 `applyDeepLink` 안에서 다른 설정 함수가 하는 일을 다시 한다. 다른 탭 반영도 지도 앱·기록만 따로 처리한다(1034–1049). 그래서 새 설정 하나에 6~8파일이 든다(bf67177 얼마나 6 · a672db6 실내만 7 · 0755756 지도 앱 8).
- **해법:** `src/settings.ts`가 `Settings` 값을 두고, 키마다 읽기·검증·쓰기를 맡는다(local/session 구분, SPEC §11.4 키 이름 그대로). 어느 설정이 다른 탭을 따라가는지(지도 앱·기록은 따라가고, 기준·숙소·지역은 따라가지 않음, SPEC §11.4)도 여기 적는다. 딥링크·백업 링크가 내는 `Partial<Settings>`도 같은 길로 적용한다. reducer는 `{ type: 'settings', patch }` 하나로 받는다. 숙소를 GPS로 정하면 `lastFail`을 지우는 규칙 같은 것은 그 case 안에 둔다.
- **인터페이스 초안:** `createSettings(store) → { read(today): Settings; apply(patch): { next: Settings; changed: (keyof Settings)[] }; fromStorageEvent(key): Partial<Settings> | null }`. 컨트롤러 규칙은 하나다. 바뀐 것이 고르기 조건이면(제안 4의 `sameRotation`) 결과 화면을 다시 뽑는다.
- **지켜 주는 테스트:** store.test 35, scenarios 「기준과 출발지」「숙소」「날짜 모드」「얼마나」「비 와요」, drive-agents D5, partner-stay-link, keep-app, track U3(다른 탭의 기록 끄기), app.test S8-2. `apply`는 가짜 Storage로 단위 테스트할 수 있다.
- **크기:** M(약 200줄, store·state·app·deeplink·keep).
- **위험:** 중간. 사용자 기기에 이미 있는 값을 다루는 자리다. 키 이름과 검증은 바꾸지 않는다.
- **ADR:** 새 ADR이 필요하다. 「설정은 한 모듈이 읽고 쓴다. 키·검증(SPEC §11.4)은 그대로」.

### 보류 — 저장 목록을 깊은 모듈 하나로

저장 목록 지식이 다섯 곳에 나뉘어 있다. store.ts(정규화·토글·옮기기·합치기), state.ts(`savedDays`·`heldDay`·`unsaved` 유령 줄), app.ts(`onHeart`·정리), render.ts(줄 그리기·포커스 되돌리기), keep.ts(백업 형식)다. 흐름 B를 다시 다루면 이 다섯 곳을 같이 고치게 된다. 하지만 ADR-0086이 "실제 기록 먼저, 흐름은 새 실험으로"라고 정했다. 그리고 이 자리는 「막음」(저장한 것을 잃음) 위험이 가장 큰 곳이다. 그래서 재실험 결론이 나올 때 그 작업과 함께 한다. 지금은 손대지 않는다.

## 5. 바꾸지 말 것과 이유

| 바꾸지 말 것 | 이유 |
|---|---|
| 프레임워크 도입(React·Preact·lit 등) | plans 「구조」와 SPEC §12가 정했다. gzip 50KB 예산(ADR-0058)도 먹는다. 위 제안은 모두 프레임워크 없이 된다 |
| 상태 흐름(순수 reduce → render(state) → 결과만 돌려주는 효과) | SPEC §11·§12. DOM 없는 state.test 34개가 이 흐름 위에 있다 |
| reducer를 조각 reducer 여럿으로 쪼개기 | `case` 40개가 평균 3~4줄로 짧다. `enterView`·`CLEARS_HINT` 같은 공통 규칙은 switch 하나여야 지켜진다 |
| 저장소 키 이름·검증, 옛 키 `jeju.saved` 처리 | 사용자 기기에 이미 있는 값이다(SPEC §11.4: 옛 키는 쓰지도 지우지도 않는다) |
| nav.ts 경로 모델 | 145줄로 길지만 깊은 모듈이다(SPEC §11.3, nav.test 16). 고칠 자리가 아니다 |
| 이미 깊고 순수한 모듈(pick·home·sun·market·season·links·keep·deeplink·data·track·analytics·update·nav) | 더 쪼개면 얕은 파일만 는다 |
| index.html의 정적 기분 버튼과 앞선 탭 스크립트 | JS 전에 보이고 눌려야 한다(plans 「구조」, f873468) |
| 고정 데이터·로그인 없음·손으로 쓴 SW·정적 랜딩·분석 셋 | §1 표의 ADR들 |
| 저장·날짜 흐름 | ADR-0086(위 「보류」) |
| 랜딩 토큰을 앱 토큰에 맞추기 | ADR-0088: 랜딩 재질은 다음 단계에 한다 |
| 테스트 파일 재배치(scenarios 2,447줄, e2e 3,306줄) | describe·구획이 기능별이라 찾을 수 있다. 옮기면 git blame만 흐려진다 |

## 6. 판정

코드를 유지보수하는 쪽에서 보면 이대로 출시해도 된다. 고침 커밋 30개 중 20개가 1~2파일이었다. 순환 의존은 없다. 고르기·오늘 판·백업·딥링크 같은 규칙은 각자 작은 순수 모듈과 단위 테스트를 갖고 있다. 버그를 기능별로 고치는 데 구조가 막는 곳은 없다. 무게가 있는 곳은 새 설정이나 새 줄을 더하는 기능 추가다. 기능 커밋 45개의 중앙값이 4파일이고, 새 설정·새 줄을 더한 커밋 15개는 중앙값 8파일이었다. 그 중심에는 늘 1,100줄 클로저 두 개(app.ts·render.ts)가 있다. 이건 정확성 위험이 아니라 속도 비용이다. 앱을 실제 index.html에 올려 DOM을 누르는 테스트 약 360개와 e2e 75개가 바깥 이음매만 건드리므로, 출시 뒤 안쪽 배치를 바꾸는 일은 이 안전망 위에서 할 수 있다. 출시 전에는 아무것도 고치지 않는다(criteria 5절). 출시 뒤에는 제안 1(반나절, 조용한 기록 유실 구멍을 막음)부터 하고, 제안 2·3은 그다음 기능 작업 전에 하나씩 하길 권한다.

## 7. 덤으로 찾은 것 (작은 것, 출시와 무관)

- 죽은 코드 2개: `isCardSafe`(card-text.ts:13), `LocateFailure`(app.ts:25).
- 낡은 주석: app.ts:767–768(「cards do not depend on the day」). 제안 4 참고.
- ADR 색인 `docs/adr/README.md`가 0085에서 멈춰 있다. 0086~0089 네 줄이 없고 「83파일, 번호 76개」 문구도 낡았다.
- SPEC §12 「구현 구조」 표는 src 26개 파일 중 11개만 적고 있다. 가장 큰 app.ts가 없다.
- src/에 앱 번들에 안 들어가는 파일이 셋 있다: card-text.ts(빌드·테스트용), logo.ts(스크립트·테스트용), landing.css(랜딩 빌드용). 알아 두기만 하면 된다.

---

어느 제안부터 파 볼까요? 권하는 순서는 출시 뒤 1 → 2 → 3입니다. 하나를 고르면 그 제안의 인터페이스를 세 가지로 그려 비교한 뒤 ADR 초안을 쓰겠습니다.
