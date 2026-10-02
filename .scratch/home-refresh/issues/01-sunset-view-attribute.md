# 01 노을 보이는 곳 속성 (sunsetView)

Status: ready-for-agent (원문 `review/out`이 있는 환경에서만)

근거: `docs/research/ux-audit/mockup-fixes.md` §1, 시험 스크립트 `docs/research/ux-audit/sunset-check.mjs`. 사용자 결정 2026-10-03 「원문이 있는 환경에서 진행」.

## 할 일

1. OSM 해안선(ODbL)을 빌드 입력으로 고정한다(파일로 커밋하거나 받는 스크립트 + 해시).
2. 계절 방위 3개(242°·264°·298°)마다 다음 조건을 계산한다.
   - 해 지는 방향 ±10°로 20km 선을 그었을 때, 300m 안에서 바다로 나가고 그 뒤 본섬에 닿지 않는다.
   - 그리고 실외이거나 소개글에 바다 단어가 있다.
3. 후보 약 250곳과 오름 후보 109곳을 원문으로 판정한다(ADR-0065 실내 판정과 같은 방식).
   - 판정 기록은 `review/sunset/*.json`에 `{ id, sunset, basis }`로 남긴다.
   - 무작위 5%를 재채점해 일치율 85% 이상이면 통과.
4. `spots.json`에 `sunsetView`(계절 배열)를 넣는다.
   - 멱등 스크립트로 만든다. 다시 돌려도 같은 출력이어야 한다(`booking.mjs`·`indoor.mjs`와 같은 모양).
   - `build:spots`와 섞이지 않게 순서를 문서화한다.
5. 출처 줄에 「© OpenStreetMap contributors」를 단다.

## 앱 쪽 (이 이슈 다음)

- 오늘 줄: 해 지기 2시간 30분 전부터, 차로 45분 안에 확인된 곳이 3곳 이상일 때만 「노을 볼 곳 ›」을 띄운다.
- 그전까지 앱은 「해 지는 시각 HH:MM」만 쓴다(home-refresh 빌드에 포함).
