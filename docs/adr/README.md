# ADR 색인

이 폴더의 결정 기록(ADR) 전체 목록이다. 파일 이름은 바꾸지 않는다(다른 문서의 참조가 깨진다).

## 번호 중복 0025~0029

0025~0029는 번호가 겹친다. 같은 번호에 두 계열이 있다.

- **옛 방향(2026-05)**: 큐레이션·발굴 파이프라인(apps/api·apps/mobile 시절). 예: `0029-phase0-hidden-gem-discovery.md`.
- **새 방향(2026-09-30~)**: 폰 우선 웹 apps/web(현재 여차나:제주). 예: `0029-destination-areas-and-saves.md`.

그래서 0025~0029를 가리킬 때는 「ADR-0029」가 아니라 **파일 이름**으로 쓴다(예: `0029-destination-areas-and-saves.md`). 0030 이후는 번호만 써도 된다. 결번: 0036·0039·0046·0048. 84파일, 번호 77개.

상태 열은 각 파일 Status 줄의 첫머리다. 「대체·보완」 열은 이 결정을 일부 또는 전부 바꾼 ADR이고, 자세한 범위는 각 파일 Status 아래 줄에 있다. 새 ADR을 쓰면 이 표에 한 줄 더한다.

| 번호 | 파일 | 제목 | 상태 | 대체·보완 |
|---|---|---|---|---|
| 0001 | [0001-spot-preferences-as-category-distribution.md](0001-spot-preferences-as-category-distribution.md) | SpotPreferences as Category Distribution Map | Accepted (2026-05-17) |  |
| 0002 | [0002-trip-daterange-required-with-inferred-default.md](0002-trip-daterange-required-with-inferred-default.md) | Trip.dateRange Required with Inferred Default | Accepted (2026-05-17) |  |
| 0003 | [0003-schedule-composer-minimum-one-spot-gap-fill.md](0003-schedule-composer-minimum-one-spot-gap-fill.md) | ScheduleComposer Minimum 1 Spot + Gap-fill via Recommender | Accepted (2026-05-17) |  |
| 0004 | [0004-spot-embedding-infrastructure-only.md](0004-spot-embedding-infrastructure-only.md) | Spot Embedding for Semantic Search Infrastructure Only (v1 Unused in Recommendation) | Accepted (2026-05-17) |  |
| 0005 | [0005-transaction-manager-port-async-local-storage.md](0005-transaction-manager-port-async-local-storage.md) | TransactionManager Port with AsyncLocalStorage for Cross-Repository Atomicity | Accepted (2026-05-17) |  |
| 0006 | [0006-pinned-spot-model-for-auto-fill-metadata.md](0006-pinned-spot-model-for-auto-fill-metadata.md) | PinnedSpot Model as Day-Spot Relationship Carrier | Accepted (2026-05-17) |  |
| 0007 | [0007-parse-free-text-regex-llm-fallback.md](0007-parse-free-text-regex-llm-fallback.md) | Natural Language Date Parsing — Regex Pre-filter with LLM Fallback | Accepted (2026-05-17) |  |
| 0008 | [0008-recommendation-initial-12-cards-pagination.md](0008-recommendation-initial-12-cards-pagination.md) | Recommendation Initial Card Count — 12 with Scroll Pagination | Accepted (2026-05-17) |  |
| 0009 | [0009-spot-thumbnail-inline-widget-detail-only.md](0009-spot-thumbnail-inline-widget-detail-only.md) | Spot Card Thumbnails Inline; Kakao Places Widget in Detail View Only | Accepted (2026-05-17) |  |
| 0010 | [0010-no-monetisation-influence-curator-driven-curation.md](0010-no-monetisation-influence-curator-driven-curation.md) | No Monetisation Influence on Curation; Curator-Thesis Scoring | Accepted (2026-05-17) |  |
| 0011 | [0011-kakao-login-required-no-guest-mode.md](0011-kakao-login-required-no-guest-mode.md) | Kakao Login Required; No Guest Mode | Superseded | 0026-no-login.md |
| 0012 | [0012-auth-service-port.md](0012-auth-service-port.md) | AuthService Port in the Application Layer | Accepted |  |
| 0013 | [0013-resolve-owned-trip-helper.md](0013-resolve-owned-trip-helper.md) | resolveOwnedTrip Application Helper | Accepted |  |
| 0014 | [0014-is-auto-filled-sticky-semantics.md](0014-is-auto-filled-sticky-semantics.md) | is_auto_filled is a Sticky Flag | Accepted |  |
| 0015 | [0015-warm-recommender-category-limitation.md](0015-warm-recommender-category-limitation.md) | Warm Recommender is Category-Scoped in v1 | Accepted |  |
| 0016 | [0016-dev-auth-provider.md](0016-dev-auth-provider.md) | DevAuthProvider for Development-Mode Authentication Bypass | Accepted |  |
| 0017 | [0017-two-track-recommendation.md](0017-two-track-recommendation.md) | Two-Track Recommendation — Curated vs Popular (Spotify Algotorial Pattern) | Accepted |  |
| 0018 | [0018-external-trend-data-acl.md](0018-external-trend-data-acl.md) | External Trend Data Sources via Anti-Corruption Layer | Accepted |  |
| 0019 | [0019-trend-discovery-port-separation.md](0019-trend-discovery-port-separation.md) | TrendDiscoveryPort Separated from TrendDataSourcePort | Accepted |  |
| 0020 | [0020-calibration-profile-per-trip.md](0020-calibration-profile-per-trip.md) | CalibrationProfile Stored Per-Trip | Accepted |  |
| 0021 | [0021-curation-candidate-soft-delete.md](0021-curation-candidate-soft-delete.md) | CurationCandidate Uses Soft-Delete | Accepted |  |
| 0022 | [0022-rejected-candidate-not-rediscoverable.md](0022-rejected-candidate-not-rediscoverable.md) | Rejected Candidate Is Not Re-Discoverable | Accepted |  |
| 0023 | [0023-visitjeju-as-phase0-primary-source.md](0023-visitjeju-as-phase0-primary-source.md) | 비짓제주 API를 Phase 0 시드의 1차 데이터 소스로 채택 | Accepted (2026-05-18) |  |
| 0024 | [0024-external-data-source-matrix.md](0024-external-data-source-matrix.md) | 외부 데이터 소스 5슬롯 모델 (Stage 4 검증 체인) | Accepted (2026-05-18, 2026-05-19 수정×2) |  |
| 0025 (옛 방향) | [0025-curation-thesis-alignment-over-quantity.md](0025-curation-thesis-alignment-over-quantity.md) | 큐레이션 시드 목표 — thesis 정렬 우선, 수량 KPI 없음 | Accepted (2026-05-18) |  |
| 0025 (새 방향) | [0025-pivot-to-tomorrow-picker.md](0025-pivot-to-tomorrow-picker.md) | "내일 뭐하지" 파트너로 방향 전환 | Accepted (2026-09-30) | 일부: 0028, 0058, 0059 |
| 0026 (새 방향) | [0026-no-login.md](0026-no-login.md) | 로그인 없음 (ADR-0011 대체) | Accepted (2026-09-30) |  |
| 0026 (옛 방향) | [0026-trendscore-curator-tool-model.md](0026-trendscore-curator-tool-model.md) | trendScore — 자동 산정 폐기, 큐레이터 도구 모델 | Accepted (2026-05-19) |  |
| 0026 (옛 방향) | [0026-trendscore-longterm-growth-with-category-slice.md](0026-trendscore-longterm-growth-with-category-slice.md) | trendScore 정의 — 장기 증가율 기반 + 카테고리 슬라이스 | Superseded (2026-05-19) | 0026-trendscore-curator-tool-model.md |
| 0027 (옛 방향) | [0027-curator-hitl-evolution-and-minimal-web-ui.md](0027-curator-hitl-evolution-and-minimal-web-ui.md) | HITL 큐레이터 워크플로우 + 진화 단계 명시 | Superseded (2026-05-19) | 0027-curator-hitl-evolution-and-tooling.md |
| 0027 (옛 방향) | [0027-curator-hitl-evolution-and-tooling.md](0027-curator-hitl-evolution-and-tooling.md) | HITL 큐레이터 워크플로우 + 구체 도구 진화 단계 | Accepted (2026-05-19, 도구 명시 보강) |  |
| 0027 (새 방향) | [0027-mobile-web-frozen-data.md](0027-mobile-web-frozen-data.md) | 폰 우선 웹(PWA) + 고정 데이터로 새로 만든다 | Accepted (2026-09-30) |  |
| 0028 (새 방향) | [0028-include-food-and-full-review.md](0028-include-food-and-full-review.md) | 맛집 포함 + 보유 데이터 전 항목 검수 | Accepted (2026-09-30) | 일부(기분 5개): 0092 |
| 0028 (옛 방향) | [0028-llm-augmented-embedding-batch.md](0028-llm-augmented-embedding-batch.md) | LLM-Augmented Embedding — Phase 0 1회 배치 | Accepted (2026-05-19) |  |
| 0029 (새 방향) | [0029-destination-areas-and-saves.md](0029-destination-areas-and-saves.md) | 세부 지역(목적지) 기준 + 하트 저장 | Accepted (2026-09-30) | 일부: 0075, 0058, 0077 |
| 0029 (옛 방향) | [0029-phase0-hidden-gem-discovery.md](0029-phase0-hidden-gem-discovery.md) | Phase 0 hidden gem 자동 발굴 파이프라인 | Deprecated (2026-05-20) |  |
| 0030 | [0030-negative-dictionary-from-rejection-reasons.md](0030-negative-dictionary-from-rejection-reasons.md) | 거절 사유 → negative dictionary 자동 갱신 | Accepted (2026-05-19) |  |
| 0031 | [0031-phase0-jeju-bbox-coord-filter.md](0031-phase0-jeju-bbox-coord-filter.md) | Phase 0 제주 bbox 좌표 필터 | 결정됨 |  |
| 0032 | [0032-phase0-curation-priority-policy.md](0032-phase0-curation-priority-policy.md) | Phase 0 큐레이션 우선순위 정책 | 결정됨 |  |
| 0033 | [0033-llm-extractor-v2-false-spot-prevention.md](0033-llm-extractor-v2-false-spot-prevention.md) | LLM Extractor v2: 가짜 Spot 추출 방지 + 광고 탐지 강화 + parent spot hint | Deprecated (2026-05-20) |  |
| 0034 | [0034-approve-condition-coordinates-required.md](0034-approve-condition-coordinates-required.md) | Approve 조건: 좌표 필수 (kakao_unverified 좌표 미확인 후보 approve 금지) | 결정됨 |  |
| 0035 | [0035-llm-extractor-v3-domain-blocking-name-dedup.md](0035-llm-extractor-v3-domain-blocking-name-dedup.md) | LLM Extractor v3: 비제주·브랜드 차단 + 도메인 차단 + 이름 dedup | 결정됨 |  |
| 0037 | [0037-matched-only-curation-policy.md](0037-matched-only-curation-policy.md) | Matched-Only Curation Policy: Stage 4 실패 자동 폐기 | 결정됨 |  |
| 0038 | [0038-layer2-category-filter-layer3-naver-kakao-cross.md](0038-layer2-category-filter-layer3-naver-kakao-cross.md) | Layer 2 카카오/네이버 카테고리 필터 + Layer 3 Naver→Kakao 교차 검증 | 결정됨 |  |
| 0040 | [0040-gemma4-llm-provider-port.md](0040-gemma4-llm-provider-port.md) | LlmProviderPort 추상화 및 Gemma 4 도입 | Deprecated (2026-05-20) |  |
| 0041 | [0041-stage3-tool-calling-gemma26b.md](0041-stage3-tool-calling-gemma26b.md) | Stage 3 Tool Calling + Gemma 26B 채택 | Deprecated (2026-05-20) |  |
| 0042 | [0042-two-tier-curation-model.md](0042-two-tier-curation-model.md) | Two-Tier 큐레이션 모델 (v1 채택) | Accepted (2026-05-19) |  |
| 0043 | [0043-gemma-curator-comment-generation.md](0043-gemma-curator-comment-generation.md) | Gemma 큐레이터 코멘트 생성 + 사용자 reject·수정 감수 | Accepted (2026-05-19) | 일부(톤): 0052 |
| 0044 | [0044-awards-auto-extraction.md](0044-awards-auto-extraction.md) | awards 자동 추출 (블루리본·미쉐린 등) | Accepted (2026-05-19) |  |
| 0045 | [0045-curation-comment-hallucination-prevention.md](0045-curation-comment-hallucination-prevention.md) | 큐레이션 코멘트 환각 방지 5-Layer 파이프라인 | Accepted (2026-05-20) |  |
| 0047 | [0047-events-table-separate-model.md](0047-events-table-separate-model.md) | 축제·행사 별도 events 모델 — v1.5 활성, v1 사전 준비 | Accepted |  |
| 0049 | [0049-naver-datalab-trend-v1-active.md](0049-naver-datalab-trend-v1-active.md) | 네이버 데이터랩 트렌드 API — v1 활성화 | Accepted (2026-05-20) |  |
| 0050 | [0050-kakao-local-api-primary-geocoding.md](0050-kakao-local-api-primary-geocoding.md) | 카카오 Local API — 단독 지오코딩 소스 확정 | Accepted (2026-05-20) |  |
| 0051 | [0051-visitjeju-buzz-score-1000-selection.md](0051-visitjeju-buzz-score-1000-selection.md) | 비짓제주 외부 노출도 점수 + 카테고리 쿼터로 1,000건 선별 | Accepted (2026-05-20) |  |
| 0052 | [0052-editorial-voice-curator-comment-tone.md](0052-editorial-voice-curator-comment-tone.md) | Editorial Voice 큐레이터 코멘트 톤 가이드 | Accepted (2026-05-20) |  |
| 0053 | [0053-dedup-v3-category-aware.md](0053-dedup-v3-category-aware.md) | dedup v3 — 카테고리 정규화 기반 중복 판정 | Accepted (2026-05-20) |  |
| 0054 | [0054-awards-hint-official-source-only.md](0054-awards-hint-official-source-only.md) | awards_hint는 공식 출처 매칭만 허용 | Accepted |  |
| 0055 | [0055-spot-name-normalization.md](0055-spot-name-normalization.md) | Spot Name 정규화 정책 | Accepted (2026-05-22) |  |
| 0056 | [0056-operating-status-column.md](0056-operating-status-column.md) | operating_status 컬럼 정책 | Accepted (2026-05-22) |  |
| 0057 | [0057-spots-json-size-budget.md](0057-spots-json-size-budget.md) | spots.json 용량 기준 재판정 (gzip 120KB 폐기) | Accepted (2026-09-30) |  |
| 0058 | [0058-web-rebuild-constraints-rejudged.md](0058-web-rebuild-constraints-rejudged.md) | 리빌딩 이전 제약 재판정 (apps/web "내일 뭐하지") | Accepted (2026-09-30) | 일부: 0062, 0074, 0076, 0078 |
| 0059 | [0059-p-trip-now-first.md](0059-p-trip-now-first.md) | 이름 "P의 여행", 기준 순간 "지금", 날짜별 보관(약식 플래너) | Accepted (2026-09-30) | 일부(1번 이름): 0068 → 0077 |
| 0060 | [0060-satisfaction-score-and-range.md](0060-satisfaction-score-and-range.md) | 만족도 점수 우선 정렬과 범위 선택 | Accepted (2026-09-30) |  |
| 0061 | [0061-anonymous-usage-events.md](0061-anonymous-usage-events.md) | 익명 사용 기록으로 인기도 측정 | Accepted (2026-09-30) | 일부: 0078 |
| 0062 | [0062-region-expansion-path.md](0062-region-expansion-path.md) | 지역 확장 여지 (TourAPI), 제주 배포 우선 | Accepted (2026-10-01) |  |
| 0063 | [0063-predeploy-hosting-and-persistence.md](0063-predeploy-hosting-and-persistence.md) | 배포 준비 — Cloudflare Pages, 로그인 없는 저장 유지, 출처 표시 | Accepted (2026-10-01) | 일부: 0076, 0078 |
| 0064 | [0064-new-mood-sight-or-do.md](0064-new-mood-sight-or-do.md) | "새로운 거"를 섞어서·구경·체험으로 나눠 보기 | Accepted (2026-10-01) |  |
| 0065 | [0065-indoor-rainy-day.md](0065-indoor-rainy-day.md) | 비 오는 날 → 실내만 보기 | Accepted (2026-10-01) |  |
| 0066 | [0066-five-day-market-days.md](0066-five-day-market-days.md) | 오일장 「오늘 열려요」 — 오일장 9곳 추가와 장날 표시 | Accepted (2026-10-01) |  |
| 0067 | [0067-drive-directions-and-agent-ready.md](0067-drive-directions-and-agent-ready.md) | 차로 바로 길찾기 · 차 안 사용 전제 · AI 에이전트용 딥링크 | Accepted (2026-10-01) | 보완: 0069 |
| 0068 | [0068-rename-travel-plan-lazy.md](0068-rename-travel-plan-lazy.md) | 이름 「여행계획짜기 귀찮아:제주」 (ADR-0059 1번 대체) | Accepted (2026-10-01) | 0077 |
| 0069 | [0069-walk-island-directions-device-check.md](0069-walk-island-directions-device-check.md) | 걸어서는 도보 길찾기 · 섬 카드는 배 타는 곳까지 · 길찾기 링크 실측과 실기기 점검표 | Accepted (2026-10-01) |  |
| 0070 | [0070-color-white-sea-tangerine.md](0070-color-white-sea-tangerine.md) | 색 체계 「바다·귤」: 흰 바탕과 3색, 주 버튼은 메인 색 채움 | Accepted (2026-10-01) |  |
| 0071 | [0071-map-app-naver-default.md](0071-map-app-naver-default.md) | 지도 앱은 네이버지도가 기본 · 카카오맵 · TMAP은 설정에서 고른다 | Accepted (2026-10-01) |  |
| 0072 | [0072-static-landing-and-place-pages.md](0072-static-landing-and-place-pages.md) | 정적 랜딩과 장소 페이지 — 허브·지역 15·조합(target만)·장소마다 한 쪽, 사진은 핫링크(끄는 스위치 있음) | Accepted (2026-10-01) |  |
| 0073 | [0073-booking-links-paused.md](0073-booking-links-paused.md) | 예약 링크(마이리얼트립 검색) 중단 — 장소별로 확인된 경로가 생길 때까지 | Accepted (2026-10-01) | 계획 부분: 0074 |
| 0074 | [0074-verified-booking-routes-for-experiences.md](0074-verified-booking-routes-for-experiences.md) | 체험 카드는 장소별로 확인된 예약 경로 하나를 단다 — 경로 없는 체험은 체험 탭에서 뺀다 | Accepted (2026-10-01) | Amendment 1: 예약 없이 가는 곳(`walkin`)은 경로 없이도 보인다 (ADR-0105) |
| 0075 | [0075-home-refresh-today-and-photos.md](0075-home-refresh-today-and-photos.md) | 홈 개편 A′ — 오늘 판, 기분 줄 사진, 아래 두 묶음. 결과 화면 작은 고침 | Accepted (2026-10-03) | 일부(기분 5개): 0092 |
| 0076 | [0076-rain-prompt-via-pages-function.md](0076-rain-prompt-via-pages-function.md) | 비 소식은 기상청 단기예보를 Pages Function 하나로 받는다 — 동네 이름만 보낸다 | Accepted (2026-10-03) |  |
| 0077 | [0077-rename-yeohaenggwi.md](0077-rename-yeohaenggwi.md) | 이름 「여행귀:제주」, 주소 yeogwi.pages.dev (ADR-0068 1·2·4·5 대체) | Superseded by ADR-0082 |  |
| 0078 | [0078-analytics-always-on.md](0078-analytics-always-on.md) | 분석은 셋(GA4 · 네이버 애널리틱스 · 자체 익명 기록), 꺼진 채로는 배포하지 않는다 | Accepted (2026-10-03) |  |
| 0079 | [0079-weekly-seo-rank-ops.md](0079-weekly-seo-rank-ops.md) | 주간 SEO·순위 운영 — 측정은 기계가, 고침은 커밋까지, 배포는 사람이 | Accepted (2026-10-03) |  |
| 0080 | [0080-seasonal-spots.md](0080-seasonal-spots.md) | 계절 명소(철) 1단계 — 원문으로 판정한 곳에만, 그해 관측일 또는 원문이 말한 달에만, 카드 메타 줄 글자 하나 | Accepted (2026-10-04) |  |
| 0081 | [0081-in-app-survey.md](0081-in-app-survey.md) | 써 본 사람에게만 묻는 짧은 설문, 글자 한 줄로, 자체 D1에 | Accepted (2026-10-04) |  |
| 0082 | [0082-rename-yeochana.md](0082-rename-yeochana.md) | 이름 「여차나:제주」, 주소 yeochana.pages.dev (ADR-0077 대체) | Accepted (2026-10-04) |  |
| 0084 | [0084-custom-domain-yeochana-com.md](0084-custom-domain-yeochana-com.md) | 주소 yeochana.com — pages.dev·www는 같은 경로로 301, pages.dev/sw.js만 캐시 걷는 워커 (ADR-0082 주소 부분 대체) | Accepted (2026-10-08) |  |
| 0085 | [0085-saved-flow-events.md](0085-saved-flow-events.md) | 저장 목록 열기·목록에서 연 길찾기(담은 지 날 수, 지난 날 여부)·정리 동작을 기록에 더함, 시각은 여전히 안 보냄 (ADR-0061 확장) | Accepted (2026-10-09) |  |
| 0086 | [0086-keep-date-first-flow.md](0086-keep-date-first-flow.md) | 저장·날짜 흐름은 지금대로(A) 두고, 저장 목록 흐름 기록(ADR-0085)으로 실제 사용을 먼저 본다 — 2차 가상 실험의 사전등록 규칙대로 | Accepted (2026-10-10) |  |
| 0087 | [0087-hide-visited-places.md](0087-hide-visited-places.md) | 「가 봤어요」로 그곳을 이 기기에서만 후보에서 뺀다, 저장한 곳의 「뺀 곳 N곳」에서 되돌림 (ADR-0061 이벤트 확장) | Accepted (2026-10-14) | ADR-0090이 보이는 이름(「가 본 곳」)·되돌리기 보완 |
| 0088 | [0088-visual-refresh-and-logo.md](0088-visual-refresh-and-logo.md) | 화면 재질 개편(면으로 묶기·면 버튼·떠 있는 것만 그림자)과 로고 「꺾이는 길」 (SPEC 1·13·14 #1, ADR-0070·0075·0082 일부 개정) | Accepted (2026-10-15) |  |
| 0089 | [0089-partner-stay-link.md](0089-partner-stay-link.md) | 숙소 링크 `?stay=위도,경도&src=꼬리표`로 그 숙소 기준을 열고 출처별로 센다 (ADR-0067 딥링크 확장) | Accepted (2026-10-15) |  |
| 0090 | [0090-top-left-back.md](0090-top-left-back.md) | 길 잃지 않게 — 위 줄 왼쪽은 「뒤로」(첫 화면은 로고), 기준·♥는 늘 오른쪽, 되돌리기·설정은 그 자리에서 (ADR-0087 보이는 이름 개정) | Accepted (2026-10-16) |  |
| 0091 | [0091-night-trails-later.md](0091-night-trails-later.md) | 해가 진 뒤에는 오름·산·숲길 같은 야외 산길을 뒤로 미룬다(빼지 않음), 순서가 바뀌면 상태 줄 한 줄 | Accepted (2026-10-16) | Amendment 1: 밤에는 배로 가는 섬도 뒤로, 밀린 것에 맞춘 문구 |
| 0092 | [0092-famous-places-mood.md](0092-famous-places-mood.md) | 여섯째 기분 「유명한 데 가 보고 싶어」 — 비짓제주 관광지 만족도 5 또는 공영관광지 4점 이상, 먹기·카페 빼고 (ADR-0028·0075의 기분 5개 대체) | Accepted (2026-10-16) | Amendment 1: 주인 지정 2곳. Amendment 2: 실내도 늘, 인기(네이버 글 수)·가까움 반반 합 순. Amendment 3: 인기 2회차(구절·기관 머리말). Amendment 4: 인기 = 검색량(네이버 검색광고). Amendment 5: 키워드 여럿 검색량 합 |
| 0093 | [0093-english-chinese-japanese.md](0093-english-chinese-japanese.md) | 영어·중국어(简体)·일본어 — 앱 화면과 장소 소개글, 랜딩은 한국어, 지도는 모든 언어에서 네이버지도 기본 (context.md 「Korean-only for MVP」 대체) | Accepted (2026-10-17) | Amendment 8: 부산 파일은 미리 받지 않고 쓴 기기만, 새 워커가 따로 이어받음 |
| 0095 | [0095-busan-file-pipeline.md](0095-busan-file-pipeline.md) | 부산 데이터는 Postgres 없는 파일 파이프라인 — TourAPI 원문 `review/busan/raw` → `scripts/busan/` → `spots-busan.json`, 제주 `build-spots.mjs`와 분리 | Accepted (2026-10-18) |  |
| 0096 | [0096-start-screen-inline.md](0096-start-screen-inline.md) | 시작 화면은 앱 번들 밖 인라인 — 판정은 head, 덮개는 쓸 때만, GPS·경계는 앱, 꺼진 빌드는 블록을 지움 | Accepted (2026-10-19) |  |
| 0097 | [0097-storage-keys-per-destination.md](0097-storage-keys-per-destination.md) | 저장 키 머리말 jeju. 유지, 여행지별 기준·동네·숙소는 꼬리 .busan, jeju.dest, 다른 여행지 id 보존 (ADR-0063·0087 개정) | Accepted (2026-10-19) |  |
| 0098 | [0098-busan-part-chunk-and-terser.md](0098-busan-part-chunk-and-terser.md) | 부산 몫(동네 12·경계·시작 화면 모듈)은 부산이 쓰일 때만 받는 청크, 압축은 terser — 켠 빌드 한국어 진입 gzip ≤ 50KB | Accepted (2026-10-20) |  |
| 0099 | [0099-busan-landing-phase-1.md](0099-busan-landing-phase-1.md) | 부산 랜딩 1단계 — 엔티티 문장은 여행지마다(「여차나:부산은 … 부산 무계획 여행 앱」), 허브 1 + 동네 12쪽만, 장소 쪽은 사전등록 조건 뒤 | Accepted (2026-10-24) | Amendment 1: 제주·부산 허브끼리 「다른 여행지」 한 줄로 잇는다 |
| 0102 | [0102-gangwon-curated-gangneung.md](0102-gangwon-curated-gangneung.md) | 강원 검수한 곳 — 여행지 gangwon, 시군구 다섯(강릉 51150·속초 51210·춘천 51110·양양 51830·평창 51760, 그 밖은 자동 지역), 판정·동네는 자동 지역 색인, 자기 청크 없이 spots-gangwon.json, 이유 줄·기분 다섯 | Accepted (2026-10-30) | Amendment 2: 속초·춘천, 한 번에 한 시군구. Amendment 3: 양양, 주인 덮어쓰기(owner-overrides.json). Amendment 4: 평창 |
| 0103 | [0103-basis-sheet-dest-toggle-address-search.md](0103-basis-sheet-dest-toggle-address-search.md) | 기준 시트 2판 — 「여행지 \| 내 위치」 토글(옆으로 밀리는 칩 줄), 숙소 → 「주소·숙소」 검색(카카오 로컬, `/api/geo` 서버 경유, 키 없으면 「검색을 쓸 수 없어요.」), 운영 빌드만 | Accepted (2026-10-30) |  |
| 0104 | [0104-sgg-anchor-points.md](0104-sgg-anchor-points.md) | 한 점의 시군구는 시군구마다 둔 점(곳 좌표의 k-평균 최대 8개, 색인 `p`) 가운데 가장 가까운 점으로 — 자동 지역 곳 82.1% → 94.8%, 평창 64.4% → 98.3%, 색인 gzip 4,780 → 10,937 B, 강원 동네·비 소식도 그 시군구 (ADR-0101 1.1·R3, ADR-0102 2 개정) | Accepted (2026-10-31) |  |
| 0105 | [0105-play-mood-and-walkin.md](0105-play-mood-and-walkin.md) | 「새로운 거 해보고 싶어」 → 「놀러 가고 싶어」(id `new` 그대로), 탭 섞어서·구경·놀거리, 계곡·낚시·목장은 놀러·해변은 쉬기, 예약 없이 가는 곳은 보임, 자동 지역에도 쉬기 (ADR-0064·0074·0101·0102 개정) | Accepted (2026-10-31) |  |
| 0106 | [0106-seoul-curated-by-gu.md](0106-seoul-curated-by-gu.md) | 서울 검수한 곳 — 여행지 seoul(강원 꼴: 자동 지역 몫과 함께 열림, 자기 청크 없이 spots-seoul.json), 동네는 구, 판정·감사를 통과한 구만 DEST.seoul.sgg에(그 밖은 자동 지역), 판정은 강원 v4 + 장소 종류 표 v5·walkin + 서울 줄(궁·박물관·한강공원·야경·공연장), 유명한 곳 후보는 관광지·문화시설 | Accepted (2026-10-31) |  |
| 0117 | [0117-seoul-home-shelves.md](0117-seoul-home-shelves.md) | 서울 홈은 선반 — 기분 다섯·즐길 거리·오늘 행사를 가로 선반으로 합치고 별도 둘러보기 화면·「오늘 근처에서 하는 것」 묶음은 서울 홈에서 뺌, ADR-0114 판정 거둠 (ADR-0112·0114 서울 홈 자리 개정) | Accepted (2026-11-06) |  |
| 0116 | [0116-entry-budget-70kb.md](0116-entry-budget-70kb.md) | 한국어 진입 JS+CSS 예산 gzip 60,000 → 70,000 B — 올리기 전 운영 홈 라이트하우스 성능 75·LCP 6.4초(미달, 기분 칸 사진이 JS 뒤에 요청되는 순서 탓), 진입에 더할 때마다 다시 잼 (ADR-0100 값 개정) | Accepted (2026-11-05) |  |
| 0118 | [0118-seoul-weekly.md](0118-seoul-weekly.md) | 이번 주 서울 — 네이버 블로그·뉴스(고정 검색어)와 카카오 로컬로 기간 한정의 팝업·새로 연 곳·전시·마켓·축제를 모아 판정·블라인드 감사(90%) 뒤 `weekly-seoul.json`, 서울 홈 선반 `week`(시간대 순서표 안), 끝난 것은 날짜로 빠짐, 이번엔 손으로 1회 | Accepted (2026-11-05) |  |
| 0119 | [0119-seoul-2040-curation.md](0119-seoul-2040-curation.md) | 서울 장소 한국어 화면은 20~40대가 일부러 가는 곳만 — 먹기 아닌 1,154곳을 keep·drop·unsure로 판정(새 Opus)·블라인드 감사(라벨마다 90%), 통과한 drop만 한국어 화면에서 숨김, en·ja·zh는 그대로, 자료는 지우지 않음 (ADR-0115 결정 2 「교과서 서울 맨 뒤」 기본값을 한국어 화면에서 개정) | Accepted (2026-11-06) |  |
