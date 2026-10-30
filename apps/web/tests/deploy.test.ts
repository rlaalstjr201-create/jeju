// ADR-0063 1·4 + Consequences: what Cloudflare Pages serves besides the app (docs/deploy.md).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GA_NAME, gaParams } from '../src/analytics';
import type { UsageEvent } from '../src/track';

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

  // Changed on purpose (F14): /* is there now, with no Cache-Control in it
  it('icons and the preview image: a day; the catch-all sets no Cache-Control (Pages would join two values)', () => {
    for (const p of ['/icons/*', '/favicon.ico', '/og.png', '/robots.txt']) expect(cc(p), p).toBe('public, max-age=86400');
    expect(h['*']).toBeUndefined();
    expect(cc('/*')).toBeUndefined();
  });

  // 출시 전 점검 F14 (idempotency-security.md S7): not framed by another site; no camera, microphone or payment
  it('F14 (S7) /*: X-Frame-Options DENY and Permissions-Policy only; no other rule sets either (no joined values)', () => {
    expect(h['/*']).toEqual({ 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), payment=()' });
    for (const [p, set] of Object.entries(h)) if (p !== '/*') expect(Object.keys(set), p).toEqual(['Cache-Control']);
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
    expect(html).toContain('--bg: #ffffff');
    expect(html).toContain('--bg: #0f1319');
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
    expect(html).toContain('‘기록 끄기’를 누르면 바로 멈추고');
    // ADR-0078 4: GA4 and 네이버 애널리틱스 named, their cookies and connection data said, no coordinates, how to turn off
    expect(html).not.toContain('수집 주소를 넣어 배포했을 때만 켜져요');
    expect(html).toContain('Google 애널리틱스(GA4)');
    expect(html).toContain('네이버 애널리틱스');
    expect(html).toContain('두 서비스는 쿠키를 쓰고, 접속 IP와 브라우저 정보 같은 접속 정보를 각 회사 서버에서 처리해요');
    expect(html).toContain('좌표는 이 세 곳 어디로도 보내지 않아요');
    expect(html).toContain('세 곳 모두 멈춰요');
    expect(html).toContain('스크립트를 아예 불러오지 않아요');
    // 비 소식 (ADR-0076): the one thing that goes to a server, and what does not
    expect(html).toContain('동네 이름 하나만 보내요');
    expect(html).toContain('좌표는 보내지 않아요');
    expect(html).toContain('Cloudflare 접속 기록에 남을 수 있어요');
    // 가 봤어요 (ADR-0087): kept on the device; its tap and undo are counted here (visited·unvisited), not in GA4
    expect(html).toContain('저장한 곳과 날짜, ‘가 봤어요’로 뺀 곳, 숙소, 고른 여행지(제주·부산·다른 곳)와 다른 곳의 마지막 시군구, 고른 지역과 범위, 고른 언어는 이 기기의 브라우저 저장소에만 있어요'); // 고른 언어: ADR-0093, 고른 여행지: specs/busan.md 7, 시군구: plans/nationwide-app.md 7
    // 자동 지역 (plans/nationwide-app.md 5): a 시군구 centre's grid, never the position
    expect(html).toContain('그 시군구 가운데의 기상청 격자 번호(지금 위치가 아니에요) 하나를 보내요');
    // 시작 화면 (specs/busan.md 7): it asks for the position only on its big button; 부산's photos come from 한국관광공사
    expect(html).toContain('시작 화면에서 ‘내 위치로 시작하기’를 누르면 위치를 물어요');
    expect(html).toContain('부산과 다른 곳은 한국관광공사');
    expect(html).toContain('‘가 봤어요’ 누름과 되돌림');
    // 숙소 링크 (ADR-0089 4): the tag it came in by
    expect(html).toContain('숙소 링크로 들어왔다면 그 링크의 꼬리표');
    expect(html).toContain('<h2>문의</h2>');
    expect(html).toMatch(/<a class="tbtn" href="\/">처음 화면으로<\/a>/);
    expect(html).not.toMatch(/<script/);
    expect(html).toContain('<link rel="canonical" href="__SITE__/privacy" />');
  });

  // 독립 리뷰 2026-10-20 m2: the translations say what the Korean one does — the start screen asks for the position on its
  // button, and coordinates never leave the device
  it.each([
    ['privacy-en.html', 'tapping “Start with my location” there asks for your location.', 'Coordinates are never sent off the device.'],
    ['privacy-zh-Hans.html', '点按“用我的位置开始”时会询问位置。', '坐标不会发送到设备以外。'],
    ['privacy-ja.html', '「現在地で始める」を押すと、位置情報の許可を求めます。', '座標を端末の外に送ることはありません。'],
  ])('%s: the start screen\'s ask and the location sentence', (f, ask, kept) => {
    const html = text(f);
    expect(html).toContain(ask);
    expect(html).toContain(kept);
  });

  // 출시 전 점검 F4 (idempotency-security.md K3): the repository is private, so its issues link was a 404 for everyone
  it('F4 (K3) 문의 is the operator\'s mail (replies) and the app\'s 의견 보내기, never the private repository', () => {
    const html = text('privacy.html');
    expect(html).not.toMatch(/github\.com/);
    const ask = html.slice(html.indexOf('<h2>문의</h2>'), html.indexOf('<p class="date">'));
    expect(ask).toContain('<a href="mailto:studiofilm.app@gmail.com">studiofilm.app@gmail.com</a>');
    expect(ask).toContain('답장하는 데만 써요');
    expect(ask).toContain('‘의견 보내기’로 남겨도 돼요');
    expect(ask).toContain('‘설정 · 지도 앱 · 의견’');
  });

  it('의견 보내기 (ADR-0081): what is sent and kept, what is not, the home line and 기록 끄기', () => {
    const html = text('privacy.html');
    expect(html).toContain('<h2>의견 보내기</h2>');
    expect(html).toContain('직접 보낸 ‘의견 보내기’뿐이에요');
    expect(html).toContain('날짜(시각 없이)만 붙여 저장해요');
    expect(html).toContain('접속 IP, 브라우저 정보, 쿠키, 위치, 장소 번호, 기기 번호는 저장하지 않아요');
    expect(html).toContain('이 기기에만 적어 둬요');
    expect(html).toContain('기록을 꺼 두면 설문 줄은 나오지 않아요');
    expect(html).toContain('보낸 의견은 1년이 지나면 지워요. 누가 보냈는지 알 수 없어서 내 의견만 골라 지울 수는 없어요.');
    expect(html).toContain('다 답하지 않아도 되고');
  });
});

// 출시 전 점검 F3 (idempotency-security.md K2): the page said 「까지만」 over a shorter list than GA4 gets. Both lists are
// fixed here: one more event or field for GA4 fails this until privacy.html says it too.
describe('F3 (K2) what GA4 and our own record get is what privacy.html says', () => {
  const html = text('privacy.html');
  const ga = html.split('\n').find((l) => l.includes('GA4에는'))!;
  const own = html.slice(html.indexOf('이 사이트의 익명 기록으로 보내는 것'), html.indexOf('</ul>'));

  it('GA4 events: the page view and these eight, each named in its paragraph', () => {
    expect(GA_NAME).toEqual({ tap: 'mood_tap', shown: 'card_shown', map: 'map_open', save: 'place_save', open: 'saved_open', arrange: 'saved_arrange', start_view: 'start_view', start_done: 'start_done' });
    const said: Record<string, string> = { mood_tap: '기분 누름', card_shown: '카드로 보임', map_open: '외부 지도 앱 링크 열기', place_save: '저장', saved_open: '저장 목록 열기', saved_arrange: '정리', start_view: '시작 화면이 보임', start_done: '시작 화면에서 시작함' };
    expect(ga).toContain('본 페이지');
    for (const name of Object.values(GA_NAME)) expect(ga, name).toContain(said[name!]);
  });

  it('GA4 fields: exactly these, each named in that paragraph (never the area, the 시군구, the day, 실내만 or a position)', () => {
    const every: Required<UsageEvent> = { e: 'map', id: 'p', mood: 'food', sub: 'cafe', range: '30', basis: 'area', area: '애월', dated: true, indoor: true, season: 'tangerine', live0: true, past: true, from: 'saved', age: 2, op: 'up', dest: 'busan', how: 'pick', why: 'denied', sgg: '51150', d: '2026-10-15' };
    const keys = Object.keys(gaParams(every));
    expect(keys).toEqual(['place_id', 'mood', 'sub', 'range', 'basis', 'dated', 'season', 'from', 'age', 'past', 'live0', 'op', 'dest', 'how', 'why']);
    const said: Record<string, string> = {
      place_id: '장소 번호',
      mood: '고른 기분',
      sub: '세부 종류',
      range: '범위',
      basis: '기준 종류',
      dated: '다른 날을 골랐는지',
      season: '카드에 보인 철',
      from: '저장 목록에서 열었는지',
      age: '저장한 지 며칠',
      past: '지난 날',
      live0: '오늘 이후 저장이 없었는지',
      op: '정리 종류',
      dest: '지금 여행지(제주·부산·다른 곳)',
      how: '위치로 시작했는지 직접 골랐는지',
      why: '그 전에 위치를 쓸 수 없었던 까닭',
    };
    for (const k of keys) expect(ga, k).toContain(said[k]);
  });

  it('our own record lists 세부 종류, 실내만 and 철 too; the page applies from 2026년 10월 30일 (plans/nationwide-app.md U19: 자동 지역 출시)', () => {
    for (const w of ['세부 종류', '실내만', '카드에 보인 철', '지금 여행지(제주·부산·다른 곳)', '다른 곳에서는 고른 시군구', '시작 화면이 보였는지', '위치로 시작했는지 직접 골랐는지']) expect(own, w).toContain(w);
    expect(html).toContain('<p class="date">2026년 10월 30일부터 적용해요.</p>');
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
    expect(cfg).toMatch(/privacy\.html/);
    expect(html).toContain('<link rel="canonical" href="__SITE__/" />');
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

describe('wrangler.toml (ADR-0078)', () => {
  const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');

  it('the Pages project yeochana, dist as output, the D1 counters bound as EVENTS_DB with their migrations', () => {
    expect(toml).toMatch(/^name = "yeochana"$/m);
    expect(toml).toMatch(/^pages_build_output_dir = "dist"$/m);
    expect(toml).toMatch(/^compatibility_date = "\d{4}-\d\d-\d\d"$/m);
    expect(toml).toMatch(/binding = "EVENTS_DB"\ndatabase_name = "yeogwi-events"\ndatabase_id = "[0-9a-f-]{36}"/);
    expect(existsSync(resolve(root, 'migrations/0001_events.sql'))).toBe(true);
  });

  it('no secret and no [vars] in it (KMA_SERVICE_KEY stays a Pages secret)', () => {
    expect(toml).not.toMatch(/KMA_SERVICE_KEY\s*=|\[vars\]|api_token|secret\s*=/i);
  });
});
