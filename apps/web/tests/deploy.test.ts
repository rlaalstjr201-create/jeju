// ADR-0063 1·4 + Consequences: what Cloudflare Pages serves besides the app (docs/deploy.md).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const pub = (f: string) => resolve(root, 'public', f);
const text = (f: string) => readFileSync(pub(f), 'utf8');

/** _headers as { path: { header: value } }. */
function headers(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  let path = '';
  for (const line of text('_headers').split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      path = line.trim();
      expect(out[path], `${path} twice`).toBeUndefined();
      out[path] = {};
      continue;
    }
    const m = /^\s+([\w-]+):\s*(.+)$/.exec(line);
    expect(m, line).not.toBeNull();
    out[path][m![1]] = m![2].trim();
  }
  return out;
}

describe('_headers (Cloudflare Pages)', () => {
  const h = headers();
  const cc = (p: string) => h[p]?.['Cache-Control'];

  it('content-hashed build files and the ?v= data: a year, immutable', () => {
    expect(cc('/assets/*')).toBe('public, max-age=31536000, immutable');
    expect(cc('/spots.json')).toBe('public, max-age=31536000, immutable');
  });

  it('the page, sw.js, the manifest, 404 and privacy pages: no-cache (a deploy shows on the next visit)', () => {
    for (const p of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/404.html', '/privacy', '/privacy.html']) expect(cc(p), p).toBe('no-cache');
  });

  it('icons and the preview image: a day; no catch-all rule (Pages would join two Cache-Control values)', () => {
    for (const p of ['/icons/*', '/favicon.ico', '/og.png', '/robots.txt']) expect(cc(p), p).toBe('public, max-age=86400');
    expect(Object.keys(h).some((p) => p === '/*' || p === '*')).toBe(false);
  });

  it('no SPA fallback: no _redirects rewriting everything to index.html', () => {
    expect(existsSync(pub('_redirects'))).toBe(false);
  });
});

describe('404.html', () => {
  it('a plain page in the same tokens, with a way home; no script', () => {
    const html = text('404.html');
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<h1>없는 주소예요.</h1>');
    expect(html).toMatch(/<a class="tbtn" href="\/">처음 화면으로<\/a>/);
    expect(html).toContain('--bg: #f6f6f3');
    expect(html).toContain('--bg: #161817');
    expect(html).not.toMatch(/<script/);
    expect(html).toMatch(/name="robots" content="noindex"/);
  });
});

describe('privacy.html (ADR-0063 4)', () => {
  it('says: saves stay on the device, location never leaves it, what anonymous counts send and how to turn them off, where to ask', () => {
    const html = text('privacy.html');
    expect(html).toContain('<h1>개인정보 처리 안내</h1>');
    expect(html).toContain('브라우저 저장소에만 있어요');
    expect(html).toContain('좌표를 기기 밖으로 보내지 않아요');
    expect(html).toContain('수집 주소를 넣어 배포했을 때만 켜져요');
    expect(html).toContain('‘기록 끄기’를 누르면 바로 멈추고');
    expect(html).toContain('<h2>문의</h2>');
    expect(html).toMatch(/<a class="tbtn" href="\/">처음 화면으로<\/a>/);
    expect(html).not.toMatch(/<script/);
  });
});

describe('link previews, icons, robots (ADR-0063 Consequences)', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');

  it('OG and Twitter meta: title, description, a 1200×630 image', () => {
    for (const m of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) expect(html, m).toMatch(new RegExp(`property="${m}" content="[^"]+"`));
    for (const m of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(html, m).toMatch(new RegExp(`name="${m}" content="[^"]+"`));
    expect(html).toContain('<meta property="og:image" content="__SITE__/og.png" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    const png = readFileSync(pub('og.png'));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  it('vite fills __SITE__ from SITE_URL (absolute preview URLs), or leaves the paths relative', () => {
    const cfg = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(cfg).toMatch(/process\.env\.SITE_URL/);
    expect(cfg).toMatch(/replaceAll\('__SITE__', site\)/);
  });

  it('a maskable icon (its own file) in the manifest; favicon.ico and apple-touch-icon exist and are linked', () => {
    const m = JSON.parse(text('manifest.webmanifest'));
    const mask = m.icons.find((i: { purpose: string }) => i.purpose === 'maskable');
    expect(mask).toMatchObject({ src: 'icons/icon-maskable-512.png', sizes: '512x512' });
    expect(m.icons.filter((i: { purpose: string }) => i.purpose === 'any')).toHaveLength(2);
    for (const f of ['icons/icon-maskable-512.png', 'icons/icon-180.png', 'favicon.ico']) expect(existsSync(pub(f)), f).toBe(true);
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/icon-180.png" />');
  });

  it('robots.txt allows everything', () => {
    expect(text('robots.txt')).toBe('User-agent: *\nAllow: /\n');
  });
});
