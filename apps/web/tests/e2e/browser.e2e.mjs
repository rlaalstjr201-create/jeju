// Real-browser checks for what jsdom cannot show: history timing, hit-testing under the sheet, layout at
// small widths / large text / dark mode, two tabs, data failure + recovery, service-worker offline.
// Run after `vite build`:  node tests/e2e/browser.e2e.mjs   (needs playwright-core + Chrome or Chromium)
// Env: E2E_CHANNEL=chrome|chromium (default chrome), E2E_SHOTS=<dir> to save screenshots, E2E_ONLY=<id regex>.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '../..');
const PORT = Number(process.env.E2E_PORT ?? 4179);
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.E2E_SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// Spot photos come from an external host; a local image stands in so the layout never depends on reaching it.
const PHOTO = readFileSync(join(appDir, 'public/icons/icon-512.png'));
const PHOTO_HOST = 'https://api.cdn.visitjeju.net/**';

async function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      return await import(name);
    } catch {
      /* try the next */
    }
  }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(join(root, 'noop.js'))('playwright-core');
}

// --- geolocation stub: behaviour set per test through localStorage.__geo ---
// Default point: 동문시장 (33.5122, 126.5272), where real spots are dense. The old default — the city hall —
// was also the geocoder's fallback point, so 16 misplaced spots read "걸어서 약 5분" there and hid the bug.
const GEO_STUB = `(() => {
  const DEF = { mode: 'ok', lat: 33.5122, lng: 126.5272, delay: 30 };
  const cfg = () => { try { return JSON.parse(localStorage.getItem('__geo') || 'null') || DEF; } catch { return DEF; } };
  const geo = { getCurrentPosition(ok, fail) {
    const c = cfg();
    if (c.mode === 'hang') return;
    setTimeout(() => {
      if (c.mode === 'ok') ok({ coords: { latitude: c.lat, longitude: c.lng } });
      else fail({ code: c.mode === 'deny' ? 1 : 2, PERMISSION_DENIED: 1 });
    }, c.delay ?? 30);
  } };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  if (navigator.permissions) {
    const q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => d && d.name === 'geolocation' ? Promise.resolve({ state: 'prompt' }) : q(d);
  }
})();`;

const results = [];
// E2E_ONLY=<regex on the check id> runs a subset while working on one area.
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;
async function check(id, name, fn) {
  if (ONLY && !ONLY.test(id)) return;
  try {
    await fn();
    results.push({ id, name, ok: true });
  } catch (e) {
    // first line + Playwright's call log tail (which element, and why the action could not happen)
    const lines = String(e?.message ?? e).split('\n');
    results.push({ id, name, ok: false, err: [lines[0], ...lines.slice(1).filter((l) => l.trim()).slice(-4)].join('\n        ') });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startPreview() {
  const pkg = createRequire(join(appDir, 'package.json')).resolve('vite/package.json');
  const vite = join(dirname(pkg), 'bin', 'vite.js');
  const proc = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { cwd: appDir, stdio: 'pipe' });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  proc.kill();
  throw new Error('vite preview did not start (run `vite build` first)');
}

const pw = await loadPlaywright();
const server = await startPreview();
const browser = await pw.chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome', headless: true });

async function fresh({ width = 390, height = 844, dark = false, sw = false, geo, storage = {} } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
    serviceWorkers: sw ? 'allow' : 'block',
    locale: 'ko-KR',
  });
  await ctx.addInitScript(GEO_STUB);
  await ctx.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
  const page = await ctx.newPage();
  await page.goto('about:blank');
  await page.goto(BASE);
  await page.evaluate(
    ({ geo, storage }) => {
      localStorage.clear();
      sessionStorage.clear();
      if (geo) localStorage.setItem('__geo', JSON.stringify(geo));
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
    },
    { geo, storage },
  );
  await page.reload();
  return { ctx, page };
}
// A deliberate tap, then a pause: within 300ms of a tap that changes the screen, the app treats the next
// pointer tap as the 2nd half of a double tap and swallows it (so it can't open a card under the finger).
const tapText = async (page, sel) => {
  await page.locator(sel).first().click();
  await sleep(350);
};
const names = (page) => page.$$eval('#cards .card:not(.ghost) .name', (els) => els.map((e) => e.textContent));
const hstate = (page) => page.evaluate(() => history.state);
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
async function waitCards(page) {
  await page.waitForSelector('#cards .card:not(.ghost) .name', { timeout: 5000 });
}
async function back(page) {
  await page.evaluate(() => history.back());
  await sleep(350);
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false });
}

// --- history (S15–S20, audit MAJOR 1·2) ---
await check('S15', 'saved list → ⇄ → area keeps the list, re-sorted; no blank screen', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  await page.locator('.card .heart').nth(0).click();
  await page.locator('.card .heart').nth(1).click();
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  await tapText(page, '#basis');
  await tapText(page, '#sheet [data-area="성산"]');
  await sleep(500);
  assert(await visible(page, '#savedView'), 'saved list closed');
  assert((await page.textContent('#savedView .sort')) === '성산에서 가까운 순', 'not re-sorted from 성산');
  const s = await hstate(page);
  assert(s?.view === 'saved' && s?.overlay === null, `history.state ${JSON.stringify(s)}`);
  await shot(page, 'saved-390-light');
  await ctx.close();
});

await check('S16', 'saved list → ⇄ → 닫기 closes only the sheet, no empty entry', async () => {
  const { ctx, page } = await fresh({ storage: { 'jeju.saved': [] } });
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('.card .heart').first().click();
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  const before = await hstate(page);
  await tapText(page, '#basis');
  await tapText(page, '#sheet .sheet-close');
  await sleep(500);
  assert(await visible(page, '#savedView'), 'saved list closed with the sheet');
  assert(JSON.stringify(await hstate(page)) === JSON.stringify(before), 'history not back on the saved entry');
  await ctx.close();
});

await check('S17·S19·S20', 'every back press does something: sheet → saved → cards → first screen → leaves', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="new"]');
  await waitCards(page);
  const newCards = await names(page);
  await page.locator('.card .heart').first().click();
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  await tapText(page, '#basis');
  await back(page);
  assert(!(await visible(page, '#sheet .sheet')), 'back did not close the sheet');
  assert(await visible(page, '#savedView'), 'back closed more than the sheet');
  await back(page);
  assert(!(await visible(page, '#savedView')), 'back did not close the saved list');
  assert(JSON.stringify(await names(page)) === JSON.stringify(newCards), 'cards not restored');
  await back(page);
  assert((await names(page)).length === 0, 'back did not return to the first screen');
  await back(page);
  assert(page.url() === 'about:blank', `expected to leave the app, at ${page.url()}`);
  await ctx.close();
});

await check('S17', 'saved list → 돌아가기 → 바꾸기 → another mood: then one back = first screen, the next back leaves', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('.card .heart').first().click();
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  await tapText(page, '#savedView .back');
  await tapText(page, '#results .change');
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  await sleep(300);
  await back(page);
  assert((await names(page)).length === 0, 'first back was a dead press');
  await back(page);
  assert(page.url() === 'about:blank', 'second back did not leave');
  await ctx.close();
});

await check('S18', 'reload with the sheet open, then back → leaves at once', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '#basis');
  await page.waitForSelector('#sheet .sheet');
  await page.reload();
  await sleep(600);
  assert(!(await visible(page, '#sheet .sheet')), 'sheet came back after reload');
  await back(page);
  await sleep(300);
  assert(page.url() === 'about:blank', `first back was a dead press (at ${page.url()})`);
  await ctx.close();
});

// --- races (S10, S37, S38) ---
await check('S37', 'GPS slow → area picked → GPS fails late: no sheet, the area cards stay', async () => {
  const { ctx, page } = await fresh({ geo: { mode: 'fail', delay: 1500 } });
  await tapText(page, '[data-mood="rest"]');
  await tapText(page, '#basis');
  await tapText(page, '#sheet [data-area="애월"]');
  await waitCards(page);
  const got = await names(page);
  await sleep(1800);
  assert(!(await visible(page, '#sheet .sheet')), 'a sheet popped up by itself');
  assert(!(await visible(page, '.notice')), 'a failure notice replaced the cards');
  assert(JSON.stringify(await names(page)) === JSON.stringify(got), 'cards changed');
  assert((await page.textContent('#basis')).includes('애월 근처'), 'basis changed');
  await ctx.close();
});

await check('S10', '숙소 GPS pending → 닫기: nothing is saved or switched later', async () => {
  const { ctx, page } = await fresh({ geo: { mode: 'ok', lat: 33.25, lng: 126.56, delay: 1200 }, storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  const got = await names(page);
  await tapText(page, '#basis');
  await tapText(page, '#sheet [data-basis="stay"]');
  await tapText(page, '#sheet [data-action="stay-here"]');
  await tapText(page, '#sheet .sheet-close');
  await sleep(1600);
  assert((await page.textContent('#basis')).includes('애월 근처'), 'basis switched to 숙소');
  assert((await page.evaluate(() => localStorage.getItem('jeju.stay'))) === null, '숙소 was stored');
  assert(JSON.stringify(await names(page)) === JSON.stringify(got), 'cards changed');
  await ctx.close();
});

// --- data failure (S24) ---
await check('S24', 'spots.json 503 → "다시 불러오기" → recovers without reload', async () => {
  const { ctx, page } = await fresh();
  await page.route('**/spots.json*', (r) => r.fulfill({ status: 503, body: 'down' }));
  await page.reload();
  await tapText(page, '[data-mood="rest"]');
  await page.waitForSelector('.notice .retry');
  await page.unroute('**/spots.json*');
  await tapText(page, '.notice .retry');
  await waitCards(page);
  await ctx.close();
});

// --- two tabs (audit MAJOR: last-writer-wins) ---
await check('two-tabs', 'tab A saves, tab B saves → both kept, both tabs show ♥ 2', async () => {
  const { ctx, page: a } = await fresh();
  const b = await ctx.newPage();
  await b.goto(BASE);
  // one tab in front at a time, like a phone (a hidden tab's timers and frames are throttled)
  await a.bringToFront();
  await tapText(a, '[data-mood="rest"]');
  await waitCards(a);
  await a.locator('.card .heart').first().click();
  await b.bringToFront();
  await tapText(b, '[data-mood="walk"]');
  await waitCards(b);
  await b.locator('.card .heart').first().click();
  await sleep(200);
  const saved = await a.evaluate(() => JSON.parse(localStorage.getItem('jeju.saved') || '[]'));
  assert(saved.length === 2, `storage has ${saved.length}`);
  assert((await a.textContent('#saved')).trim().endsWith('2'), `tab A shows ${await a.textContent('#saved')}`);
  assert((await b.textContent('#saved')).trim().endsWith('2'), `tab B shows ${await b.textContent('#saved')}`);
  await ctx.close();
});

// --- hit-testing under the sheet (audit MAJOR) ---
await check('sheet-hit', 'nothing behind the sheet (hearts, links) can be hit through it', async () => {
  for (const dark of [false, true]) {
    const { ctx, page } = await fresh({ dark });
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    await tapText(page, '#basis');
    await page.waitForSelector('#sheet .sheet');
    const leaks = await page.evaluate(() => {
      const box = document.querySelector('#sheet .sheet').getBoundingClientRect();
      const out = [];
      for (let y = Math.max(0, box.top); y < Math.min(innerHeight, box.bottom); y += 6)
        for (let x = box.left + 1; x < box.right; x += 6) {
          const el = document.elementFromPoint(x, y);
          if (el && !document.getElementById('sheet').contains(el)) out.push(`${el.className}@${x},${y}`);
        }
      return out;
    });
    assert(leaks.length === 0, `${leaks.length} points hit the page behind: ${leaks.slice(0, 3).join(' ')}`);
    await shot(page, `sheet-390-${dark ? 'dark' : 'light'}`);
    await ctx.close();
  }
});

// --- small screens (S45, S46) ---
for (const [w, h, id] of [
  [320, 568, 'S45'],
  [375, 667, 'S46'],
]) {
  await check(id, `${w}×${h}: after a tap the first card's name is on screen`, async () => {
    const { ctx, page } = await fresh({ width: w, height: h });
    // with the 식사 tabs too (§15.1-9)
    for (const mood of ['food', 'rest']) {
      await tapText(page, `[data-mood="${mood}"]`);
      await waitCards(page);
      await sleep(100);
      const bottom = await page.$eval('.card .name', (e) => e.getBoundingClientRect().bottom);
      assert(bottom <= h, `${mood}: name bottom at y=${Math.round(bottom)} > ${h}`);
      if (mood === 'food') await tapText(page, '#results .change');
    }
    await tapText(page, '#cards .more');
    await sleep(100);
    const top = await page.$eval('.card .name', (e) => e.getBoundingClientRect().bottom);
    assert(top <= h, `after 다른 3곳 보기 the first name is at y=${Math.round(top)}`);
    await shot(page, `cards-${w}`);
    await ctx.close();
  });
}

// --- layout matrix: overflow + tap targets (S9-4, S47, S52) ---
await check('S9-4', '320·390·430 × light·dark × 9 states: no sideways scroll, every button ≥ 44px tall', async () => {
  const problems = [];
  const measure = async (page, label) => {
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const small = [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null && !b.closest('[inert]') && !b.closest('[hidden]'))
        .map((b) => [b.className || b.textContent.trim().slice(0, 12), b.getBoundingClientRect()])
        .filter(([, r]) => r.height > 0 && r.height < 43.5)
        .map(([n, r]) => `${n}:${Math.round(r.height)}`);
      return { over: de.scrollWidth - de.clientWidth, small };
    });
    if (r.over > 0) problems.push(`${label} overflows by ${r.over}px`);
    if (r.small.length) problems.push(`${label} small: ${r.small.join(',')}`);
  };
  for (const width of [320, 390, 430])
    for (const dark of [false, true]) {
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      const { ctx, page } = await fresh({ width, dark });
      await measure(page, `${tag} home`);
      await tapText(page, '[data-mood="food"]');
      await waitCards(page);
      await measure(page, `${tag} food`);
      await page.locator('.card .heart').first().click();
      await tapText(page, '#basis');
      await measure(page, `${tag} sheet`);
      await tapText(page, '#sheet [data-basis="stay"]');
      await measure(page, `${tag} stay-sheet`);
      await tapText(page, '#sheet .sheet-close');
      await sleep(450); // taps within 300ms of a sheet closing are treated as the 2nd tap of a double tap
      await tapText(page, '#saved');
      await page.waitForSelector('#savedView .card');
      await measure(page, `${tag} saved`);
      await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'deny' })));
      await tapText(page, '#savedView .back');
      await tapText(page, '#results .change');
      await tapText(page, '[data-mood="walk"]');
      await page.waitForSelector('.notice');
      await measure(page, `${tag} denied`);
      if (width === 390) await shot(page, `denied-390-${dark ? 'dark' : 'light'}`);
      await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'hang' })));
      await tapText(page, '#results .change');
      await tapText(page, '[data-mood="rest"]');
      await page.waitForSelector('#cards .ghost');
      await measure(page, `${tag} placeholder`);
      await ctx.close();
      const { ctx: c2, page: p2 } = await fresh({ width, dark });
      await p2.route('**/spots.json*', (r) => r.fulfill({ status: 503, body: 'x' }));
      await p2.reload();
      await tapText(p2, '[data-mood="new"]');
      await p2.waitForSelector('.notice .retry');
      await measure(p2, `${tag} load-error`);
      await c2.close();
    }
  assert(problems.length === 0, problems.join(' | '));
});

// S48 / SPEC §15.1-11. Two ways a phone gets "200%": page zoom (a 390 phone at 200% lays out at 195×422 CSS
// px — the old `html { zoom: 2 }` also doubled dvh, so the sheet grew to 1485px on an 844px screen and the
// test could not see sheet problems) and the text-size setting (root font-size 200%: every rem doubles).
const LINES = () => {
  // Lines the button occupies: the label text must sit on one line box, and the icon beside it (not above
  // or below). Counted by vertical centres, since an icon and its text never share an exact top.
  const lines = (sel) => {
    const btn = document.querySelector(sel);
    const text = btn.querySelector('span');
    const r = document.createRange();
    r.selectNodeContents(text);
    const textTops = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    const t = text.getBoundingClientRect();
    const i = btn.querySelector('svg').getBoundingClientRect();
    const beside = Math.abs((t.top + t.bottom) / 2 - (i.top + i.bottom) / 2) < t.height / 2;
    return beside ? textTops : textTops + 1;
  };
  const de = document.documentElement;
  // a button whose label is cut: content wider/taller than the box it may show
  const cut = [...document.querySelectorAll('button')]
    .filter((b) => b.offsetParent !== null && !b.closest('[inert]'))
    .filter((b) => b.scrollWidth > b.clientWidth + 1)
    .map((b) => b.className || b.textContent.trim().slice(0, 10));
  return { over: de.scrollWidth - de.clientWidth, saved: lines('#saved'), basis: lines('#basis'), cut };
};
await check('S48', '200% (page zoom = 195×422, and text size = root 200%): no sideways scroll, no cut button, top buttons on one line, sheet fits', async () => {
  for (const mode of ['zoom', 'text']) {
    const { ctx, page } = await fresh(mode === 'zoom' ? { width: 195, height: 422, storage: { 'jeju.saved': [] } } : { storage: { 'jeju.saved': [] } });
    if (mode === 'text') {
      await page.addStyleTag({ content: 'html { font-size: 200% }' });
      const ask = await page.$eval('.ask', (e) => getComputedStyle(e).fontSize);
      assert(ask === '48px', `root 200% did not reach the question: ${ask}`);
    }
    const home = await page.evaluate(LINES);
    assert(home.over <= 0 && !home.cut.length, `${mode} home: overflow ${home.over}, cut ${home.cut}`);
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    await page.locator('.card .heart').first().click();
    await sleep(100);
    const r = await page.evaluate(LINES);
    assert(r.over <= 0, `${mode}: overflow ${r.over}px`);
    assert(r.saved <= 1 && r.basis <= 1, `${mode}: top buttons wrapped: saved ${r.saved} lines, basis ${r.basis} lines`);
    assert(!r.cut.length, `${mode}: cut buttons ${r.cut}`);
    await shot(page, `text-200-${mode}`);
    await tapText(page, '#basis');
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('#sheet .sheet').getBoundingClientRect();
      const close = document.querySelector('#sheet .sheet-close').getBoundingClientRect();
      return { h: s.height, vh: innerHeight, closeBottom: close.bottom, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert(sheet.h <= sheet.vh * 0.9 && sheet.closeBottom <= sheet.vh + 1, `${mode} sheet ${Math.round(sheet.h)}px on ${sheet.vh}, 닫기 at ${Math.round(sheet.closeBottom)}`);
    const cols = await page.$$eval('#sheet .areas', (gs) => gs.map((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length));
    assert(cols.every((c) => c === 1), `${mode}: area index ${cols} columns`);
    const cutInSheet = await page.evaluate(LINES);
    assert(!cutInSheet.cut.length && sheet.over <= 0, `${mode} sheet: cut ${cutInSheet.cut}, overflow ${sheet.over}`);
    await shot(page, `sheet-200-${mode}`);
    await ctx.close();
  }
});

// --- double tap, reload restore (S35, S54) ---
await check('S35', 'double tap on a mood shows the first 3, not the second', async () => {
  const storage = { 'jeju.region': '애월', 'jeju.basis': 'region' };
  const one = await fresh({ storage });
  await tapText(one.page, '[data-mood="rest"]');
  await waitCards(one.page);
  const want = await names(one.page);
  await one.ctx.close();
  const two = await fresh({ storage });
  await two.page.locator('[data-mood="rest"]').dblclick();
  await waitCards(two.page);
  await sleep(200);
  assert(JSON.stringify(await names(two.page)) === JSON.stringify(want), 'double tap skipped the first 3');
  await two.ctx.close();
});

await check('S54', 'pull-to-refresh / discarded tab: the same 3 cards come back', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  await tapText(page, '#cards .more');
  await sleep(200);
  const want = await names(page);
  await page.reload();
  await waitCards(page);
  await sleep(200);
  assert(JSON.stringify(await names(page)) === JSON.stringify(want), 'different cards after reload');
  await ctx.close();
});

// --- design/SPEC.md §15.1: 12·13·15, and the double tap that lands on the next screen ---
await check('S35-ghost', 'double tap on a mood / 다른 3곳 보기 / 다시 불러오기 never opens the card that appears under the finger', async () => {
  const { ctx, page } = await fresh({ storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await page.locator('[data-mood="rest"]').dblclick();
  await waitCards(page);
  const first = await names(page);
  await sleep(400);
  await page.locator('#cards .more').dblclick();
  await sleep(400);
  assert(ctx.pages().length === 1, `${ctx.pages().length - 1} tab(s) opened by a double tap`);
  const second = await names(page);
  assert(second.every((n) => !first.includes(n)), 'the next 3 overlap the first 3');
  const h = await page.evaluate(() => history.state);
  assert(h?.view === 'cards' && h?.depth === 1, `history ${JSON.stringify(h)}`);
  await ctx.close();

  // 다시 불러오기 once the list can load: the cards take the notice's place under the finger
  const two = await fresh({ storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await two.page.route('**/spots.json*', (r) => r.fulfill({ status: 503, body: 'down' }));
  await two.page.reload();
  await tapText(two.page, '[data-mood="rest"]');
  await two.page.waitForSelector('.notice .retry');
  await two.page.unroute('**/spots.json*');
  const box = await two.page.locator('.notice .retry').boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await two.page.mouse.click(x, y);
  await sleep(150);
  assert(await two.page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.card-link'), [x, y]), 'no card under the finger');
  await two.page.mouse.click(x, y, { clickCount: 2 });
  await sleep(400);
  assert(two.ctx.pages().length === 1, `${two.ctx.pages().length - 1} tab(s) opened by a double tap on 다시 불러오기`);
  await two.ctx.close();
});

await check('S43·S44', 'mood A → 바꾸기 → B → 바꾸기 → A shows the same A; 식사 → 카페 → 식사 the same 식사', async () => {
  const { ctx, page } = await fresh({ storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  const rest = await names(page);
  await tapText(page, '#results .change');
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  await tapText(page, '#results .change');
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  assert(JSON.stringify(await names(page)) === JSON.stringify(rest), 'rest cards changed');
  await tapText(page, '#results .change');
  await tapText(page, '[data-mood="food"]');
  await waitCards(page);
  const meal = await names(page);
  await tapText(page, '[data-sub="cafe"]');
  await tapText(page, '[data-sub="meal"]');
  await waitCards(page);
  assert(JSON.stringify(await names(page)) === JSON.stringify(meal), 'meal cards changed');
  await ctx.close();
});

await check('motion', 'reduced motion: the sheet opens and closes at once, no animation; with motion it slides; focus returns', async () => {
  for (const reduce of [true, false]) {
    const { ctx, page } = await fresh();
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    await page.locator('#basis').click();
    const name = await page.$eval('#sheet .sheet', (e) => getComputedStyle(e).animationName);
    await sleep(350); // a tap right after the sheet opens counts as the 2nd half of a double tap
    await page.locator('#sheet .sheet-close').click();
    const hiddenNow = await page.$eval('#sheet', (e) => e.hidden);
    if (reduce) assert(name === 'none' && hiddenNow, `reduce: animation ${name}, hidden ${hiddenNow}`);
    else assert(name !== 'none' && !hiddenNow, `motion: animation ${name}, hidden ${hiddenNow}`);
    await sleep(300);
    assert(await page.$eval('#sheet', (e) => e.hidden), 'sheet never went away');
    assert((await page.evaluate(() => document.activeElement?.id)) === 'basis', 'focus did not return to the basis button');
    await ctx.close();
  }
});

// --- service worker: offline revisit, weak network (S22, S23) ---
await check('S22', 'offline revisit (SW installed): app + data load, cards shown, one quiet offline line, no empty photo boxes', async () => {
  const { ctx, page } = await fresh({ sw: true, storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled
  await sleep(300);
  await ctx.unroute(PHOTO_HOST); // a route answers even offline; the photos must fail as the real host would
  await ctx.setOffline(true);
  await page.reload();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await sleep(800);
  const st = await page.textContent('#status');
  assert(st.includes('오프라인이라 사진은 안 보여요.'), `status: "${st}"`);
  const boxes = await page.$$eval('.card .ph', (els) => els.filter((e) => !e.hidden && e.offsetParent !== null).length);
  assert(boxes === 0, `${boxes} empty photo boxes`);
  await ctx.setOffline(false);
  await ctx.close();
});

await check('S23', 'hanging network: the cached shell is served within ~3s', async () => {
  const { ctx, page } = await fresh({ sw: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await sleep(300);
  // make the navigation request hang at the network layer
  await ctx.route(BASE, () => undefined);
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10000 });
  const ms = Date.now() - t0;
  assert(await page.locator('[data-mood="rest"]').isVisible(), 'no app shell');
  assert(ms < 5000, `took ${ms}ms`);
  await ctx.close();
});

// QA 2026-09-30 r2 (MAJOR): a deploy that the page already runs must not reload it (a flash that can eat a
// tap, or a jump back to the top when a card opens Kakao Map); a deploy with new code still does.
// Serves copies of dist/ from its own server so the "deploy" can be swapped under a controlled page.
await check('S65', 'new deploy: a page already on the new build is not reloaded; a page on old code reloads onto the new', async () => {
  const { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const http = await import('node:http');
  const { extname } = await import('node:path');
  const dist = join(appDir, 'dist');
  const tmp = mkdtempSync(join(tmpdir(), 'tomorrow-deploy-'));
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  const version = /const VERSION = '([^']+)'/.exec(sw)[1];
  const js = readdirSync(join(dist, 'assets')).find((f) => /^index-.+\.js$/.test(f));
  const make = (name, files) => {
    const dir = join(tmp, name);
    cpSync(dist, dir, { recursive: true });
    for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f), body);
    return dir;
  };
  const v1 = make('v1', {});
  // v2: nothing the page runs changes — a new worker version and a copy edit in index.html
  const v2 = make('v2', { 'sw.js': sw.replace(version, `${version}-v2`), 'index.html': html.replace('</body>', '<!-- v2 --></body>') });
  // v3: new code — the bundle under a new content-hashed name
  const js3 = js.replace(/\.js$/, 'v3.js');
  const v3 = make('v3', { 'sw.js': sw.replace(version, `${version}-v3`).replaceAll(js, js3), 'index.html': html.replaceAll(js, js3) });
  cpSync(join(v3, 'assets', js), join(v3, 'assets', js3));
  rmSync(join(v3, 'assets', js));

  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  let live = v1;
  const port = Number(process.env.E2E_DEPLOY_PORT ?? PORT + 1);
  const deploy = http
    .createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      try {
        const body = readFileSync(join(live, p));
        res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end();
      }
    })
    .listen(port);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', locale: 'ko-KR' });
  try {
    await ctx.addInitScript(`navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => { window.__takeovers = (window.__takeovers || 0) + 1; });`);
    const page = await ctx.newPage();
    const url = `http://localhost:${port}/`;
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the v1 worker
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'v1 worker never took control');
    let loads = 0;
    page.on('load', () => loads++);
    const takenOver = async (tag) => {
      for (let i = 0; i < 100; i++) {
        const keys = await page.evaluate(() => caches.keys()).catch(() => []);
        if (keys.some((k) => k.endsWith(tag))) return;
        await sleep(100);
      }
      throw new Error(`the ${tag} worker never took over`);
    };

    // reopen after the v2 deploy: the old worker's network-first navigation already brings the v2 shell
    live = v2;
    await page.goto(url);
    assert((await page.content()).includes('<!-- v2 -->'), 'the reopened page is not the v2 shell');
    await takenOver('-v2');
    for (let i = 0; i < 50 && !(await page.evaluate(() => window.__takeovers ?? 0).catch(() => 0)); i++) await sleep(100);
    assert((await page.evaluate(() => window.__takeovers ?? 0)) === 1, 'the v2 worker did not take over this page');
    await sleep(2500);
    assert(loads === 1, `the page reloaded although it already ran the new build (${loads} loads)`);

    // the v3 deploy brings new code: the idle first screen reloads onto it
    live = v3;
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
    for (let i = 0; i < 100 && loads < 2; i++) await sleep(100);
    const why =
      loads < 2
        ? await page
            .evaluate(async () => {
              const own = [...document.scripts].map((s) => s.src).filter(Boolean);
              const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
              const hit = async (u) => !!(await caches.match(u));
              return { caches: await caches.keys(), takeovers: window.__takeovers ?? 0, own: await Promise.all([...own, ...css].map(async (u) => [u, await hit(u)])), vis: document.visibilityState };
            })
            .catch((e) => String(e))
        : '';
    assert(loads === 2, `no reload onto new code (${loads} loads) ${JSON.stringify(why)}`);
    await page.waitForLoadState('load');
    assert((await page.evaluate(() => [...document.scripts].map((s) => s.src).join(' '))).includes(js3), 'not running the v3 bundle after the reload');
  } finally {
    await ctx.close();
    deploy.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- QA 2026-09-30: scenario rows that had no browser check (S31, S51, S52) and the audit's findings ---

/** spots.json with the nearest spot of `mood` renamed (a 32-letter name with an English part in brackets). */
async function withLongName(page, mood, name) {
  await page.route('**/spots.json*', async (route) => {
    const res = await route.fetch();
    const spots = await res.json();
    const [lat, lng] = [33.5122, 126.5272];
    const d = (s) => (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
    const nearest = spots.filter((s) => s.mood === mood).sort((a, b) => d(a) - d(b))[0];
    nearest.name = name;
    await route.fulfill({ response: res, body: JSON.stringify(spots) });
  });
}
await check('S31', 'a 32-letter name with an English part in brackets wraps inside its card: no overflow, clear of the heart, alias never split', async () => {
  const LONG = '제주돌문화공원 설문대할망전시관 (Jeju Stone Park)';
  for (const [width, height] of [
    [320, 568],
    [195, 422],
  ]) {
    const { ctx, page } = await fresh({ width, height });
    await withLongName(page, 'walk', LONG);
    await page.reload();
    await tapText(page, '[data-mood="walk"]');
    await waitCards(page);
    const r = await page.evaluate((LONG) => {
      const card = [...document.querySelectorAll('#cards .card')].find((c) => c.querySelector('.name').textContent.includes('Jeju'));
      if (!card) return null;
      const name = card.querySelector('.name');
      const n = name.getBoundingClientRect();
      const heart = card.querySelector('.heart').getBoundingClientRect();
      const alias = card.querySelector('.alias');
      const range = document.createRange();
      range.selectNodeContents(alias);
      const aliasLines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
      const de = document.documentElement;
      return {
        over: de.scrollWidth - de.clientWidth,
        nameOver: name.scrollWidth - name.clientWidth,
        clearOfHeart: n.right <= heart.left + 10, // the heart's 44px box overlaps its own -10px margin
        inCard: n.right <= card.getBoundingClientRect().right + 0.5,
        aliasLines,
        len: [...LONG].length,
      };
    }, LONG);
    assert(r, 'long name not on screen');
    assert(r.len >= 32, `name is ${r.len} letters`);
    assert(r.over <= 0 && r.nameOver <= 0 && r.inCard, `${width}: overflow page ${r.over}, name ${r.nameOver}, in card ${r.inCard}`);
    assert(r.clearOfHeart, `${width}: the name runs under the heart`);
    assert(r.aliasLines === 1 || width < 250, `${width}: "(Jeju Stone Park)" split over ${r.aliasLines} lines`);
    await shot(page, `long-name-${width}`);
    await ctx.close();
  }
});

// Headless Chromium cannot emulate display-mode (CDP has no such media feature), so S51 is checked by what a
// home-screen launch changes: the manifest's start_url opened as a new top-level page (same localStorage,
// empty sessionStorage and history), no browser back button (iOS standalone has none: every layer must close
// from inside the page), and no code that behaves differently in standalone (grep of the build).
await check('S51', 'home-screen launch: start_url in a fresh top-level page → first screen, remembered basis and saves; every layer closes without a back button', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const built = readdirSync(join(appDir, 'dist/assets')).map((f) => readFileSync(join(appDir, 'dist/assets', f), 'utf8'));
  assert(!built.some((s) => /display-mode|standalone/.test(s)), 'the build branches on display-mode');
  const { ctx, page } = await fresh({ storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('.card .heart').first().click();
  // the installed app: a new top-level context — same localStorage, its own (empty) sessionStorage and history
  const app = await ctx.newPage();
  const manifest = await (await fetch(new URL('manifest.webmanifest', BASE))).json();
  await app.goto(new URL(manifest.start_url, BASE).href);
  await sleep(300);
  const r = await app.evaluate(() => ({
    home: !document.getElementById('home').hidden,
    results: !document.getElementById('results').hidden,
    basis: document.getElementById('basis').textContent,
    saved: document.getElementById('saved').textContent.trim(),
    savedShown: !document.getElementById('saved').hidden,
    state: history.state,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert(manifest.display === 'standalone', `manifest display ${manifest.display}`);
  assert(r.home && !r.results, 'did not open on the first screen');
  assert(r.basis === '애월 근처', `basis ${r.basis}`);
  assert(r.savedShown && r.saved === '1', `♥ ${r.saved}`);
  assert(r.state?.view === 'home' && r.state?.depth === 0 && r.over <= 0, `history ${JSON.stringify(r.state)}, overflow ${r.over}`);
  // no back button: results → 바꾸기, saved list → 돌아가기, sheet → 닫기 / scrim, all from inside the page
  await tapText(app, '[data-mood="rest"]');
  await waitCards(app);
  await shot(app, 'standalone-cards');
  await tapText(app, '#basis');
  await tapText(app, '#sheet .sheet-close');
  await sleep(250);
  assert(!(await visible(app, '#sheet .sheet')), '닫기 did not close the sheet');
  await tapText(app, '#saved');
  await app.waitForSelector('#savedView .card');
  await tapText(app, '#savedView .back');
  assert(await visible(app, '#results'), '돌아가기 did not return to the results');
  await tapText(app, '#results .change');
  assert(await visible(app, '#home'), '바꾸기 did not return to the moods');
  await ctx.close();
});

await check('S52', 'landscape (844×390, 667×375): one centred 480px column, no sideways scroll, sheet within the screen and scrolling inside', async () => {
  for (const [width, height] of [
    [844, 390],
    [667, 375],
  ]) {
    for (const dark of [false, true]) {
      const { ctx, page } = await fresh({ width, height, dark });
      const col = await page.$eval('#app', (e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, left: r.left, right: innerWidth - r.right };
      });
      assert(col.w <= 480 && Math.abs(col.left - col.right) <= 1, `${width} column ${JSON.stringify(col)}`);
      await tapText(page, '[data-mood="walk"]');
      await waitCards(page);
      const top = await page.$eval('#crumb', (e) => e.getBoundingClientRect().top);
      assert(top >= 0 && top < height, `${width}: results title at y=${Math.round(top)}`);
      await tapText(page, '#basis');
      const s = await page.evaluate(() => {
        const sheet = document.querySelector('#sheet .sheet');
        const r = sheet.getBoundingClientRect();
        const close = document.querySelector('#sheet .sheet-close').getBoundingClientRect();
        return {
          h: r.height,
          w: r.width,
          top: r.top,
          scrolls: sheet.scrollHeight > sheet.clientHeight,
          overflowY: getComputedStyle(sheet).overflowY,
          closeIn: close.bottom <= innerHeight + 1 && close.top >= r.top,
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      assert(s.w <= 480 && s.h <= height * 0.9 && s.top >= 0, `${width} sheet ${Math.round(s.w)}×${Math.round(s.h)} at ${Math.round(s.top)}`);
      assert(s.scrolls && s.overflowY === 'auto' && s.closeIn, `${width} sheet scroll ${s.scrolls}/${s.overflowY}, 닫기 visible ${s.closeIn}`);
      assert(s.over <= 0, `${width} overflow ${s.over}`);
      await page.$eval('#sheet .sheet', (e) => e.scrollTo(0, e.scrollHeight));
      await tapText(page, '#sheet [data-area="성산"]');
      await waitCards(page);
      assert((await page.textContent('#basis')).includes('성산 근처'), 'area at the bottom of the scrolled sheet not reachable');
      if (!dark) await shot(page, `landscape-${width}`);
      await ctx.close();
    }
  }
});

await check('QA-reload-history', 'reload on a results entry that never loaded (GPS pending / notice): the same mood comes back, and no back press is dead', async () => {
  // (a) GPS slow: reload while the placeholder shows
  const { ctx, page } = await fresh({ geo: { mode: 'hang' } });
  await tapText(page, '[data-mood="new"]');
  await page.waitForSelector('#cards .ghost');
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'ok', lat: 33.5122, lng: 126.5272, delay: 30 })));
  await page.reload();
  await waitCards(page);
  assert((await page.textContent('#crumb')) === '새로운 거 해보고 싶어', `title after reload: ${await page.textContent('#crumb')}`);
  await back(page);
  assert((await names(page)).length === 0 && (await hstate(page))?.depth === 0, `first back: ${JSON.stringify(await hstate(page))}`);
  await back(page);
  assert(page.url() === 'about:blank', 'second back did not leave');
  await ctx.close();
  // (b) denied: notice → location turned on → pull to refresh → cards for that mood; then back, back = out
  const b = await fresh({ geo: { mode: 'deny' } });
  await tapText(b.page, '[data-mood="walk"]');
  await b.page.waitForSelector('.notice');
  await b.page.evaluate(() => localStorage.removeItem('__geo'));
  await b.page.reload();
  await waitCards(b.page);
  assert((await b.page.textContent('#crumb')) === '좀 걷고 싶어', 'another mood after reload');
  await tapText(b.page, '#results .change');
  await tapText(b.page, '[data-mood="rest"]');
  await waitCards(b.page);
  await back(b.page);
  assert((await names(b.page)).length === 0 && (await hstate(b.page))?.depth === 0, `dead back: ${JSON.stringify(await hstate(b.page))}`);
  await back(b.page);
  assert(b.page.url() === 'about:blank', 'second back did not leave');
  await b.ctx.close();
  // (c) no session storage at all: the orphaned results entry is consumed on mount
  const c = await fresh();
  await tapText(c.page, '[data-mood="rest"]');
  await waitCards(c.page);
  await c.page.evaluate(() => sessionStorage.clear());
  await c.page.reload();
  await sleep(400);
  assert((await hstate(c.page))?.view === 'home' && (await hstate(c.page))?.depth === 0, `after reload ${JSON.stringify(await hstate(c.page))}`);
  await back(c.page);
  assert(c.page.url() === 'about:blank', 'the first back was dead');
  await c.ctx.close();
});

await check('QA-stale-session', 'rest shown → 바꾸기 → walk fails → location back → reload: 좀 걷고 싶어, not the old 푹 쉬고 싶어 cards', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await tapText(page, '#results .change');
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'fail' })));
  await tapText(page, '[data-mood="walk"]');
  await page.waitForSelector('.notice');
  await page.evaluate(() => localStorage.removeItem('__geo'));
  await page.reload();
  await waitCards(page);
  assert((await page.textContent('#crumb')) === '좀 걷고 싶어', `title ${await page.textContent('#crumb')}`);
  // 식사 shown → 카페·디저트 still loading → reload: 카페·디저트
  await tapText(page, '#results .change');
  await tapText(page, '[data-mood="food"]');
  await waitCards(page);
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'hang' })));
  await tapText(page, '[data-sub="cafe"]'); // still locating when the page is reloaded
  await page.evaluate(() => localStorage.removeItem('__geo'));
  await page.reload();
  await waitCards(page);
  assert((await page.getAttribute('[data-sub="cafe"]', 'aria-pressed')) === 'true', '식사 came back instead of 카페·디저트');
  await ctx.close();
});

await check('QA-more-origin', '"다른 3곳 보기" never asks GPS again: a failing fix leaves the next 3 coming, no notice', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  const first = await names(page);
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'fail' })));
  await tapText(page, '#cards .more');
  await sleep(200);
  assert(!(await visible(page, '.notice')), 'a failure notice replaced the cards');
  const next = await names(page);
  assert(next.length === 3 && next.every((n) => !first.includes(n)), `next 3: ${next.join(', ')}`);
  await ctx.close();
});

await check('QA-saved-scroll', 'closing the saved list returns to the scroll position the cards were at (real layout, not a mocked scrollY)', async () => {
  // hint already seen: the first-save hint goes with ♥ N (3판 §6.13) and would shorten the page meanwhile
  const { ctx, page } = await fresh({ height: 700, storage: { 'jeju.hintSeen': true } });
  await tapText(page, '[data-mood="walk"]');
  await waitCards(page);
  await page.locator('.card .heart').first().click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(100);
  const y = await page.evaluate(() => scrollY);
  assert(y > 50, `page does not scroll (y=${y})`);
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  assert((await page.evaluate(() => scrollY)) === 0, 'saved list did not open at the top');
  await tapText(page, '#savedView .back');
  const after = await page.evaluate(() => scrollY);
  assert(Math.abs(after - y) <= 1, `back at y=${after}, was ${y}`);
  await ctx.close();
});

await check('QA-saved-gps-hang', 'saved list while GPS never answers: shown in saved order within ~3s, never a grey placeholder forever', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('.card .heart').nth(0).click();
  await page.locator('.card .heart').nth(1).click();
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'hang' })));
  await tapText(page, '#results .change');
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card:not(.ghost)', { timeout: 4500 });
  assert((await page.textContent('#savedView .sort')) === '위치를 몰라서 저장한 순서대로 보여 드려요.', 'sort line');
  assert((await page.textContent('#basis')) === '여기 근처', 'a wait is not a failure');
  await ctx.close();
});

await check('QA-meta', 'meta: one trip line per screen when all three match; at 195px no line starts with "·"; 카카오맵 once', async () => {
  const { ctx, page } = await fresh({ width: 195, height: 422, storage: { 'jeju.region': '성산', 'jeju.basis': 'region' } });
  for (const mood of ['rest', 'walk', 'food']) {
    await tapText(page, `[data-mood="${mood}"]`);
    await waitCards(page);
    const r = await page.evaluate(() => {
      const metas = [...document.querySelectorAll('#cards .card .meta')];
      const trips = metas.map((m) => m.querySelector('.travel')?.textContent ?? '');
      const sepAtLineStart = metas.some((m) => {
        const sep = m.querySelector('.sep');
        if (!sep) return false;
        const range = document.createRange();
        range.selectNodeContents(sep);
        const rects = [...range.getClientRects()];
        return rects.some((x) => x.left <= m.getBoundingClientRect().left + 1);
      });
      const alt = document.querySelector('#alt-trip')?.textContent;
      if (alt) trips.push(alt.replace(/^둘 다 /, ''));
      return { trips, dests: document.querySelectorAll('#cards .dest').length, sepAtLineStart };
    });
    assert(r.dests === 1, `${mood}: 카카오맵 ${r.dests} times`);
    assert(!r.sepAtLineStart, `${mood}: a line starts with "·"`);
    const bare = r.trips.map((t) => t.replace(/^\S+에서 /, ''));
    assert(!bare.some((t) => bare.filter((x) => x === t).length >= 3), `${mood}: ${r.trips.join(' / ')}`);
    await shot(page, `meta-195-${mood}`);
    await tapText(page, '#results .change');
  }
  await ctx.close();
});

// --- design/SPEC.md §15.1 17–24 (3판) ---
const AREA_ORDER = [
  ['한경', '수월봉'], ['한림', '협재'], ['애월', '한담'], ['신제주', '공항 근처'], ['구제주', '동문시장'], ['조천', '함덕'], ['구좌', '월정리'], ['우도', '배로 가는 섬'],
  ['대정', '모슬포'], ['안덕', '산방산'], ['중문', '주상절리'], ['서귀포 시내', '올레시장'], ['남원', '위미'], ['표선', '성읍'], ['성산', '일출봉'],
];

await check('3-17', 'row cards: at 320×568 default text the photo sits beside the text; at root 150% it goes on top', async () => {
  for (const big of [false, true]) {
    const { ctx, page } = await fresh({ width: 320, height: 568 });
    if (big) await page.addStyleTag({ content: 'html { font-size: 150% }' });
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    const r = await page.$$eval('#cards .card.row:not(.noimg)', (cards) =>
      cards.map((c) => ({ ph: c.querySelector('.ph').getBoundingClientRect().toJSON(), name: c.querySelector('.name').getBoundingClientRect().toJSON() })),
    );
    assert(r.length === 2, `${r.length} row cards with a photo`);
    for (const { ph, name } of r) {
      if (big) assert(ph.bottom <= name.top + 0.5, `150%: photo bottom ${ph.bottom} below name top ${name.top}`);
      else assert(ph.right <= name.left + 0.5, `default: photo right ${ph.right} past name left ${name.left}`);
    }
    await shot(page, `rows-320-${big ? '150' : '100'}`);
    await ctx.close();
  }
});

await check('3-18', 'booking link: one line at 320 and 390, on the first card and on a row card', async () => {
  for (const width of [320, 390]) {
    const seen = { lead: 0, row: 0 };
    const bad = [];
    for (const [area] of AREA_ORDER) {
      if (seen.lead && seen.row) break;
      const { ctx, page } = await fresh({ width, storage: { 'jeju.region': area.replace(' ', ''), 'jeju.basis': 'region', 'jeju.hintSeen': true } });
      await tapText(page, '[data-mood="new"]');
      await waitCards(page);
      for (let i = 0; i < 4; i++) {
        const r = await page.$$eval('#cards .card .book', (els) =>
          els.map((a) => {
            const range = document.createRange();
            range.selectNodeContents(a);
            return { kind: a.closest('.card').classList.contains('lead') ? 'lead' : 'row', lines: new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size };
          }),
        );
        for (const b of r) {
          seen[b.kind]++;
          if (b.lines !== 1) bad.push(`${width} ${area} ${b.kind}: ${b.lines} lines`);
        }
        if (seen.lead && seen.row) {
          if (width === 320) await shot(page, 'book-320');
          break;
        }
        await tapText(page, '#cards .more');
        await sleep(150);
      }
      await ctx.close();
    }
    assert(seen.lead && seen.row, `${width}: no bookable card found (lead ${seen.lead}, row ${seen.row})`);
    assert(!bad.length, bad.join(' | '));
  }
});

await check('3-19', '다른 3곳 bar: at 320×568 the button is on screen and the bar floats with its rule; at the end it rests 28px under the last card, no rule', async () => {
  const { ctx, page } = await fresh({ width: 320, height: 568 });
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await sleep(200);
  const probe = () =>
    page.evaluate(() => {
      const bar = document.querySelector('#cards .more-bar');
      const more = bar.querySelector('.more').getBoundingClientRect();
      const cards = document.querySelectorAll('#cards .card');
      const last = cards[cards.length - 1].getBoundingClientRect();
      const line = getComputedStyle(bar, '::before').borderTopColor;
      const probe = document.createElement('div');
      probe.style.color = 'var(--line)';
      bar.append(probe);
      const lineColor = getComputedStyle(probe).color;
      probe.remove();
      return { top: more.top, bottom: more.bottom, vh: innerHeight, stuck: bar.classList.contains('stuck'), gap: more.top - last.bottom, line, lineColor };
    });
  const a = await probe();
  assert(a.top >= 0 && a.bottom <= a.vh, `button at ${a.top}–${a.bottom} of ${a.vh}`);
  assert(a.stuck, 'bar not .stuck while floating');
  assert(a.line === a.lineColor, `floating rule ${a.line}, want ${a.lineColor}`);
  await shot(page, 'bar-320-floating');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(200);
  const b = await probe();
  assert(!b.stuck, 'bar still .stuck at the end');
  assert(Math.abs(b.gap - 28) <= 1, `last card → button ${b.gap}px`);
  assert(b.line !== b.lineColor, `rule shown at rest: ${b.line}`);
  await ctx.close();
});

await check('3-20', 'focus return: 닫기 by pointer → #basis focused without a ring; Esc → with a ring', async () => {
  const { ctx, page } = await fresh();
  const after = () => page.evaluate(() => ({ basis: document.activeElement === document.getElementById('basis'), ring: document.activeElement.matches(':focus-visible') }));
  await tapText(page, '#basis');
  await page.waitForSelector('#sheet .sheet');
  await tapText(page, '#sheet .sheet-close');
  await sleep(300);
  const a = await after();
  assert(a.basis && !a.ring, `pointer close: focus on basis ${a.basis}, ring ${a.ring}`);
  await sleep(300);
  await tapText(page, '#basis');
  await page.waitForSelector('#sheet .sheet');
  await page.keyboard.press('Escape');
  await sleep(300);
  const b = await after();
  assert(b.basis && b.ring, `Esc close: focus on basis ${b.basis}, ring ${b.ring}`);
  await ctx.close();
});

await check('3-21', 'first-save hint: stays 4s and through another heart, goes with 다른 3곳 보기; not again after reload; never in the saved list', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('#cards .card .heart').first().click();
  await page.waitForSelector('#cards .hint');
  assert((await page.textContent('#announce')) === '저장한 곳은 맨 위 하트 버튼에 모여요.', 'not announced');
  await sleep(4000);
  assert((await page.$$('#cards .hint')).length === 1, 'gone after 4s');
  await page.locator('#cards .card .heart').nth(1).click();
  await sleep(100);
  assert((await page.$$('#cards .hint')).length === 1, 'gone after another heart');
  await shot(page, 'hint-390');
  await tapText(page, '#cards .more');
  await sleep(200);
  assert((await page.$$('.hint')).length === 0, 'still there after 다른 3곳 보기');
  await page.reload();
  await waitCards(page);
  await page.locator('#cards .card .heart').nth(2).click();
  await sleep(200);
  assert((await page.$$('.hint')).length === 0, 'shown again after reload');
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card');
  await page.locator('#savedView .heart').first().click();
  await page.locator('#savedView .heart').first().click();
  await sleep(100);
  assert((await page.$$('.hint')).length === 0, 'shown in the saved list');
  await ctx.close();
});

await check('3-22', 'area index: 15 cells in order with landmarks in the results notice, basis sheet and 숙소 sheet; only the chosen one is 600 with a check; no cell has a fill', async () => {
  const read = (page, root) =>
    page.$$eval(`${root} .areas .opt`, (els) =>
      els.map((b) => ({
        text: `${b.querySelector('.nm').textContent}|${b.querySelector('.lm').textContent}`,
        weight: getComputedStyle(b.querySelector('.nm')).fontWeight,
        check: getComputedStyle(b.querySelector('.i-check')).display !== 'none',
        pressed: b.getAttribute('aria-pressed') === 'true',
        bg: getComputedStyle(b).backgroundColor,
        cols: getComputedStyle(b.parentElement).gridTemplateColumns.split(' ').length,
      })),
    );
  const want = AREA_ORDER.map(([n, l]) => `${n}|${l}`).join();
  const verify = (cells, label, chosen) => {
    assert(cells.map((c) => c.text).join() === want, `${label}: ${cells.map((c) => c.text).join()}`);
    for (const c of cells) {
      assert(c.bg === 'rgba(0, 0, 0, 0)', `${label} ${c.text}: background ${c.bg}`);
      assert(c.cols === 2, `${label}: ${c.cols} columns`);
      const on = c.text.startsWith(`${chosen}|`);
      assert(c.pressed === on && c.check === on && c.weight === (on ? '600' : '400'), `${label} ${c.text}: pressed ${c.pressed} check ${c.check} weight ${c.weight}`);
    }
  };
  for (const dark of [false, true]) {
    const { ctx, page } = await fresh({ width: 320, dark, geo: { mode: 'deny' } });
    await tapText(page, '[data-mood="walk"]');
    await page.waitForSelector('.notice .areas');
    verify(await read(page, '#cards'), 'results', null);
    await ctx.close();
    const b = await fresh({ width: 320, dark, storage: { 'jeju.region': '애월', 'jeju.basis': 'region', 'jeju.stay': { lat: 33.4387, lng: 126.9026, area: '성산', source: 'area' } } });
    await tapText(b.page, '#basis');
    await b.page.waitForSelector('#sheet .areas');
    verify(await read(b.page, '#sheet'), 'basis sheet', '애월');
    const rows = await b.page.$$eval('#sheet .opts .opt', (els) => els.map((e) => e.textContent));
    assert(rows.join('/') === '지금 있는 곳/숙소성산 숙소', `sheet rows ${rows.join('/')}`);
    await shot(b.page, `sheet-basis-320-${dark ? 'dark' : 'light'}`);
    await tapText(b.page, '#sheet [data-action="restay"]');
    await b.page.waitForSelector('#sheet .primary');
    verify(await read(b.page, '#sheet'), 'stay sheet', '성산');
    await b.ctx.close();
  }
});

await check('3-23', 'trip lines: 애월 · 푹 쉬고 싶어 — first card "애월에서 … · 카카오맵"; equal rows said once on 아니면 with aria-describedby; 카카오맵 once', async () => {
  const { ctx, page } = await fresh({ storage: { 'jeju.region': '애월', 'jeju.basis': 'region' } });
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  let grouped = 0;
  for (let i = 0; i < 6; i++) {
    const r = await page.evaluate(() => ({
      lead: document.querySelector('#cards .card.lead .meta').textContent,
      alt: document.querySelector('#cards .alt').textContent,
      rowMetas: document.querySelectorAll('#cards .card.row .meta').length,
      described: [...document.querySelectorAll('#cards .card.row .card-link')].map((a) => a.getAttribute('aria-describedby')),
      maps: (document.getElementById('results').innerText.match(/카카오맵/g) ?? []).length,
    }));
    assert(r.lead.startsWith('애월에서 ') && r.lead.endsWith('카카오맵'), `lead meta "${r.lead}"`);
    assert(r.maps === 1, `카카오맵 ${r.maps} times`);
    if (r.alt.includes('둘 다 ')) {
      grouped++;
      assert(r.rowMetas === 0 && r.described.every((d) => d === 'alt-trip'), `grouped but rows ${r.rowMetas} metas, ${r.described}`);
      if (grouped === 1) await shot(page, 'trip-grouped-390');
    } else assert(r.rowMetas === 2 && r.described.every((d) => d === null), `ungrouped: ${r.rowMetas} metas, ${r.described}`);
    await tapText(page, '#cards .more');
    await sleep(150);
  }
  assert(grouped > 0, 'no screen with two equal row trips in 6 pages');
  await ctx.close();
});

await check('3-24', 'results hierarchy: the chosen mood is smaller than the first card name; ≤ 3 text sizes on screen', async () => {
  for (const mood of ['rest', 'food']) {
    const { ctx, page } = await fresh();
    await tapText(page, `[data-mood="${mood}"]`);
    await waitCards(page);
    const r = await page.evaluate(() => {
      const px = (e) => parseFloat(getComputedStyle(e).fontSize);
      const sizes = new Set();
      const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim() || n.parentElement.closest('[hidden], [aria-hidden="true"]')) continue;
        const rect = n.parentElement.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight || !rect.width) continue;
        sizes.add(px(n.parentElement));
      }
      return { crumb: px(document.getElementById('crumb')), name: px(document.querySelector('#cards .card.lead .name')), sizes: [...sizes].sort() };
    });
    assert(r.crumb < r.name, `${mood}: crumb ${r.crumb} ≥ name ${r.name}`);
    assert(r.sizes.length <= 3, `${mood}: sizes ${r.sizes}`);
    await ctx.close();
  }
});

await check('QA-first-tap', 'a mood tapped while the app script is still downloading is carried out when it arrives', async () => {
  const { ctx, page } = await fresh();
  await page.route('**/assets/*.js', async (route) => {
    await sleep(1200);
    await route.continue();
  });
  // module scripts hold DOMContentLoaded back: tap as soon as the static buttons are on screen
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.locator('[data-mood="walk"]').click();
  assert(!(await page.evaluate(() => typeof window.__early === 'undefined')), 'the app had already loaded: the tap was not early');
  await waitCards(page);
  assert((await page.textContent('#crumb')) === '좀 걷고 싶어', 'wrong mood');
  await ctx.close();
});

await browser.close();
server.kill();

const width = Math.max(...results.map((r) => r.id.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(width)}  ${r.name}${r.ok ? '' : `\n      → ${r.err}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
