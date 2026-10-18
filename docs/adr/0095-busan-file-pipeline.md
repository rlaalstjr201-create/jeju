# ADR-0095: 부산 데이터는 Postgres 없는 파일 파이프라인

Status: Accepted (2026-10-18, `plans/busan.md` 2판 ADR #4, S2에서 씀). ADR-0094 + Amendment 1의 부산 데이터 갈래.

## Context

- 제주 데이터는 비짓제주 수집 → Postgres → 검수 → `scripts/build-spots.mjs` → `public/spots.json`을 탔다. `build-spots.mjs`는 제주 입력 경로·판정 파일을 그대로 읽고 `public/spots.json`을 덮어쓴다.
- 부산은 TourAPI 국문(KorService2, `lDongRegnCd=26`) 한 출처다. 판정(S3)·카카오(S3b)·검색수(S4)는 모두 파일 입력·파일 출력이라 DB가 하는 일이 없다.
- 부산 작업이 제주 출하 파일을 바꾸면 안 된다(`npm run check:jeju`가 `spots.json` 해시를 본다).

## Decision

1. 부산 데이터는 파일로만 흐른다: `review/busan/raw/`(TourAPI 원문 그대로) → `review/busan/scope.json`(장소 범위 거른 목록) → 판정·대조·측정 파일(`review/busan/*`) → `scripts/busan/build.mjs` → `public/spots-busan.json`. Postgres를 쓰지 않는다.
2. 부산 스크립트는 `scripts/busan/` 아래에 따로 둔다. 제주 `build-spots.mjs`를 부르거나 고치지 않는다. 같이 쓰는 규칙(이름 다듬기 등)은 import만 한다.
3. 수집(`scripts/busan/collect.mjs`)은 원문을 그대로 남기고(키는 어디에도 남기지 않음), 다시 돌리면 받은 것은 건너뛴다. 목록의 `modifiedtime`이 바뀐 곳만 상세를 다시 받는다. TourAPI 호출은 KST 날짜별로 `raw/calls.log`에 세고 하루 900회에서 스스로 멈춘다(개발 한도 1,000회/일).
4. 원문 스냅숏(`raw/`)은 커밋한다. 그래서 판정·빌드는 네트워크 없이 다시 돌릴 수 있고, 한국관광공사 쪽 내용이 바뀌어도 어떤 원문으로 판정했는지 남는다.
5. 출하 레코드 검사(S1')는 `tests/spot-record.ts` 하나를 두 여행지가 경계 인자만 바꿔 부른다.

## Consequences

- 부산 갱신은 `collect.mjs --refresh`(목록 5회 + 바뀐 곳 상세)와 `build.mjs`로 끝난다. DB 마이그레이션이 없다.
- 원문 스냅숏이 저장소 크기를 늘린다(상세 1,100여 개). 50MB를 넘으면 커밋 방식을 다시 정한다.
- 제주와 부산의 데이터 길이 달라, 제주 갈래의 규칙을 고칠 때 부산 쪽에 같은 규칙이 필요한지 따로 본다.
