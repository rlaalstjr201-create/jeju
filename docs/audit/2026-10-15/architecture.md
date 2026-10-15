# 출시 전 점검 5 — 코드 구성 (요약)

전체: [`architecture_review.md`](../../../architecture_review.md) (워크플로 8단계 산출물). 기준: [criteria.md](criteria.md) 5절. 제안만 적었고 코드는 고치지 않았다.

**판정: 출시해도 된다.** 버그 고치기는 이미 기능별로 된다. 고침 커밋 30개 중 20개가 1~2파일이었다. 무거운 건 새 설정·새 줄을 더하는 기능 추가다. 기능 커밋 45개의 중앙값이 4파일이고, 새 설정·새 줄을 더한 커밋 15개는 중앙값 8파일이었다. 그 무게는 app.ts·render.ts에 몰려 있다(15개 중 13개가 둘 다 건드림).

## 잰 것 (TypeScript 컴파일러 API + git 기록, 기준 커밋 48d5218)

| 항목 | 값 |
|---|---|
| 순환 의존 | 0 (타입 import 포함) |
| 80줄 넘는 함수 | 5개: `createRenderer` 1,100 · `mountApp` 1,087 · `createStore` 207 · `step` 150 · `createNav` 145. 그 안쪽 함수는 모두 80줄 미만(최대 `onMainButton` 74) |
| 가장 큰 파일 | render.ts 1,548 · app.ts 1,182 · state.ts 667 · store.ts 546 |
| reducer | `Action` 40종 = `case` 40개, `State` 필드 45개 |
| 클로저 변수 | mountApp 22개(여러 기능이 같이 쓰는 건 3개), createRenderer 27개(모두 한 구역 안) |
| app.ts가 아는 범위 | 다른 src 모듈 24개 중 19개를 import, ADR 18개 언급, 버튼 분기 `if` 32 + 15 |
| 기능 커밋이 건드린 비율 | app.ts 56% · render.ts 58% · 둘 다 42% |
| 중복 | 사용 기록 어휘 2벌(track.ts ↔ events/validate.ts), 설정 쓰기 2벌(`applyDeepLink` ↔ 설정 함수들), 기분 목록 5벌 |
| 죽은 코드 | 2개: `isCardSafe`(card-text.ts:13), `LocateFailure`(app.ts:25) |
| 테스트 | vitest 46파일·`it` 836개(그중 약 360개가 앱을 실제 index.html에 올려 DOM을 누름), e2e 75개. 실행하지 않고 셈 |

## 제안 (출시 뒤, 순서대로 하나씩)

| 순위 | 제안 | 이득 | 비용 | 위험 | ADR |
|---|---|---|---|---|---|
| 1 | 사용 기록 어휘를 track.ts 한 곳에 + 계약 테스트(어긋나면 묶음이 통째로 조용히 사라짐) | 중 | S | 매우 낮음 | 불필요 |
| 2 | render.ts: `render(state)` 그대로, 안을 홈·시트·저장 목록 모듈과 copy.ts로 | 상 | M | 낮음 | 새 ADR |
| 3 | app.ts: 오늘 판·사용 기록·설문·백업 컨트롤러를 밖으로, 버튼 이름 한 목록 | 상 | M | 낮음~중간 | 새 ADR |
| 4 | 고르기 조건을 한 값(`PickConditions`)으로, 1단계는 state.ts만 | 중 | S~M | 중간 | 새 ADR |
| 5 | 기기에 남는 설정 8개를 한 모듈이 읽고 쓴다(키 이름은 그대로) | 중 | M | 중간 | 새 ADR |
| 보류 | 저장 목록을 깊은 모듈 하나로 | — | L | 높음 | ADR-0086 재실험 뒤 |

바꾸지 않을 것: 프레임워크 없음·gzip 50KB, 순수 reduce → render(state) → 결과만 돌려주는 효과(SPEC §11·§12), 저장소 키, nav 경로 모델, 고정 데이터·로그인 없음·손으로 쓴 SW·정적 랜딩·분석 셋, 저장·날짜 흐름(ADR-0086).

덤: ADR 색인 README에 0086~0089가 없다. SPEC §12 구현 구조 표에 app.ts가 없다. app.ts:767–768 주석이 장날·철(ADR-0066·0080) 이후로 맞지 않는다.
