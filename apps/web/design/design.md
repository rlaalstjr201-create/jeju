# P의 여행 · UI/UX 근거 규칙 (design.md)

2026-10-01. `SPEC.md` 3판을 고치지 않고, 근거 있는 규칙과 3판의 차이만 적는다. 구현 기준은 여전히 SPEC.md이다. 이 문서의 권장 변경(8절)은 SPEC 개정 때 검토할 후보다. 1~4는 2026-10-01 SPEC과 코드에 반영했다(아래 `SPEC 3판:` 줄이 반영 뒤 상태).

**읽는 법**

- 규칙마다 검증할 수 있는 값, 근거(출처·연도·방법·한 줄 결과), `SPEC 3판:` 일치/불일치를 적는다.
- 근거 강도: **[A]** 통제 실험·대규모 관찰·메타분석 / **[B]** 표준·플랫폼 지침(규범이지만 실험 근거는 간접) / **[C]** 관례·약한 근거(실험이 작거나 없음, 또는 원문 미확인).
- 길이 환산: CSS px의 실제 크기는 기기마다 다르다. iPhone(390pt 폭, 약 64.6mm)에서 1px ≈ 0.166mm, Android 1dp = 1/160in ≈ 0.159mm. 그래서 44px ≈ 7.0~7.3mm, 48px ≈ 7.6~8.0mm, 56px ≈ 8.9~9.3mm, 9.2mm ≈ 55~58px.
- 출처 접근 한계: nngroup.com, krds.go.kr, a11ykr.github.io, dbpia.co.kr, koreascience.or.kr, journal.dcs.or.kr은 이 환경에서 WebFetch가 막혀 **검색 결과 요약으로만** 확인했다. 그 근거는 [C]로 낮추지 않았지만 수치를 원문과 대조하지 못했다(9절).

---

## 1. 터치 대상과 간격

**T1. 모든 탭 대상은 44×44 CSS px 이상이다(본문 속 인라인 링크 제외).** [B]
- 근거: WCAG 2.2 SC 2.5.5 Target Size (Enhanced), AAA, 44×44 CSS px ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)). Apple HIG: 모든 컨트롤의 히트 영역 44×44pt 이상 ([Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility)). KRDS도 아이콘 버튼·캐러셀 컨트롤에 44×44px 이상을 권장한다 ([KRDS 캐러셀](https://www.krds.go.kr/html/site/component/component_04_09.html)).
- SPEC 3판: **일치.** 최소 44(상단 버튼·`.tbtn`·하트·탭·`언제` 칸)이고, e2e 15.1 #10이 44px 미만 대상 0을 검사한다.

**T2. 자주 누르는 대상과 주 행동은 48px 이상, 한 손 엄지 대상은 56px(약 9.2mm) 이상을 목표로 한다.** [A]+[B]
- 근거: Parhi, Karlson, Bederson 2006, MobileHCI. 한 손 엄지 실험(크기 3.8~11.5mm × 9개 위치)에서 단일 탭은 9.6mm 이상, 연속 탭은 7.7mm 이상에서 크기에 따른 오류율 차이가 없었다. 권장값은 단일 탭 9.2mm, 연속 탭 9.6mm ([PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/parhi-mobileHCI06.pdf), [ACM](https://dl.acm.org/doi/10.1145/1152215.1152260)). Material: 48×48dp(약 9mm) 이상 ([Material](https://m2.material.io/design/usability/accessibility.html), [Android 도움말](https://support.google.com/accessibility/android/answer/7101858)). MIT Touch Lab(Dandekar, Raju, Srinivasan 2003, J. Biomech. Eng., 유한요소 모델): 손가락 끝 8~10mm, 지문 면 10~14mm ([PubMed](https://pubmed.ncbi.nlm.nih.gov/14618927/)). 이 손가락 수치는 터치 실험이 아니라 촉각 역학 모델에서 나온 값이라 직접 근거로는 약하다.
- 고령자: Jin, Plocher, Kiff 2007(HCII, 노인 대상 터치스크린): 오류가 가장 적은 버튼은 19.05mm였고, 간격은 3.17~12.7mm를 권장했다 ([ResearchGate](https://www.researchgate.net/publication/221099338_Touch_Screen_User_Interfaces_for_Older_Adults_Button_Size_and_Spacing)). 키오스크 크기라 폰에 그대로 옮길 수는 없다.
- SPEC 3판: **일치**(2026-10-01 반영). 기분 줄 60, 동네 칸 56, `닫기` 56, `다른 3곳 보기`·`다시 불러오기`·`지금 위치를 숙소로` 52, `아무거나 골라줘` 48. 카드 하트, `바꾸기`·`돌아가기`, `위로`·`아래로`·`다른 날로`, `이 날로`, 식사 탭, `언제` 칸은 그린 크기 44 그대로 누름 영역만 48×48(가상 요소, SPEC 4절, e2e T2-hit). 상단 기준·♥ N은 드문 보조 행동이라 44(T4).

**T3. 서로 다른 행동의 인접 대상은 시각 간격 8px 이상을 둔다. 24px 원 겹침 검사(2.5.8)를 통과해야 한다.** [B]
- 근거: WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA: 24×24px 이상이거나, 대상 중심의 지름 24px 원이 다른 대상과 겹치지 않아야 한다 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Material: 대상 사이 8dp 이상 ([Material](https://m2.material.io/design/usability/accessibility.html)). Henze, Rukzio, Boll 2011(MobileHCI, 안드로이드 게임 9만 1,731회 설치, 터치 1억 2천만 건): 작은 대상일수록, 화면 가장자리일수록 오류가 늘었고, 터치 위치가 대상 중심에서 체계적으로 치우쳤다 ([ACM](https://dl.acm.org/doi/abs/10.1145/2037373.2037395)).
- SPEC 3판: **일치.** `.ctl` 버튼 사이 8, 식사 탭 사이 24. 카드 하트(누름 영역 48)는 카드 전체 링크와 맞닿지만 44px 이상이라 2.5.8을 통과한다. 넓힌 누름 영역끼리는 겹치지 않는다(e2e T2-hit).

**T4. 주 행동은 화면 아래 절반, 위쪽 두 모서리에는 드물게 쓰는 보조 행동만 둔다.** [A]
- 근거: Hoober 2013. 거리에서 1,333건을 관찰했더니 한 손 쥐기 49%, 한 손으로 받치고 다른 손가락으로 누르기 36%, 두 손 엄지 15%였고, 사람들은 쥐는 법을 자주 바꿨다 ([요약](https://www.textbookofusability.com/references/hoober2013.html), [A List Apart](https://alistapart.com/article/how-we-hold-our-gadgets/)). Bergstrom-Lehtovirta & Oulasvirta 2014(CHI): 엄지가 닿는 영역은 손 크기와 기기 크기로 예측할 수 있고 먼 위쪽 모서리는 그 밖에 있다 ([DOI](https://doi.org/10.1145/2556288.2557354)).
- SPEC 3판: **일치.** 기분 목록은 화면 아래쪽에 있고(ADR-0075: 위 5 : 아래 2 빈칸 대신 앱 이름·오늘 판·질문 설명이 위를 채워, 390×844에서 기분 줄이 약 y=260~600), `다른 3곳 보기`는 아래에 떠 있으며, 시트 `닫기`도 아래에 붙는다. 위쪽 모서리에는 기준과 ♥ N만 있다.

**T5. 컨트롤의 대각선은 6.0mm 이상이다(국내 인증 기준).** [B]
- 근거: KWCAG 2.2 검사 항목 "컨트롤의 크기". 대각선 6.0mm 이상 ([KWCAG 2.2](https://a11ykr.github.io/kwcag22/), 검색 요약만 확인).
- SPEC 3판: **일치.** 44×44의 대각선은 약 62px, 곧 10mm 이상이다.

---

## 2. 글자(모바일 읽기, 한글)

**K1. 읽는 본문(이유 문장)은 16~17px, 보조 글자는 15px 이상이다. 15px 미만은 없다.** [B]+[C]
- 근거(플랫폼 기본값): iOS Body 17pt([Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)), Material 3 Body Large 16sp, 행간 24([M3](https://m3.material.io/styles/typography/applying-type)), KRDS 본문 기본 17px, 행간 150%([KRDS 타이포그래피](https://www.krds.go.kr/html/site/style/style_03.html), 검색 요약). 세 기준이 모두 15보다 크다.
- 근거(한글 실험, 작음): 「모바일 기기에서의 화면크기와 글자크기가 가독성에 미치는 효과」(33명, 화면 3종 × 글자 5종, 읽기 시간 측정): 작은·중간 화면에서는 2.4mm, 큰 화면에서는 2.6mm에서 가장 빨랐다 ([DBpia](https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE06592396), 연도 미확인). 2.4mm를 em 크기로 읽으면 약 14.5px, 2.6mm는 약 15.7px다. 단위 정의를 원문에서 확인하지 못했다. 윤종찬·하진영 2019(디지털콘텐츠학회논문지 20(1), 20~30대 10명 + 50~60대 10명, 9pt와 12pt 비교): 두 세대 모두 큰 글자가 가독성이 좋았다 ([KCI](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002433763)).
- 근거(고령자): Bernard, Liao, Mills 2001(CHI EA, 고령자): 14pt가 12pt보다 읽기 쉬웠다 ([Semantic Scholar](https://www.semanticscholar.org/paper/The-effects-of-font-type-and-size-on-the-legibility-Bernard-Liao/ab7b45fe0a5829c8804801f37a9f92aa68bf5b64)). Hou 외 2022(Frontiers in Psychology, 체계적 문헌고찰): 고령자는 큰 글자를 선호했지만 어느 크기를 넘으면 오히려 가독성이 떨어졌다 ([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9376262/)).
- 판단: 15px이 "읽을 수 없다"는 근거는 없다. 한글 실험은 15px 근처가 최적이라고도 읽힌다. 다만 플랫폼 세 곳의 본문 기본값과 고령자 연구가 모두 더 큰 쪽을 가리킨다.
- SPEC 3판: **부분 불일치.** 이유·메타·상태 줄이 모두 15/400이다. 최소 15px와 rem 단위는 일치한다.

**K2. 글자는 rem으로 쓰고, 200% 확대와 320px 폭에서 잘림이나 가로 스크롤이 없다.** [B]
- 근거: WCAG 1.4.4 Resize Text, 1.4.10 Reflow ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)).
- SPEC 3판: **일치**(3.2, 15.1 #10).

**K3. 한글 본문 행간은 1.5~1.6, 제목(1~2줄)은 1.3~1.4다.** [B]+[C]
- 근거: KRDS 본문 행간 150% 권장(검색 요약). 윤종찬·하진영 2019: 행간 160%가 100%보다 가독성이 좋았고, 50~60대에게 영향이 더 컸다. 다만 두 수준만 비교해서 최적값은 알 수 없다. 반대로 「스마트폰 한글 타이포그래피가 고령자의 가독성에 미치는 영향」(한국콘텐츠학회논문지 16(11), 2016)에서는 행간 효과가 없었다 ([KoreaScience](https://koreascience.kr/article/JAKO201606776007417.page)). 결과가 엇갈린다. 제목 행간 1.3~1.4는 관례다 [C].
- SPEC 3판: **일치**(본문 1.5, 이름 1.35~1.4, 질문 1.3). 개선 여지: 첫 장 이유처럼 자르지 않는 여러 줄 문단은 1.6도 검토할 수 있다(근거 약함).

**K4. 사용자가 행간 1.5배, 문단 뒤 2배, 자간 0.12em, 낱말 간격 0.16em으로 덮어써도 내용이 잘리지 않는다.** [B]
- 근거: WCAG 1.4.12 Text Spacing, AA ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)).
- SPEC 3판: **대체로 일치.** 글자 요소에 고정 높이가 없다(3.3). 다만 이 덮어쓰기를 적용한 e2e 검사가 없다. `line-clamp`로 자른 이름이나 이유는 덮어쓴 뒤 더 많이 숨는다(작성자 의도의 자르기라 위반은 아님).

**K5. 본문 한 줄은 라틴 문자 기준 45~75자다. 한글은 앱 폭(최대 480px)에서 저절로 약 22~29자가 된다.** [A, 라틴] / [C, 한글]
- 근거: Dyson & Haselgrove 2001(IJHCS, 25·55·100자 비교): 55자 줄이 이해도가 가장 높았고 25자 줄보다 빨리 읽혔다 ([ResearchGate](https://www.researchgate.net/publication/220106760_The_Influence_of_Reading_Speed_and_Line_Length_on_the_Effectiveness_of_Reading_from_Screen)). Bernard, Fernandez, Hull 2002(Usability News 4.2, 45·76·132자): 성인은 76자, 아동은 45자를 선호했다 ([SAGE](https://journals.sagepub.com/doi/10.1177/154193120304701112)). 한글: 신종현·박민용 2003(IE Interfaces, 읽기 형태·줄 길이·줄 간격 실험)이 있으나 수치를 확인하지 못했다 ([KCI](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART000900885)).
- SPEC 3판: **일치**(조정할 이유 없음). 15px에서 358px 폭은 약 24자, 448px 폭은 약 29자다. 줄 카드 글 칸(320에서 196px, 약 13자)은 짧지만 3줄 요약이라 읽는 문단이 아니다.

**K6. 15px 이하에는 음수 자간을 주지 않는다. 제목의 음수 자간은 -0.02em 이내다.** [C]
- 근거: 2016 고령자 연구에서는 자간이 가독성과 선호에 영향이 없었다. 모바일 한글 서체 연구(구글 본고딕)는 작은 크기에서 글자 사이를 넓히는 것을 권했다 ([KISS](https://kiss.kstudy.com/DetailOa/Ar?key=53327755)). 음수 자간이 좋다는 실험 근거는 찾지 못했다(관례).
- SPEC 3판: **일치**(15px 자간 0, 17~20 -0.01em, 24 -0.02em).

**K7. 한글은 `word-break: keep-all` + `overflow-wrap: break-word`로 어절 단위로 꺾고, 긴 어절은 강제로 꺾는다.** [C]
- 근거: CSS Text의 `keep-all`은 CJK의 음절 사이 줄바꿈을 막는다([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/word-break)). W3C i18n·CSSWG 논의에 따르면 한국어 문단은 음절 단위 줄바꿈도 전통이고, `keep-all`은 제목·광고 문구처럼 짧은 글에 특히 맞다 ([csswg #4285](https://github.com/w3c/csswg-drafts/issues/4285), [i18n #453](https://github.com/w3c/i18n-activity/issues/453)). 가독성 실험은 찾지 못했다.
- SPEC 3판: **일치**(전역 keep-all, 제목 `balance`, 문단 `pretty`).

---

## 3. 대비와 색

**C1. 모든 글자는 바탕과 4.5:1 이상이다(지금 쓰는 모든 바탕 조합: `--bg`·`--surface`·`--fill`·`--fill-press`).** [B]
- 근거: WCAG 1.4.3, AA ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). KWCAG 2.2 "텍스트 콘텐츠의 명도 대비" 4.5:1.
- SPEC 3판: **일치**(ADR-0070 「바다·귤」 기준 최저는 면 버튼 글자 `--on-main` on `--main` 라이트 4.93, 다크는 `--on-main` on `--main-press` 5.46. 보조 글자 최저는 `--muted` on `--fill-press` 5.00 / 5.95).

**C2. 읽는 본문은 7:1 이상이다(AAA). 보조 글자는 4.5:1 이상이면 된다.** [B]
- 근거: WCAG 1.4.6 Contrast (Enhanced), AAA.
- SPEC 3판: **일치.** 본문(`--text`)이 17.79 / 16.44다(ADR-0070). `--muted`는 라이트 6.12(AAA 미달)이지만 보조 글자라 규칙 안이다.

**C3. 입력 칸처럼 테두리가 있어야 무엇인지 알 수 있는 컨트롤은 테두리가 인접색과 3:1 이상이다.** [B]
- 근거: WCAG 1.4.11 Non-text Contrast, AA. "컴포넌트를 식별하는 데 필요한 시각 정보"는 3:1 이상이어야 한다 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- SPEC 3판: **일치**(2026-10-01 반영). 날짜 대체 입력 `.date-in`의 테두리는 새 토큰 `--field-line`(ADR-0070 라이트 `#8a8c8f`, 다크 `#7e8287`)이라 시트(`--surface`) 위에서 3.37 / 4.33이다(`--line`이면 1.28 / 1.55). SPEC 2.2절에 "입력 칸 테두리는 예외"를 적었다. 포커스 링(17.79)과 체크(`--main` 4.93 / 7.59)도 일치한다. 예외 하나: 저장한 곳 화면의 ♥ N 눌림 면(`--fill`) 위 귤 하트가 라이트 2.90이다(ADR-0070 결정 대기).

**C4. (비규범) APCA 기준으로 15~17px/400 글자는 Lc 75 이상, 보조 글자는 Lc 60 이상이다.** [C]
- 근거: APCA(WCAG 3 초안의 후보 대비 공식, 아직 표준이 아님). 본문 글자는 Lc 75가 최소이고 Lc 90을 선호한다. Lc 60은 본문이 아닌 글자의 최소값이다 ([APCA 문서](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)). WCAG 2 공식은 어두운 바탕의 대비를 과대평가한다는 것이 APCA 쪽 주장이다 ([Why APCA](https://git.apcacontrast.com/documentation/WhyAPCA.html)). Dobres, Chahine, Reimer 2017(Applied Ergonomics 60, 흘끗 읽기 과제): 밤 조명에서는 어두운 바탕의 작은 글자가 특히 읽기 어려웠다 ([SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5231071)).
- 직접 계산(APCA 0.0.98G):

  | 짝 | 라이트 WCAG / Lc | 다크 WCAG / Lc |
  |---|---|---|
  | `--text` on `--bg` | 15.65 / 98 | 14.51 / 92 |
  | `--muted` on `--bg` | 5.91 / 76 | 7.39 / **53** |
  | `--muted` on `--surface` | 6.40 / 82 | 6.65 / **52** |
  | `--muted` on `--fill-press` | 4.79 / 63 | 4.80 / **47** |

- SPEC 3판: **라이트 일치, 다크 불일치.** 다크 `--muted`(15/400 메타·설명·각주)는 WCAG 2로는 7.39라 넉넉해 보이지만 APCA로는 Lc 53이다(위 표는 ADR-0070 이전 값. ADR-0070은 다크 `--muted`를 `#b0b3b7`, 바탕 위 8.85로 밝혔고 APCA는 다시 재지 않았다). 이 앱의 기본 사용 상황(밤, 반쯤 딴생각)이 Dobres 2017의 불리한 조건과 겹친다.

**C5. 다크 테마는 시스템 설정을 따르고, 순검정 바탕과 순백 글자는 쓰지 않는다.** [A]+[B]
- 근거: Piepenbrock, Mayr, Buchner 2013(Ergonomics, 청년·고령자): 밝은 바탕에 어두운 글자(양극성)에서 교정 읽기가 더 정확했다. 이 이점은 동공이 작아지는 데서 온다 ([PDF](https://www.psychologie.hhu.de/fileadmin/redaktion/Oeffentliche_Medien/Fakultaeten/Mathematisch-Naturwissenschaftliche_Fakultaet/Psychologie/AAP/Publikationen/2013/Piepenbrock-2013-Positive_display_polarity_is_.pdf)). 그러니 다크를 강제하지 않는다. Material 다크 테마: 바탕은 #121212 계열, 높은 강조 글자는 흰색 87%로 두어 번짐을 피한다 ([Material](https://m2.material.io/design/color/dark-theme.html)). 이 부분은 [B]다.
- SPEC 3판: **일치.** `prefers-color-scheme`만 따르고 테마 전환은 없다. 바탕 #0f1319, 글자 #eef1f5다(ADR-0070). "밤이 기본"은 디자인 우선순위라는 뜻이지 다크를 강제하는 것이 아니다.

**C6. 상태는 색만으로 전달하지 않는다.** [B]
- 근거: WCAG 1.4.1 Use of Color.
- SPEC 3판: **일치.** 선택은 체크 + 굵기 + `aria-pressed`, 저장은 채움 + 색으로 표시한다. ADR-0070(흰 바탕 + 바다·귤·현무암)에서도 그대로다: 체크·선택 탭 밑줄을 바다(`--main`)로 칠할 뿐, 선택을 색이나 채운 면으로 표시하지 않는다. ADR-0070에서 바뀐 규칙은 하나, **주 버튼(`다른 3곳 보기`·`다시 불러오기`·`지금 위치를 숙소로`)이 회색 채움(`--fill`)에서 메인 색 채움(`--main`)으로** 바뀐 것이다. 주 버튼은 상태가 아니라 행동이라 이 규칙과 부딪치지 않는다.

---

## 4. 위계와 밀도

**H1. 한 번에 보여 주는 추천은 3곳이다. 늘릴 때는 사용자가 요청한 뒤에만 3곳씩 바꾼다.** [A, 결과 혼재]
- 근거: Iyengar & Lepper 2000(JPSP, 매장 현장 실험): 잼 6종 진열에서는 시식자의 30%가 샀고 24종 진열에서는 3%가 샀다. 들르는 비율은 24종이 높았다(60% 대 40%) ([요약](https://thinkmotiv.net/the-jam-study/)). Scheibehenne, Greifeneder, Todd 2010(JCR, 50개 실험 63조건, N=5,036 메타분석): 평균 효과 d≈0.02로 거의 0이었고, 연구 간 차이가 컸다 ([PDF](https://scheibehenne.com/ScheibehenneGreifenederTodd2010.pdf)). Chernev, Böckenholt, Goodman 2015(JCP, 99관측, N=7,202): 선택 과부하는 결정 난이도(시간 압박), 선택지 복잡도, **선호 불확실성**, 결정 목표가 있을 때 커진다 ([Wiley](https://myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2014.08.002)). Hick-Hyman 법칙: 선택 시간은 log2(n+1)에 비례한다. 다만 순서 없는 목록을 훑을 때는 선형으로 늘어난다 ([Rosati](https://www.lucarosati.it/download/papers/hick-law-classification.pdf)).
- 판단: "선택지가 적을수록 좋다"는 일반 법칙은 약하다. 하지만 이 앱 사용자(계획 없음, 반쯤 딴생각, 지금 당장)는 Chernev의 조절 변수(선호 불확실, 시간 압박)에 정확히 해당한다. 3곳은 근거와 맞는다.
- SPEC 3판: **일치.** 3곳이고, 첫 장이 크고, `다른 3곳 보기`는 요청할 때만이다.

**H2. 화면에서 가장 큰 글자는 사용자가 결정할 대상(장소 이름)이고, 이름은 왼쪽 정렬로 각 덩이의 첫 줄에 온다.** [A]
- 근거: NN/g 시선 추적 2006(232명) / 2017 재확인: F형 훑기와 레이어 케이크형(제목만 훑고 본문은 건너뜀) 패턴 ([F-pattern](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/), [Layer-cake](https://www.nngroup.com/articles/layer-cake-pattern-scanning/)). 사람들은 왼쪽 첫머리만 읽고 넘어간다.
- SPEC 3판: **일치**(첫 장 이름 20/700이 가장 크고, 기분은 17/600으로 접힘, 모두 왼쪽 정렬).

**H3. 한 화면의 글자 크기는 3단계 이하, 굵기는 3종 이하다. 인접한 두 단계는 크기 비율 1.125 이상이면서 굵기나 색 중 하나도 다르다.** [C]
- 근거: 관례(모듈러 스케일, 플랫폼 타입 스케일). 단계 수와 비율에 대한 통제 실험은 찾지 못했다.
- SPEC 3판: **일치.** 15→17은 1.13, 17→20은 1.18, 20→24는 1.2다. 15/400과 17/600은 크기 차이가 작지만 굵기로도 갈린다.

**H4. 묶음 안 간격은 묶음 사이 간격의 절반 이하다.** [C]
- 근거: 게슈탈트 근접성 원리(Wertheimer 1923). 수치 기준은 관례다.
- SPEC 3판: **일치**(묶음 안 2~12, 묶음 사이 16~28).

---

## 5. 움직임과 피드백

**M1. 누름 피드백은 0.1초 안에 시작한다.** [A/B]
- 근거: Miller 1968, Card 외 1991, Nielsen 1993. 0.1초는 즉시 반응으로 느끼는 한계, 1초는 생각의 흐름이 끊기지 않는 한계, 10초는 주의를 붙잡아 둘 수 있는 한계다 ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)).
- SPEC 3판: **일치.** 누름 반응은 즉시 시작하는 120ms 전환이다.

**M2. 400ms 안에 끝나는 응답에는 대기 표시를 띄우지 않는다. 그보다 길면 자리 표시를 보이고, 10초가 넘으면 실패 안내와 다음 행동을 보인다.** [A, 근거 오래됨]
- 근거: Doherty & Thadani 1982(IBM Systems Journal, 사내 생산성 자료): 응답이 400ms 아래로 내려가면 사용자의 다음 입력도 빨라졌다 ([요약](https://www.ux-guidelines.com/doherty-threshold.html)). Nielsen의 10초 한계(M1).
- SPEC 3판: **일치**(2026-10-01 반영). 300ms가 지나면 회색 틀을 띄운다. 데이터 요청 타임아웃은 10초(11.2, `DELAYS.dataTimeout`)이고 그 뒤 목록 실패 안내와 `다시 불러오기`를 보인다(늦게 온 목록은 그대로 쓴다). GPS는 3초 뒤 `지역으로 고르기`를 붙인다.

**M3. 자리 표시를 띄웠으면 최소 약 300ms는 유지해서 깜빡이지 않게 한다.** [C]
- 근거: 관례(301~350ms에 응답이 오면 틀이 한 번 번쩍인다). 실험 근거는 찾지 못했다.
- SPEC 3판: **미정의.** 6.7에 최소 표시 시간이 없다.

**M4. 화면 안 전환은 200~300ms이고, 퇴장이 등장보다 짧다.** [B]
- 근거: Material motion: 모바일 전환은 약 300ms, 들어오는 요소 225ms, 나가는 요소 195ms ([Material](https://m1.material.io/motion/duration-easing.html)).
- SPEC 3판: **일치**(시트 240/190, 딤 200/160).

**M5. `prefers-reduced-motion: reduce`에서는 상호작용으로 생기는 모든 움직임을 끈다.** [B]
- 근거: WCAG 2.3.3 Animation from Interactions, AAA ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).
- SPEC 3판: **일치**(모두 `no-preference` 안에만 있고 `closing` 대기도 0ms).

**M6. 반복해서 보는 결과(카드)에는 등장 애니메이션이 없다.** [C]
- 근거: 관례. M1·M2와 2.3.3의 취지에서 끌어낸 규칙이다.
- SPEC 3판: **일치.**

---

## 6. 입력과 한 손 사용

**F1. 1년 안 가까운 날짜는 네이티브 날짜 선택기로 고르고, 직접 입력도 받는다.** [B/C]
- 근거: NN/g Date-Input 지침: 달력 선택기는 현재에 가까운 날짜(1년 안)에 맞는다. 모바일에서는 선택기 없이 직접 칠 수도 있어야 하고, 구분자(-./ 공백) 형식은 자유로 받는다 ([NN/g](https://www.nngroup.com/articles/date-input/), 검색 요약).
- SPEC 3판: **일치**(오늘~+365의 `showPicker()`, 없으면 입력 칸 + `이 날로`/Enter). 형식 자유 입력은 `<input type="date">`라 브라우저가 맡는다.

**F2. 입력 칸 글자는 16px 이상이다(iOS Safari 확대 방지).** [B, 플랫폼 동작]
- 근거: iOS Safari는 계산된 글자 크기가 16px 미만인 입력 칸에 포커스가 가면 페이지를 확대한다. 확대가 풀리지 않아 시트 배치가 깨진다. Apple 공식 문서는 아니고 널리 재현된 WebKit 동작이다 ([예: 설명](https://thingsthemselves.com/no-input-zoom-in-safari-on-iphone-the-pixel-perfect-way/)).
- SPEC 3판: **일치**(2026-10-01 반영). `.date-in`은 `font: inherit` 뒤 `font-size: max(1rem, 16px)`라 16px이다. 크기 단계의 유일한 예외로 SPEC 3.2절과 14절 #7에 적었다.

**F3. 오류는 칸 근처에 글자로, 버튼 글자를 덮지 않고, 스크린리더에 알린다.** [B]
- 근거: WCAG 3.3.1 Error Identification, 4.1.3 Status Messages.
- SPEC 3판: **일치**(`p.form-err`, `role="alert"`).

**F4. 시트의 닫기와 주 행동은 엄지 쪽(아래)에 있고, 딤 탭·뒤로가기·Esc로도 닫힌다.** [A, T4]
- SPEC 3판: **일치**(6.10, 위쪽 닫기 없음).

**F5. 차 안에서는 동승자가 고르고 운전자는 길 안내만 본다: 운전 중 읽거나 입력할 기능 없음, 카드에서 길 안내까지 한 탭.** [B]
- 근거: 도로교통법 제49조 제1항 제10호는 운전 중 휴대전화 사용을 금지한다(정지 중·긴급 등 예외). 미국 NHTSA 운전자 주의 분산 지침(2013, 차량 내장 기기 대상)은 한 번 보는 시간 2초 이하, 한 작업의 화면 보기 합계 12초 이하를 기준으로 삼는다. 둘 다 운전자를 겨냥한 규범이라 이 앱은 운전자가 쓰는 화면을 만들지 않는 쪽으로 따른다.
- SPEC 3판: **일치**(2026-10-01 ADR-0067 반영). 1절 원칙 13, 카드마다 `길찾기`(카카오맵 자동차 길찾기 한 탭, 6.5절), 누름 영역 48(T2).

---

## 7. SPEC 3판 대조 요약

| 규칙 | 값 | SPEC 3판 | 상태 |
|---|---|---|---|
| T1 최소 대상 | ≥44px | 최소 44 | 일치 |
| T2 자주 누르는 대상 | ≥48, 엄지 대상 ≥56 | 하트·`바꾸기`·`위로` 등 누름 영역 48(그린 크기 44) | 일치 |
| T3 인접 간격 | ≥8, 2.5.8 | 8 / 24 | 일치 |
| T4 엄지 구역 | 주 행동 아래 | 아래 2/3 | 일치 |
| K1 본문 크기 | 16~17 | 15 | **부분 불일치** |
| K3 본문 행간 | 1.5~1.6 | 1.5 | 일치 |
| K5 줄 길이 | 라틴 45~75 | 한글 약 24~29자 | 일치(근거 약) |
| K6 자간 | ≤15px 음수 없음 | 0 | 일치 |
| K7 줄바꿈 | keep-all | keep-all | 일치(근거 약) |
| C1 글자 대비 | ≥4.5 | 최저 4.93(ADR-0070 주 버튼 글자) | 일치 |
| C3 입력 테두리 | ≥3:1 | `.date-in` `--field-line` 3.37 / 4.33 | 일치 |
| C4 APCA(비규범) | 보조 ≥Lc 60 | 다크 `--muted` Lc 47~53 | **불일치(비규범)** |
| C5 다크 | 시스템 따름, 순흑백 없음 | 일치 | 일치 |
| H1 추천 수 | 3 | 3 | 일치 |
| H3 크기 단계 | 한 화면 ≤3 | 3 | 일치 |
| M2 대기 | 0.4초 / 10초 | 0.3초 / 10초 | 일치 |
| M3 깜빡임 | 최소 표시 약 300ms | 없음 | 미정의 |
| M4 전환 | 200~300ms | 240/190 | 일치 |
| M5 동작 줄이기 | 끔 | 끔 | 일치 |
| F2 입력 글자 | ≥16px | 16px(`max(1rem, 16px)`) | 일치 |

---

## 8. 권장 변경 (우선순위순, 코드는 바꾸지 않음)

**P1. 기능·규범 위반(바로 고칠 것)**

1. **`.date-in` 글자 16px**(F2). **반영함(2026-10-01).** `font: inherit` 뒤에 `font-size: max(1rem, 16px)`를 둔다. 이렇게 하면 크기 단계(3.2 "4개만")에 예외가 하나 생긴다. 이 예외를 SPEC 3.2와 14절 #7에 명시한다.
2. **`.date-in` 테두리 3:1 이상**(C3). **반영함(2026-10-01).** 입력 칸 전용 테두리 색: 라이트 `#8a8f8c`(`--surface` 위 3.29), 다크 `#6b706d`(3.18). `--line`은 그대로 두고 새 토큰(예: `--field-line`)을 하나 둔다. 2.2절의 "면·가는선은 대상 아님" 문장에 "입력 칸 테두리는 예외"를 덧붙인다.

**P2. 근거가 분명한 개선(다음 판에서 검토)**

3. **자주 누르는 44px 대상을 48px로**(T2). **반영함(2026-10-01)**: 하트 `margin`·`.tbtn` `min-height`를 바꾸지 않고 빈 가상 요소로 누름 영역만 넓혀 배치(4절 y 좌표)가 그대로다. `이 날로`도 넣었다. 대상: 카드 하트, `바꾸기`·`돌아가기`, 식사 탭, `언제` 칸, `위로`·`아래로`·`다른 날로`. 보이는 크기는 그대로 두고 히트 영역만 키운다(하트 `margin` -10 → -12, `.tbtn` `min-height: 48px`). 상단 줄 52px 안의 기준·♥ N은 44를 유지해도 된다(드문 보조 행동, T4). 결과 화면 세로 확인값(4절 y 좌표)이 4~8px 바뀌니 e2e 기대값도 함께 바꾼다.
4. **데이터 요청 타임아웃 15초 → 10초**(M2). **반영함(2026-10-01).** 10초가 지나면 6.8의 목록 실패 안내와 `다시 불러오기`를 보인다.

**P3. 근거가 약하거나 엇갈리는 것(사용자 판단이 필요)**

5. **다크 `--muted` 밝히기**(C4, 비규범). `#a3a8a5` → `#b8bcb9`로 바꾸면 `--bg` 위 Lc 65, `--fill-press` 위 Lc 58이 된다. 대가는 `--text`(Lc 92)와 위계 차이가 줄어드는 것이다. WCAG 2로는 이미 통과하므로 APCA를 따를지는 결정 사항이다.
6. **읽는 본문 15 → 16~17px**(K1). 첫 장 이유를 17px로 올리면 "한 화면 3단계"(결과 20·17·15)는 유지되지만 이름 17/600과 크기가 같아지고 굵기로만 갈린다. 대안은 크기 단계를 15/400 → 16/400으로 통째로 올리는 것이다(줄 카드 13자 칸에서 줄 수가 늘어남). 플랫폼 기본값은 근거가 강하지만 한글 실험은 15 근방도 최적이라고 읽히므로 **필수가 아니다**. 프로토타입으로 320·390에서 비교한 뒤 결정한다.
7. **회색 틀 최소 표시 약 300ms**(M3). 관례. 실제로 깜빡임이 보일 때만 넣는다.
8. **첫 장 이유 행간 1.5 → 1.6**(K3). 결과가 엇갈리므로 선택 사항이다.
9. **e2e에 WCAG 1.4.12 덮어쓰기 검사 추가**(K4). 행간 1.5배, 자간 0.12em 등을 주입한 뒤 `scrollWidth ≤ clientWidth`와 버튼 글자가 잘리지 않는지 본다.

---

## 9. 확인하지 못한 것

- WebFetch가 막혀 NN/g, KRDS, KWCAG 2.2(a11ykr), DBpia, KoreaScience, 디지털콘텐츠학회 원문을 열지 못했다. 해당 수치는 검색 결과 요약을 따랐다(KRDS 17px·150%, KWCAG 대각선 6.0mm, NN/g 날짜 입력, 한글 2.4mm 연구). Parhi 2006 PDF는 받았지만 이 환경에 PDF 도구가 없어 본문을 읽지 못했다. 수치는 초록과 검색 요약에서 가져왔다.
- 한글 줄 길이(신종현·박민용 2003)와 한글 행간의 최적값은 원문 수치를 확인하지 못했다. 이 부분의 규칙은 [C]다.
- "44pt보다 작으면 탭 오류 25% 이상" 같은 2차 블로그 수치는 원 출처를 찾지 못해 쓰지 않았다.
- Piepenbrock 2013의 "26% 더 빨리 읽음" 같은 수치도 원문을 확인하지 못해 쓰지 않았다.
