---
name: index-check
description: 여차나:제주 색인 상태를 구글 서치콘솔과 네이버 서치어드바이저에서 한 번에 읽어 한 파일로 남긴다. 「색인 됐어?」「서치콘솔 봐줘」「서치어드바이저 봐줘」, 주간 SEO 점검의 구글 단계에서 쓴다 — 한쪽만 보지 않는다.
---

# index-check — 구글·네이버 색인 상태를 한 세트로

과제: 두 콘솔을 같은 날 읽어 `apps/web/data/seo/console/YYYY-MM-DD.json` 하나에 적고, 결론 한 줄을 보고한다.

## 어디서 무엇을 읽나

| | 브라우저 | 읽을 것 |
|---|---|---|
| 구글 서치콘솔 | Claude in Chrome (사용자 크롬, 로그인 상태) | `https://search.google.com/search-console/index?resource_id=https%3A%2F%2Fyeochana.pages.dev%2F` 색인 생성 쪽수·미색인 사유 / `…/sitemaps?resource_id=…` 사이트맵 상태·마지막으로 읽은 날짜·발견된 페이지 |
| 네이버 서치어드바이저 | Playwright MCP (`--user-data-dir C:\Users\rlaal\.playwright-naver`) — 크롬 확장은 naver.com 전체가 막힌다 | `https://searchadvisor.naver.com/console/site/report/crawl?site=https%3A%2F%2Fyeochana.pages.dev` 를 연 뒤 화면이 부른 `api-console/report/*` 응답을 `browser_network_requests`(filter `api-console`) → `browser_network_request`(response-body)로 읽는다. 그래프는 canvas라 글자로 안 나온다 |

네이버 응답에서 쓰는 것:
- `report/crawl/…&count=5`: 날짜별 `pageCount`(수집 쪽수)·`sumErrorCount`. 처음 0이 아닌 날 = 첫 수집일.
- `report/seo/site/summary/…`: `sitemap.result`·`robots`·`multiProtocol`.
- `report/expose/…`: 노출·클릭. `FAIL_NOT_EXIST_DATA`면 「데이터 없음」.

## 가드레일

- 읽기만 한다. 색인 요청·사이트맵 재제출·설정 변경 버튼은 누르지 않는다(주인이 한다, 하라는 말이 있어도 그 자리에서 다시 묻는다).
- 로그인 화면이 나오면 멈추고 주인에게 그 창에서 로그인해 달라고 한다. 비밀번호를 넣지 않는다.
- 못 읽은 칸은 `"확인 실패"`, 콘솔이 「데이터 처리 중」·`FAIL_NOT_EXIST_DATA`면 `"데이터 없음"`. 0으로 바꾸지 않는다.
- 한 번 읽고 끝. 같은 날 다시 돌려 숫자를 바꾸지 않는다.

## 기록 형식

```json
{
  "date": "YYYY-MM-DD",
  "google": { "indexed": n | "데이터 없음" | "확인 실패", "not_indexed_reasons": [], "sitemap": { "status": "…", "last_read": "…", "discovered": n } },
  "naver": { "first_crawl": "YYYY-MM-DD" | null, "crawled_pages_total": n, "crawl_errors_total": n, "sitemap": "…", "expose": "데이터 없음" | { "impressions": n, "clicks": n } },
  "verdict": "한 줄"
}
```

## 종료 조건

파일이 위 형식으로 저장됐고, 보고는 결론 한 줄 + 구글 한 줄 + 네이버 한 줄. 지난 기록이 있으면 무엇이 바뀌었는지만 덧붙인다. 열어 둔 크롬 탭은 닫는다.
