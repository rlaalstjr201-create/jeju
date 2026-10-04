---
name: seo-geo
description: 여차나:제주(apps/web) SEO·GEO 작업 입구 — 「지금 무엇을 먼저 고치고 어떤 검색어를 노리고 버릴까」. 배포 전 점검, 랜딩 페이지·문구·title·구조화 데이터·llms.txt 작업 착수 전, 검색어 후보 검토(keyword gate), 배포 후 주간 점검(GSC·네이버 서치어드바이저·AI 답변 관측)에 쓴다. 판정 규칙의 단일 출처는 .claude/agents/seo-analyst.md다.
---

# seo-geo — 입구

**이 파일에는 판정 규칙이 없다.** 규칙은 `.claude/agents/seo-analyst.md` 하나다(두 벌 두면 갈라진다).
여기 있는 것은 부르는 법과 참고 자료 목록이다.

## 1. 진단을 원하면 — 에이전트를 띄운다

```
Agent(subagent_type: "seo-analyst", prompt: "이번 가동의 과제: <배포 전 점검 | 랜딩 착수 전 | 배포 후 주간 점검>.
.claude/agents/seo-analyst.md 「6. 가동 순서」의 ⓪부터 따른다. 막힌 조회는 실패로 기록하고 재시도하지 않는다.")
```

스킬에서 직접 진단하지 않는다 — 에이전트의 종료 조건·검증기를 우회하게 된다. 보고는 `npm run seo:report` 출력 그대로.

## 2. 검색어를 노리는 작업을 하려면 — gate 먼저

랜딩·문구·FAQ·외부 게시를 만들기 전에 그 검색어가 `apps/web/data/seo/keywords.json`에서 **target**인지 본다.

```bash
cd apps/web
npm run seo:keywords                               # 판정표
npm run seo:keywords -- --suggest "애월 산책,…"     # 새 후보의 자동완성(무료, 후보 추가 때만)
```

target이 아니면 만들지 않는다. 새 후보는 `references/keyword-gate.md` 절차로 SERP를 보고 keywords.json에 넣는다.

## 3. 빠른 오프라인 점검 (진단 기록 없이)

```bash
cd apps/web && npm run build && npm run seo:crawl && npm run seo:verify
```

## 참고 자료 (필요한 것만 읽는다)

| 파일 | 언제 |
|---|---|
| `references/positioning.md` | 문구·title·JSON-LD·llms.txt·외부 소개를 쓸 때 — 브랜드 엔티티 문장과 말투 |
| `references/keyword-gate.md` | 검색어 후보를 넣거나 점수를 매길 때 — 루브릭·킬 기준·SERP 기록법 |
| `references/geo.md` | 구조화 데이터·llms.txt·AI 크롤러·정적 본문 |
| `references/naver.md` | 네이버 서치어드바이저·SERP 블록·AI 브리핑·오프사이트 |
| `references/measurement.md` | 배포 후 연결(GSC·GA4·네이버·Bing), 순위 추적, AI 답변 관측, 주기 |
| `docs/seo/seoulist-postmortem.md` | 왜 이 규칙들이 있는가 |
| `docs/seo/README.md` | 명령·루프·배포 후 할 일 |
