# ADR-0026: trendScore — 자동 산정 폐기, 큐레이터 도구 모델

Status: Accepted (2026-05-19) — supersedes 0026-trendscore-longterm-growth-with-category-slice.md

## Context

초안(0026-trendscore-longterm-growth-with-category-slice.md)은 12개월 장기 증가율 기반 자동 trendScore와 격자 × 업종 카테고리 슬라이스를 결정했다. 이후 실측 검증 결과:

- **빅데이터\_지역별 방문자수\_GW**: 반환 격자 2개(제주시·서귀포시), 업종 필드 없음. spot 단위 trend 산정 구조적으로 불가.
- **BC카드 빅데이터**: 행정동 × 업종 슬라이스 이론상 가능하나, 개인 가맹점 단위 매칭은 여신전문금융업법상 법적 제약. 별도 가입·심사·계약 필요.
- **관광자원통계서비스**: spot 단위 분기 방문객 가능하나 등록된 유명 관광지(성산일출봉 등)만 커버. hidden gem thesis와 정반대.
- **소상공인 상가정보 API**: 현재 상태 스냅샷만, 시계열 없음.

결론: **한국에서 개인 가맹점 단위 spot trend 자동 산정은 실질적으로 불가**. 더 중요한 통찰: 자동 trend 데이터가 없다는 것은 *큐레이터 시점이 곧 차별점*이라는 의미다. 자동 점수가 ranking을 결정하면 Tabelog AI 점수 사태와 동일한 경로(사용자 반발 → 철회)를 밟는다.

## Decision

**v1에서 자동 trendScore 컬럼 사용 안 함. 큐레이터 도구 모델로 재정의.**

```
spots.trend_score      → v1 null 유지
spots.popularity_score → v1 null 유지
v1 추천 ranking        → curation_score 단일 (큐레이터 판단)
```

**큐레이터 trend 도구 (수동 trigger)**:
- 네이버 데이터랩 API로 spot 이름·키워드 12개월 검색량 추이 조회
- 큐레이터 UI에 시각화 표시 (참고용)
- 큐레이터가 판단 후 "rising / established / declining" 태그를 `curation_decisions.free_memo`에 기록

**v2 이후 재평가**:
- 사용자 implicit feedback(조회·북마크·공유) 누적 → popularity proxy 가능
- BC카드 빅데이터 행정동 매출은 *큐레이터 발견 도구*로 v1.5 검토 (자동 점수 X)

## Consequences

**Positive:**
- thesis 본질 보호. 자동 점수가 추천 ranking 직접 결정하지 않아 "AI 평균" 회귀를 차단한다.
- 시스템 단순. trend 산정 로직·rate limit·시계열 매핑 없음.
- 큐레이터 시점이 데이터 부재의 역설적 경쟁 우위가 된다.
- Tabelog 사례(AI 점수 도입 → 사용자 반발 → 철회)와 반대 경로.

**Negative / Risk:**
- v1 사용자에게 trend 신호 미제공. 단 큐레이터가 발견한 hidden gem 자체가 보상한다.
- `trend_score`·`popularity_score` 컬럼은 v1 dead column. Karpathy 단순함 원칙 예외 허용 — v2 로드맵이 명시됐고 스키마 마이그레이션 비용이 컬럼 사전 준비보다 크다.

## Alternatives Considered

**빅데이터\_GW 시·군·구 단위 trend 유지:** 기각.
- 격자 2개, 큐레이터에게 인지 부하만 추가. spot 단위 신호 아님.

**BC카드 빅데이터 도입:** 보류 (v1.5 검토).
- 가입·심사·매출액 → trendScore proxy 변환 로직 비용 대비 가치 불명확. 자동 점수가 아닌 큐레이터 발견 도구로만 검토.

**관광자원통계 spot 단위 trend:** 기각.
- 등록된 유명 관광지만 커버. hidden gem thesis 차별점 없음.

**네이버 데이터랩 자동 batch:** 기각.
- ADR-0017 수동 trigger 정책과 충돌. 큐레이터 수동 trigger만 허용.

## References

- ADR-0010: No Monetisation Influence; Curator-Thesis Scoring
- ADR-0017: External trend sources via ACL (수동 trigger 정책)
- ADR-0022: Rejected Candidate Is Not Re-Discoverable
- ADR-0024 수정: 4슬롯 모델
- Claude Code 실측 보고 2건 (2026-05-19)
- Tabelog 사례 (AI 자동 점수 도입 후 사용자 반발·철회)
