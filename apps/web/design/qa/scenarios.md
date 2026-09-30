# 시나리오 표 — 내일 뭐하지 (S9-2)

기준: `src/app.ts`·`src/main.ts`·`src/pick.ts`·`sw/sw.js`·`src/style.css` 코드 읽기 + 로컬 프리뷰(`vite preview`, 390×844·320×568, 라이트·다크) 확인. 2026-09-30. 화면은 design/SPEC.md 3판(커밋 4f087b5·80dc252) 기준이다(2판과 다른 문구·배치는 3판을 따름).
사용자: 밤에 침대에서 한 손, 반쯤 딴생각. 계획 안 세움. 시끄러운 화면 싫어함.

"간극" = 사려 깊은 사람이 만든 앱이라면 할 행동과 지금 행동이 다름. **굵게** 표시한 ID는 브라우저에서 직접 재현한 것.

확인 경로(S9-2): 행마다 `tests/scenarios.test.ts`(jsdom, ID로 이름 붙음) 또는 `tests/e2e/browser.e2e.mjs`(실제 Chrome, 같은 ID) 가운데 하나 이상. 2026-09-30 QA에서 브라우저 확인이 없던 S31·S51·S52를 e2e로 옮기고, 감사에서 나온 경우를 S61~S66으로 더했다. 2차 QA(r2)의 수정으로 S02·S07·S24·S26·S35·S65의 간극을 닫고 S67~S70을 더했다. SPEC 3판 구현 뒤 QA에서 옛 문구·옛 화면 이름(`#resultsTitle`→`#crumb`, "내 주변"→"여기 근처" 등)을 고치고 S71~S77(e2e `3-17`~`3-24`)을 더했다. 확인 값: vitest 374 통과·1 건너뜀(review/out 없음), e2e 40/40, 세 번씩 반복해도 흔들림 없음. 3차 QA(ea4bc86 뒤): S78~S82와 S60 검사 보강 행을 더했다. 확인 값: vitest 377 통과·1 건너뜀, e2e 45/45, tsc·build·check:slop 통과, 세 번씩 반복해도 흔들림 없음.

| ID | 경우 | 기대 동작 | 현재 동작 (코드 기준) | 간극 |
|---|---|---|---|---|
| S01 | 첫 방문, 공유 링크로 엶 | JS·데이터 전에 질문과 기분 버튼이 바로 보인다. 로그인·팝업·권한 요청 없음 | 정적 HTML에 버튼 5개, 권한은 첫 탭 때 요청, 저장 0개면 ♥ 숨김(scenarios `S01`, app.test `S3 첫 화면`) | 없음 |
| S02 | 첫 탭, GPS 허용 | 탭 뒤 오래 걸리면 "찾는 중" 신호(카드 자리 표시), 1~2초 안에 카드 3장. 300ms 안에 끝나면 아무것도 띄우지 않는다(SPEC §1.9) | 요청이 300ms를 넘으면 카드 자리 표시 3장+"위치 확인 중…", 위치가 오면 문구만 지우고 자리 표시는 데이터가 올 때까지 유지 → 카드. 테스트는 `slow: 0`으로 즉시 띄우고 deferred로 순서를 고정하며 하네스 기본 `long`이 10초라 실시간 타이머와 경합하지 않음(scenarios `S02 GPS allowed: placeholder …`) | 없음 |
| S03 | GPS 거절 | 탓하지 않고 바로 지역 고르기. 시트를 저절로 띄우지 않음 | GPS 거절 → 시트 없이 카드 자리에 안내 제목 "위치 권한이 꺼져 있어요."+설명 "내일 갈 동네를 고르면 거기서 가까운 곳을…"+동네 색인 15칸(이름+대표 지명)+권한 켜는 방법 한 줄. 기준 라벨은 "지역 고르기". 칸을 누르면 같은 자리에 카드, history 변화 없음(scenarios `S03 denied: no sheet, no blame …`, app.test `S8-4 위치 — GPS 실패 안내`·`S3 위치`, e2e `3-22`) | 없음 |
| S04 | GPS 느림(3초 초과) | 몇 초 뒤 "지역으로 고르기"를 같은 자리에서 제안, 기다리게 하지 않음 | 3초(`long`)가 지나면 상태 줄 "위치 확인 중…" 옆에 글자 버튼 "지역으로 고르기"가 뜨고, 고르면 끝. 늦게 온 GPS 답은 무시(scenarios `S04 GPS slow: …`, 가짜 타이머로 2.999초/3초 경계를 고정) | 없음 |
| S05 | 권한 창을 무시하고 방치 | 대기 중에도 지역 선택으로 빠질 길이 보인다 | 응답 없는 권한 창도 타이머가 돌아 "지역으로 고르기"가 뜸, 카드 자리 표시 유지(scenarios `S05`) | 없음 |
| S06 | 제주 밖(서울에서 전날 밤) | "제주 밖이에요, 내일 갈 쪽을 골라 주세요" 하나로 자연스럽게 | 제목 "지금은 제주 밖이에요." + 본문 "내일 갈 동네를 고르면…" 하나로, 시트 없음, '계세요' 문구 없음(scenarios `S06`) | 없음 |
| S07 | 이미 거절한 뒤 "지금 있는 곳"을 다시 고름 | 권한이 꺼져 있다고 한 줄 알려 주고 지역을 권함 | 권한이 꺼진 걸 아는 상태면 GPS를 건너뛰고, 기준 라벨은 미리 "지역 고르기", 시트 "지금 있는 곳" 줄 둘째 줄이 "위치 권한이 꺼져 있어요"(scenarios `S07 denied earlier: known-denied skips GPS …`, `S07 a known "denied" shows in the label before any tap; …`, state.test `GPS 실패 기억 (S07)`). 시트가 열린 채 늦게 온 거절은 시트를 다시 그리지 않고 그 줄만 제자리에 붙여 포커스 유지(scenarios `S07 a GPS denial arriving while the basis sheet is open patches …`). 설정에서 위치를 켜고 돌아오면 안내가 사라지고 라벨이 "여기 근처"로 돌아옴(같은 두 테스트, `S68`). 위 두 테스트의 제목에는 옛 문구("내 위치"·"내 주변")가 남아 있으나 단언은 3판 문구 | 없음(테스트 제목만 옛 문구) |
| S08 | 숙소 미설정 → 숙소 선택 | 한 번만 묻고 기억. 어느 동네로 저장됐는지 보인다 | 시트가 숙소의 동네를 보여 줌(지역 고르기·GPS 저장 → 가장 가까운 동네)(scenarios `S08`, store.test `stay`) | 없음 |
| S09 | "지금 위치를 숙소로 저장" 실패 | 버튼은 버튼으로 두고, 오류는 별도 한 줄 | 버튼은 버튼 그대로, 오류는 별도 한 줄(scenarios `S09`) | 없음 |
| S10 | 숙소 GPS 저장 대기 중 시트를 닫음 | 닫으면 그 요청은 무효 | 시트를 닫으면 대기 중 GPS 요청은 무효: 기준·저장 변화 없고 다른 시트도 그대로(scenarios `S10`, e2e `S10`) | 없음 |
| S11 | 숙소 옮김 | 숙소 다시 정하기 | 기준 시트 "숙소" 줄 오른쪽에 글자 버튼 "다시 정하기"(`data-action="restay"`)(scenarios `S08 the basis sheet shows which 동네 …`, app.test `S8-2 위치 전환 시트`, style 계약 `tap targets ≥ 44px …`) | 없음 |
| S12 | 지역(목적지) 기준 선택 | "애월 근처"가 유지되고, 카드가 어디서 몇 분인지 말해 준다 | 첫 장은 늘 자기 문구에 출발지를 붙이고("애월에서 차로 약 5분") 끝에 밑줄 "카카오맵". 줄 카드 두 장의 문구가 같으면 "아니면 · 둘 다 …" 한 번으로 묶고 줄 카드엔 메타가 없으며, 다르면 줄마다 출발지 없는 문구. 첫 장의 "셋 다 …"는 없어짐(scenarios `S12 the first card says where …`, app.test `QA 2026-09-30 (§14): no screen shows the same trip line three times`, e2e `QA-meta`·`3-23`) | 없음. 다만 scenarios `S12`·`S13`의 정규식이 아직 옛 "(셋 다 )?"를 허용해 "셋 다"가 돌아와도 이 두 테스트만으로는 못 잡음(app.test·e2e `3-23`이 잡음) |
| S13 | 다음 날 다시 엶(어제 고른 지역이 남아 있음) | 어제 기준이 그대로라는 걸 눈치채게 한다 | 새로 열어도 라벨 "○○ 근처"와 첫 장 메타의 출발지("애월에서 …")가 보임. 지역은 계속 저장(D5)(scenarios `S13 yesterday's area is still visible the next day: …`) | 없음 |
| S14 | 카드가 보이는 중 기준 전환 | 새 기준으로 같은 기분 카드 다시 계산 | resumeAfterBasisChange가 같은 기분을 새 출발지로 다시 계산(scenarios `S14`, state.test `cardsValid`) | 없음 |
| **S15** | 저장 목록을 연 채 기준 전환(지역 선택) | 저장 목록이 새 기준 가까운 순으로 다시 정렬 | history.back()의 popstate를 nav.ts가 자기 것으로 걸러 저장 목록이 유지되고 새 기준 순으로 재정렬(nav.test `S15`, scenarios `S15`, e2e `S15`) | 없음 |
| **S16** | 저장 목록에서 기준 시트 열고 "닫기" | 시트만 닫히고 저장 목록 유지 | 저장 목록 → ⇄ → 닫기: 시트만 닫히고 빈 항목 없음(nav.test `S16`, scenarios `S16`, e2e `S16`) | 없음 |
| **S17** | 저장 목록을 연 채 기분 버튼 탭 | 목록이 닫히고 카드로, 뒤로가기 한 번이면 앱 밖 | 목록에서 기분 탭: history가 카드 항목에서 끝나 뒤로가기 한 번이면 앱 밖(nav.test `leaving the saved list for a mood`, scenarios `S17` 두 건, e2e `S17`·`S17·S19·S20`) | 없음 |
| **S18** | 시트가 열린 상태에서 새로고침 후 뒤로가기 | 한 번에 이전 페이지로 | 시트가 열린 채 새로고침하면 남은 항목을 마운트에서 back으로 소비(nav.test `S18`, scenarios `S18`, e2e `S18`) | 없음 |
| S19 | 안드로이드 뒤로 / iOS 스와이프 — 시트 열림 | 시트만 닫힘 | pushState + popstate로 시트만 닫음(app.test `S8 뒤로가기`, scenarios `S19·S20`, e2e `S17·S19·S20`) | 없음 |
| S20 | 안드로이드 뒤로 / iOS 스와이프 — 저장 목록 열림 | 목록만 닫고 직전 카드 복원 | 저장 목록만 닫고 직전 카드 복원(app.test `phone back (popstate) closes the open saved list …`, `"돌아가기" restores the exact 3 cards`, scenarios `S19·S20`, e2e `S17·S19·S20`) | 없음 |
| S21 | 오프라인, 첫 방문 | 브라우저 오프라인 화면(할 수 있는 게 없음) | 서비스워커가 캐시가 없으면 브라우저 자체 오프라인 화면(sw.test `S21 first visit offline`) | 없음 |
| S22 | 오프라인, 재방문(서비스워커 있음) | 앱·데이터는 뜨고, 사진·지도는 안 된다는 걸 조용히 | 셸·spots.json 캐시로 동작, 사진 없는 카드 + "오프라인이라 사진은 안 보여요." 한 줄(scenarios `S22`, e2e `S22`) | 없음 |
| S23 | 불안정한 망(신호 약함)에서 PWA 실행 | 1~2초 안에 캐시된 화면 | 내비게이션이 3초 안에 응답이 없으면 캐시된 셸로(sw.test `S23 약한 망`, e2e `S23`) | 없음 |
| S24 | spots.json 로드 실패 후 다시 탭 | 다시 누르면 재시도해서 성공 | 실패는 기억하지 않아 다시 불러오기·새 탭이 재요청해 성공(data.test `S24`, scenarios `S24` 두 건, e2e `S24`). 오프라인 실패 뒤 온라인으로 돌아오면 결과·저장 목록이 저절로 나옴(scenarios `S69`). 15초 타임아웃 뒤 늦게 도착한 목록은 버리지 않고 실패 안내를 대신하며 다운로드는 한 번(data.test `a download that outlives its timeout is kept` 세 건, scenarios `S70`) | 없음 |
| S25 | spots.json 느림 | 탭 즉시 카드 자리 표시 | 탭 즉시 카드 자리 표시 3장(고정 기준), 눌린 버튼만 바뀌는 빈 화면 없음(scenarios `S25`) | 없음 |
| S26 | 배포 직후 첫 실행(SW 갱신) | 새 코드와 새 데이터가 같이 | app이 spots.json?v=해시를 요청하고 SW가 같은 URL을 사전 캐시, 데이터·index.html이 바뀌면 캐시 버전도 바뀜(sw.test `S26 배포 직후`, `install / activate`). 해시가 이름에 든 빌드 파일과 `spots.json?v=`는 HTTP 캐시에서 받아도 되고(첫 방문의 spots.json 다운로드 한 번), 해시 없는 셸·매니페스트만 `cache: 'reload'`(sw.test `content-hashed files and spots.json?v= may come from the HTTP cache`, `Vite still names every built asset by its content`) | 없음 |
| S27 | localStorage 차단(사생활 보호 모드 등) | 이번 방문 동안은 전부 동작 | main.ts try/catch, 메모리 savedIds로 동작(store.test `S27`, app.test `저장소를 쓸 수 없을 때` 두 건) | 없음 |
| S28 | localStorage 가득 참 | 조용히 계속 동작 | 첫 쓰기 실패 뒤 메모리로 전환, 이후에도 정확(store.test `S28`) | 없음 |
| S29 | localStorage 값 손상 | 기본값으로 복구 | 읽을 때 검증·복구: 저장 id 문자열만·중복 제거, 옛 지역 값 매핑, 알 수 없는 기준은 내 위치로 표시(store.test `S29`, scenarios `저장소 값 손상 (S29)` 두 건) | 없음 |
| S30 | 사진 로드 실패 | 빈 사진 칸 없이 글만 | 사진 실패 시 사진 칸을 그 자리에서 없애고 글만 남김, 다시 그리지 않음(app.test `image load failure drops the photo box`, scenarios `photos lost while offline…`) | 없음 |
| **S31** | 긴 이름(최대 32자, 영문 괄호 포함) | 줄바꿈, 넘침 없음 | 32자 이름(`… (Jeju Stone Park)`)을 넣은 데이터로 320×568·195×422 확인: 페이지·이름 가로 넘침 0, 하트와 겹치지 않음, 괄호 별칭은 안에서 끊기지 않음. 2줄을 넘는 이름은 §3.3대로 2줄 끝에서 `…`로 잘린다(e2e `S31`) | 없음 |
| S32 | 이름 앞뒤 공백·탭 섞인 데이터(7건) | 깨끗한 이름 | 이름은 로드 때 정리되고 출하 데이터에 앞뒤·중복 공백 0, 지도·예약 URL에 %09·%20 없음(data.test `S32 이름 공백` 두 건) | 없음 |
| S33 | 섬 스팟(우도 65·마라도 10·가파도 4·비양도 5) | "배 타고 가요"처럼 사실대로 | 섬 기준·섬 스팟은 "같은 우도 안이에요"/"본섬이라 배를 타고 나가야 해요"/"○○라서 배를 타야 해요"이고 "차로"는 나오지 않음. 3판 배치: 첫 장은 자기 문구, 줄 카드 둘이 같으면 "아니면 · 둘 다 …"로 한 번, 다르면 줄마다(scenarios `S33 island cards say you need a boat …`, pick.test `S33 섬 스팟`, data.test `an island place re-checked …`) | 없음 |
| S34 | 같은 버튼 연타(후보 소진 방향) | 다음 3장, 멀어지면 멀어진다고 느낌 | 풀이 커서 소진되지 않고, 소진 시 "이 근처는 다 봤어요. 처음 본 곳부터 다시 보여 드려요."로 처음부터. 가까운 순. "다른 3곳 보기"는 목록 끝 sticky 띠 안에 있고 옛 "한 번 더 누르면…" 안내는 없음(app.test `다른 3곳 보기 → none of the previous 3 cards`, scenarios `S34 audit: …`, pick.test `S34 한 바퀴 (wrapped)`, state.test `S43·S44`, e2e `3-19`) | 없음 |
| S35 | 기분 버튼 더블탭(지역·숙소 기준) | 한 번 누른 것으로 처리 | 기분·"다른 3곳 보기" 더블탭은 한 번으로 처리, 첫 3장이 밀려나지 않음(scenarios `S35` 3건, e2e `S35`). 더블탭의 두 번째 탭은 손가락 밑에 나타난 카드를 열지 않음(scenarios `S35 the 2nd tap of a double tap never lands …`, e2e `S35-ghost`). 같은 기분을 다시 눌러도 아직 맞는 카드는 회색 자리 표시로 바뀌지 않고 같은 노드로 남음(scenarios `S67`) | 없음 |
| S36 | 로딩 중 다른 버튼 탭 | 마지막 탭만 반영 | 요청 id로 앞 요청 버림(state.test `S36·S38`, scenarios `S36`) | 없음 |
| S37 | 로딩 중(GPS 대기) 기준 시트에서 지역을 고름 | 고른 지역으로 끝 | 늦게 실패한 앞 요청이 시트를 띄우지 않고 고른 지역 카드가 유지됨(scenarios `S37`, e2e `S37`) | 없음 |
| S38 | 겹친 위치 요청, 앞 요청이 늦게 실패 | 새 결과가 이긴다 | 겹친 요청에서 새 결과가 이김(state.test `S36·S38`, scenarios `S38`) | 없음 |
| S39 | 하트 더블탭 | 저장 후 해제(원래대로) | 토글 두 번 = 저장 후 해제(scenarios `S39`) | 없음 |
| S40 | 처음 하트를 누름 | 어디에 모였는지 한 번 알려 줌 | 결과 화면에서 첫 하트(0→1) 때 그 카드 폭 전체 줄에 "저장한 곳은 맨 위 하트 버튼에 모여요."(#announce에도). 타이머·사라짐 전환 없음: 10초 뒤에도, 하트를 더 눌러도 남고, 하트가 아닌 다음 의도(다른 3곳 보기·기분·바꾸기·식사 탭·기준·♥ N·복원)에서 즉시 빠짐. 새로고침 뒤 다시 안 뜸, 저장한 곳에서는 안 뜸(scenarios `S40 the first heart ever says once …`, `first-save hint: no fade; gone with the next intent …`, e2e `3-21`) | 없음 |
| S41 | 저장 목록에서 해제 | 실수 되돌리기 가능 | 해제해도 카드는 남고 빈 하트, 다시 누르면 복구(app.test `"♥ N" appears once N > 0, … allows unsave and 돌아가기`) | 없음 |
| S42 | 저장한 스팟이 데이터에서 사라짐 | 조용히 제외, 개수도 맞게 | 데이터 로드 뒤 걸러서 ♥ N 갱신, 저장소는 건드리지 않음(scenarios `S42`, state.test `S42`, store.test `S42`, app.test `unknown ids (not in the current data) are skipped silently in the saved list`) | 없음 |
| S43 | 먹기 → 카페·디저트 → 다시 식사 | 방금 보던 식사 3장이 그대로 | 식사 히스토리가 유지되어 식사 → 카페 → 식사가 같은 3장(state.test `S43·S44`, app.test `switching the toggle … restores the same meal cards`, e2e `S43·S44`) | 없음 |
| S44 | 기분 A → B → 다시 A | 비교하던 A 카드로 돌아가길 기대하는 사람이 많음 | A → 바꾸기 → B → 바꾸기 → A는 비교하던 A 3장으로 복원(D2), 다음 3장은 "다른 3곳 보기"로만. 지난번 기분은 목록 줄 오른쪽 체크(`aria-current`)(state.test `S43·S44`, scenarios `S44 mood A → 바꾸기 → B → 바꾸기 → A …`, e2e `S43·S44`) | 없음 |
| S45 | 320×568 화면에서 탭 | 결과가 바로 보임 | 기분을 고르면 목록이 접히고 결과는 맨 위에서 열려 `#crumb`(고른 기분 한 줄)에 포커스, 320×568에서 첫 장 이름이 화면 안. "다른 3곳 보기" 뒤엔 머리가 화면 밖일 때만 상단 줄 아래로 즉시 스크롤(scenarios `작은 화면 (S45·S46)` 두 건, e2e `S45`) | 없음 |
| S46 | 375×667(아이폰 SE) | 결과가 바로 보임 | 375×667에서 첫 장 이름이 화면 안, "다른 3곳 보기"는 결과 끝 sticky 띠에서 화면 아래에 떠 있음(끝까지 내리면 마지막 카드 아래 28px)(scenarios `작은 화면 (S45·S46)`, `S34 audit: …`, e2e `S46`·`3-19`) | 없음 |
| S47 | 430px 화면 | 넘침 없음 | max-width 480, 16px 여백, 넘침 0(app.test `app shell has no fixed width…`, e2e `S9-4` 320·390·430 × 라이트·다크 행렬) | 없음 |
| S48 | 글자 200% | 잘림 없음, 상단 정돈 | 상단 버튼은 nowrap이고 줄이 바뀜(♥와 숫자가 나뉘지 않음), 동네 색인은 1열, 200%(화면 확대·루트 글자 크기 둘 다)에서 가로 넘침·잘림 없음, 시트는 화면 안(scenarios `S48 large text: …`, e2e `S48`) | 없음 |
| S49 | 다크 모드 | 밤에 눈부시지 않게 | 첫 페인트·스플래시 모두 어두움(index.html 인라인 배경 #161817, manifest `background_color` #161817), 사진 brightness 0.9, 다크 토큰은 녹회색(순검정·순백 아님)(scenarios `S49 dark: first paint and splash are dark …`, data.test `S51 홈 화면(PWA) 실행 — 매니페스트`의 `opens standalone … dark splash (D6)`, e2e `S9-4`의 다크 행렬은 넘침·44px만 봄) | 작음 — 다크에서 실제 배경색·밝은 면 여부를 브라우저로 재는 테스트는 없음(CSS 문자열 계약과 손계산 대비뿐) |
| S50 | 동작 줄이기 | 움직임 없음 | 움직임은 `prefers-reduced-motion: no-preference` 안에서만(슬롭 규칙 13). 동작 줄이기에선 시트가 즉시 나타나고 사라지며 닫힘 대기도 0ms. 카드 등장 애니메이션은 애초에 없음, 첫 저장 안내도 전환 없음(scenarios `sheet: slides away over 190ms when motion is allowed …`, `first-save hint: no fade; …`, e2e `motion`, slop.test) | 없음 |
| **S51** | PWA 단독 실행 | 앱처럼 바로, 기준 기억 | 매니페스트(standalone, start_url이 scope 안, 아이콘 존재)는 `data.test.ts`. 브라우저: start_url을 새 최상위 페이지로 열면(sessionStorage·history 비어 있음, localStorage 공유) 첫 화면, `애월 근처`·♥ 1 유지. 뒤로 버튼이 없는 iOS 단독 실행을 위해 시트 `닫기`·`돌아가기`·`바꾸기`로 모든 층을 페이지 안에서 닫음. 빌드에 display-mode 분기 없음(e2e `S51`; 헤드리스 Chrome은 display-mode를 흉내 내지 못한다) | 없음 |
| S52 | 가로 회전 | 레이아웃 유지 | 844×390·667×375 × 라이트·다크: 480px 한 줄 가운데, 가로 넘침 0, `#crumb`(결과 머리) 화면 안, 시트는 높이 88dvh 이하로 안에서 스크롤·`닫기` 보임, 맨 아래 `성산`까지 스크롤해 고를 수 있음(e2e `S52`) | 없음 |
| S53 | 카드 눌러 카카오맵 → 돌아옴(탭 유지) | 보던 카드 그대로 | 카드 링크는 target=_blank rel=noopener라 원래 탭 유지(app.test `card link = kakao place page, or a name-search fallback … target=_blank rel=noopener`) | 없음 |
| S54 | 돌아왔더니 브라우저가 탭을 버리고 새로고침 / 당겨서 새로고침 | 방금 보던 3장이 그대로 | 세션 기록으로 새로고침·탭 폐기 뒤 같은 3장과 눌린 기분 복원, 1km 넘게 움직였으면 새로 뽑음(scenarios `S54` 두 건, e2e `S54`, state.test·store.test `S54 세션 기록`) | 없음 |
| S55 | 카카오톡·인스타 인앱 브라우저로 엶 | 동작하고, 저장은 이 브라우저에만 남는다는 걸 알 수 있음 | 3판(§6.12)은 UA로 가르지 않고 저장한 곳 각주가 늘 같은 두 문장: "이 브라우저에만 저장돼요. 다른 기기나 앱에서는 안 보여요."(scenarios `S55 the saved list always says saves stay in this browser …`). 옛 "앱 안에서 연 창이라…" 문구는 없앰 | 없음 |
| S56 | 카카오 장소 ID 없는 스팟(748건) 지도 열기 | 정확한 위치 핀 | kakaoPlaceId 없는 스팟(현재 748건)은 "제주 "를 붙인 이름 검색 링크(data.test·app.test `search-link fallback`). 정확한 핀(SPEC D4 후보 `map.kakao.com/link/map/{이름},{lat},{lng}`)은 아님. 링크 모양은 app.test `search-link fallback is used exactly when kakaoPlaceId is null` | 있음(작음) — 여전히 이름 검색이라 동명 장소가 섞일 수 있음. 제주 범위 한정은 적용됨 |
| S57 | 카드 아무 데나 탭 | 지도로 간다는 걸 미리 앎 | 첫 장 메타 끝의 밑줄 "카카오맵" 하나가 알리고(한 화면에 한 번, 저장한 곳에서는 첫 줄에만), 모든 카드는 전체가 링크이며 aria 이름이 "…, 카카오맵에서 보기", 화살표 글리프 없음, "·"는 no-break로 줄 처음에 오지 않음(scenarios `S57 the first card says where a tap goes …`, e2e `QA-meta`·`3-23`) | 없음 |
| S58 | 키보드만 사용 | 포커스 보임, 시트 안에 갇힘, Esc 닫기 | 시트 열림 중 배경 inert, Tab이 시트 안에서 순환, Esc로 닫고 기준 버튼(`#basis`)으로 포커스 복귀. 복귀 뒤 링은 Esc일 때만 보이고 탭·클릭으로 닫으면 안 보임(scenarios `S58 sheet: background inert, …`, e2e `3-20`) | 없음 |
| S59 | 스크린리더 | 결과를 짧게 알림, 하트 상태가 한 가지 신호로 | 결과는 #announce로 "3곳 골랐어요."만 알리고 #cards는 aria-live 아님, 하트 이름은 고정이고 상태는 aria-pressed만(scenarios `S59`) | 없음 |
| S60 | 카드 문장 톤 | 사람이 쓴 한 줄처럼 | 이유 문장(2,959곳): "수 있어요" 2.8%(≤ 20%), 15~47자, 끝 마침표 0건(3판), 돈까스 0건, 3판 금지어(겉바속촉·아름다운·여유를 누려요·공간이에요) 0건(data.test `S60 이유 문장 어미`, `이유 문장 마침표`, `3판 이유 문장 — 빌드 규칙`, `§10 금지 어형 0건`, slop.test 규칙 17·19). 한 어미 ≤ 25%·같은 어미 화면 ≤ 5% 지표는 폐기(ADR-0058) | 없음(충실성 감사는 별도, S9-3 참조) |
| **S61** | 위치를 기다리는 중·실패 안내에서 새로고침(권한을 켠 뒤 당겨서 새로고침 포함) | 방금 고른 기분이 다시 나온다. 뒤로가기가 헛돌지 않는다 | 세션 기록은 결과를 요청할 때 기분을 적고, 바꾸기가 지운다. 기록이 없는 결과 항목은 마운트에서 back으로 소비(scenarios `QA 2026-09-30 — 새로고침·뒤로가기`, e2e `QA-reload-history`·`QA-stale-session`) | 없음 |
| **S62** | GPS 기준에서 `다른 3곳 보기`를 누를 때 위치가 실패하거나 움직임 | 보던 카드 다음 3장이 나온다 | 지금 3장의 출발점을 그대로 쓴다. GPS를 다시 묻지 않는다(e2e `QA-more-origin`) | 없음 |
| **S63** | 권한 창을 방치한 채 ♥ N | 저장한 곳이 보인다 | 3초 뒤 저장한 순서로, `위치를 몰라서 저장한 순서대로 보여 드려요.` 기준 라벨은 그대로(e2e `QA-saved-gps-hang`) | 없음 |
| **S64** | 느린 첫 방문에서 JS 전에 기분을 누름 | 누른 기분이 열린다 | 인라인 스크립트가 마지막 기분을 기억, 앱이 뜨면 연다(e2e `QA-first-tap`) | 없음 |
| S65 | 홈 화면 앱을 띄워 둔 채 새 배포 | 새 코드·새 데이터로 바뀐다 | 새 워커가 넘겨받으면 첫 화면이 한가할 때 바로, 아니면 백그라운드로 갈 때 새로고침. 옛 워커는 지워진 캐시를 되살리지 않음(sw.test `QA 2026-09-30 — 새 배포가 상주 앱에 닿는 길`, e2e `S65`). 이미 새 번들을 돌리는 페이지는 controllerchange에서 새로고침하지 않음 — 첫 화면이 한가하든 아니든, 지금이든 백그라운드로 갈 때든. 다음 배포에 새 코드가 오면 다시 새로고침(sw.test `controllerchange while the page already runs the new bundle → no reload`, e2e `S65`) | 없음 |
| S66 | 오프라인에서 본 카드, 연결이 돌아옴 | 사진이 다시 보인다 | 오프라인 중 실패한 사진만 다시 시도, 보이는 카드는 그 자리에서 사진 칸을 되찾음(scenarios `photos lost while offline…`) | 없음 |
| S67 | 같은 기분을 다시 누름(GPS 기준) — 위치를 다시 확인하는 동안 | 보던 카드가 그대로 있고 회색 자리 표시로 바뀌지 않는다 | 화면의 카드가 이 기분·식사/카페·기준에 아직 맞으면(`cardsValid`) 300ms가 지나도 카드 노드를 다시 만들지 않고 "위치 확인 중…" 한 줄만 보임. 카드가 더는 안 맞는 경우(식사 ↔ 카페)는 옛 카드를 빌려 쓰지 않음(scenarios `S67 the same mood again (GPS basis)…`, `S67 a mood whose cards no longer fit…`; 데이터가 늦을 때의 자리 표시는 `S02`·`S25`) | 없음 |
| S68 | 위치를 꺼 둔 채 결과를 보다가 설정에서 다시 켜고 돌아옴 | 카드가 나오고, "위치 권한이 꺼져 있어요" 안내가 "내 주변" 라벨 밑에 남지 않는다 | 앱이 앞으로 돌아올 때마다 권한을 다시 읽음. 켜졌고 결과가 꺼짐 안내 상태면 카드를 다시 계산하고, 여전히 꺼져 있으면 안내를 두고 GPS를 묻지 않음(scenarios `S68`) | 없음 |
| S69 | 오프라인에서 목록을 못 불러온 뒤 연결이 돌아옴 | 결과와 저장 목록이 저절로 나온다 | `online` 이벤트가 오프라인 표시를 끄고 실패한 로드를 다시 시도해 결과 화면과 저장 목록 둘 다 안내가 사라지고 카드가 나옴(scenarios `S69`) | 없음 |
| S70 | 약한 망에서 목록이 15초 타임아웃 뒤에 도착 | 실패 안내가 저절로 카드로 바뀌고 두 번 받지 않는다 | 타임아웃은 기다림만 끝내고 다운로드는 이어 감. 먼저 도착한 목록을 저장하고 알려 실패 안내를 카드로 바꾸며 요청은 한 번(scenarios `S70`, data.test `a download that outlives its timeout is kept` 세 건) | 없음 |
| S71 | 320px 기본 글자에서 줄 카드(둘째·셋째 장) | 사진이 글 옆에 있어 위계가 무너지지 않는다. 글자를 키우면 사진이 위로 | 줄 카드는 왼쪽 정사각 사진+오른쪽 글. `@container (max-width: 18em)`(글자 150%)에서만 사진이 위·2:1(e2e `3-17`, style 계약 `tap targets ≥ 44px …`) | 없음 |
| S72 | 예약 링크가 있는 카드(체험) | "마이리얼트립에서 예약 찾아보기"가 한 줄 | 320·390에서 첫 장과 줄 카드 모두 `.book`이 한 줄(카드 폭 전체 줄). 글자 200%에선 줄바꿈 허용(e2e `3-18`, app.test `MyRealTrip link only on bookable (experience) cards …`) | 없음 |
| S73 | 결과가 화면보다 길 때 "다른 3곳 보기" | 엄지 자리(화면 아래)에 떠 있고, 끝에선 카드 아래 제자리 | sticky 띠: 떠 있을 때만 위 1px 선(IntersectionObserver, 스크롤 핸들러 없음), 끝까지 내리면 마지막 카드 아래 28px·선 없음. 회색 틀·안내 중엔 띠 없음. 400ms 안 재탭 무시(e2e `3-19`, scenarios `the 다른 3곳 bar: one IntersectionObserver …`, `S35 "다른 3곳 보기" double tap advances once`) | 없음 |
| S74 | 시트를 탭·클릭으로 닫음 vs Esc로 닫음 | 포커스는 시트를 연 버튼으로 돌아오되, 링은 Esc일 때만 보인다(밤에 가장 밝은 점이 되지 않게) | `#basis`로 복귀, `:focus-visible` 휴리스틱에 맡김(강제 표시 없음)(e2e `3-20`, app.test `S8-2 포커스 복귀 (UX fix #6)`, scenarios `S58 sheet: …`) | 없음 |
| S75 | 동네 고르기(결과 자리·기준 시트·숙소 시트) | 행정 지명을 몰라도 고른다 | 15칸 색인이 서→동 순서·대표 지명과 함께 세 곳에 같은 모양으로 나옴, 선택 칸만 이름 600+체크, 칸 배경 없음, 글자가 커지면 1열, 대표 지명은 각 지역 중심에서 가장 가까운 곳(e2e `3-22`, app.test `area landmarks: 15 fixed places …`, `sheet lists 내 위치 / 숙소 / 15개 지역 …`, scenarios `S03 denied: …`) | 없음(app.test 제목에 옛 "내 위치") |
| S76 | 결과 화면의 이동 문구 | 같은 문구를 세 번 읽지 않고, 지도 목적지는 한 번만 | 애월 기준 "푹 쉬고 싶어": 첫 장 "애월에서 … · 카카오맵", 줄 카드 둘이 같으면 "아니면 · 둘 다 …"(줄 카드에 `.meta` 없음, 링크에 `aria-describedby="alt-trip"`), "카카오맵"은 한 번(e2e `3-23`, `QA-meta`, app.test `no screen shows the same trip line three times …`) | 없음 |
| S77 | 결과 화면의 시각 위계 | 장소가 주인공: 고른 기분은 작게, 첫 장 이름이 가장 크게 | `h1.crumb`(17/600) < 첫 장 `.name`(20/700), 화면 안 글자 크기 종류 ≤ 3(e2e `3-24`, slop.test 규칙 7·8) | 없음 |
| S78 | 320·360에서 Tab으로 카드를 지나감 — "다른 3곳 보기" 띠가 떠 있음 | 포커스가 띠에 가려지지 않는다 | 카드 링크·하트가 띠 밑에 남지 않게 포커스 때 스크롤 여백을 둠(e2e `QA2-focus-bar`) | 없음 |
| S79 | 320×568 기준 시트에서 Tab | 고정된 `닫기` 밑에 선택지가 남지 않는다 | 시트 안 모든 선택지가 sticky `닫기` 위 영역에 들어옴(e2e `QA2-focus-sheet`) | 없음 |
| S80 | 320×568 동네 색인에서 Shift+Tab으로 위로 | 상단 줄 밑에 가려지는 칸이 없고, ♥ N에 포커스를 줘도 화면이 움직이지 않는다 | 포커스된 칸은 상단 줄 아래에 보임, ♥ N 포커스로 스크롤 안 바뀜(e2e `QA2-focus-top`) | 없음 |
| S81 | 루트 글자 200%, 320px, 기준 시트의 숙소 줄 | "서귀포 시내 숙소"가 한 줄로 남는다 | 이름은 `다시 정하기` 옆이나 위에서 줄바꿈 없이 한 줄(e2e `QA2-stay-row`) | 없음 |
| S82 | 320px 줄 카드의 이름이 " - "나 괄호로 나뉨("… 절로 가는길 - 정진의 길", "- 인욕의 길", "(박진경 추도비)") | 같은 이름 앞부분이라도 구분되어 보인다 | 이름 한 줄(말줄임), 그다음 줄에 " - " 뒤 또는 괄호 부분(`src/render.ts splitName`, `.base`/`.alias`)(e2e `QA2-row-names`) | 없음 |
| S83 | 이유 문장·스타일 검사가 놓치던 경우 | 마침표(전각 포함)와 선택 채움을 따옴표 모양과 상관없이 잡는다 | 규칙 19는 둘째 문장·전각 끝 마침표를 잡고 소수점은 통과, `shipReason`·`cleanReason`이 전각 끝 마침표를 같이 지움, 규칙 18은 `aria-pressed`·`aria-current` 선택 채움을 따옴표 유무와 관계없이 잡고 `.saved-btn`은 통과(slop.test `#19 catches a second sentence after any stop, …`, `shipReason and cleanReason drop a fullwidth final stop too, and agree`, `#18 catches a filled selection however the attribute is quoted, and aria-current`) | 없음 |
