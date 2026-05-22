# ADR-0050: 카카오 Local API — 단독 지오코딩 소스 확정

Status: Accepted (2026-05-20)

## Context

Phase 0 설계에서 카카오 로컬 API를 "지오코딩 + 실재 검증" 용도로 채택하되, 네이버 지도 API를 fallback으로 고려했다. Apify(스크래핑 대행)도 검토 대상이었다.

비짓제주 점수 기반 선별(ADR-0051) 전환 후 지오코딩 역할 재평가:

- 비짓제주 API가 `latitude`, `longitude`를 직접 제공 → 신규 spot에 대한 지오코딩 필요 없음
- 카카오 로컬 API 남은 역할: **장소명 검색 → kakao_place_id 획득** (dedup v2 contentid fallback)
- 네이버 지도 API: 별도 키 발급 필요, 할당량 불명확, 비짓제주 좌표 있으면 불필요
- Apify: 스크래핑 대행, 약관·비용 이슈, ROI 낮음

## Decision

카카오 Local API **단독 사용**, 네이버 fallback·Apify 보류.

### 사용 범위 (v1)

1. **dedup v2 보조**: `kakao_place_id` 획득 → contentid OR kakao_id 기반 dedup
2. **spot 실재 검증**: 비짓제주 spot이 실제 영업 중인지 카카오 검색으로 교차 확인 (선택적)
3. **v2 예약 deep link**: KakaoMap 연동 (기존 결정 ADR-0023 유지)

### 사용하지 않는 것

- 네이버 지도 API fallback: 보류 (비짓제주 좌표 충분, 추가 복잡도 불필요)
- Apify: 보류 (약관 위반 위험, v1에서 ROI 없음)
- 좌표 보강 geocoding: 불필요 (비짓제주 API 직접 제공)

## Consequences

**Positive:**
- API 종류 최소화 → 인증·rate limit 관리 단순화
- 카카오 일 100,000건 → 1,000건 선별 대비 100배 여유

**Negative / Risk:**
- 카카오 미등록 spot (신생·소규모)은 place_id 획득 불가
  → dedup은 contentid 또는 좌표+name 유사도로 대체 (ADR-0051 dedup v2)

## Alternatives Considered

**네이버 지도 API fallback**: 기각. 비짓제주 좌표 직접 제공으로 geocoding 불필요. 추가 키 발급 부담.

**Apify 스크래핑**: 기각. 약관 위반 위험 + v1 범위 초과.

**Google Maps API**: 기각. 유료, 한국 지도 정확도 카카오 대비 낮음.

## References

- ADR-0023: 비짓제주 API primary (좌표 직접 제공)
- ADR-0051: dedup v2 (kakao_place_id 활용)
- ADR-0024: 외부 데이터 소스 매트릭스
