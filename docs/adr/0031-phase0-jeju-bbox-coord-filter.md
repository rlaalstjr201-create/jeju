# ADR-0031 — Phase 0 제주 bbox 좌표 필터

**날짜**: 2026-05-19  
**상태**: 결정됨

## 컨텍스트

Phase 0 H3 dry-run 실행 중 Kakao Local API가 "산방산" 쿼리에 대해  
제주도 밖(lat=34.86, lng=128.54, 경남 거제) 좌표를 반환하는 오매칭 사례 발견.

## 결정

**KakaoLocalVerifier.verify()** 내부에서 반환된 좌표를 제주 bbox로 검증한다.  
bbox 밖 → `matched=false` 다운그레이드 → `kakao_unverified` 로 저장, 큐레이터 판단.

**범위**: lat 33.0~**34.0** / lng 126.0~127.0 (본도 + 추자군도 포함)

## 근거

- 가장 이른 시점(Kakao 응답 직후)에 차단 → 이후 파이프라인 코드 변경 불필요  
- `kakao_unverified` 로 보존 → 큐레이터가 수동으로 올바른 좌표 확인 가능  
- ADR-0022(rejected 재발굴 X) 정합: 자동 reject 대신 unverified 보존 선택  

## 변경 이력

| 날짜 | 변경 | 이유 |
|------|------|------|
| 2026-05-19 | latMax 33.6 → 34.0 | 추자군도(lat~33.93) 제주도 행정구역임을 확인, H3+ dry-run 후 수정 |

## 영향

- 기존 오매칭 DB 레코드(산방산 lat=34.86): `fix-out-of-bbox.ts` 스크립트로 status='rejected' 처리  
- 추자도 38건 false-reject → `restore-chuja-island.ts` 로 복구  
- ADR-0029 Phase 0 파이프라인 결정과 연계
