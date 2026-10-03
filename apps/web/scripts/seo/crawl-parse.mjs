// 크롤 파싱의 단일 출처 — 네트워크도 파일도 건드리지 않는 순수 함수.
// crawl.mjs·verify.mjs가 쓰고 tests/seo-crawl.test.ts가 픽스처로 검증한다.
// (seoulist scripts/lib/crawl-parse.mjs를 여행귀:제주에 맞춰 옮김: hreflang 없음(ko 단일), Cloudflare Pages
//  pretty URL(/privacy.html → /privacy), JSON-LD·OG·보이는 글자 수 추가.)
//
// 정규식 파싱이다. HTML 일반이 아니라 우리 빌드가 내는 모양만 읽는다.

/**
 * URL → 사이트 안 경로. 외부·비HTTP·상대경로는 null.
 * origin이 비어 있으면(SITE_URL 미설정 빌드) 절대 URL은 전부 외부로 본다.
 * Cloudflare Pages는 `/x.html`을 `/x`로 돌려보내므로 `.html`을 뗀다(`/404.html`은 그대로 둔다 — 직접 링크되는 쪽이 아니다).
 */
export function normUrl(u, origin = '') {
  if (u === null || u === undefined) return null;
  let s = String(u).trim();
  if (origin && s.startsWith(origin)) s = s.slice(origin.length) || '/';
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return null;
  s = s.split('#')[0].split('?')[0];
  if (s === '' || !s.startsWith('/')) return null;
  if (s === '/') return '/';
  s = s.replace(/\/+$/, '') || '/';
  if (s.endsWith('/index.html')) s = s.slice(0, -'/index.html'.length) || '/';
  if (s.endsWith('.html') && s !== '/404.html') s = s.slice(0, -'.html'.length);
  return s;
}

/** dist 기준 상대 파일 경로 → URL. */
export function fileToUrl(rel) {
  const r = String(rel).split('\\').join('/');
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return `/${r.slice(0, -'/index.html'.length)}`;
  if (r === '404.html') return '/404.html';
  if (r.endsWith('.html')) return `/${r.slice(0, -'.html'.length)}`;
  return `/${r}`;
}

const RE = {
  title: /<title[^>]*>([\s\S]*?)<\/title>/i,
  meta: /<meta\b[^>]*>/gi,
  link: /<link\b[^>]*>/gi,
  a: /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
  h1: /<h1[^>]*>([\s\S]*?)<\/h1>/gi,
  ld: /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  lang: /<html[^>]*\slang=["']([^"']+)["']/i,
};

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
};

export const strip = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** JS를 돌리지 않는 크롤러가 읽는 본문(<body>). script·style·svg·template은 뺀다.
 *  <noscript>와 hidden 섹션은 센다 — HTML에 있으니 JS 없는 크롤러는 읽는다. */
export function visibleText(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]) ?? html;
  return strip(body.replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, ' '));
}

/** JSON-LD 블록 → [{ok, types, error?}]. @graph 안의 타입까지 모은다. */
export function parseJsonLd(html) {
  const out = [];
  for (const m of html.matchAll(RE.ld)) {
    try {
      const data = JSON.parse(m[1]);
      const types = [];
      const walk = (x) => {
        if (Array.isArray(x)) { x.forEach(walk); return; }
        if (!x || typeof x !== 'object') return;
        const t = x['@type'];
        if (t) types.push(...(Array.isArray(t) ? t : [t]));
        for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v);
      };
      walk(data);
      out.push({ ok: true, types });
    } catch (e) {
      out.push({ ok: false, types: [], error: e.message });
    }
  }
  return out;
}

export function parsePage(html, origin = '') {
  const metas = {};
  for (const m of html.matchAll(RE.meta)) {
    const key = (attr(m[0], 'name') || attr(m[0], 'property') || '').toLowerCase();
    const content = attr(m[0], 'content');
    if (key && content !== null && !(key in metas)) metas[key] = content.trim();
  }
  let canonicalRaw = null;
  for (const m of html.matchAll(RE.link)) if ((attr(m[0], 'rel') || '').toLowerCase() === 'canonical') canonicalRaw = attr(m[0], 'href');
  const links = [];
  for (const m of html.matchAll(RE.a)) {
    const to = normUrl(attr(` ${m[1]}`, 'href'), origin);
    if (to) links.push({ to, text: strip(m[2]) });
  }
  const robots = metas.robots || '';
  return {
    // <html>도 <title>도 없는 조각은 페이지가 아니다(seoulist /home-extra 3중 거짓 양성 사고).
    fragment: !/<html[\s>]/i.test(html) || !RE.title.test(html),
    lang: html.match(RE.lang)?.[1] || '',
    title: strip(html.match(RE.title)?.[1]),
    description: metas.description || '',
    canonicalRaw,
    canonical: normUrl(canonicalRaw, origin),
    noindex: /noindex/i.test(robots),
    og: Object.fromEntries(Object.entries(metas).filter(([k]) => k.startsWith('og:') || k.startsWith('twitter:'))),
    verification: Object.keys(metas).filter((k) => /-site-verification$/.test(k)),
    jsonld: parseJsonLd(html),
    links,
    h1s: [...html.matchAll(RE.h1)].map((m) => strip(m[1])),
    textChars: visibleText(html).replace(/\s/g, '').length,
    hasNoscript: /<noscript\b/i.test(html),
    uncrawlable: [
      ...[...html.matchAll(/href=["']javascript:/gi)].map(() => 'javascript:'),
      ...[...html.matchAll(/<(?:span|div|li|button)\b[^>]*\shref=/gi)].map(() => 'non-anchor href'),
      ...[...html.matchAll(/\bonclick=["'][^"']*location/gi)].map(() => 'onclick location'),
    ],
  };
}

/** 앵커텍스트가 문맥을 주지 않는가. */
export const GENERIC_ANCHOR = /^(여기|자세히|더 ?보기|바로가기|클릭|here|more|→|>|»)$/i;

// 배포 지문 — 정의와 라벨이 같은 자리에 있어야 한다(seoulist: 라벨 누락으로 링크 변화가 「0 바뀐 쪽」으로 나왔다).
export const FINGERPRINT_FIELDS = {
  t: 'title', d: 'description', c: 'canonical', n: 'noindex', h: 'h1', l: '내부링크 수', j: 'JSON-LD 타입', x: '본문 글자 수',
};

export function fingerprintOf(page) {
  return {
    t: page.title,
    d: page.description,
    c: page.canonical,
    n: page.noindex,
    h: page.h1s[0] || '',
    l: page.links.length,
    j: page.jsonld.flatMap((b) => b.types).sort().join('|'),
    x: page.textChars,
  };
}

/** 내부링크 그래프. pages: Map<url, {url, links:[{to}]}>. */
export function buildGraph(pages, root = '/') {
  const inbound = new Map([...pages.keys()].map((u) => [u, 0]));
  const adj = new Map();
  for (const p of pages.values()) {
    const seen = new Set();
    for (const l of p.links) {
      if (l.to === p.url || seen.has(l.to)) continue;
      seen.add(l.to);
      if (inbound.has(l.to)) inbound.set(l.to, inbound.get(l.to) + 1);
    }
    adj.set(p.url, [...seen].filter((u) => pages.has(u)));
  }
  const depth = new Map([[root, 0]]);
  for (const q = [root]; q.length;) {
    const u = q.shift();
    for (const v of adj.get(u) || []) if (!depth.has(v)) { depth.set(v, depth.get(u) + 1); q.push(v); }
  }
  return { inbound, depth, adj };
}
