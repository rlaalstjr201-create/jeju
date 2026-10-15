// ADR-0088 5: the logo 「꺾이는 길」 has one definition (src/logo.ts); the app's top line and the landing pages'
// header carry the same symbol and wordmark, the icon script draws the same geometry.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSite, assignSlugs } from '../scripts/landing';
import { logoInner, MARK } from '../src/logo';
import type { Spot } from '../src/pick';

const root = resolve(__dirname, '..');

describe('logo 「꺾이는 길」 (ADR-0088 5)', () => {
  it('the geometry is the spec\'s: one turn on a 64 grid, stroke 7, a dot r 5 at the end of the line', () => {
    expect(MARK).toEqual({ d: 'M12 46 L30 46 Q36 46 38 40 L46 16', width: 7, dot: { x: 46, y: 16, r: 5 } });
  });

  it('index.html: the top line starts with the logo (a copy of logoInner()), the name line under it is 「P를 위한 여행동반자」', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const top = html.match(/<header class="top">([\s\S]*?)<\/header>/)![1];
    expect(top).toContain(`<span class="logo">${logoInner()}</span>`);
    expect(top.indexOf('class="logo"')).toBeLessThan(top.indexOf('id="basis"'));
    expect(html).toContain('<p class="brand">P를 위한 여행동반자</p>');
  });

  it('landing pages: the header is the same symbol and wordmark, a link home', () => {
    const spot: Spot = {
      id: 'a1', name: '한담해안산책로', lat: 33.462, lng: 126.31, mood: 'walk', reason: '바다를 따라 걸어요', image: '',
      kakaoPlaceId: null, bookable: false, score: 3, indoor: false,
    };
    const site = buildSite({ spots: [spot], slugs: assignSlugs([spot], {}), site: 'https://x.test', photos: false, dataDate: '2026-10-01' });
    for (const p of site.pages) expect(p.html).toContain(`<header class="top"><a class="logo" href="/">${logoInner()}</a></header>`);
  });

  it('the icon script reads the same geometry', () => {
    expect(readFileSync(resolve(root, 'scripts/make-icons.ts'), 'utf8')).toMatch(/from '\.\.\/src\/logo'/);
  });
});
