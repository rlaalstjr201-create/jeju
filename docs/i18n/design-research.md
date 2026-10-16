# 언어별 모바일 UI 관례 조사 — 영어·중국어(简体)·일본어

조사일 2026-10-17. WebSearch 25회 + WebFetch·curl. 결정 문서가 아니라 근거 모음이다(결정은 ADR-0093 Amendment로).
표기: 「검색 요약 경유」는 원문을 직접 열지 못하고 검색 결과 요약에 기댄 것, 「확인 실패」는 끝내 근거를 찾지 못한 것, 「판단」은 근거에서 추론한 것.

## 0. 결론 한 줄

같은 레이아웃·브랜드를 두고 **언어마다 바꿀 것은 글꼴 순서, 행간, 자간, 굵기, 줄바꿈, 문장부호·날짜 꼴**이다. 색·정보 밀도·배지는 바꾸지 않는다(근거가 약하거나 여차나 원칙과 충돌). 언어별 CSS는 그 언어 파일(`src/i18n/<lang>.ts`)에서 import해 그 언어 방문에만 내려가게 한다.

## 1. 지금 화면에서 본 것 (`apps/web/design/qa/i18n/*.png`, 375px)

1. **세 언어 모두 한국어 타이포 토큰을 그대로 쓴다.** 제목 자간 −0.01~−0.03em(`.brand`·`.ask`·`.title`·`.sheet h2`), 본문 행간 1.5, 제목 1.35, 굵기 700~800. 한글에 맞춘 값이라 한자·가나에는 빽빽하다(아래 2절).
2. **영어 글꼴 순서가 한국어용이다.** body 스택이 `"Apple SD Gothic Neo"`·`Pretendard`·`"Noto Sans KR"`을 `"Segoe UI"`보다 앞에 둔다. iOS는 `-apple-system`이 먼저라 SF로 나오지만, Windows 스크린숏(en-home.png)의 라틴 글자는 한국어 글꼴의 라틴 글리프로 보인다(판단: 스크린숏 모양).
3. **중국어 문장부호.** 첫 화면 질문이 「现在想干点啥?」로 반각 `?`다. 중국어 문장 안은 전각(？)이 규칙이다([中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)). 일본어 화면은 「？」로 맞다.
4. **장소 이름이 한글로 남는다**(세 언어 결과·첫 화면 기분 줄). 디자인보다 데이터 문제(ADR-0093 「names-*.json」 대기)지만, 디자인상 영향이 가장 크다: 영어 기분 줄 「Jeju favorites: 애월더선셋…」은 읽을 수 없는 글자가 줄 끝을 차지한다. 이 조사 범위 밖이라 기록만 한다.
5. **중·일 스택에 한국어 글꼴이 없다.** 4가 해소되기 전까지 한글이 섞이므로, 스택 끝에 한국어 글꼴을 두는 편이 OS 대체 글꼴보다 예측 가능하다(판단).
6. 영어 버튼·칩은 375px에서 넘치지 않았다(`Directions`·`Been there`·`about 15 min by car`). 길이 문제는 지금은 없다.

## 2. 글자(타이포그래피)

### 2.1 공통 근거

- **CJK는 라틴보다 행간이 넓어야 한다.** 한자는 글자 면(em 상자)을 꽉 채우고 위아래 돌출이 없어 줄 사이 틈이 생기지 않는다. 중국어 1.5~2배 권장([woshipm](https://www.woshipm.com/ucd/1096734.html)). 일본어 JLREQ는 행간(줄 사이 빈칸)을 글자 크기의 50~100%로 둔다([W3C jlreq](https://www.w3.org/TR/jlreq/), 2.4 부근, "between half-em spacing and the one em spacing"). = line-height 1.5~2.0. Adobe Spectrum 토큰은 CJK 본문 1.7을 따로 둔다([Spectrum tokens](https://opensource.adobe.com/spectrum-design-data/tokens/typography), 검색 요약 경유). Typotheque도 CJK 글자가 em 상자를 최대한 채운다고 설명한다([Typotheque](https://www.typotheque.com/articles/typesetting-cjk-text), 검색 요약 경유).
- **Apple 자사 사이트의 실제 CSS**(apple.com.cn, curl로 직접 확인): 제목 클래스에서 `:lang(ja)`는 행간을 라틴보다 키우고(1.083→1.146, 21px 소개문 1.381→1.429) 자간을 `0em`으로 되돌린다. `:lang(zh)`는 **자간만 0으로** 되돌리고 행간은 라틴과 같다. `:lang(zh-CN)` 글꼴은 `"SF Pro SC", …, "PingFang SC"`, `:lang(ja)`는 `"SF Pro JP", …, "Hiragino Kaku Gothic Pro"`로 **라틴 SF를 앞에, 그 언어 CJK 글꼴을 뒤에** 둔다([apple.com.cn overview.built.css](https://www.apple.com.cn/v/iphone/cellular/d/built/styles/overview.built.css)). 즉 라틴에 주던 음수 자간은 CJK에서 걷어낸다.
- **줄바꿈 CSS.** `line-break: strict`는 작은 가나·장음 「ー」·반복 기호 「々」 앞에서 줄을 바꾸지 않는다(normal도 같음, loose만 허용) ([CSS Text 3](https://www.w3.org/TR/css-text-3/) line-break 절). `word-break: keep-all`은 CJK에서 글자 사이 줄바꿈을 막는다([MDN word-break](https://developer.mozilla.org/en-US/docs/Web/CSS/word-break)) — 그래서 지금 중·일에 `normal`+`strict`를 둔 것(ADR-0093 8)은 맞다. `word-break: auto-phrase`는 실험 기능이다(같은 MDN). 일본어 제목·짧은 글에만 `auto-phrase`+`text-wrap: balance`, 본문에는 쓰지 말라는 실무 권고가 있다([tak-dcxi gist](https://gist.github.com/tak-dcxi/0f8b924d6dd81aaeb58dc2e287f2ab3a)).
- `text-autospace`(한자·가나와 라틴·숫자 사이 자동 간격)는 Baseline 2025 신규([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-autospace)). `text-spacing-trim`(전각 괄호·구두점 사이 빈칸 줄이기)은 Baseline 아님, 글꼴에 `halt`/`chws` 기능이 있어야 동작([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/text-spacing-trim)). 둘 다 지원 안 되는 브라우저에선 무시되므로 넣어도 깨지지 않는다(판단).
- **글자 수 증감.** 영어 대비 중국어(简体) 약 −30%, 일본어 −55~−10%, 한국어 −10~−15%. 다만 CJK 글자는 폭이 넓어 화면 폭 절감은 글자 수만큼 크지 않다. 10자 미만 짧은 문자열은 번역 시 100~300% 늘 수 있다([Kwintessential](https://www.kwintessential.co.uk/blog/translation-text-expansion-how-it-affects-design-2), [Linguise](https://www.linguise.com/blog/guide/why-translated-websites-break-layouts-and-how-to-design-for-text-expansion-from-the-start/), 검색 요약 경유). → 영어는 버튼·칩, 중국어는 오히려 짧아 줄이 비어 보임(판단).

### 2.2 영어 (EN)

- **글꼴**: 시스템 글꼴 우선. Ant Design 스택 `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`([Ant Design font](https://ant.design/docs/spec/font)). 한국어 글꼴은 Segoe UI·Roboto 뒤로.
- **크기·굵기**: Ant 본문 14/22, 굵기는 400·500 위주, 600은 영어 굵은 글자용(같은 페이지). iOS 본문 17pt(Apple HIG — WebFetch가 본문을 못 받아 **확인 실패**, [woshipm](https://www.woshipm.com/ucd/1096734.html)의 17pt 인용은 2차 근거). 숫자 열은 `tabular-nums`(Ant, 이미 SPEC 3.1에 있음).
- **대소문자**: 제목·헤딩은 sentence case([Google developer style guide](https://developers.google.com/style/capitalization), "use sentence case"). 지금 화면(「Go for a walk」)은 이미 맞다.
- **날짜·시간**(CLDR, Node `Intl` 출력): en-US `Sat, Oct 17`·`5:58 PM`, en-GB `Sat 17 Oct`·`17:58`. 지금은 날짜는 미국식, 시간은 24시간제(「Sunset 17:58」)로 섞여 있다. 어느 쪽으로 맞출지는 주인 결정(판단: 대상이 영어권 전체면 en-US).
- **추천 신호(시장 관례)**: Airbnb는 상위 1·5·10% 숙소에 금색 트로피·「Guest favorite」 배지를 붙인다([Airbnb Help 3495](https://www.airbnb.com/help/article/3495), 검색 요약 경유). Tripadvisor는 상위 10% 「Travelers' Choice」, 상위 1% 「Best of the Best」 두 단계([Tripadvisor mediaroom](https://tripadvisor.mediaroom.com/travelers-choice), 검색 요약 경유). Google 지도는 혼잡도를 「Usually not too busy」 같은 문장으로 보여 준다([Google blog](https://blog.google/products/maps/maps101-popular-times-and-live-busyness-information/), 검색 요약 경유). 배지 색·모양의 1차 근거는 **확인 실패**.

### 2.3 중국어 简体 (zh-Hans, 본토)

- **글꼴**: iOS PingFang SC(iOS 9부터), Windows Microsoft YaHei([woshipm](https://www.woshipm.com/ucd/1096734.html), [juejin](https://juejin.cn/post/6844903633037819912), 검색 요약 경유). 화웨이 HarmonyOS Sans·샤오미 MiSans·OPPO Sans는 각 제조사 시스템 글꼴이다([OpenHarmony resources](https://github.com/openharmony/resources), [IT之家 MiSans](https://www.ithome.com/0/595/412.htm), 검색 요약 경유). 이들 기기의 웹뷰에서 `sans-serif`가 그 글꼴로 풀리는지는 **확인 실패** — 이름을 스택에 넣어도 해가 없다(판단).
- **굵기**: PingFang SC의 최대 굵기가 Semibold라는 자료와 Bold까지 있다는 자료가 엇갈린다([juejin Flutter 글](https://juejin.cn/post/7658663867578023963) vs [gitcode](https://blog.gitcode.com/b9fcecd02e646900b90d29cbdfcbbf9f.html), 검색 요약 경유) → 확인 실패. Microsoft YaHei는 Regular/Bold(+Light)뿐이라 700·800이 같은 굵기로 나온다(판단). 실무 권고는 Regular+Medium 두 굵기([woshipm](https://www.woshipm.com/ucd/1096734.html)).
- **행간**: 1.5~2배(woshipm), 중국 본토 앱 기준 Ant 14/22 = 1.57([Ant](https://ant.design/docs/spec/font)). Apple은 zh 제목 행간을 라틴과 같게 둔다(2.1).
- **자간**: Apple은 zh 제목에서 `letter-spacing: 0em`(2.1).
- **문장부호·숫자**: 중국어 문장엔 전각 부호, 숫자는 반각 아라비아 숫자, 한자와 라틴·숫자 사이엔 빈칸, `%`·`°` 앞은 붙임, 부호 반복 금지([中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)). 본토 부호는 글자 칸 끝(왼쪽 아래)에 놓이고, 줄표 「——」와 말줄임 「……」은 줄을 넘겨 쪼개지 않는다([W3C clreq](https://www.w3.org/TR/clreq/) 5.1, 5.4.1). 빈칸 규칙은 글자 대신 `text-autospace`로 처리할 수 있다(2.1).
- **날짜·시간**(CLDR): `10月17日周六`, `17:58`, `15分钟后`. 지금 화면 「10月17日 周六」은 빈칸 하나 차이.
- **색**: 중국 본토·대만은 주가 상승을 빨강, 하락을 초록으로 표시하고, 빨강은 경사·행운의 색이다([Benzinga](https://www.benzinga.com/general/education/21/10/23258001/did-you-know-you-dont-want-to-be-in-the-green-if-youre-trading-in-china-japan-or-taiwan), [BehavioralEconomics.com](https://behavioraleconomics.com/when-red-means-go), 검색 요약 경유). 여차나 토큰엔 빨강이 없고(`--main` 파랑, `--accent` 주황) 오류 표시도 빨강을 쓰지 않으므로 **바꿀 것 없음**.
- **정보 밀도**: 중국 앱이 빽빽한 건 한 앱에 모든 서비스를 몰아넣는 사업 구조 때문이라는 분석([Thoughtworks](https://www.thoughtworks.com/en-au/insights/blog/why-do-chinese-websites-and-apps-look-so-busy), 검색 요약 경유), 위챗류 앱의 숫자 없는 빨간 점 배지·「发现」 탭 관례([Dan Grover](https://dangrover.com/blog/2014/12/01/chinese-mobile-app-ui-trends.html)). 소셜 앱 小红书는 두 줄 폭포형 목록에서 글은 두 줄만 보이고 표지 사진이 먼저 읽힌다([Canva CN](https://www.canva.cn/learn/redbook-note-cover-design/), 검색 요약 경유).
- **추천 신호**: 大众点评 「必吃榜」은 별점·맛 점수·유효 리뷰가 장기간 상위인 곳([woshipm](https://www.woshipm.com/share/6083534.html), 검색 요약 경유), 携程 「口碑榜」, 高德 「扫街榜」은 사용자 이동 데이터 기반([界面](https://m.jiemian.com/article/12605480.html), [新京报](https://www.bjnews.com.cn/detail/1776078097129980.html), 검색 요약 경유). 즉 **「榜」(순위표)과 「热门」 같은 말**로 신호를 준다. 이 앱들의 태그 색·모양 1차 근거는 **확인 실패**.

### 2.4 일본어 (JA)

- **글꼴**: Apple은 Hiragino Sans(+SF), Windows는 Yu Gothic·Meiryo([atadistance](https://atadistance.net/2021/12/09/japanese-fonts-to-use-for-an-international-website/), 검색 요약 경유). 일본어 글꼴을 라틴 전용 글꼴보다 앞에 두라는 권고([American Express Japan i18n](https://designinternet-qaeusw1green.americanexpress.com/guidelines/japan-internationalization/overview), 검색 요약 경유 — 원문 접속 실패). 디지털청 디자인 시스템은 Noto Sans JP, 굵기 400·700 두 가지만([DADS Typography](https://design.digital.go.jp/dads/foundations/typography/)).
- **크기**: DADS는 본문·UI 16px 기준, 14px 미만은 원칙적으로 불허(같은 페이지).
- **행간**: DADS 본문 150%가 최소, 160·170·175%가 표준 본문, 큰 제목 140%, 한 줄 UI(버튼) 100%(같은 페이지). 본문 1.7~2, 제목 1.25~1.5 권고([tak-dcxi gist](https://gist.github.com/tak-dcxi/0f8b924d6dd81aaeb58dc2e287f2ab3a)). Apple도 ja 행간을 키운다(2.1).
- **자간**: DADS는 26px 이하 표준·한 줄 UI에 **+0.02em**, 28~36px +0.01em, 큰 글자 0(같은 페이지). 즉 음수 자간이 아니라 약간 벌린다. 제목에만 `font-feature-settings: "palt"`(가나 비례 폭), 본문엔 쓰지 않는다(tak-dcxi gist).
- **줄바꿈**: `line-break: strict` 권장(tak-dcxi gist, CSS Text 3). 금칙 처리 문자 분류(닫는 괄호·구두점·작은 가나 등)는 [W3C jlreq](https://www.w3.org/TR/jlreq/) 3.1.7·3.1.8·부록 A.
- **날짜·시간**(CLDR): `10月17日(土)`, `17:58`, `15 分後`. 지금 화면 「10月17日（土）」은 전각 괄호 — 일본어 UI에서 흔한 꼴이라 유지 가능(판단).
- **정보 밀도·신뢰**: 일본 사이트는 여백보다 한곳에 많은 정보를 모아 보여 주고, 서구에서 산만해 보이는 것이 일본에선 꼼꼼함·신뢰로 읽힌다는 보고([Fujitsu blog](https://www.fujitsu.com/lu/news/blogs/when-clutter-got-purpose-understanding-the-role-of-cultural-context-in-ux-ui), [UX Collective](https://bootcamp.uxdesign.cc/common-elements-in-japanese-web-design-93cdec731dde), [Boing Boing](https://boingboing.net/2026/01/05/japanese-users-prefer-dense-busy-websites.html), 검색 요약 경유). 일본 앱 아이콘이 미국보다 내용이 많다는 연구([Tokyo Tech](https://www.titech.ac.jp/english/news/2023/067510), 검색 요약 경유).
- **추천 신호**: 食べログ는 점수를 소수 둘째 자리로, 3.50 이상이 상위 약 3%, 4.00 이상이 약 0.07%라고 공시한다([食べログ 점수 도움말](https://tabelog.com/help/score/)). 「百名店」은 장르별 상위 100곳 상([ORICON](https://www.oricon.co.jp/pressrelease/3011084/), 검색 요약 경유). 즉 **숫자와 기준선**이 신호다. 별·배지 색 1차 근거는 **확인 실패**. じゃらん·Retty·Google 지도 일본어판 UI 차이도 **확인 실패**.

## 3. 권고 표

### 3.1 토큰·CSS

| 항목 | 한국어(지금, 그대로) | 영어 | 중국어 简体 | 일본어 |
|---|---|---|---|---|
| font-family | 그대로 | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif` (라틴 먼저, 한글 이름용 한국어 글꼴 뒤) | 지금 스택 + `"HarmonyOS Sans SC", MiSans` (Noto Sans SC 앞) + 끝에 `"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic"` | 지금 스택 + 끝에 한국어 글꼴 3개 |
| 본문 크기 | 15px | 15px 유지 | 15px 유지 | 15px 유지. DADS 16px 기준은 메모만(밀도 문화와 충돌, 판단) |
| 본문 행간(여러 줄 글: `.lede`·`.reason`·`.hint`·`.note`·`.how` 등) | 1.5 | 1.5 | **1.65** | **1.7** |
| 한 줄 글 행간(`.mood .ex`·`.tag`·버튼) | 1.5 / 26px | 그대로 | 그대로 | 그대로 — 기분 줄 72px가 넘지 않게(17×1.35+15×1.7+24 = 72.5로 넘침, DADS도 한 줄 UI는 행간을 좁힘) |
| 제목 행간 | 1.35 | **1.25~1.3** | 1.4 | **1.45** |
| 제목 자간 | −0.01~−0.03em | 유지(SF는 자체 광학 자간, 판단) | **0** | **0** (+`palt`는 제목만, 선택) |
| UI·본문 자간 | 0 | 0 | 0 | **+0.02em**(DADS) — 기분 줄·버튼에만, 판단 |
| 굵기 | 400/600/700/800 | 유지 | 제목 800·700 → **600**(YaHei·PingFang에서 같은 결과를 확정적으로) | 800 → **700**(DADS 두 굵기) |
| 줄바꿈 | `keep-all` | 기본(`normal`) + 긴 단어 대비 `overflow-wrap: anywhere`는 이름 칸만 | `normal` + `line-break: strict`(지금) | 같음 + 제목에 `word-break: auto-phrase`(Chrome만, 판단) |
| 간격 보정 | 없음 | 없음 | `text-autospace: normal` | `text-autospace: normal`, 선택적으로 `text-spacing-trim: trim-start` |
| 숫자·시간 | 그대로 | `Intl` en-US로 12시간제(주인 결정) | `Intl` zh-CN | `Intl` ja-JP |

### 3.2 컴포넌트

| 컴포넌트 | 영어 | 중국어 | 일본어 |
|---|---|---|---|
| 기분 줄(`.mood`, 최소 72px) | 라벨은 이미 줄바꿈 허용(`.label` block, nowrap 아님). 예시 줄(`.ex`)의 한글 이름은 데이터 해결 전까지 그대로 말줄임 | 라벨이 짧아 오른쪽이 빔 — 크기 키우지 말고 그대로(브랜드 일관) | 예시 줄 「：」 전각 유지 |
| 칩·태그(`.tag`, `nowrap`) | 「about 15 min by car」가 최장. 375px에서 들어감. 더 긴 문구는 칩 대신 문장으로(판단) | 「开车约15分钟」 숫자 앞뒤 빈칸은 `text-autospace`로 | 「車で約15分」 |
| 버튼 | `Directions`·`Been there` 들어감. 폭 고정 금지, 글자 기준 | 「路线」「去过」 짧음 — 그대로 | 「経路」「行った」 그대로 |
| 시트 제목(`.sheet h2`) | sentence case | 전각 부호 | 전각 부호, 행간 1.45 |
| 카드 메타 줄 | 시간 표기 en-US | `·` 반각 가운뎃점이 본토 관례(clreq 5.1) | 「・」 전각 가운뎃점이 일본어 관례(판단, jlreq 3.1.2 부근) |
| 문구 | — | 「现在想干点啥?」→「…啥？」 (전각) | — |

### 3.3 바꾸지 않을 것

- 브랜드(로고, `Yeochana`, `--main`·`--accent` 색), 레이아웃, 화면 순서, 그림자·면 규칙(ADR-0088).
- 누름 영역 ≥44px(자주 누르는 것 ≥48), iOS 입력 칸 16px 규칙(SPEC 3.1).
- 색 의미: 빨강을 새로 들이지 않는다(중국 「빨강=좋음」은 금융 맥락 근거뿐, 여차나엔 빨강이 없다).
- 정보 밀도·배지: 중·일 시장이 빽빽하다는 근거는 있지만 여차나는 「3곳만」이 제품 원칙이다(P 여행자 메모, ADR-0075). 「榜」「百名店」식 순위 배지도 들이지 않는다(판단).
- **한국어 화면은 바이트 단위로 그대로.**

## 4. 번들 예산 (한국어 JS+CSS gzip 48.16KB / 50KB)

- 지금 `style.css` 547~550행의 중·일 규칙은 한국어 번들에 들어 있다(ADR-0093 12의 +1.42KB 안).
- 권고: 언어별 규칙을 `src/i18n/en.css`·`zh-Hans.css`·`ja.css`로 두고 각 `src/i18n/<lang>.ts`에서 `import './<lang>.css'`. 이 파일들은 `main.ts`의 동적 `import('./i18n/<lang>')`로만 불리므로 Vite가 CSS를 그 청크와 함께 따로 내보낸다(판단: Vite의 동적 import CSS 분할 동작, 빌드로 확인 필요). 547~550행을 옮기면 한국어 번들은 오히려 줄어든다 — 단 「한국어 바이트 동일」 조건과 충돌하므로 옮길지 남길지는 주인 결정.
- 선택자는 지금처럼 `html:lang(xx)`로 감싸 언어가 바뀌어도 새지 않게.
- 화면 가림(최대 3초, ADR-0093 2) 동안 CSS도 함께 와야 글꼴·행간이 번쩍이지 않는다(판단).

## 5. 확인 실패 목록

- Apple HIG 타이포 페이지 본문(WebFetch가 제목만 받음), Material Design 「dense script」 언어 지원 페이지(본문 못 받음, Mozilla 포럼의 「CJK 행간 2」 회상은 미검증).
- 大众点评·小红书·携程·高德·食べログ·じゃらん·Retty·Google 지도 일본어판의 배지·태그 색과 모양(1차 자료 없음).
- PingFang SC 최대 굵기(자료 충돌), 중국 제조사 안드로이드 웹뷰의 `sans-serif` 실제 글꼴.
- 디지털청 행간·자간 값은 DADS 사이트에서 직접 확인했으나 앱 사례가 아닌 행정 서비스 기준이다.
- 이 표의 수치(1.65·1.7·1.45 등)는 근거 범위 안에서 고른 **판단**이며, 375px 스크린숏(qa/i18n) 재촬영으로 기분 목록 높이·첫 화면 접힘선이 SPEC 5.x를 넘지 않는지 확인해야 한다.
