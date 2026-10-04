# ADR 색인

이 폴더의 결정 기록(ADR) 전체 목록이다. 파일 이름은 바꾸지 않는다(다른 문서의 참조가 깨진다).

## 번호 중복 0025~0029

0025~0029는 번호가 겹친다. 같은 번호에 두 계열이 있다.

- **옛 방향(2026-05)**: 큐레이션·발굴 파이프라인(apps/api·apps/mobile 시절). 예: `0029-phase0-hidden-gem-discovery.md`.
- **새 방향(2026-09-30~)**: 폰 우선 웹 apps/web(현재 여행귀:제주). 예: `0029-destination-areas-and-saves.md`.

그래서 0025~0029를 가리킬 때는 「ADR-0029」가 아니라 **파일 이름**으로 쓴다(예: `0029-destination-areas-and-saves.md`). 0030 이후는 번호만 써도 된다. 결번: 0036·0039·0046·0048. 83파일, 번호 76개.

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
| 0028 (새 방향) | [0028-include-food-and-full-review.md](0028-include-food-and-full-review.md) | 맛집 포함 + 보유 데이터 전 항목 검수 | Accepted (2026-09-30) |  |
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
| 0074 | [0074-verified-booking-routes-for-experiences.md](0074-verified-booking-routes-for-experiences.md) | 체험 카드는 장소별로 확인된 예약 경로 하나를 단다 — 경로 없는 체험은 체험 탭에서 뺀다 | Accepted (2026-10-01) |  |
| 0075 | [0075-home-refresh-today-and-photos.md](0075-home-refresh-today-and-photos.md) | 홈 개편 A′ — 오늘 판, 기분 줄 사진, 아래 두 묶음. 결과 화면 작은 고침 | Accepted (2026-10-03) |  |
| 0076 | [0076-rain-prompt-via-pages-function.md](0076-rain-prompt-via-pages-function.md) | 비 소식은 기상청 단기예보를 Pages Function 하나로 받는다 — 동네 이름만 보낸다 | Accepted (2026-10-03) |  |
| 0077 | [0077-rename-yeohaenggwi.md](0077-rename-yeohaenggwi.md) | 이름 「여행귀:제주」, 주소 yeogwi.pages.dev (ADR-0068 1·2·4·5 대체) | Accepted (2026-10-03) |  |
| 0078 | [0078-analytics-always-on.md](0078-analytics-always-on.md) | 분석은 셋(GA4 · 네이버 애널리틱스 · 자체 익명 기록), 꺼진 채로는 배포하지 않는다 | Accepted (2026-10-03) |  |
| 0079 | [0079-weekly-seo-rank-ops.md](0079-weekly-seo-rank-ops.md) | 주간 SEO·순위 운영 — 측정은 기계가, 고침은 커밋까지, 배포는 사람이 | Accepted (2026-10-03) |  |
| 0080 | [0080-seasonal-spots.md](0080-seasonal-spots.md) | 계절 명소(철) 1단계 — 원문으로 판정한 곳에만, 그해 관측일 또는 원문이 말한 달에만, 카드 메타 줄 글자 하나 | Accepted (2026-10-04) |  |
| 0081 | [0081-in-app-survey.md](0081-in-app-survey.md) | 써 본 사람에게만 묻는 짧은 설문, 글자 한 줄로, 자체 D1에 | Accepted (2026-10-04) |  |
