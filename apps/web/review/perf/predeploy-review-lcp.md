# 배포 전 독립 리뷰 — 첫 방문 LCP 고침 (c3849ca1..56c952a8)

2026-11-05. 소스는 읽기만 했다. 테스트·빌드·미리보기(https://lcp-start.yeochana.pages.dev) 확인만 했다.

## 결론

배포해도 된다. 시작 화면을 걷는 길 세 곳(start.ts `close`, app.ts `BUSAN && !starting`)이 모두 `showPhotos`를 부른다. 걷은 뒤에 만들어지는 사진은 처음부터 `src`를 받는다. 시작 화면이 없는 방문(다시 온 사람, 링크로 온 사람)과 제주 전용 빌드는 바뀌지 않는다. MAJOR는 없다. MINOR가 하나 있는데, 첫 그리기 단계 사이 한 프레임 안에 시작 화면을 닫으면 아래쪽 다른 동네 타일 사진 일부가 비어 남을 수 있다.

## 확인한 것

- **명령**
  - `npx tsc --noEmit -p .`: 통과
  - `npx vitest run`: 83 파일, 1715 통과, 109 건너뜀
  - `npm run test:nation`: 91 파일, 1823 통과, 1 건너뜀
  - `SITE_URL=https://yeochana.com npm run build`: exit 0
  - `npm run check:jeju`: 한국어 진입 60,073 B로 예산 70,000 B 안이다(기준 59,994 B, +79 B). 켜진 빌드의 인라인 블록은 +1,912 B로 상한 2,000 B 안이다. 바뀐 것은 `files.sw.js` 해시 하나뿐이다. 이건 precache 목록이 바뀌어서 생기는 예상된 차이다. 그래서 exit 1이 났지만 위반은 아니다.
- **시작 화면을 걷는 길**
  - 클래스 `yc-start`를 지우는 곳은 `src/start.ts:102`(close)와 `src/app.ts:233` 두 곳뿐이다(`grep -rn yc-start src/`). 두 곳 모두 바로 뒤에 `showPhotos(doc)`를 부른다.
  - close를 부르는 곳은 셋이다. `pick`(제주·부산 직접 고르기), `gps` 성공, 자동 지역 `nation`(인기 칸·다른 곳)이다.
  - app.ts의 `!starting` 길도 덮는다. 부산 조각이나 시작 화면 모듈을 못 받은 폴백(`fellBack`)이 이 길로 가고, 클래스는 있는데 `#ycStart`가 없는 경우도 이 길로 간다.
- **링크·다시 온 사람·언어**
  - index.html 첫 스크립트는 `d`(링크 dest/area/stay/mood…, referrer /jeju, 저장된 jeju.dest, 옛 jeju.* 키)가 정해지면 `yc-start`를 붙이지 않는다. 그러면 render.ts가 처음부터 `src`를 쓴다.
  - en/ja/zh-Hans 페이지도 같은 인라인 스크립트(`h.lang`으로 문구만 고름)와 같은 코드 길을 탄다.
- **제주 전용 빌드**: `vite.config.ts` busanBlock이 `--mode jeju`에서 `<!--busan-->` 블록을 통째로 뺀다. 그래서 `yc-start`가 생길 수 없고 사진은 늘 `src`다.
- **덮인 동안 다시 그리기**
  - examples()는 매번 `.pair`를 지우고 새 img를 만든다. renderNow도 `replaceChildren`으로 새로 만든다. 덮인 동안 새로 만든 것은 `data-later`를 받고, 닫을 때 문서 안에 있으면 바뀐다.
  - 닫은 뒤 만들어지는 img는 클래스 검사에서 `src`를 받는다.
- **깨진 사진 기록**: `app.ts:1466` capture `error` 리스너는 `els.main`에 걸려 있다. src가 없는 img는 error를 내지 않는다. 그래서 덮인 동안 깨진 사진으로 잘못 기록되는 일이 없다. src를 넣은 뒤의 실패는 평소처럼 `imgError`로 간다.
- **덮인 동안 사진을 만드는 다른 곳**
  - render.ts의 img 생성은 세 곳이다(633 카드, 1210 homePhoto, 1325 now). 카드(결과·저장 목록)는 홈 화면이 아니다. 저장 목록도 첫 방문이면 비어 있다. 옛 jeju.* 키가 있으면 시작 화면이 안 뜨기 때문이다.
  - `browse-view.ts:63`은 둘러보기 화면이라 첫 화면 아래에 그려지지 않는다.
  - index.html에는 `<img>`가 없다.
- **미리보기 브라우저 확인**: localStorage를 비우고 새로고침해 확인했다.
  - 덮인 동안: `yc-start` 있음, img 27개 모두 `data-later`, img 리소스 요청 0건.
  - 「제주」를 누른 뒤: 클래스 없음, `data-later` 0개, 27개 모두 src, 22개 로드(나머지는 lazy).
  - 다시 열기(저장된 선택이 있음): 시작 화면 없이 27개 모두 src.
- **테스트**: 새 케이스(`tests/start.test.ts`)는 GPS 성공으로 close할 때 `showPhotos`가 손으로 만든 `data-later` img를 바꾸는지만 본다. 의미는 있지만 범위가 좁다(MINOR 2).

## MAJOR

없음.

## MINOR

1. **첫 그리기 단계 사이에 닫으면 다른 동네 타일 사진이 빈다.**
   - `render.ts` 1433~1458의 stageHome 4단계는 7번째부터의 다른 동네 타일(`late`, homePhoto 포함)을 DOM에서 떼어 둔다. 5단계는 다음 afterPaint에 그것을 다시 붙인다.
   - 그 사이(약 한 프레임)에 close가 불리면 `showPhotos`는 문서 안의 img만 찾으므로 떼어 둔 타일은 놓친다. 그 타일들은 `data-later`를 단 채 다시 붙는다.
   - 다음 홈 다시 그리기(homeSig가 바뀔 때)가 와야 고쳐진다. 직접 「제주」를 고르는 경우 그 전에도 제주가 그려져 있었으므로 sig가 그대로일 수 있다.
   - 창은 데이터가 처음 들어온 직후 한 프레임뿐이다. 홈 아래쪽 타일이다. 그래서 MINOR로 둔다.
   - 고친다면 5단계에서 append할 때 클래스를 다시 보거나, `showPhotos`를 `late`에도 적용하면 된다.
2. **테스트가 연결부를 덮지 않는다.**
   - render.ts가 `yc-start` 아래에서 `data-later`를 쓰는지 보는 테스트가 없다.
   - app.ts 폴백 길(`!starting`)에서 `showPhotos`가 불리는지, `pick`·`nation` close 길을 보는 테스트도 없다.
   - 지금은 코드 읽기와 미리보기로만 확인된 상태다.
3. **LCP 효과의 해석 범위.** 문서(`docs/perf/lighthouse-2026-11-05-lcp.md`)가 이미 적어 둔 대로, 이 고침은 첫 방문 LCP만 바꾼다. 닫은 직후 사진 요청은 시작 화면을 닫은 시점부터 시작하므로, 첫 방문자가 홈 사진을 보는 시각은 그만큼 늦어진다. 의도된 교환이다. 보고할 때 「홈 사진이 빨라졌다」로 읽지 않는다.

MAJOR: 0
