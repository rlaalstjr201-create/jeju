# 로드맵 — 권고 순서 (2026-10-03)

**맨 위에서부터 차례로 한다.** 앞 단계가 끝나거나 막혀서 「막힘」으로 표시되기 전에는 다음 단계를 시작하지 않는다.

- 세션이나 에이전트가 「다음 할 일」을 물으면 이 표에서 가장 위에 있는 `ready-for-agent` 항목을 고른다.
- 상태 표기는 `docs/agents/triage-labels.md`를 따른다.
- 끝나면 상태를 `done (커밋)`으로 바꾸고 다음 줄로 넘어간다.

권고의 출처:
- `docs/coherence-audit-2026-10-03.md`
- `docs/research/data-sources-korea-japan.md`
- `docs/research/ux-audit/report.md`
- `docs/research/ux-audit/mockup-judgment.md` §5
- `docs/research/seasonal-events-01.md`

| # | 할 일 | 상태 | 왜 이 순서인가 | 근거·이슈 |
|---|---|---|---|---|
| 1 | 정합성 점검 고침 반영·배포·실화면 확인(홈 위치 처리, 기록 안내, IndexNow 날짜, 옛 주소 SW 해제, 스플래시, 문서 정리) | in-progress | 지금 서비스가 목적과 어긋난 채로 두지 않는다 | `docs/coherence-audit-2026-10-03.md` |
| 2 | 5초 사용자 시험 5~10명(첫 화면 → 「뭐 하는 앱?」, 밥집 하나 정하기 시간) | ready-for-human | 목적이 「단번에」 읽히는지는 사람만 확인할 수 있다. 확장 전에 핵심을 검증한다 | `mockup-judgment.md` §5 통과 기준 |
| 3 | e2e 기존 실패 2개 + 흔들리는 1건 | in-progress(별도 세션) | 검증 장치가 흔들리면 이후 모든 단계의 신호가 흐려진다 | 세션 칩 2개 |
| 4 | 축제·행사·시기 이벤트(스팸 아닌 방식) — 조사·설계 → ADR → Light Spec → 빌드 | in-progress(조사) | 제주 안에서 「지금」 가치를 키우는 가장 싼 확장. 데이터 출처가 TourAPI와 겹쳐 6번의 준비도 된다 | `.scratch/seasonal-events/issues/01-research-and-adr.md` |
| 5 | 첫 실사용 데이터 2주 관찰(D1·GA4·네이버, 주간 점검 보고서) | waiting | 확장 우선순위를 실제 사용으로 정한다. 그 전엔 짐작이다 | ADR-0078, 0079 |
| 6 | 전국 확장 시범: data.go.kr 「한국관광공사_국문 관광정보 서비스_GW」 활용 신청(사람) → 부산·강릉·경주 중 1곳 Light Spec → 빌드 | ready-for-human(키 신청) → ready-for-agent | 출처 조사 완료. 비짓제주와 같은 구조라 옮기기 쉽다 | `data-sources-korea-japan.md` §0·§5(공사 문의 8문항) |
| 7 | 일본 실현성 측정: 도시 1곳에서 Wikidata 장소 중 Commons 사진이 있는 비율 | ready-for-agent | 사진 비율이 낮으면 방식 자체가 성립하지 않으니 먼저 잰다 | 같은 문서 §0 |
| 8 | 노을 보이는 곳 속성 | ready-for-agent(원문 `review/out` 있는 환경에서만) | 오늘 판 두 번째 우선순위 줄의 데이터 | `.scratch/home-refresh/issues/01-sunset-view-attribute.md` |
| 9 | 데이터 오류 103건 중 안전한 것, 원문 근접 이유 문장 9곳 재작성 | ready-for-agent | 품질 부채. 확장 전에 줄인다 | `docs/handoff/2026-10-02-local-resume.md` 남은 작업 2·3 |
| 10 | 수익화(광고·제휴)는 제주관광공사 상업 이용 확인 뒤 | ready-for-human | 사용자·데이터가 생긴 다음 | `docs/licensing-visitjeju.md` |
