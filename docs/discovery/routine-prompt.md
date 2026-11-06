# 클라우드 루틴 프롬프트 초안 — 서울 매일 발굴 (ADR-0123)

> 이 파일은 초안이다. 루틴 갱신은 주인이 한다. 지금의 주 1회 「이번 주 서울」 루틴 프롬프트를 아래로 바꾸고, 실행 주기를 **매일 KST 04:30**(UTC 19:30)으로 바꾼다. 환경에 `.env`(저장소 루트)에 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET·KAKAO_REST_API_KEY가 있어야 한다. 유료 AI API는 쓰지 않는다 — 옮겨 적기·판정·감사는 이 루틴 안의 하위 에이전트가 한다.

---

여차나(저장소 루트, 앱 `apps/web`)의 **서울 매일 발굴** 하루 회차를 돌린다. 기준은 `apps/web/review/seoul-discovery/criteria-02.md`(사전등록, 고치지 않는다 — 기준 01에서 장소 확인·끝나는 날·로고 그림을 고친 것, ADR-0123 Amendment 1), 스펙 `specs/seoul-discovery.md`, 결정 ADR-0123. 모든 명령은 `apps/web`에서 `node scripts/seoul-discovery/discover.mjs <단계>`로 한다. 날짜 D는 오늘 KST(명령이 스스로 정한다).

규칙:
- 각 단계는 오늘 한 번. 명령이 「exists (one run a day)」로 멈추면 그 단계는 이미 끝난 것이다. 끊긴 호출은 같은 명령으로 이어 간다. 판정·감사는 다시 돌리지 않는다. 어느 단계든 기계적 실패(키 없음, API 오류, 카카오 하루 한도)가 나면 **그날은 거기서 멈추고** 아무것도 push하지 않은 채 무엇이 왜 멈췄는지 보고한다.
- 키 값을 출력·파일·커밋 어디에도 남기지 않는다. `git add -A` 금지, amend 금지, 강제 push 금지. build:spots 금지. 코드·기준·테스트를 고치지 않는다(자료와 review 파일만 바뀐다).
- push에는 `apps/web/data/seoul/discovery-seoul.json`과 `apps/web/review/seoul-discovery/` 아래 파일만 들어가야 한다(그래야 GitHub 워크플로가 자동 배포한다).

순서:
1. `sweep` — 끝난 것 빼기, 8주 된 새로 연 곳 올리기·내려보내기, 7일마다 폐업 신호. (판정 없음)
2. `collect` — 검색어 표로 네이버 블로그·뉴스를 모아 `days/D/raw.json`, `days/D/extract/in-NN.txt`를 만든다.
3. **옮겨 적기**: 하위 에이전트 하나(기계적 작업, Sonnet 급)에게 `days/D/extract/in-NN.txt`마다 `out-NN.json`을 쓰게 한다. 지시는 criteria-02 2절 그대로다 — 글에 있는 말만, 바깥 검색 금지, 칸 `name·kind(팝업|전시|마켓|축제|행사|새로 연 곳)·word(새로 연 곳의 업종 낱말, 기준 6절 목록)·placeText·start·end(YYYY-MM-DD, 해 없으면 올해, 11·12월 글의 1·2월은 다음 해)·time·reserveText·from(글 번호 배열)`, 같은 것은 한 파일 안에서 하나로, 식당·편의점 신상품·온라인·분양·채용·서울 밖·이름 없는 것은 옮기지 않음, 없으면 `[]`.
4. `queue` — 장부에 있는 것·대형 체인·유흥 이름을 빼고 하루 60곳을 뽑는다.
5. `enrich` — 근거(블로그 10·뉴스 5·카카오)를 붙여 `days/D/judge/in-NN.json`. 카카오는 글의 장소 글자·주소를 먼저 찾고, 결과 주소의 구·동(또는 동네 700m)이 글의 동네와 맞는 것만 장소로 둔다(기준 02 4절).
6. **판정**: `judge/in-NN.json`마다 **새 Opus** 하위 에이전트 하나(이 대화도 다른 묶음도 보지 않은)에게 criteria-02 전체와 그 파일만 주고 `judge/out-NN.json`을 쓰게 한다. 지시: 5·6절대로 행마다 keep·drop 한 번, 확신 없으면 drop, 웹 검색·URL 열기 금지, 모델 지식은 체인·이름난 곳 판단에만. 새로 연 곳은 `end = start + 55일`(날짜 표를 함께 준다: D−28일부터 D+7일까지 각 날짜 → +55일). 출력은 입력 cid마다 한 객체 `{cid, keep, kind, word, start, end, time, reserve, src, why}`. 판정자에게 특히 일러 둘 것(기준 02): 카카오 장소는 글의 동네(`area`)와 맞는 것만 들어 있으니 비어 있으면 A로 drop, **끝나는 날을 확정할 수 없으면 drop**(다른 지점·다른 회차의 날짜, 다른 글 제목에 지나가듯 나온 날짜는 근거가 아니다). 하루 판정은 `queue`가 정한 60곳 상한 안이다.
7. `ship` — 형식 검사·같은 상호 한 곳을 거쳐 `data/seoul/discovery-seoul.json`에 더한다.
8. `images` — 오늘 실린 것의 출처 페이지(기사·공식 사이트) og:image를 붙인다.
9. **주간 감사 — 주 1회**(장부 `lastAudit`가 7일 이상 전일 때만): `audit-sample` → **새 Opus** 하위 에이전트(판정을 보지 않은, 판정 파일·key 파일·장부·자료를 열지 말라고 지시)에게 criteria-02와 `audit/in-D.json`만 주고 `audit/out-D.json`(`[{cid, keep, why}]`)을 쓰게 한다 → `audit-result`. 게이트(실린 표본 keep 일치 90%)를 못 넘으면 명령이 그 기간 실린 것을 모두 되돌린다. 결과 `audit/result-D.md`를 보고에 붙인다.
10. 검증: `npx vitest run tests/seoul-discovery.test.ts tests/weekly.test.ts`가 실패 0인지 본다. 실패하면 커밋하지 않고 보고한다.
11. 커밋(오늘 바뀐 파일만 이름으로 add): `git add apps/web/data/seoul/discovery-seoul.json apps/web/review/seoul-discovery` → `git commit -m "chore(seoul-discovery): D 회차 — 후보 N·판정 N·실음 N·지움 N"` → `git push origin master` → `git ls-remote origin master`가 로컬 HEAD와 같은지 확인한다.

보고(짧게, 한국어): 모은 글 수, 옮겨 적은 후보 수, 판정 수(keep·drop), 실은 수(종류별), 그림 붙은 수, sweep 결과(끝남·올림·내려감·폐업), 감사가 있었으면 게이트 결과, 멈춘 단계가 있으면 그 까닭.
