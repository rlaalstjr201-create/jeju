# ADR-0051: 비짓제주 외부 노출도 점수 + 카테고리 쿼터로 1,000건 선별

Status: Accepted (2026-05-20)  
**Amendment 1: 2026-05-22** — 카테고리 정의 재정립 (category-snippet-audit 기반)

## Context

비짓제주 3,534건 (c1 1,407 + c4 2,127) 전체를 큐레이터 검토 불가.
기존 선별 기준 (intro ≥ 30자, dedup 100m) 폐기 — 구조적 결함 확인:

- dedup 100m 좌표 단독: 99% 오매칭 (자연 landmark vs 이벤트 vs 음식점)
- info 풍부도(intro 길이) 점수화: 유명 spot이 메타 부실로 탈락하는 모순

비짓제주는 공공 데이터(제주관광공사) → 광고 회피 thesis 이미 충족. 광고 점수 불필요.

## Decision

## 카테고리 정의

| 5분류 | 비짓제주 소스 | 매칭 룰 |
|---|---|---|
| 관광 (sightseeing) | c1 잔여 | 체험·문화공간 keyword 미매칭 c1 |
| 맛집 (restaurant) | c4 잔여 | 카페 keyword 미매칭 c4 |
| 카페 (cafe) | c4 매칭 | 카페·베이커리·디저트·빙수·빵·로스터리·티하우스·찻집 |
| 체험 (experience) | c1 매칭 | 체험·만들기·클래스·공방·액티비티·패러글라이딩·승마·낚시·다이빙·서핑·카약 |
| 문화공간 (cultural_space) | c1 매칭 | 박물관·미술관·갤러리·전시관·기념관·문학관·아트센터·도서관 |

분류 충돌 우선순위:
- c1 내: `문화공간 > 체험 > 관광`
- c4 내: `카페 > 맛집`

알파 제외: c2 쇼핑, c3 숙박, c6 테마여행  
v1.5 보류: c5 축제·행사 (events 테이블 별도, ADR-0047)

## Decision

### 단일 점수: external_buzz_score (0~10)

**측정**: 네이버 블로그 검색 + 카페 검색 totalCount 합산 (`external_buzz_count`)

**카테고리별 percentile 정규화**:

| Percentile | 점수 |
|---|---|
| top 10% | 10점 |
| top 10~25% | 8점 |
| top 25~50% | 6점 |
| top 50~75% | 4점 |
| bottom 25% | 2점 |

**절대값 floor (카테고리 내 왜곡 방지)**:

| 조건 | 상한 |
|---|---|
| buzz_count < 10건 | 최대 4점 cap |
| buzz_count < 50건 | 최대 7점 cap |

카테고리별 정규화로 체험·액티비티(절대값 작음) 균형 보장.

### 종합 점수

```
final_score = external_buzz_score
            + (awards 보유 ? +1 : 0)
            + (whitelist ? +2 : 0)
            + (trend_category = 'steady' ? +1 : 0)
            + (trend_category = 'rising' ? +0.5 : 0)
            + (trend_category = 'declining' ? -2 : 0)
```

### 자동 제외 조건

- `coords_missing`: lat/lng NULL → 자동 제외

### 카테고리별 선별 쿼터 (합계 1,000건)

| 카테고리 | 쿼터 |
|---|---|
| 관광 (sightseeing) | 250건 |
| 맛집 (restaurant) | 300건 |
| 카페 (cafe) | 200건 |
| 체험 (experience) | 150건 |
| 문화공간 (cultural_space) | 100건 |

### 선별 흐름

```
1. 비짓제주 3,534건 페치 (c1 + c4)
2. coords_missing 자동 제외
3. 카테고리별 그룹화
4. external_buzz_count 계산 (네이버 블로그+카페 API, 7,068회)
5. percentile 정규화 + floor 적용 → external_buzz_score
6. 보너스·패널티 가감 → final_score
7. 카테고리별 final_score 상위 N건 선별 (쿼터 적용)
8. 선별된 1,000건: tier='reference', 큐레이터 큐 진입
9. 미선별 ~2,500건: DB 보존, v1.5 재선별
```

### dedup v3 룰 (ADR-0053)

```
duplicate = (
    haversine(a, b) < 100m
    AND jaccard_bigram(normalize(a.name), normalize(b.name)) >= 0.7
    AND normalized_category(a) == normalized_category(b)
    AND abs(len(normalize(a.name)) - len(normalize(b.name))) < 3
) OR (a.contentsid == b.contentsid)
```

좌표 단독 dedup 폐기. 카테고리 정규화 완료 후 동일 카테고리 내에서만 중복 판정.  
상세: ADR-0053.

### 메타 풍부도 (info_status)

- `info_status` 컬럼: `rich | ok | thin | missing` 플래그
- 점수에 영향 없음 — 유명 spot 위양성 reject 방지
- 메타 부실 → Phase B 자동 보강 + Phase E 코멘트 grounding으로 해결

### Whitelist

초기 3건: 만장굴, 주상절리대, 비자림 (buzz_count에 관계없이 +2점 보장)  
큐레이터가 추후 추가 가능 (`src/config/visitjeju-whitelist.json`).

### 비용

- 네이버 검색 API: 무료 (3,534건 × 2 = 7,068회, 일 한도 25,000의 28%)
- 네이버 데이터랩: 무료 (1,000건 ÷ 5 = 200회, ADR-0049)
- LLM 호출: 0회 (점수 산정에)

## Consequences

**Positive:**
- 유명 spot이 메타 부실로 탈락하는 모순 해결 (whitelist + buzz_score 상위)
- 외부 노출도 = 단순·투명한 ranking 기준
- 카테고리별 균형 보장 (percentile 정규화)
- 1,000건 = 큐레이터 검토 부담 명확 (2.8시간 페이스 기준)
- LLM 비용 0

**Negative / Risk:**
- 외부 노출도 ≠ 큐레이션 가치 (큐레이터 reject으로 보완)
- 무명 hidden gem 발굴 한계 (Naver Hidden 121건 v1.5 검토로 보완)
- 네이버 검색 API 이름 오매칭 (비짓제주 title vs 네이버 검색어 불일치)

## Alternatives Considered

**info_score 가중치**: 기각. 유명 spot이 메타 부실로 탈락하는 모순. ranking 신호 부적합.

**thesis_score (광고 회피 점수)**: 기각. 비짓제주는 공공 데이터, 광고 회피 thesis 이미 충족.

**LLM 자동 점수**: 기각. 3,534건 × LLM 비용 대비 가치 낮음. 단순 검색 totalCount가 더 신뢰성 높음.

**절대값 컷오프 (검색 100건 이상)**: 기각. 체험·액티비티 카테고리 위양성 reject. percentile 정규화로 해결.

**dedup 100m 좌표 단독 유지**: 기각. 99% 오매칭 확인 (2026-05-20 분석).

## References

- ADR-0023 Amendment 3 (비짓제주 primary 강화)
- ADR-0042 Amendment (Two-Tier 단순화)
- ADR-0044 (awards 자동 추출, +1점 보너스)
- ADR-0049 (네이버 데이터랩 트렌드, trend_category)
- ADR-0050 (카카오 Local API, kakao_place_id dedup)
- 2026-05-20 데이터 분석: dedup 100m 99% 오매칭, info_score 모순 발견

---

## Amendment 1 (2026-05-22): 카테고리 정의 재정립

### 배경

`category-snippet-audit.ts` (2026-05-22) 실행 결과:
- clean 42.1% / warning 30.7% / **polluted 27.2%** (272건)
- 원인 분석: 키워드 사전 한계 + 카테고리 오분류 혼재
  - 키워드 부재로 인한 가짜 polluted: 약 15~19% (자연지명·역사유적·올레길 등)
  - 실제 카테고리 오분류: 나머지 (테마파크가 cultural_space, 빵집이 category 혼재)

목표: **사용자 정의 기준 확정 → 단일 진실 소스(ADR-0051) 업데이트**

### 변경된 카테고리 정의

#### sightseeing (관광) — 정의 **확장**

"제주에서 보고 즐길 수 있는 관광 영역 전체"

| 포함 | 예시 |
|------|------|
| 자연 경관 | 해수욕장, 포구, 오름, 폭포, 해안도로, 봉, 계곡, 동굴 |
| 자연 현상 | 일출, 일몰, 전망, 풍경 |
| 인공 명소 | **테마파크, 워터파크** (기존 cultural_space에서 이전) |
| 역사·유적 | **4.3 관련 공간, 평화공원, 기념관, 유적지** (기존 cultural_space에서 이전) |
| 트레킹 코스 | **올레길, 숲길, 트레킹 코스** |
| 항구·포구 | 항, 포구, 선착장 |

#### cultural_space (문화공간) — 정의 **축소**

"예술·문화 콘텐츠를 직접 감상·체험하는 공간"

| 포함 | 제외 |
|------|------|
| 미술관, 박물관, 갤러리 | 테마파크 → sightseeing |
| 공연장 | 역사 유적·기념관 → sightseeing |
| 전시관 | 도서관 → experience (커뮤니티) |
| 아트센터 | |

#### cafe (카페) — 정의 **확장**

"음료와 함께 즐기는 공간"

| 포함 | 예시 |
|------|------|
| 카페, 커피, 라떼 | 기존 정의 유지 |
| 디저트, 베이커리 | 기존 정의 유지 |
| **빵집, 도넛, 케이크** | 머무는 패턴이 카페와 동일 |
| **티하우스, 찻집** | 기존 정의 유지 |

제외 (→ restaurant): 분식, 버거, 피자, 김밥, 국밥 등 식사 중심 업장  
제외 (→ excluded): 펜션, 독채, 스테이 등 숙박 업장

#### restaurant·experience — 기존 정의 유지

변경 없음.

### 재분류 적용 범위

알파 셋 1,000건에 일괄 적용 (`recategorize-alpha.ts`, 2026-05-22).  
ADR-0053 dedup v3 카테고리 정규화 기준도 본 Amendment 1 반영.

### 결과 검증

`category-snippet-audit-v2.ts` — 키워드 사전 v2 + 재분류 후 재진단.  
목표: polluted < 10%.

### References (Amendment 1)

- `diagnostics/category-snippet-audit-{timestamp}.json` — 원인 분석 데이터
- `src/scripts/diagnostics/recategorize-alpha.ts` — 재분류 스크립트
- `src/scripts/diagnostics/category-snippet-audit-v2.ts` — 재진단 스크립트
