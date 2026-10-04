# SEO·GEO — 여차나:제주

검색(구글·네이버)과 생성형 엔진(ChatGPT·Perplexity·Gemini·Claude·네이버 AI 브리핑)에서 여차나:제주(https://yeochana.pages.dev)가 찾아지고 인용되게 하는 루프.
설계는 seoulist의 SEO 시스템을 옮기고, 그 프로젝트가 **검색어 경쟁에서 진 이유**(`seoulist-postmortem.md`)를 규칙으로 막았다.

| 무엇 | 어디 |
|---|---|
| 판정 규칙(단일 출처) | `.claude/agents/seo-analyst.md` |
| 입구·참고 자료 | `.claude/skills/seo-geo/` (`/seo-geo`) |
| 계기(스크립트) | `apps/web/scripts/seo/` |
| 기록 | `apps/web/data/seo/` — `keywords.json` · `diagnoses/` · `queue.json` · `crawl/` · `forecasts/` · `config.json` |
| 첫 감사 | `audit-01.md` |
| 검색어 조사 | `keyword-research-01.md` |
| 정적 랜딩 초안 | `specs/seo-landing.md` |

(`data/`는 저장소 루트가 아니라 `apps/web/data/seo/`다 — 루트 `/data/`는 `.gitignore` 대상이다.)

## 포지션 (모든 문구의 바탕)

> **여차나:제주는 여차하면 나서는 P를 위한 여행동반자로, 계획 없이 다니는 여행자가 지금 있는 곳에서 기분 하나로 갈 곳 3곳을 받는 제주 무계획 여행 앱이다.**

태그라인 「P를 위한 여행동반자」, 목적 문장 「지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.」(ADR-0077 Amendment 1·2). 문장의 단일 출처는 `.claude/skills/seo-geo/references/positioning.md`. 브랜드 검색어는 「여차나:제주」(`keywords.json` brand). 헤드(「제주 가볼만한곳」「○○ 맛집」)는 노리지 않는다. 검색 유입은 세부 지역 × 기분 롱테일(「성산 근처 체험」), P·무계획 의도는 브랜드·GEO 연결용.

## 루프

```
            ┌──────────── keyword gate (seo:keywords) ────────────┐
            │  후보 → 자동완성·SERP → 5축 점수·킬 기준 → target만 작업 │
            └───────────────────────┬────────────────────────────┘
                                    ▼
 진단 seo-analyst ──▶ 기록 diagnoses/*.json ──▶ 렌더·검증 seo:report ──▶ 큐 queue.json
      ▲                                                                   │
      │                                                         변경(사람: index.html·public·랜딩)
      │                                                                   ▼
 채점(다음 진단 첫 절) ◀── seo:verify (check id 해소율 · 게이트 · 예측) ◀── 빌드 + seo:crawl
                                    ▲
                     배포 후: GSC · 네이버 서치어드바이저 · Bing · AI 답변 관측 · 순위 추적(track → pivotOf)
```

- 개입마다 감사 id(`check`)를 붙여 두면 다음 빌드에서 사라졌는지로 **사람 기억 없이** 채점된다.
- 해소율이 다음 진단의 개입 수 상한을 정한다(≥50% → 5 · 30~50% → 3 · <30% → 2).
- 콘텐츠·랜딩 개입은 keywords.json의 **target 검색어**를 가리켜야 검증을 통과한다.

## 명령 (apps/web에서)

| 명령 | 하는 일 | 외부 호출 | 파일 쓰기 |
|---|---|---|---|
| `npm run build` (`SITE_URL=https://<도메인> npm run build`) | 감사 대상 만들기 | — | dist |
| `npm run seo:crawl` | dist 전수: 페이지·내부링크·사이트맵·감사 발견(P0~P2)·배포 diff | 0 | — |
| `npm run seo:crawl -- --json \| --site <origin> \| --dist <경로>` | | 0 | — |
| `npm run seo:crawl -- --snapshot` / `--diff <파일>` | 기준 스냅샷 남기기 / 대조 | 0 | `data/seo/crawl/<날짜>.json` |
| `npm run seo:keywords` | keyword gate 판정표·검증 | 0 | — |
| `npm run seo:keywords -- --track` | target 순위 추적 판정(배포 후) | 0 | — |
| `npm run seo:keywords -- --suggest "a,b"` | 네이버·구글 자동완성 | **있음**(무료·키 없음) | — |
| `npm run seo:verify` (`-- --strict`) | 큐 해소 채점 · 게이트 검증 · 예측 상태 · 외부 소스 연결 상태 (`--strict`: P0·게이트 오류면 exit 1) | 0 | — |
| `npm run seo:report` / `-- --validate` / `-- --queue` | 진단 렌더 / 검증 / 큐 생성 | 0 | `--queue`만 `data/seo/queue.json` |
| `npm run seo:forecast` | 지금은 안내만(TODO-after-deploy) | 0 | — |

테스트: `npx vitest run tests/seo-*.test.ts` (crawl 파싱·감사 규칙 · 진단 기록 검증 · 채점 산술 · keyword gate · 순위 판정 · 기록 파일 무결성).

`seo:crawl`·`seo:keywords`는 **계기판(exit 0)**이다. 배포 전 점검으로 막고 싶으면 `seo:verify -- --strict`.

## 배포 전에 할 일

`audit-01.md` (a) — 정확한 태그와 파일이 적혀 있다. 요약: SITE_URL · title/description · canonical · JSON-LD(WebSite+WebApplication) · `<noscript>` · robots Sitemap 줄 · sitemap.xml · llms.txt. 그리고 (b) 정적 랜딩(`specs/seo-landing.md`)의 Open Question 결정.

## 배포 후에 할 일

1. `SITE_URL` 빌드 → `seo:crawl` P0 확인 → `seo:crawl -- --snapshot`.
2. Cloudflare AI 크롤러 차단 설정 확인.
3. GSC(도메인 속성·사이트맵·URL 검사) · 네이버 서치어드바이저(등록·소유 확인·사이트맵·수집 요청) · Bing(GSC 가져오기) — `data/seo/config.json`에 속성 이름만(비밀값은 환경변수).
4. GA4는 보류(ADR-0061·privacy.html과 함께 결정).
5. 주 1회 target 순위 기록 → `seo:keywords -- --track` · 격주 seo-analyst · 월 1회 AI 답변 관측 · 확정 28일 뒤 첫 `seo:forecast`.
6. `scripts/seo/gsc.mjs` 구현(TODO-after-deploy).

상세: `.claude/skills/seo-geo/references/measurement.md`, `naver.md`.

## 주간 운영 (매주 월요일 아침, ADR-0079)

측정은 기계가, 고침은 로컬 커밋까지, 배포·push는 사람이 한다. 순서(apps/web에서):

1. `SITE_URL=https://yeochana.pages.dev npm run build` → `npm run seo:crawl` · `npm run seo:verify`
2. `node scripts/seo/rank-naver.mjs` → `data/seo/rank/naver-YYYY-MM-DD.json` (막히면 `check_failed`, 같은 날 다시 재지 않는다. `--dry`는 목록만)
3. GSC 「실적 → 검색어」(지난 7일)를 크롬에서 읽어 `data/seo/gsc/YYYY-MM-DD.json`에 저장 — `{date_range:{start,end}, rows:[{query, clicks, impressions, ctr, position}]}`
4. `node scripts/seo/gsc-import.mjs --gsc data/seo/gsc/YYYY-MM-DD.json` → target `track[]` 한 줄 + `seo:keywords --track` 판정 + 「밀림」 경보(3계단 넘게 하락·10위 밖으로, 색인 4주 안은 보류). 못 읽은 칸은 「확인 실패」로 남긴다
5. seo-analyst 진단(`seo:report`)
6. 자동 조치 범위만 고친다: meta → title·description, push → 내부 링크·본문 보강, 구조화 데이터·llms.txt 정합, 사이트맵·IndexNow. 새 랜딩·검색어 판정 변경·브랜드 문장·ADR감은 제안만
7. 테스트·`check:slop`·`seo:crawl`·`seo:verify` 통과 시 로컬 커밋(push·배포는 승인 후)
8. `node scripts/seo/indexnow.mjs dry` — 배포 뒤 승인되면 `send`(seed 이후 추가·변경 URL만. 키: `public/<키>.txt`, 상태: `data/seo/indexnow-state.json`)
9. 보고 `docs/seo/weekly/YYYY-MM-DD.md` — 순위 표·판정·한 일·승인 대기·확인 실패, 분석 리포트(ADR-0078 6) 링크

## 하지 않는 것

유료 SERP·검색량 API · 절대 유입 예측 · 배포 전 기준선 예측 · 헤드 검색어용 페이지 · 비짓제주 원문/사진 재게시 · llms.txt·크롤러 방문을 성과로 읽기 · 1회 AI 답변을 성과로 읽기.
