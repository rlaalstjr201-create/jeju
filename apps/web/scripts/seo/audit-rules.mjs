// 오프라인 SEO·GEO 감사 규칙의 단일 출처 — 순수 함수. crawl.mjs·verify.mjs가 쓰고 tests/seo-crawl.test.ts가 검증한다.
//
// 입력은 빌드 결과물을 읽어 만든 값뿐이다(네트워크 0건). 발견(finding)마다 **안정된 id**가 있어서
// 진단 기록의 개입이 `check: "<id>"`로 그 발견을 가리키고, verify.mjs가 다음 빌드에서 그 id가 사라졌는지로
// 채점한다 — 사람 기억에 걸지 않는다(seoulist: 개입 13건 중 8건이 「이행 안 됨」).
//
// severity: P0 = 배포 전에 막는다 · P1 = 배포 전에 하는 게 맞다 · P2 = 나중에 해도 된다
// layer:    크롤(닿는가) · 색인(무엇으로 읽히는가) · GEO(AI가 인용할 거리가 있는가) · 공유(링크 미리보기)

/** 검색·AI 크롤러. robots.txt가 이들을 막으면 그 표면 전체가 사라진다. */
export const CRAWLERS = {
  search: ['Googlebot', 'Yeti', 'Bingbot', 'Daum'],                         // Yeti = 네이버
  ai: ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot', 'PerplexityBot', 'Perplexity-User',
    'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'Google-Extended', 'Applebot-Extended'],
};

/** robots.txt → { groups: [{agents, allow, disallow}], sitemaps }. 우리가 쓰는 모양만 읽는다. */
export function parseRobots(txt) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'sitemap') { sitemaps.push(v); continue; }
    if (k === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (k === 'allow') cur.allow.push(v);
    if (k === 'disallow') cur.disallow.push(v);
  }
  return { groups, sitemaps };
}

/** 이 봇이 `/`를 막히는가. 자기 이름 그룹이 있으면 그것만, 없으면 `*` 그룹을 본다(구글 규칙). */
export function blocksRoot(robots, bot) {
  const name = bot.toLowerCase();
  const own = robots.groups.filter((g) => g.agents.some((a) => a !== '*' && name.startsWith(a)));
  const groups = own.length ? own : robots.groups.filter((g) => g.agents.includes('*'));
  return groups.some((g) => g.disallow.includes('/') && !g.allow.includes('/'));
}

/** 검색어를 받으려는 페이지가 아닌 안내 페이지. 제목·구조화 데이터 검사에서 뺀다. */
export const UTILITY = ['/privacy'];

const F = (id, severity, layer, msg, fix, url) => ({ id, severity, layer, ...(url ? { url } : {}), msg, fix });

/**
 * 사이트 감사.
 * @param {{ pages: Map<string, any>, files: Record<string,string|null>, origin: string, spotCount?: number }} input
 *   pages: url → parsePage 결과(+url). files: robots.txt·sitemap.xml·llms.txt·_headers의 내용(없으면 null).
 */
export function auditSite({ pages, files, origin, spotCount = 0 }) {
  const out = [];
  const html = [...pages.values()].filter((p) => !p.fragment);
  const indexable = html.filter((p) => !p.noindex && p.url !== '/404.html');

  // ── 사이트 단위 ─────────────────────────────────────────────
  if (!origin) out.push(F('site:no-origin', 'P0', '공유',
    '빌드에 SITE_URL이 없어 og:url·og:image·canonical이 상대경로다. 카카오톡·검색엔진은 절대 URL만 믿는다.',
    'Cloudflare Pages 빌드 환경변수 SITE_URL=https://<도메인> 설정(도메인 확정 후). 감사는 SITE_URL=… npm run seo:crawl로 다시 돈다.'));

  if (files['robots.txt'] == null) out.push(F('site:no-robots', 'P1', '크롤', 'robots.txt가 없다.', 'public/robots.txt 추가'));
  else {
    const r = parseRobots(files['robots.txt']);
    for (const bot of [...CRAWLERS.search, ...CRAWLERS.ai]) {
      if (blocksRoot(r, bot)) out.push(F(`site:robots-blocks:${bot}`, CRAWLERS.search.includes(bot) ? 'P0' : 'P1', '크롤',
        `robots.txt가 ${bot}의 / 접근을 막는다.`, `${bot} 그룹의 Disallow: / 를 지운다(인용·유입이 목적이면 전면 허용).`));
    }
    if (!r.sitemaps.length) out.push(F('site:robots-no-sitemap', 'P1', '크롤',
      'robots.txt에 Sitemap: 줄이 없다. 네이버·빙은 이 줄로 사이트맵을 찾는다.', 'Sitemap: https://<도메인>/sitemap.xml 한 줄 추가'));
    else if (r.sitemaps.some((s) => !/^https?:\/\//.test(s))) out.push(F('site:robots-sitemap-relative', 'P1', '크롤',
      'robots.txt의 Sitemap: 값이 절대 URL이 아니다(규격 위반).', '절대 URL로 쓴다'));
  }

  if (files['sitemap.xml'] == null) out.push(F('site:no-sitemap', 'P1', '크롤',
    'sitemap.xml이 없다. 페이지가 1장이면 영향이 작지만 정적 랜딩(specs/seo-landing.md)이 생기면 필수다.',
    '빌드 때 dist/sitemap.xml 생성(색인 대상 URL 전부, 절대 URL, lastmod=spots.json 갱신일).'));
  else {
    const locs = [...files['sitemap.xml'].matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    if (locs.some((l) => !/^https?:\/\//.test(l))) out.push(F('site:sitemap-relative', 'P1', '크롤', 'sitemap.xml에 상대 URL이 있다.', '절대 URL로'));
  }

  if (files['llms.txt'] == null) out.push(F('site:no-llms-txt', 'P2', 'GEO',
    'llms.txt가 없다. 비용 0의 요약 파일이지만 성과 지표는 아니다(구글은 쓰지 않는다고 명시).',
    'public/llms.txt — 브랜드 정의·기분 5개·세부 지역 15곳·데이터 출처·랜딩 링크(docs/seo/audit-01.md 부록 초안).'));
  else if (!/P의 여행/.test(files['llms.txt'])) out.push(F('site:llms-no-brand', 'P2', 'GEO', 'llms.txt에 브랜드명 「P의 여행」이 없다.', '첫 줄 # P의 여행'));

  if (files._headers != null && /X-Robots-Tag:\s*[^\n]*noindex/i.test(files._headers)) {
    // 어느 경로에 붙었는지까지는 보지 않는다 — 있다는 사실만으로 사람이 볼 값어치가 있다.
    out.push(F('site:headers-noindex', 'P1', '색인', '_headers에 X-Robots-Tag noindex가 있다. 의도한 경로인지 확인.', '의도가 아니면 지운다'));
  }

  // ── 페이지 단위 ─────────────────────────────────────────────
  for (const p of html) {
    const u = p.url;
    if (u === '/404.html') {
      if (!p.noindex) out.push(F('page:/404.html:indexable', 'P1', '색인', '404.html에 noindex가 없다.', '<meta name="robots" content="noindex">', u));
      continue;
    }
    if (p.noindex) continue;
    const utility = UTILITY.includes(u); // 안내 페이지 — 검색어를 받으려는 쪽이 아니다
    if (p.lang !== 'ko') out.push(F(`page:${u}:lang`, 'P2', '색인', `<html lang>이 "${p.lang}"이다.`, 'lang="ko"', u));
    if (!p.title) out.push(F(`page:${u}:no-title`, 'P0', '색인', 'title이 없다.', '<title> 추가', u));
    else if (!utility && !/제주/.test(p.title)) out.push(F(`page:${u}:title-no-jeju`, 'P1', '색인',
      `title "${p.title}"에 「제주」가 없다. 검색 결과 제목만 보고는 제주 여행 도구인지 모른다.`,
      'title에 제주와 P(무계획·즉흥) 포지션을 넣는다. 예: 「P의 여행 · 계획 없이 제주, 지금 갈 곳 3곳」', u));
    if (!p.description) out.push(F(`page:${u}:no-description`, 'P1', '색인', 'meta description이 없다.', '한 문장 설명 추가', u));
    else if (p.description.length > 160) out.push(F(`page:${u}:description-long`, 'P2', '색인', `description ${p.description.length}자 — 잘린다.`, '80자 안팎으로', u));
    if (!p.canonicalRaw) out.push(F(`page:${u}:no-canonical`, 'P1', '색인', 'canonical이 없다.', `<link rel="canonical" href="https://<도메인>${u === '/' ? '/' : u}">`, u));
    else if (!/^https?:\/\//.test(p.canonicalRaw)) out.push(F(`page:${u}:canonical-relative`, 'P1', '색인', `canonical이 상대경로("${p.canonicalRaw}").`, '절대 URL로', u));
    else if (p.canonical !== null && p.canonical !== u) out.push(F(`page:${u}:canonical-other`, 'P1', '색인', `canonical이 다른 쪽(${p.canonical})을 가리킨다.`, '자기참조로', u));
    if (p.h1s.length === 0) out.push(F(`page:${u}:no-h1`, 'P2', '색인', 'h1이 없다.', 'h1 1개', u));
    for (const k of ['og:image', 'og:url']) {
      const v = p.og[k];
      if (v !== undefined && !/^https?:\/\//.test(v)) out.push(F(`page:${u}:${k.replace(':', '-')}-relative`, 'P1', '공유', `${k}가 절대 URL이 아니다("${v}").`, 'SITE_URL 설정 후 빌드(site:no-origin)', u));
    }
    const bad = p.jsonld.filter((b) => !b.ok);
    if (bad.length) out.push(F(`page:${u}:jsonld-invalid`, 'P0', 'GEO', `JSON-LD ${bad.length}개 블록이 파싱되지 않는다.`, '유효한 JSON으로', u));
    if (!utility && !p.jsonld.some((b) => b.ok && b.types.length)) out.push(F(`page:${u}:no-jsonld`, 'P1', 'GEO',
      '구조화 데이터가 없다. AI·검색이 이 페이지를 무엇(앱·장소 목록)으로 읽을지 정해 주지 않는다.',
      u === '/' ? 'WebSite + WebApplication(브랜드 정의 문장, inLanguage ko, areaServed 제주) JSON-LD' : '페이지 성격에 맞는 타입(ItemList·TouristDestination·BreadcrumbList)', u));
  }

  // 앱 셸 — JS를 안 도는 크롤러(GPTBot·ClaudeBot·PerplexityBot 다수, 네이버 Yeti 일부)가 보는 것은 이것뿐이다.
  const home = pages.get('/');
  if (home && !home.fragment) {
    if (home.textChars < 300) out.push(F('page:/:thin-shell', 'P0', 'GEO',
      `홈의 정적 본문이 ${home.textChars}자다. 장소 ${spotCount || '?'}곳은 JS가 spots.json에서 그려서 JS를 안 도는 크롤러에게는 없다.`,
      '정적 랜딩(specs/seo-landing.md)을 빌드 때 만든다. 홈에는 <noscript> 소개 + 랜딩 허브 링크.'));
    if (!home.hasNoscript) out.push(F('page:/:no-noscript', 'P1', 'GEO',
      '<noscript>가 없다. JS를 안 도는 크롤러는 버튼 5개만 본다.', '<noscript>에 브랜드 정의 문장 + 랜딩 허브 링크'));
  }
  const landing = indexable.filter((p) => p.url !== '/' && !UTILITY.includes(p.url));
  if (!landing.length) out.push(F('site:no-landing-pages', 'P0', '수요',
    '검색어가 도착할 페이지가 홈 1장뿐이다. 「애월 근처」「성산 체험」 같은 세부 지역·기분 검색은 받을 자리가 없다.',
    'specs/seo-landing.md — keyword gate(data/seo/keywords.json)를 통과한 조합만 정적 페이지로 만든다.'));

  return out.sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
}
