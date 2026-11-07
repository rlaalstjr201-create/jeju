# 포트폴리오 스크린샷 목록

라이브 앱 https://yeogwi.pages.dev 를 2026-10-03에 Playwright(Chromium)로 찍었다. 휴대폰 화면은 390×844(deviceScaleFactor 기본값 1), 데스크톱은 1440×900이다. 모든 로드 전에 init script로 localStorage `jeju.track=false`(기록 끄기, ADR-0061), `jeju.basis="region"`, `jeju.region="애월"`을 넣었다.

**사용 기록 미발생 확인**: 홈 로드, 기분 탭, 하트 저장, /jeju/aewol/, /privacy를 도는 동안 요청 리스너를 걸어 두었고, `/api/events`·google-analytics·googletagmanager·wcs(네이버 애널리틱스)로 가는 요청은 0건이었다. 요청이 간 호스트는 `yeogwi.pages.dev`와 `api.cdn.visitjeju.net`(사진) 두 곳뿐이다. 앱 화면에도 「기록 켜기」 버튼이 떠 있어 기록이 꺼진 상태임을 보여 준다. 혹시 몰라 같은 패턴의 요청은 route로 차단해 두었지만, 실제로 시도된 요청은 하나도 없었다.

| 파일 | 보이는 것 | 촬영 방법 |
|---|---|---|
| 01-home-light.png | 애월 기준 홈 첫 화면(라이트): 기분 4개, 아무거나, 다른 동네 | 2026-10-03, 390×844, 첫 화면만, colorScheme light |
| 02-home-dark.png | 01과 같은 화면의 다크 모드 | 2026-10-03, 390×844, emulateMedia colorScheme dark |
| 03-home-full.png | 애월 기준 홈 전체 페이지(라이트) | 2026-10-03, 390 폭, fullPage, light |
| 04-results-food.png | 「맛있는 거 먹고 싶어」 결과: 식사 탭, 대표 1곳과 「아니면」 2곳 | 2026-10-03, 390×844, sessionStorage 비운 상태에서 탭, 이미지 로드 후 |
| 05-results-walk-full.png | 「좀 걷고 싶어」 결과 전체 페이지 | 2026-10-03, 390 폭, fullPage |
| 06-results-indoor.png | 실내만 켠 결과: 헤더 「애월 근처 · 실내만」과 「차로 30분 안의 실내 중에서…」 안내 줄 | 2026-10-03, 390×844, sessionStorage `jeju.indoor="true"` 뒤 「좀 걷고 싶어」 탭 |
| 07-basis-sheet.png | 기준 시트: 언제(지금·내일·날짜), 어디, 얼마나, 날씨(비 와요) | 2026-10-03, 390×844, `#basis` 탭 |
| 08-any.png | 「아무거나 골라줘」 결과 | 2026-10-03, 390×844, 새 세션에서 탭 |
| 09-saved.png | 저장한 곳 2개 목록(오늘): 애월 우니담, 애월은혜전복 | 2026-10-03, 390×844, 맛집 결과에서 하트 2개 탭 후 `#saved`(♥ 2) 탭. 촬영 뒤 저장 목록은 지움 |
| 10-rain-row.png | 홈 날짜 칸 아래 「비 소식 · 실내만 볼까요? 날씨: 기상청」 줄 | 2026-10-03, 390×844, `**/api/rain*` 응답을 `{"area":"aewol","pop":80,"rain":true,"base":"x","from":"기상청"}`로 바꿔치기(가로채기 1회 확인) |
| 11-landing-hub.png | /jeju/ 동네 허브 랜딩 첫 화면 | 2026-10-03, 390×844 |
| 12-landing-area.png | /jeju/aewol/ 애월 랜딩 첫 화면 | 2026-10-03, 390×844 |
| 13-landing-place.png | /jeju/aewol/ 에서 처음 나오는 장소 페이지(/jeju/aewol/aewoldeoseonset/, 애월더선셋) | 2026-10-03, 390×844 |
| 14-privacy.png | /privacy 개인정보 처리 안내 첫 화면 | 2026-10-03, 390×844 |
| 15-desktop-home.png | 데스크톱 홈 첫 화면(애월 기준) | 2026-10-03, 1440×900, light |
| 16-og.png | 공유 미리보기 이미지(OG) | 새로 찍지 않고 `apps/web/public/og.png`를 복사 |

## history/ (디자인 변천, 기존 이미지 복사)

| 파일 | 보이는 것 | 원본 |
|---|---|---|
| before-home.jpeg | 홈 개편 전, UX 감사 때 찍은 우리 앱 홈 | docs/research/ux-audit/shots/ours-T1-390-01.jpeg |
| audit-onuljeju-home.jpeg | UX 감사 비교 대상: 오늘제주 홈 | docs/research/ux-audit/shots/onuljeju-T1-390-01.jpeg |
| audit-myrealtrip-home.jpeg | UX 감사 비교 대상: 마이리얼트립 홈 | docs/research/ux-audit/shots/myrealtrip-home-390-03.jpeg |
| audit-daangn-home.jpeg | UX 감사 비교 대상: 당근 홈 | docs/research/ux-audit/shots/daangn-home-390-01.jpeg |
| mockup-a.jpeg | 홈 개편 목업 A 전체 | apps/web/design/proto-d/shots/a-390-full.jpeg |
| mockup-b.jpeg | 홈 개편 목업 B 전체 | apps/web/design/proto-d/shots/b-390-full.jpeg |
| mockup-a2.jpeg | 목업 A 2차안 전체 | apps/web/design/proto-d/shots/a2-390-full.jpeg |
| mockup-b2.jpeg | 목업 B 2차안 첫 화면 | apps/web/design/proto-d/shots/b2-390-first.jpeg |
| after-home.jpeg | 개편 후 홈(이름 바꾼 뒤 QA 촬영) | apps/web/design/qa/home-refresh/rename-home.jpeg |
| early-1.png | 초기 프로토 A 홈: 날짜와 「내일은 어떤 기분이에요?」, 글자뿐인 기분 목록(화살표 있음) | apps/web/design/shots/proto-a-home-390-light.png |
| early-2.png | 초기 프로토 C 홈: A와 같은 구성인데 화살표를 빼고 구분선만 남긴 안 | apps/web/design/shots/proto-c-home-390-light.png |
| early-3.png | 초기 프로토 B 맛집 결과 카드 | apps/web/design/shots/proto-b-food-390-light.png |
| early-4.png | 첫 QA 라운드(r1) 맛집 결과: 큰 사진 1장과 「아니면」 2곳, 「내 주변」 기준 | apps/web/design/qa/shots-r1/cards-food-390-light.png |

지정한 원본 9개는 모두 있었다. 복사하지 않은 초기 이미지는 아래와 같다.
- `apps/web/design/shots/proto-{a,b,c}-{home,cards,food,saved,sheet,empty}-{320,390}-{light,dark}.png`: 프로토 A·B·C를 화면별·테마별로 찍은 것(42장).  2026-11-07 저장소에서 뺌(git 기록 `0bbb82db`에 남음).
- `apps/web/design/qa/shots-r1/`(142장), `shots-r2/`(185장): 1·2차 QA 시나리오 촬영(홈, 기분별 카드, 위치 거부, 기준 시트, 저장, 200% 확대 등).
- `apps/web/design/qa/home-refresh/`: 홈 개편 QA(u1 실내만 켬/끔, u3 GPS·구제주 라이트/다크, u5 비).
- `apps/web/design/proto-a/`, `proto-b/`, `proto-c/`: 이미지 파일 없음. 2026-11-07 저장소에서 뺌(git 기록 `0bbb82db`에 남음).
