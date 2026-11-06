# ADR-0126: render.ts·app.ts를 화면 구역·기능 컨트롤러로 덜어 낸다

Status: Accepted (2026-11-07, 주인 「끝까지 이어서 진행해줘」 — 구조 검수 1번). 10-15 아키텍처 리뷰(루트 `architecture_review.md`) 제안 2·3의 일부.

## Context

- 기능을 더할 때마다 `render.ts`(2,064줄)와 `app.ts`(1,863줄)를 함께 열었다. 두 파일 모두 거의 전부가 함수 하나(`createRenderer`, `mountApp`)의 클로저였다.
- 10-15 리뷰는 클로저 변수가 이미 구역마다 갈려 있어서 나누는 위험이 낮다고 보았다.

## Decision

1. **바깥 인터페이스는 그대로다.** 다음 셋은 바꾸지 않는다.
   - `createRenderer(doc, els, opts) → { render, setDate, dispose }`
   - `mountApp(doc, deps) → App`
   - 상태 흐름: 순수 reduce → 멱등 render → 결과만 돌려주는 효과(SPEC §11·§12)
2. **문구:** `src/copy.ts`에 둔다.
   - 화면 글자: `COPY`·`BUSAN_COPY`·`MOOD_LABEL`·`PLACE`
   - DOM 없는 말 만들기: `heldText`·`statusOf`·`howOf`·`nationOutside` 등
3. **그리기 구역:** `src/view/`
   - `home.ts`: `createHome(kit)`가 `renderHome`·`renderSurvey`·`setHomeDate`를 돌려준다.
   - `sheet.ts`: `createSheet(sheetKit)`가 `renderSheet`·`disposeSheet`를 돌려준다.
   - `kit.ts`: 구역이 받는 묶음.
   - `dom.ts`, `icons.ts`: 공용 도우미와 아이콘.
   - 카드·결과·저장 목록은 카드 그리기를 함께 쓰므로 `render.ts`에 남긴다.
   - 그리는 순서는 `render(s)`가 정하고, 바꾸지 않는다. 초점과 스크롤이 이 순서에 기댄다.
4. **기능 컨트롤러:** `src/flow/`
   - `today.ts`: 노을 타이머·비 소식
   - `usage.ts`: 사용 기록·설문
   - `browse.ts`: 서울 둘러보기
   - `ctx.ts`: 컨트롤러가 받는 `AppCtx`
   - `mountApp`이 `app` 묶음을 만든다. `state`는 getter로 주고, 함수는 감싸서 준다. 감싼 함수는 부를 때 대상을 찾으므로 아직 정의되지 않은 함수도 넣을 수 있다. 그래서 컨트롤러는 언제나 그 순간의 state를 본다.
5. **옮기기만 한다.** 옮긴 컨트롤러 안에서는 `state` 같은 이름을 `app.state`로 읽는 것만 바뀐다. 동작 쪽에서 고친 줄은 둘이다.
   - tick의 `duskKey = ''`는 `resetDusk()`로 바꿨다.
   - drawn의 `if (browsing && …) endBrowse()`는 `endBrowse()` 안에 있는 같은 검사에 맡겼다.

## 남긴 것

app.ts에 아래 넷이 남아 있다. 옮기기만으로는 덜어지지 않는다. 버튼 이름 목록(`actions.ts`)이나 묶어 그리기를 컨트롤러에 여는 방법 같은 설계가 먼저 필요하고, 동작이 바뀔 수 있으니 따로 결정한다.

- 저장 지키기(설치 안내·백업): 설치 프롬프트 리스너와 저장 목록 열기에 묶여 있다.
- 오늘 근처 문화(`askCulture`): 묶어 그리기 `batching`·`held`를 함께 쓴다.
- 홈 위치 읽기와 여행지 전환: 데이터 받기·`warm`·`batch`와 묶여 있다.
- 버튼 라우팅(`onMainButton`·`onSheetButton`)

## Consequences

- 줄 수가 이렇게 바뀌었다.
  - `render.ts` 2,064 → 1,013, `app.ts` 1,863 → 1,713
  - 새로 생긴 쪽: `copy.ts` 370, `view/` 약 790(home 344·sheet 378 등), `flow/` 약 290(today 86·usage 98·browse 39 등)
- 이제 문구 하나는 `copy.ts`에서, 홈 줄 하나는 `view/home.ts`에서 고친다.
- 검증
  - 단계마다 `tsc`가 통과했고, vitest 세 모드에서 옮기기 전과 같은 수가 통과했다(기본 1853·전국 1958·부산 1876).
  - 몇 단계에서는 무거운 테스트 1~2개가 5초 시간 초과로 실패했다. 다른 프로그램이 CPU를 쓰던 때였고, 그 파일만 다시 돌리면 통과했다.
  - 무거운 S3 20조합 테스트는 나누기 전에도 2.5~4.0초가 걸렸다. 병렬로 돌리면 한도 5초에 가깝다.
