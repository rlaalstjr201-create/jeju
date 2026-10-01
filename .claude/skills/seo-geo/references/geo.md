# GEO — 생성형 엔진(ChatGPT·Perplexity·Gemini·Claude·네이버 AI 브리핑)에 인용되기

근거 수준을 섞지 않는다: **공식 문서로 확인된 것**과 **가설**을 나눈다. 연구의 효과 크기를 우리 예상 상승률로 옮기지 않는다.

## 확인된 것

- 구글 AI 개요·AI 모드는 별도 마크업을 요구하지 않는다 — 색인 가능성·내부링크·사람이 읽는 텍스트·화면과 일치하는 구조화 데이터가 기본.
- ChatGPT 검색 노출에는 `OAI-SearchBot` 접근이 필요하다(학습용 `GPTBot`과 별개). Perplexity는 `PerplexityBot`(색인)과 `Perplexity-User`(요청 시)를 나눈다. Claude는 `Claude-SearchBot`·`Claude-User`·`ClaudeBot`.
- 이 AI 크롤러 다수는 JS를 실행하지 않는다 → **정적 HTML 본문이 없으면 인용할 것이 없다.** 지금 여행계획짜기 귀찮아:제주의 장소 정보는 전부 JS 렌더다.
- llms.txt는 제안 규격일 뿐이다. 구글은 쓰지 않는다고 했다. 비용이 0이라 둔다 — KPI 아님.
- 구글 FAQ 리치결과는 2023-08부터 권위 있는 정부·보건 사이트로 제한됐다. FAQPage를 리치결과용으로 넣지 않는다.

## 가설(측정으로만 확인)

- 정의형 첫 문장(「X는 ~하는 ~다」)과 목록 형식이 생성 답변에 잘 뽑힌다.
- 같은 엔티티 문장이 여러 출처(우리 사이트·외부 글)에 반복되면 엔진이 그 연결(「P 여행 + 제주 → 여행계획짜기 귀찮아:제주」)을 학습·검색에서 쓴다.
- 「인용(Cited)」과 「추천(Recommended)」은 다르다. 추천은 웹 전체의 합의(커뮤니티·블로그·언론)가 정한다 — 오프사이트 없이는 인용까지만 간다.

## 페이지별 구조화 데이터 (화면과 같은 내용만)

| 페이지 | 타입 |
|---|---|
| 홈 `/` | `WebSite`(name, alternateName, url, inLanguage ko) + `WebApplication`(applicationCategory TravelApplication, operatingSystem Web, offers 0 KRW, description = 엔티티 한 줄, areaServed 제주특별자치도, inLanguage ko) |
| 허브 `/jeju/` | `CollectionPage` + `ItemList`(15개 지역 페이지) + `BreadcrumbList` |
| 지역 `/jeju/<area>/` | `TouristDestination`(name, geo, containedInPlace 제주특별자치도) + 기분별 `ItemList`(ListItem → `TouristAttraction`·`Restaurant`·`CafeOrCoffeeShop`, name, geo; url은 장소 페이지) + `BreadcrumbList` |
| 장소 `/jeju/<area>/<place>/` | `TouristAttraction`·`Restaurant`·`CafeOrCoffeeShop`(name, description=우리 이유, geo, url, hasMap, image, containedInPlace=지역) + `BreadcrumbList` (ADR-0072) |

- 장소 `description`에 비짓제주 원문을 넣지 않는다. 우리 `reason` 문장만.
- `image`는 비짓제주 CDN 핫링크 URL만, 사진 모드일 때만(ADR-0072 — `LANDING_PHOTOS=0`이면 빠진다. 제3자 사진, `docs/licensing-visitjeju.md`).
- 점수(`score`)를 `aggregateRating`으로 내보내지 않는다 — 리뷰 기반 평점이 아니고 화면에도 없다(ADR-0060).

## robots.txt 목표 모양

```
User-agent: *
Allow: /

Sitemap: https://<도메인>/sitemap.xml
```

`*` 허용이면 AI 봇도 허용이다. 이름을 따로 적을 필요는 없지만, 적는다면 Allow만 적는다. Cloudflare 대시보드의 AI 크롤러 차단(「AI Crawl Control」류)은 robots와 별개로 막을 수 있으니 배포 직후 확인한다.

## llms.txt 모양

`docs/seo/audit-01.md` 부록 B에 초안이 있다. 원칙: 첫 줄 `# 여행계획짜기 귀찮아:제주`, 인용 블록에 엔티티 한 줄, 「무엇을 하지 않는가」(일정·평점·가격 없음), 기분 5개·세부 지역 15곳, 랜딩 링크, 데이터 출처와 출처 표시.
