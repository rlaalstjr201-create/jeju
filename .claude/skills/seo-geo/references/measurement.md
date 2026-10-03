# 측정 — 배포 후 연결과 경쟁에 맞춘 루프

배포 전에는 오프라인 계기(seo:crawl·seo:keywords·seo:verify)만 돈다. 아래는 **배포 후** 할 일이다. 지금은 기록만 — 구현은 연결 후.

## 연결 (한 번)

연결 상태(2026-10-03, `apps/web/data/seo/config.json` 기준): GSC URL 접두어 속성 `https://yeogwi.pages.dev/` 확인·사이트맵 제출(API 미연결, 주간 작업이 화면을 읽음) · 네이버 서치어드바이저 확인·사이트맵 제출·`/` 수집 요청 · Bing 미등록 · GA4 도입됨(아래 표).

| 소스 | 무엇 | 저장소에 남길 것(비밀 아님) |
|---|---|---|
| Google Search Console | 도메인 속성(`sc-domain:<도메인>`, DNS TXT) · 사이트맵 제출 · URL 검사로 `/`·`/jeju/` 색인 요청 | `data/seo/config.json` `gsc.property`. 서비스 계정 JSON은 저장소 밖, 경로를 환경변수 `GSC_CREDENTIALS`에 |
| 네이버 서치어드바이저 | 사이트 등록·소유 확인·사이트맵·수집 요청 (`naver.md`) | `naver.site`. API 없음 — 수동 기록 |
| Bing Webmaster Tools | GSC에서 가져오기 · IndexNow 키 | `bing.site`. ChatGPT 검색·Copilot의 색인 바탕 |
| GA4 | **도입됨(ADR-0078)** — 속성 「여행귀:제주」, 측정 ID `G-P8DN26LKBC`(공개 ID, `apps/web/scripts/analytics-env.ts` `SITE_IDS`). 개인정보 안내는 ADR-0078에 맞춰 고쳤다. 실적 API는 미연결 | `ga4.property_id`(현재 config는 빈 칸·옛 TODO 문구 — 갱신 필요) |

연결 후 `apps/web/scripts/seo/gsc.mjs`의 `gscLayerStats()`를 구현한다(seoulist `scripts/lib/gsc.mjs` 참고). GSC 확정 데이터는 2~3일 늦다 — 미확정 구간으로 채점하지 않는다.

## 주기

| 주기 | 무엇 | 누가 |
|---|---|---|
| 배포 직후 1회 | `SITE_URL=… npm run build` → `seo:crawl` P0 0건 확인 → 연결 4종 → Cloudflare AI 크롤러 설정 확인 → 브랜드 검색어 「여행귀:제주」 색인 확인 | 사람 |
| 주 1회(월) | keywords.json target마다 `track[]`에 그 주 구글 평균 순위·노출·클릭(GSC query 차원)과 네이버 순위(서치어드바이저·직접 검색) 한 줄 → `npm run seo:keywords -- --track` | 사람 10분 |
| 격주 | seo-analyst 가동(진단 기록·채점·큐) | 에이전트 |
| 월 1회 | AI 답변 관측(아래) · watch 후보 SERP 재관찰 · 새 후보 자동완성 | 사람 + 에이전트 |
| 사건 때 | 배포 후 `seo:crawl -- --diff` · 순위 급변 · 새 경쟁자 | 에이전트 |

## 순위 추적 판정 (사전등록, `pivotOf`)

| 상태 | 판정 |
|---|---|
| 색인 확인 전 | wait — GSC URL 검사·네이버 웹문서 노출부터 |
| 색인 후 4주 미만 | wait — 신규 부스트·흔들림 구간에 판정하지 않는다(seoulist: 첫 노출 4주 뒤 절벽) |
| 4~8주 노출 0 | wait / **8주 노출 0 → kill**(페이지는 두되 작업을 접는다) |
| 10위 안 · 최근 노출 ≥30 · 클릭 0 | meta (제목·설명) |
| 10위 안 · 클릭 있음 | hold (손대지 않는다 — 자기잠식 금지) |
| 11~20위 | push (내부링크·본문 보강·오프사이트 언급 1건) |
| 8주 뒤 20위 밖 | **pivot** — 더 좁은 조합(지역 × 기분 × 대표 지명)으로 옮긴다 |

target이 2주 연속 판정 `kill`·`pivot`이면 keywords.json에서 그 후보를 다시 채점한다(SERP 재관찰 포함).

## 예측 (seo:forecast — 확정 28일 뒤부터)

규모 예측을 하지 않는다. target 검색어의 **8주 뒤 순위 구간(p10~p90)**과 **색인된 랜딩 쪽수**만 사전등록한다. 널 모델 두 개(no_change = 지금 순위, trend = 최근 2주 기울기 연장)를 함께 적고, 널을 못 이기면 기각. 채점 산술은 `scripts/seo/score.mjs`(테스트로 고정).

## AI 답변 관측

질문 묶음(비브랜드, 바꾸지 않는다 — 바꾸면 새 ID):

| ID | 질문 |
|---|---|
| Q1 | 계획 없이 제주 여행 왔는데 지금 뭐 하면 좋을까? |
| Q2 | P 성향인데 제주 여행 무계획으로 가도 돼? 현지에서 갈 곳 고르는 방법 |
| Q3 | 지금 애월 근처인데 좀 걷고 싶어. 어디 갈까? |
| Q4 | 성산 근처에서 새로운 체험 할 만한 곳 3곳만 |
| Q5 | 서귀포 시내에서 차로 30분 안에 푹 쉴 만한 곳 |
| Q6 | 제주 즉흥 여행할 때 쓰기 좋은 앱이나 사이트 |
| Q7 | 함덕 근처 지금 가볼 만한 곳 |
| Q8 | 제주에서 기분 따라 갈 곳 추천해 주는 서비스 있어? |
| B1(브랜드, 진단용) | 여행귀:제주 앱이 뭐야? |

엔진: ChatGPT(검색 켬) · Perplexity · Gemini · 네이버(AI 브리핑이 뜨는 검색어로) · Claude. 조합마다 3회, 같은 날.
기록: `apps/web/data/seo/ai-observations.jsonl` 한 줄 = 한 응답 `{date, engine, prompt_id, run, search_triggered, brand_mentioned, recommended, cited_urls[], our_url_cited, accuracy, competitors[]}`. 답변 전문은 저장하지 않는다.
읽는 법: 1회는 아무 의미 없다. 3회 중 2회 이상 · 2개월 연속일 때만 「인용된다」고 말한다. 크롤러 방문·llms.txt 요청은 인용이 아니다.
