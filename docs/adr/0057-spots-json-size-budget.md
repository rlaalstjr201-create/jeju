# ADR-0057: spots.json 용량 기준 재판정 (gzip 120KB 폐기)

Status: Accepted (2026-09-30)

## Context

`plans/tomorrow-picker.md` S1의 "spots.json gzip ≤ 120KB"는 초기 소량 데이터 기준이다.
리빌딩(ADR-0028·0029, SPEC 3판) 후 출하 데이터는 2,959곳, 원본 약 1.08MB, gzip 약 331KB다.

- 첫 방문·배포 직후 1회만 받고, 이후 서비스워커 캐시(`?v=` 해시)에서 읽는다.
- 추정 수신 시간: LTE 1초 미만, 약 1Mbps 약 3초, 느린 3G(약 400kbps) 약 7초.
- 로딩 제한 15초. 늦게 도착한 응답도 보관한다(`data.ts`).

## Decision

- gzip 120KB 기준을 폐기한다. 리빌딩 이전 제약은 재판정 대상이다.
- 지금은 크기를 줄이지 않는다.
- 성능은 배포 후 Lighthouse 최적화 단계에서 다룬다. 후보: 호스팅 brotli, 이미지 URL 공통 접두 제거, 지역별 분할 로딩.

## Consequences

- 느린 망 첫 방문은 첫 카드까지 수 초 걸릴 수 있다(회색 틀과 "위치 확인 중…"이 보인다).
- 용량 회귀는 Lighthouse 단계의 기준으로 다시 정한다.
