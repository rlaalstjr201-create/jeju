// scripts/seo/crawl-parse.mjs + audit-rules.mjs — 빌드도 네트워크도 없이 픽스처로 (seoulist test-seo-crawl.mjs를 옮김).
// 과탐 음성도 본다: 정상인 것을 문제로 잡으면 계기가 상시 빨간불이 되어 아무도 안 본다.
import { describe, expect, it } from 'vitest';
import {
  buildGraph, fileToUrl, fingerprintOf, FINGERPRINT_FIELDS, normUrl, parseJsonLd, parsePage, visibleText, type SitePage,
} from '../scripts/seo/crawl-parse.mjs';
import { auditSite, blocksRoot, parseRobots } from '../scripts/seo/audit-rules.mjs';

const O = 'https://p.example.kr';

describe('normUrl / fileToUrl', () => {
  it('strips the origin, hash, query and trailing slash', () => {
    expect(normUrl(`${O}/jeju/aewol/`, O)).toBe('/jeju/aewol');
    expect(normUrl(`${O}/`, O)).toBe('/');
    expect(normUrl(O, O)).toBe('/');
    expect(normUrl('/jeju/#walk', O)).toBe('/jeju');
    expect(normUrl('/?src=naver', O)).toBe('/');
  });
  it('external, protocol-relative, mailto, relative and empty → null', () => {
    for (const u of ['https://map.kakao.com/x', '//cdn.x/a.png', 'mailto:a@b.c', 'javascript:void(0)', 'jeju/x', '', null]) expect(normUrl(u, O), String(u)).toBeNull();
  });
  it('without an origin every absolute URL is external (SITE_URL unset build)', () => {
    expect(normUrl(`${O}/jeju`, '')).toBeNull();
  });
  it('Cloudflare Pages pretty URLs: /privacy.html and /privacy are one page; /404.html stays', () => {
    expect(normUrl('/privacy.html')).toBe('/privacy');
    expect(normUrl('/jeju/index.html')).toBe('/jeju');
    expect(normUrl('/404.html')).toBe('/404.html');
    expect(fileToUrl('privacy.html')).toBe('/privacy');
    expect(fileToUrl('index.html')).toBe('/');
    expect(fileToUrl('jeju\\aewol\\index.html')).toBe('/jeju/aewol');
    expect(fileToUrl('404.html')).toBe('/404.html');
  });
});

const PAGE = `<!doctype html><html lang="ko"><head>
<title>애월에서 지금 갈 만한 곳 · 여행귀:제주</title>
<meta name="description" content="계획 없이 애월에 있다면 기분 하나로 고르세요.">
<link rel="canonical" href="${O}/jeju/aewol">
<meta property="og:url" content="${O}/jeju/aewol">
<meta property="og:image" content="${O}/og.png">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TouristDestination","name":"애월"},{"@type":"ItemList","itemListElement":[{"@type":"ListItem","position":1,"item":{"@type":"TouristAttraction","name":"한담"}}]}]}</script>
<style>.x{color:red}</style>
</head><body><h1>애월 <span>근처</span></h1>
<a href="/">홈</a><a href="/jeju/">제주 전체</a><a href="https://map.kakao.com/x">지도</a><a href="/jeju/">again</a><a href="/jeju/aewol">self</a>
<script>var hidden = "이 글자는 세지 않는다"</script>
<p>${'가'.repeat(400)}</p>
</body></html>`;

describe('parsePage', () => {
  const p = parsePage(PAGE, O);
  it('reads title, description, canonical, lang, og', () => {
    expect(p.title).toBe("애월에서 지금 갈 만한 곳 · 여행귀:제주");
    expect(p.description).toContain('애월');
    expect(p.canonical).toBe('/jeju/aewol');
    expect(p.lang).toBe('ko');
    expect(p.og['og:image']).toBe(`${O}/og.png`);
    expect(p.fragment).toBe(false);
    expect(p.noindex).toBe(false);
  });
  it('JSON-LD types include @graph members and nested items', () => {
    expect(p.jsonld[0].ok).toBe(true);
    expect(p.jsonld[0].types).toEqual(expect.arrayContaining(['TouristDestination', 'ItemList', 'ListItem', 'TouristAttraction']));
  });
  it('a broken JSON-LD block is reported, not thrown', () => {
    expect(parseJsonLd('<script type="application/ld+json">{oops</script>')[0].ok).toBe(false);
  });
  it('internal links only, h1 stripped', () => {
    expect(p.links.map((l) => l.to)).toEqual(['/', '/jeju', '/jeju', '/jeju/aewol']);
    expect(p.h1s[0]).toBe('애월 근처');
  });
  it('visible text excludes script and style', () => {
    expect(visibleText(PAGE)).not.toContain('세지 않는다');
    expect(visibleText(PAGE)).not.toContain('color');
    expect(p.textChars).toBeGreaterThan(400);
  });
  it('noindex and fragments', () => {
    expect(parsePage(PAGE.replace('</head>', '<meta name="robots" content="noindex"></head>')).noindex).toBe(true);
    expect(parsePage('<div>partial</div>').fragment).toBe(true);
  });
});

describe('fingerprint / graph', () => {
  it('every fingerprint key has a label (seoulist: a missing label hid link changes)', () => {
    expect(Object.keys(fingerprintOf(parsePage(PAGE, O))).sort()).toEqual(Object.keys(FINGERPRINT_FIELDS).sort());
  });
  it('inbound counts once per page, self links ignored, depth by BFS', () => {
    const pages = new Map([
      ['/', { url: '/', links: [{ to: '/jeju' }, { to: '/jeju' }] }],
      ['/jeju', { url: '/jeju', links: [{ to: '/jeju/aewol' }, { to: '/jeju' }] }],
      ['/jeju/aewol', { url: '/jeju/aewol', links: [{ to: '/' }] }],
      ['/orphan', { url: '/orphan', links: [] }],
    ]);
    const g = buildGraph(pages);
    expect(g.inbound.get('/jeju')).toBe(1);
    expect(g.inbound.get('/orphan')).toBe(0);
    expect(g.depth.get('/jeju/aewol')).toBe(2);
    expect(g.depth.has('/orphan')).toBe(false);
  });
});

describe('robots', () => {
  it('* Allow / blocks nobody; a named group overrides *', () => {
    const r = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://p.example.kr/sitemap.xml');
    expect(blocksRoot(r, 'Googlebot')).toBe(false);
    expect(blocksRoot(r, 'GPTBot')).toBe(true);
    expect(r.sitemaps).toEqual(['https://p.example.kr/sitemap.xml']);
  });
  it('* Disallow / blocks everyone without an own group', () => {
    expect(blocksRoot(parseRobots('User-agent: *\nDisallow: /'), 'Yeti')).toBe(true);
  });
});

const site = (html: Record<string, string>, files: Record<string, string | null> = {}, origin = O) => {
  const pages = new Map<string, SitePage>();
  for (const [url, h] of Object.entries(html)) pages.set(url, { url, ...parsePage(h, origin) });
  const all = { 'robots.txt': null, 'sitemap.xml': null, 'llms.txt': null, _headers: null, ...files };
  return auditSite({ pages, files: all, origin, spotCount: 2955 }).map((f) => f.id);
};

describe('auditSite', () => {
  const SHELL = '<!doctype html><html lang="ko"><head><title>여행귀</title><meta property="og:url" content="/"></head><body><h1>지금 뭐 하고 싶어요?</h1></body></html>';
  it('the current app shell: thin, no origin, no landing, no canonical, no JSON-LD, title without 제주', () => {
    const ids = site({ '/': SHELL }, {}, '');
    for (const id of ['page:/:thin-shell', 'site:no-origin', 'site:no-landing-pages', 'page:/:no-canonical', 'page:/:no-jsonld', 'page:/:title-no-jeju', 'page:/:og-url-relative', 'site:no-sitemap', 'site:no-robots', 'site:no-llms-txt']) expect(ids, id).toContain(id);
  });
  it('a complete landing page raises nothing page-level (false-positive check)', () => {
    const ids = site({ '/jeju/aewol': PAGE }, {
      'robots.txt': `User-agent: *\nAllow: /\nSitemap: ${O}/sitemap.xml`, 'sitemap.xml': `<urlset><url><loc>${O}/jeju/aewol</loc></url></urlset>`, 'llms.txt': '# 여행귀:제주\n',
    });
    expect(ids.filter((i) => i.startsWith('page:/jeju/aewol'))).toEqual([]);
    expect(ids.filter((i) => i.startsWith('site:'))).toEqual([]);
  });
  it('robots blocking a search bot is P0, an AI bot P1', () => {
    const pages = new Map<string, SitePage>([['/jeju', { url: '/jeju', ...parsePage(PAGE, O) }]]);
    const f = auditSite({ pages, origin: O, files: { 'robots.txt': 'User-agent: Yeti\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /', 'sitemap.xml': null, 'llms.txt': null, _headers: null } });
    expect(f.find((x) => x.id === 'site:robots-blocks:Yeti')?.severity).toBe('P0');
    expect(f.find((x) => x.id === 'site:robots-blocks:OAI-SearchBot')?.severity).toBe('P1');
  });
  it('404 must be noindex; the privacy page is exempt from title/JSON-LD checks', () => {
    const ids = site({
      '/404.html': '<html lang="ko"><head><title>여행귀:제주</title></head><body></body></html>',
      '/privacy': `<html lang="ko"><head><title>개인정보 처리 안내 · 여행귀:제주</title><meta name="description" content="x"><link rel="canonical" href="${O}/privacy"></head><body><h1>x</h1></body></html>`,
    });
    expect(ids).toContain('page:/404.html:indexable');
    expect(ids.filter((i) => i.startsWith('page:/privacy'))).toEqual([]);
  });
});
