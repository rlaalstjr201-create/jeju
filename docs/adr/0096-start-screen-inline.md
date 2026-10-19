# ADR-0096: 시작 화면은 앱 번들 밖 인라인으로

Status: Accepted (2026-10-19, `plans/busan.md` 2판 ADR #2, S5에서 씀). ADR-0094 2(시작 화면)를 어떻게 만드는지 정한다. 용어는 `docs/context.md`의 **여행지**·**시작 화면**.

## Context

- 시작 화면은 저장소가 빈 첫 방문에만 뜬다(spec 1.1의 넷째 경우). 앱 번들이 정하면 제주 홈이 먼저 그려졌다가 덮인다.
- 한국어 진입 JS+CSS는 gzip 50KB 예산 안이어야 한다(ADR-0093 Amendment 4). 부산 경계 꼭짓점·판정 코드를 첫 그리기 전에 넣으면 그만큼 늘어난다.
- 출시 스위치가 꺼진 빌드의 제주 HTML은 바이트까지 그대로여야 한다(`npm run check:jeju`, 검토 M3 b).

## Decision

1. **판정은 `index.html` `<head>` 인라인**(언어 고르기 다음). 순서: `?area=` 부산 slug 12개 → 부산, `?stay=`가 제주 네모 안 → 제주·밖 → 부산 후보, 그 밖의 딥링크 키(`mood`·`reach`·`date`·`indoor`·`area`)·`/jeju/**` 같은 사이트 referrer → 제주, `jeju.dest` 기억, `jeju.` 키 하나라도 → 제주(이전 기기). 결과는 `window.__dest`·`__destBy`. 넷 다 아니면 `<html>`에 `.yc-start`.
2. **덮개 DOM은 쓸 때만**: `<body>` 첫 인라인이 `.yc-start`일 때만 `#ycStart`(`role="dialog"`, `aria-modal="true"`, 처음 초점 큰 버튼)를 `#app` 앞에 만든다. 정적 HTML에 새 요소는 없다. 네 언어 문구는 인라인 작은 표(`window.__ycT`).
3. **GPS 판정과 경계 꼭짓점은 앱**: 인라인은 위치를 읽지 않는다. 큰 버튼은 `__startTap`·`yc:start-gps`만 남기고 앱(`src/start.ts`)이 위치를 읽어 `releasedDestOf`로 정한다. `?stay=` 부산 후보도 앱이 경계로 확정한다(두 여행지 밖이면 버리고 제주). 칸 고르기는 인라인이 `jeju.dest`를 쓰고 `__startPick`·`yc:dest`를 남긴다. 앱이 오기 전에 누른 것은 마운트 때 처리한다.
4. **`granted` 순서(검토 M4)**: 권한이 이미 `granted`면 덮개가 그려진 채로 앱이 읽는다(큰 버튼 `위치 확인 중…`). 여행지 안이면 덮개를 걷고 그 여행지, 실패면 처음 상태, 밖이면 밖 문구. 덮개는 첫 그리기부터 있고 걷히기만 한다.
5. **꺼진 빌드는 블록을 지운다**: 두 블록은 `<!--busan-->…<!--/busan-->`로 감싸고, `vite.config.ts` `busanBlock`이 mode `busan`이 아니면 통째로 지운다(켠 빌드는 표시만 지운다).

## Consequences

- 꺼진 빌드의 `dist/index.html`은 S0과 같은 바이트다(`check:jeju` 통과, 2026-10-19).
- 켠 빌드 HTML은 인라인 두 블록만큼 커진다(상한: gzip +2KB, plans/busan.md 위험 표).
- 인라인 slug 표(12개)와 `src/areas.ts` `BUSAN_AREAS`는 따로 있다. `tests/start.test.ts`가 인라인 판정 표를 jsdom에서 돌려 맞춘다.
- 크롤러(저장소 없음)는 덮개를 본다. 홈 본문 DOM은 그대로라 색인 글은 같다. 4주 판정은 spec 9·plan M5대로.
