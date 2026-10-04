# Plan: 써 본 사람에게 묻는 짧은 설문

Spec: `specs/survey.md`. ADR-0081.

## 단위 (순서대로. 단위마다 검증 → 커밋 → 다음)

| # | 단위 | 주로 건드리는 곳 | 새 테스트·검증 |
|---|---|---|---|
| U1 | 받는 쪽: 검증·핸들러·메모리/D1 저장, 함수, 마이그레이션 | 새 `events/feedback.ts`, `events/d1.ts`(`d1FeedbackStore`), 새 `functions/api/feedback.ts`, 새 `migrations/0002_feedback.sql` | `tests/feedback.test.ts`: 알려진 값만, 모르는 필드·빈 답·501자·4KB·GET 거부, 상한 200(201번째 204·저장 0), 저장 행에 날짜·답·버전만(IP·UA·쿠키 넣어 보내도 0), 함수 503·no-store. 로컬 miniflare(wrangler)로 마이그레이션 한 번 적용해 문장이 도는지 |
| U2 | 앱: 줄 조건·시트·보내기 | 새 `src/survey.ts`(조건·본문 만들기), `store.ts`(`jeju.survey`), `state.ts`(`surveyLine`·`feedbackSent`·오버레이 `feedback`), `nav.ts`(오버레이 목록), `render.ts`(홈 줄·시트·문구), `app.ts`(지도 표시·보인 방문 세기·보내기), `main.ts`(주소·버전), `vite.config.ts`(`__APP_V__`), `index.html`(「의견 보내기」), `style.css`(체크 줄·글 상자, 기존 값만) | `tests/survey.test.ts`: F1 전부(지도 전·같은 방문·다음 방문·3번 상한·누른 뒤·기록 끔), F2(빈 보내기 요청 0, 보낸 본문 필드), 조건 밖 홈 innerHTML 동일. 기존 839 그대로 |
| U3 | 읽기 스크립트 + 개인정보 안내 + 주간 작업 한 줄 | 새 `scripts/feedback-report.mjs`, `public/privacy.html`, 저장소 밖 주간 작업 지시문 | `tests/feedback-report.test.ts`: SQL·요약 모양(고정 행), 파일 쓰기 없음. 원격에는 돌리지 않는다 |
| U4 | e2e·스크린숏·문서 | `tests/e2e/browser.e2e.mjs`(새 항목 하나), `design/qa/survey/`, `design/SPEC.md`(§6.1·6.3·6.12·9·12.3·15.1), `specs/usage-events.md`(설문은 별개라는 한 줄) | e2e 전부 통과, 320/390·라이트/다크 스크린숏 |

## 지킬 불변식

- **홈 불변**: 조건이 안 맞으면 홈 DOM이 지금과 바이트 단위로 같다(줄 노드를 아예 만들지 않는다). 기존 테스트를 고치지 않는다.
- **조용함**: 팝업·모달·배지·알림·닫기 버튼 없음. 줄은 글자 버튼 하나.
- **개인정보**: 보내는 것은 답·글·버전. 서버는 날짜만 붙인다. IP·UA·쿠키·위치·장소 id·기기 식별자·시각 0. 지도 표시는 이 기기에만.
- **기록 끄기**: 홈 줄만 숨긴다. 「의견 보내기」와 보내기는 그대로.
- **번들**: JS+CSS gzip 50KB 이하. 받는 쪽은 앱 번들에 들어가지 않는다(events 테스트의 검사 그대로).
- **슬롭**: 새 문구도 check:slop. 화살표·이모지·느낌표·「추천」·가운데 정렬·새 글자 크기·고정 높이 없음. 터치 44px 이상.
- **원문 비공개**: 응답 글은 저장소에 쓰지 않는다. 읽기 스크립트는 표준 출력만.
- **원격 금지**: 이 작업에서 배포·push·원격 마이그레이션을 하지 않는다. 원격 적용은 리뷰 뒤 주 세션이 한다.

## 단위마다 검증 (모두 통과해야 커밋)

1. `npx tsc --noEmit`
2. `npx vitest run` — 시작 839, 줄지 않는다.
3. `npm run check:slop` 0건
4. `npm run build` 후 JS+CSS gzip 50KB 이하(측정값을 커밋 메시지에)
5. `E2E_PORT=4581 E2E_DEPLOY_PORT=4582 npm run e2e -w @jeju/web` 전부 통과(U2·U4)

## 주 세션이 할 일

- 리뷰 뒤 `npx wrangler d1 migrations apply yeogwi-events --remote`(apps/web에서), 그 뒤 배포.
