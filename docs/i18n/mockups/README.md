# 언어별 글자 시안 (주인 확인용, 앱 코드는 바꾸지 않음)

`{en,zh-Hans,ja}.png`: 375×812(2배 해상도)에서 첫 화면(위)과 `좀 걷고 싶어` 결과(아래)를 왼쪽 「지금」(현재 빌드), 오른쪽 「시안」(아래 CSS를 실행 중에 `page.addStyleTag`로 더한 것)으로 나란히 놓았다. 사진은 실제 VisitJeju 사진이다. 위치는 동문시장 근처(테스트용 위치값). 결과 화면의 「밤이라 산길은 뒤로 미뤘어요」 줄은 촬영 시각(새벽)의 것이다. 잰 값은 `measure.json`. 근거는 `docs/i18n/design-research.md` 3.1.

공통 묶음: 제목 = `.ask, .crumb, .title, .settings-h, .sheet h2, .more-sec h2, .card.lead .name`, 여러 줄 글 = `.lede, .reason, .hint, .note, .how, .status, .notice-b, .foot`.

## 시안이 더한 CSS

영어
- `body`: `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; word-break: normal`
- 제목: `line-height: 1.25`
- `.name`: `overflow-wrap: anywhere`

중국어(简体)
- `body`: `font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", MiSans, "Noto Sans SC", "Microsoft YaHei", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; text-autospace: normal`
- 여러 줄 글: `line-height: 1.65`
- 제목: `line-height: 1.4; letter-spacing: 0; font-weight: 600`
- `.logo`, `.mood`, `.name`: `letter-spacing: 0`, `.logo`: `font-weight: 600`

일본어
- `body`: `font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, Roboto, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; text-autospace: normal`
- 여러 줄 글: `line-height: 1.7`
- 제목: `line-height: 1.45; letter-spacing: 0`
- `.logo`: `letter-spacing: 0; font-weight: 700`
- `.mood`, `.tbtn`, `.primary`, `.more`: `letter-spacing: 0.02em`

## 잰 것 (375×812)

| | 기분 줄 높이(5줄 / 아무거나) | 「아무거나」 아래 끝 y | 첫 결과 카드 높이 | 가로 넘침·잘린 글자 |
|---|---|---|---|---|
| en 지금 → 시안 | 76 ×5 / 52 → 같음 | 726 → 725 | 405 → 403 | 0 → 0 |
| zh-Hans 지금 → 시안 | 76 ×5 / 52 → 같음 | 726 → 733 | 382 → 385 | 0 → 0 |
| ja 지금 → 시안 | 76 ×5 / 52 → 같음 | 726 → 736 | 382 → 387 | 0 → 0 |

기분 줄은 지금 높이(76)를 넘지 않았다. 시안에서 중국어·일본어는 질문 아래 설명 두 줄의 행간이 넓어져 「아무거나」가 7~10px 내려가지만 812 화면 안에 있다.
