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
await check('S15', 'saved list → ⇄ → area keeps the list, trips from the new area; no blank screen', async () => {
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
  assert((await page.textContent('#savedView .travel')).startsWith('성산에서 '), 'trips not from 성산');
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
  const saved = await a.evaluate(() => JSON.parse(localStorage.getItem('jeju.saved.v2') || '[]'));
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

/** spots.json with the nearest spot of `mood` renamed (a 32-letter name with an English part in brackets).
 * Changed on purpose (ADR-0060): cards are best-scored first, so it also gets the top score (the rest of that
 * mood the lowest) to stay on screen. */
async function withLongName(page, mood, name) {
  await page.route('**/spots.json*', async (route) => {
    const res = await route.fetch();
    const spots = await res.json();
    const [lat, lng] = [33.5122, 126.5272];
    const d = (s) => (s.lat - lat) ** 2 + (s.lng - lng) ** 2;
    const same = spots.filter((s) => s.mood === mood);
    for (const s of same) s.score = 1;
    const nearest = same.sort((a, b) => d(a) - d(b))[0];
    nearest.name = name;
    nearest.score = 5;
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
  // The installed app works as the page does — the one display-mode check in the build is the home-screen nudge,
  // which is not shown inside the installed app (ADR-0063 2d).
  const modes = built.join('\n').match(/display-mode/g) ?? [];
  assert(modes.length <= 1, `the build branches on display-mode ${modes.length}×`);
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

await check('QA-saved-gps-hang', 'saved list while GPS never answers: shown (no trips) within ~3s, never a grey placeholder forever', async () => {
  const { ctx, page } = await fresh();
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await page.locator('.card .heart').nth(0).click();
  await page.locator('.card .heart').nth(1).click();
  await page.evaluate(() => localStorage.setItem('__geo', JSON.stringify({ mode: 'hang' })));
  await tapText(page, '#results .change');
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card:not(.ghost)', { timeout: 4500 });
  assert((await page.locator('#savedView .travel').count()) === 0, 'a trip without a position');
  assert((await page.textContent('#basis')) === '여기 근처', 'a wait is not a failure');
  await ctx.close();
});

await check('QA-meta', 'meta: one trip line per screen when all three match; at 195px no line starts with "·"; the map app (네이버지도) once', async () => {
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
    assert(r.dests === 1, `${mood}: the map app ${r.dests} times`);
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

await check('3-18', 'booking link paused (ADR-0073): no .book and no 마이리얼트립 on any card at 320 and 390', async () => {
  for (const width of [320, 390]) {
    for (const mood of ['new', 'food', 'rest']) {
      const { ctx, page } = await fresh({ width, storage: { 'jeju.hintSeen': true } });
      await tapText(page, `[data-mood="${mood}"]`);
      await waitCards(page);
      const r = await page.$$eval('#cards', (els) => ({ book: document.querySelectorAll('#cards .book').length, text: els[0].textContent.includes('마이리얼트립') }));
      assert(r.book === 0 && !r.text, `${width} ${mood}: book ${r.book} text ${r.text}`);
      await ctx.close();
    }
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
    // 언제 (specs/date-mode.md) above 어디; 얼마나 (ADR-0060) right under the 어디 rows, before the 동네 index
    assert(rows.join('/') === '지금/내일/날짜 고르기/지금 있는 곳/숙소성산 숙소/걸어서/차로 30분/차로 1시간/비 와요(실내만)', `sheet rows ${rows.join('/')}`);
    await shot(b.page, `sheet-basis-320-${dark ? 'dark' : 'light'}`);
    await tapText(b.page, '#sheet [data-action="restay"]');
    await b.page.waitForSelector('#sheet .primary');
    verify(await read(b.page, '#sheet'), 'stay sheet', '성산');
    await b.ctx.close();
  }
});

await check('3-23', 'trip lines: 애월 · 푹 쉬고 싶어 — first card "애월에서 … · 네이버지도"; equal rows said once on 아니면 with aria-describedby; 네이버지도 once', async () => {
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
      maps: (document.getElementById('results').innerText.match(/네이버지도/g) ?? []).length,
    }));
    assert(r.lead.startsWith('애월에서 ') && r.lead.endsWith('네이버지도'), `lead meta "${r.lead}"`);
    assert(r.maps === 1, `네이버지도 ${r.maps} times`);
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

// --- QA round 2: keyboard focus under the sticky bars, the 숙소 row at 200%, names that differ only after " - " ---

await check('QA2-focus-bar', 'Tab through the cards at 320·360 with 다른 3곳 bar floating: no card link or heart is left under the bar', async () => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
  ]) {
    for (const mood of ['food', 'rest']) {
      const { ctx, page } = await fresh({ width, height });
      await tapText(page, `[data-mood="${mood}"]`);
      await waitCards(page);
      await sleep(200);
      await page.evaluate(() => {
        document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      assert(await page.$eval('#cards .more-bar', (b) => b.classList.contains('stuck')), `${width} ${mood}: bar not floating at the top`);
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        await sleep(50);
        const r = await page.evaluate(() => {
          const a = document.activeElement;
          const bar = document.querySelector('#cards .more-bar');
          if (!a || !a.closest('#cards') || bar.contains(a)) return { done: !!a && bar.contains(a) };
          if (!a.closest('.card')) return {};
          const e = a.getBoundingClientRect();
          return { el: `${a.className} ${a.getAttribute('aria-label')}`, stuck: bar.classList.contains('stuck'), bottom: e.bottom, barTop: bar.getBoundingClientRect().top };
        });
        if (r.done) break;
        if (!r.el) continue;
        seen.add(r.el.split(' ')[0]);
        assert(!r.stuck || r.bottom <= r.barTop + 0.5, `${width} ${mood}: ${r.el} bottom ${Math.round(r.bottom)} under the bar at ${Math.round(r.barTop)}`);
      }
      assert(seen.has('card-link') && seen.has('heart'), `${width} ${mood}: tabbed through ${[...seen]}`);
      await ctx.close();
    }
  }
});

await check('QA2-focus-sheet', 'Tab through the basis sheet at 320×568: no option is left under the sticky 닫기', async () => {
  const { ctx, page } = await fresh({ width: 320, height: 568 });
  await tapText(page, '#basis');
  await page.waitForSelector('#sheet .sheet');
  let n = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    await sleep(30);
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      const close = document.querySelector('#sheet .sheet-close');
      if (!a || !a.closest('#sheet') || a === close) return null;
      return { el: a.textContent.trim().slice(0, 12), bottom: a.getBoundingClientRect().bottom, closeTop: close.getBoundingClientRect().top };
    });
    if (!r) continue;
    n++;
    assert(r.bottom <= r.closeTop + 0.5, `"${r.el}" bottom ${Math.round(r.bottom)} under 닫기 at ${Math.round(r.closeTop)}`);
  }
  assert(n >= 10, `only ${n} controls reached in the sheet`);
  await ctx.close();
});

await check('QA2-focus-top', 'Shift+Tab up the area index at 320×568: nothing is left under the top bar; focusing ♥ N does not move the page', async () => {
  const { ctx, page } = await fresh({ width: 320, height: 568, geo: { mode: 'deny' }, storage: { 'jeju.saved': [] } });
  await tapText(page, '[data-mood="walk"]');
  await page.waitForSelector('#results .notice');
  await sleep(200);
  await page.evaluate(() => {
    document.activeElement.blur();
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  let n = 0;
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Shift+Tab');
    await sleep(30);
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || !a.closest('main') || a.closest('.top')) return null;
      return { el: a.textContent.trim().slice(0, 12), top: a.getBoundingClientRect().top, barBottom: document.querySelector('.top').getBoundingClientRect().bottom };
    });
    if (!r) continue;
    n++;
    assert(r.top >= r.barBottom - 0.5, `"${r.el}" top ${Math.round(r.top)} under the top bar (${Math.round(r.barBottom)})`);
  }
  assert(n >= 10, `only ${n} controls reached`);
  await ctx.close();
  // the top bar's own buttons are always on screen: focusing one never scrolls the page
  const two = await fresh({ width: 320, height: 568, storage: { 'jeju.hintSeen': true } });
  await tapText(two.page, '[data-mood="rest"]');
  await waitCards(two.page);
  await two.page.locator('.card .heart').first().click();
  // focus left on the heart by the keyboard (a ring), as when Shift+Tab goes from the page up to ♥ N
  await two.page.keyboard.press('Shift+Tab');
  await two.page.keyboard.press('Tab');
  assert(await two.page.$eval('.card .heart', (h) => h.matches(':focus-visible')), 'heart not keyboard-focused');
  await two.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(100);
  const y = await two.page.evaluate(() => scrollY);
  assert(y > 50, `page does not scroll (y=${y})`);
  for (const sel of ['#saved', '#basis']) {
    await two.page.evaluate((sel) => document.querySelector(sel).focus(), sel);
    await sleep(100);
    const after = await two.page.evaluate(() => scrollY);
    assert(after === y, `focusing ${sel} moved the page from ${y} to ${after}`);
  }
  await two.ctx.close();
});

await check('QA2-stay-row', 'root 200% at 320: the 숙소 row of the basis sheet keeps "서귀포 시내 숙소" on one line beside or above 다시 정하기', async () => {
  const stay = { lat: 33.2573, lng: 126.5338, area: '서귀포시내', source: 'area' };
  const { ctx, page } = await fresh({ width: 320, height: 568, storage: { 'jeju.stay': stay, 'jeju.basis': 'stay' } });
  await page.addStyleTag({ content: 'html { font-size: 200% }' });
  await tapText(page, '#basis');
  await page.waitForSelector('#sheet [data-action="restay"]');
  const r = await page.evaluate(() => {
    const lm = document.querySelector('#sheet [data-basis="stay"] .lm');
    const range = document.createRange();
    range.selectNodeContents(lm);
    return { text: lm.textContent, lines: new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size };
  });
  assert(r.text === '서귀포 시내 숙소' && r.lines === 1, `"${r.text}" on ${r.lines} lines`);
  await ctx.close();
});

/** spots.json with the nearest spots of `mood` renamed, nearest first. Changed on purpose (ADR-0060): cards
 * are best-scored first, so the renamed ones get descending top scores (the rest of that mood the lowest). */
async function withNames(page, mood, names) {
  await page.route('**/spots.json*', async (route) => {
    const res = await route.fetch();
    const spots = await res.json();
    const d = (s) => (s.lat - 33.5122) ** 2 + (s.lng - 126.5272) ** 2;
    const near = spots.filter((s) => s.mood === mood).sort((a, b) => d(a) - d(b));
    for (const s of near) s.score = 1;
    names.forEach((n, i) => {
      near[i].name = n;
      near[i].score = 5 - i;
    });
    await route.fulfill({ response: res, body: JSON.stringify(spots) });
  });
}
await check('QA2-row-names', 'row cards at 320/390: "… 절로 가는길 - 정진의 길" and "- 인욕의 길" tell apart, and "(박진경 추도비)" shows: name up to two lines, then the part after " - " or in brackets whole on its own line; at 390 neither name is cut', async () => {
  const LEAD = '제주돌문화공원';
  for (const [w, h] of [[320, 568], [390, 844]]) for (const rows of [
    ['제주불교성지 순례길 절로 가는길 - 정진의 길', '제주불교성지 순례길 절로 가는길 - 인욕의 길'],
    ['제주시 충혼묘지 4·3추모비(박진경 추도비)', '추사 유배길 - 2코스 인연의 길'],
  ]) {
    const { ctx, page } = await fresh({ width: w, height: h });
    await withNames(page, 'walk', [LEAD, ...rows]);
    await page.reload();
    await tapText(page, '[data-mood="walk"]');
    await waitCards(page);
    const got = await page.$$eval('#cards .card.row .name', (els) =>
      els.map((name) => {
        const n = name.getBoundingClientRect();
        const base = name.querySelector('.base');
        const alias = name.querySelector('.alias');
        const a = alias?.getBoundingClientRect();
        const range = document.createRange();
        if (alias) range.selectNodeContents(alias);
        return {
          text: name.textContent,
          alias: alias?.textContent ?? null,
          shown: !!a && a.height > 0 && a.bottom <= n.bottom + 0.5 && a.right <= n.right + 0.5,
          aliasLines: alias ? new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size : 0,
          aliasCut: !!alias && alias.scrollWidth > alias.clientWidth + 0.5,
          baseLines: base ? Math.round(base.getBoundingClientRect().height / parseFloat(getComputedStyle(base).lineHeight)) : 0,
          baseCut: !!base && (base.scrollHeight > base.clientHeight + 0.5 || base.scrollWidth > base.clientWidth + 0.5),
        };
      }),
    );
    assert(got.map((g) => g.text).join('|') === rows.join('|').replace('(박진경', ' (박진경'), `${w}: rows: ${got.map((g) => g.text).join(' | ')}`);
    for (const g of got) {
      assert(g.alias && g.shown && g.aliasLines === 1 && !g.aliasCut, `${w} "${g.text}": alias ${JSON.stringify(g.alias)} shown ${g.shown}, ${g.aliasLines} lines, cut ${g.aliasCut}`);
      assert(g.baseLines <= 2, `${w} "${g.text}": name ${g.baseLines} lines`);
      if (w === 390) assert(!g.baseCut, `390 "${g.text}": name cut though two lines hold it`);
    }
    await page.locator('#cards .card.row').first().scrollIntoViewIfNeeded();
    await shot(page, `row-names-${w}-${rows[0].slice(0, 4)}`);
    await ctx.close();
  }
});

// --- date mode (specs/date-mode.md D1–D6) ---
const SPOT_IDS = JSON.parse(readFileSync(join(appDir, 'public/spots.json'), 'utf8')).map((x) => x.id);
const seoulDay = (plus = 0) => new Date(Date.now() + 9 * 3600_000 + plus * 86_400_000).toISOString().slice(0, 10);
const addDaysIso = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayMeasure = () => {
  const de = document.documentElement;
  const small = [...document.querySelectorAll('button, input')]
    .filter((b) => b.offsetParent !== null && !b.closest('[inert]') && !b.closest('[hidden]') && !b.classList.contains('sr'))
    .map((b) => [b.dataset.action || b.className || b.textContent.trim().slice(0, 12), b.getBoundingClientRect()])
    .filter(([, r]) => r.height > 0 && r.height < 43.5)
    .map(([n, r]) => `${n}:${Math.round(r.height)}`);
  const sizes = new Set();
  const scope = document.querySelector('#sheet:not([hidden]) .sheet') ?? document.querySelector('main');
  for (const e of scope.querySelectorAll('*')) {
    if (e.closest('[hidden]') || e.closest('.sr') || e.offsetParent === null) continue;
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) sizes.add(getComputedStyle(e).fontSize);
  }
  const centred = [...document.querySelectorAll('main *, #sheet *')].filter((e) => e.offsetParent !== null && getComputedStyle(e).textAlign === 'center').length;
  return { over: de.scrollWidth - de.clientWidth, small, sizes: sizes.size, centred };
};
await check('D1-D6', 'date mode at 320·390·430 × light·dark: 언제 in the basis sheet, date in the label, hearts per day, saved list by day with 위로·아래로·다른 날로·빼기 kept across a reload; history balanced; no sideways scroll, every control ≥ 44px, ≤ 3 text sizes, nothing centred', async () => {
  const problems = [];
  const measure = async (page, label) => {
    const r = await page.evaluate(dayMeasure);
    if (r.over > 0) problems.push(`${label} overflows by ${r.over}px`);
    if (r.small.length) problems.push(`${label} small: ${r.small.join(',')}`);
    if (r.sizes > 3) problems.push(`${label} ${r.sizes} text sizes`);
    if (r.centred) problems.push(`${label} ${r.centred} centred`);
  };
  const [a, b, c, d] = SPOT_IDS;
  const today = seoulDay();
  const tomorrow = seoulDay(1);
  const sections = (page) =>
    page.$$eval('#savedView .day', (els) => els.map((s) => `${s.querySelector('.day-h').textContent}:${[...s.querySelectorAll('.card')].map((x) => x.dataset.id).join(',')}`).join(' / '));
  for (const width of [320, 390, 430])
    for (const dark of [false, true]) {
      const tag = `${width}-${dark ? 'dark' : 'light'}`;
      const { ctx, page } = await fresh({
        width,
        dark,
        storage: {
          'jeju.saved.v2': [
            { id: a, date: today, order: 0 },
            { id: b, date: today, order: 1 },
            { id: c, date: tomorrow, order: 0 },
            { id: d, date: seoulDay(-2), order: 0 },
          ],
        },
      });
      // D1: the first screen as before (the ♥ N is there because something is saved)
      const first = await page.$$eval('main button:not([hidden]), header button:not([hidden]), .top button:not([hidden])', (els) => els.filter((e) => e.offsetParent !== null).length);
      if (first !== 7) problems.push(`${tag} first screen has ${first} controls`);
      if ((await page.textContent('#basis')).trim() !== '여기 근처') problems.push(`${tag} label ${await page.textContent('#basis')}`);
      if ((await page.textContent('#saved')).trim() !== '3') problems.push(`${tag} ♥ ${await page.textContent('#saved')}`);
      // D2: 언제 → 내일
      await tapText(page, '#basis');
      await measure(page, `${tag} basis sheet`);
      const picker = await page.evaluate(() => {
        const i = document.querySelector('#sheet input[type="date"]');
        return { min: i.min, picker: typeof i.showPicker === 'function' };
      });
      if (picker.min !== today || !picker.picker) problems.push(`${tag} date input ${JSON.stringify(picker)}`);
      await tapText(page, `#sheet [data-when="${tomorrow}"]`);
      if (!(await visible(page, '#sheet .sheet'))) problems.push(`${tag} 내일 closed the sheet`);
      await tapText(page, '#sheet .sheet-close');
      await sleep(250);
      const label = (await page.textContent('#basis')).trim();
      if (label !== '내일 · 여기 근처') problems.push(`${tag} label "${label}"`);
      await tapText(page, '[data-mood="rest"]');
      await waitCards(page);
      await measure(page, `${tag} results`);
      const id = await page.locator('#cards .card').first().getAttribute('data-id');
      await page.locator('#cards .card .heart').first().click();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('jeju.saved.v2')));
      if (!stored.some((e) => e.id === id && e.date === tomorrow)) problems.push(`${tag} heart not on 내일`);
      // D3: by day
      await tapText(page, '#saved');
      await page.waitForSelector('#savedView .card:not(.ghost)');
      const want = `오늘:${a},${b} / 내일:${[c, id].filter((x, i, l) => l.indexOf(x) === i).join(',')} / 지난 날펼치기:`;
      if ((await sections(page)) !== want) problems.push(`${tag} sections ${await sections(page)}`);
      await measure(page, `${tag} saved`);
      await tapText(page, '#savedView [data-action="past"]');
      await measure(page, `${tag} saved past open`);
      await tapText(page, `#savedView .card[data-id="${a}"] [data-action="down"]`);
      await tapText(page, `#savedView .card[data-id="${b}"] [data-action="move-day"]`);
      const hs = await hstate(page);
      if (hs?.overlay !== 'move') problems.push(`${tag} move sheet history ${JSON.stringify(hs)}`);
      await measure(page, `${tag} move sheet`);
      await tapText(page, `#sheet [data-day="${tomorrow}"]`);
      await sleep(250);
      const focused = await page.evaluate(() => [document.activeElement?.dataset.action, document.activeElement?.dataset.id]);
      if (focused[0] !== 'move-day' || focused[1] !== b) problems.push(`${tag} focus after move ${focused}`);
      await tapText(page, `#savedView .card[data-id="${c}"] .heart`);
      const hb = await hstate(page);
      if (hb?.view !== 'saved' || hb?.overlay !== null) problems.push(`${tag} history after move ${JSON.stringify(hb)}`);
      if (width === 390 && !dark) await shot(page, 'date-saved-390-light');
      // across a reload: the order, the move and the removal stay; back pops saved → cards → first screen
      await page.reload();
      await page.waitForSelector('#savedView .card:not(.ghost)');
      const after = await sections(page);
      const want2 = `오늘:${a} / 내일:${[id, b].filter((x) => x !== c).join(',')} / 지난 날펼치기:`;
      if (after !== want2) problems.push(`${tag} after reload ${after} (want ${want2})`);
      // every back press does something: no entry left behind by the two sheets
      await back(page);
      const v1 = await page.evaluate(() => [history.state?.view, history.state?.overlay, !document.querySelector('#results').hidden]);
      await back(page);
      const v2 = await page.evaluate(() => [history.state?.view, history.state?.depth, !document.querySelector('#home').hidden]);
      if (v1.join() !== 'cards,,true' || v2.join() !== 'home,0,true') problems.push(`${tag} back: ${v1} then ${v2}`);
      await ctx.close();
    }
  assert(problems.length === 0, problems.join(' | '));
});

// --- 얼마나 (ADR-0060, specs/ranking.md R4) ---
await check('R4-range', '얼마나 at 320·390: right under the 어디 rows in the basis sheet (before the 동네 index; in view without scrolling at 390), 차로 30분 checked, each row ≥ 44px and tappable above the sticky 닫기; choosing one closes the sheet, keeps the label, re-picks the cards, history balanced; kept across a reload; no sideways scroll', async () => {
  const problems = [];
  for (const width of [320, 390]) {
    const tag = String(width);
    const { ctx, page } = await fresh({ width, height: width === 320 ? 568 : 844 });
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    const depth = (await hstate(page)).depth;
    await tapText(page, '#basis');
    const heads = await page.$$eval('#sheet .group-h > span:first-child', (els) => els.map((e) => e.textContent));
    if (heads.join() !== '언제,어디,얼마나,날씨,제주시 쪽,서귀포 쪽') problems.push(`${tag} groups ${heads}`);
    if (width === 390) {
      // right under 어디: all three range rows in view above the sticky 닫기 without scrolling the sheet
      const inView = await page.$eval('#sheet [data-reach="drive60"]', (b) => {
        const r = b.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= document.querySelector('#sheet .sheet-close').getBoundingClientRect().top + 0.5 && document.querySelector('#sheet .sheet').scrollTop === 0;
      });
      if (!inView) problems.push(`${tag} range needs a scroll`);
    }
    await page.locator('#sheet [data-reach="drive60"]').scrollIntoViewIfNeeded();
    const rows = await page.$$eval('#sheet [data-reach]', (els) =>
      els.map((b) => {
        const r = b.getBoundingClientRect();
        const close = document.querySelector('#sheet .sheet-close').getBoundingClientRect();
        return {
          reach: b.dataset.reach,
          label: b.querySelector('.nm').textContent,
          pressed: b.getAttribute('aria-pressed'),
          check: getComputedStyle(b.querySelector('.i-check')).visibility !== 'hidden' && getComputedStyle(b.querySelector('.i-check')).display !== 'none' && getComputedStyle(b.querySelector('.i-check')).opacity !== '0',
          weight: getComputedStyle(b.querySelector('.nm')).fontWeight,
          h: r.height,
          clear: r.bottom <= close.top + 0.5,
          bg: getComputedStyle(b).backgroundColor,
        };
      }),
    );
    if (rows.map((r) => r.label).join() !== '걸어서,차로 30분,차로 1시간') problems.push(`${tag} rows ${rows.map((r) => r.label)}`);
    for (const r of rows) {
      if (r.h < 43.5) problems.push(`${tag} ${r.reach} ${r.h}px`);
      if (!r.clear) problems.push(`${tag} ${r.reach} under 닫기`);
      if ((r.pressed === 'true') !== (r.reach === 'drive30')) problems.push(`${tag} pressed ${r.reach}=${r.pressed}`);
      if (r.check !== (r.reach === 'drive30')) problems.push(`${tag} check ${r.reach}=${r.check}`);
      if (r.bg !== 'rgba(0, 0, 0, 0)') problems.push(`${tag} ${r.reach} filled ${r.bg}`);
    }
    if (!(Number(rows.find((r) => r.reach === 'drive30')?.weight) > Number(rows.find((r) => r.reach === 'walk')?.weight))) problems.push(`${tag} chosen row not heavier`);
    const m = await page.evaluate(dayMeasure);
    if (m.over > 0) problems.push(`${tag} sheet overflows by ${m.over}px`);
    if (m.small.length) problems.push(`${tag} sheet small: ${m.small.join(',')}`);
    if (m.centred) problems.push(`${tag} ${m.centred} centred`);
    await tapText(page, '#sheet [data-reach="drive60"]');
    await sleep(250);
    if (await visible(page, '#sheet .sheet')) problems.push(`${tag} sheet still open`);
    await waitCards(page);
    const hs = await hstate(page);
    if (hs.depth !== depth || hs.overlay !== null || hs.view !== 'cards') problems.push(`${tag} history ${JSON.stringify(hs)}`);
    if ((await page.textContent('#basis')).trim() !== '여기 근처') problems.push(`${tag} label ${await page.textContent('#basis')}`);
    if ((await page.evaluate(() => localStorage.getItem('jeju.reach'))) !== '"drive60"') problems.push(`${tag} not stored`);
    const after = await names(page);
    if (after.length !== 3) problems.push(`${tag} ${after.length} cards`);
    const text = await page.evaluate(() => document.body.innerText + document.body.innerHTML);
    if (/score|점수|별점|★/i.test(text)) problems.push(`${tag} score on screen`);
    const r = await page.evaluate(dayMeasure);
    if (r.over > 0) problems.push(`${tag} results overflow ${r.over}px`);
    // across a reload: the range stays chosen and the cards picked in it come back
    await page.reload();
    await waitCards(page);
    if ((await names(page)).join() !== after.join()) problems.push(`${tag} reload cards ${await names(page)} (was ${after})`);
    await tapText(page, '#basis');
    const pressed = await page.$$eval('#sheet [data-reach][aria-pressed="true"]', (els) => els.map((e) => e.dataset.reach));
    if (pressed.join() !== 'drive60') problems.push(`${tag} after reload pressed ${pressed}`);
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- 익명 사용 기록 (ADR-0061, specs/usage-events.md U1) ---
await check('U1-no-events', 'VITE_EVENTS_URL unset (this build): a mood, a heart, the map link (네이버지도), the saved list (no note, no 기록 끄기) and hiding the page make no request but to this origin, the photo host and the link hosts; sendBeacon is never called', async () => {
  const LINK_HOSTS = ['map.naver.com', 'm.map.naver.com', 'map.kakao.com', 'place.map.kakao.com', 'www.myrealtrip.com'];
  const allowed = new Set([new URL(BASE).host, 'api.cdn.visitjeju.net', ...LINK_HOSTS]);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR' });
  await ctx.addInitScript(GEO_STUB);
  await ctx.addInitScript(() => {
    const real = navigator.sendBeacon?.bind(navigator);
    window.__beacons = 0;
    navigator.sendBeacon = (...a) => {
      window.__beacons++;
      return real ? real(...a) : false;
    };
  });
  await ctx.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
  for (const h of LINK_HOSTS) await ctx.route(`https://${h}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
  const seen = [];
  ctx.on('request', (r) => {
    if (r.url().startsWith('data:') || r.url().startsWith('about:')) return;
    seen.push({ host: new URL(r.url()).host, method: r.method(), url: r.url() });
  });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await tapText(page, '[data-mood="rest"]');
  await waitCards(page);
  await tapText(page, '#cards .card.lead .heart');
  const popup = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await page.locator('#cards .card.lead .card-link').click();
  await (await popup)?.close();
  await sleep(350);
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .foot');
  const noted = await visible(page, '#savedView .track');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await sleep(500);
  const beacons = await page.evaluate(() => window.__beacons);
  await ctx.close();
  const other = seen.filter((r) => !allowed.has(r.host));
  const posts = seen.filter((r) => r.method !== 'GET');
  assert(seen.some((r) => LINK_HOSTS.includes(r.host)), 'the map link did not open (nothing exercised)');
  assert(other.length === 0, `requests elsewhere: ${other.map((r) => r.url).join(', ')}`);
  assert(posts.length === 0, `non-GET requests: ${posts.map((r) => `${r.method} ${r.url}`).join(', ')}`);
  assert(beacons === 0, `sendBeacon called ${beacons}×`);
  assert(!noted, 'the note / 기록 끄기 shows though nothing is collected');
});

// --- QA r4 ---
/** The next 12월 25일 that is neither today nor tomorrow: the longest date label. */
const xmasDay = () => {
  const t = seoulDay();
  let d = `${t.slice(0, 4)}-12-25`;
  if (d <= seoulDay(1)) d = `${Number(t.slice(0, 4)) + 1}-12-25`;
  return d;
};
await check('QA4-label', 'top bar with a date label (12월 25일 · 서귀포 시내 근처) at 320 × 150%·200% and 390 × 200%: no sideways scroll, the label wraps instead of running off screen (no ellipsis), ♥ N stays on the same bar, both ≥ 44px', async () => {
  const problems = [];
  for (const [width, pct] of [[320, 150], [320, 200], [390, 200]]) {
    const tag = `${width}×${pct}%`;
    const { ctx, page } = await fresh({ width, height: 700, storage: { 'jeju.when': xmasDay(), 'jeju.basis': 'region', 'jeju.region': '서귀포시내', 'jeju.saved.v2': [{ id: SPOT_IDS[0], date: seoulDay(), order: 0 }] } });
    await page.addStyleTag({ content: `html { font-size: ${pct}% }` });
    await sleep(100);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const b = document.querySelector('#basis');
      const text = b.querySelector('span');
      const br = b.getBoundingClientRect();
      const sr = document.querySelector('#saved').getBoundingClientRect();
      const top = document.querySelector('.top').getBoundingClientRect();
      return {
        label: text.textContent,
        sw: de.scrollWidth,
        cw: de.clientWidth,
        right: br.right,
        textRight: text.getBoundingClientRect().right,
        cut: text.scrollWidth > text.clientWidth + 1 || getComputedStyle(text).textOverflow === 'ellipsis',
        h: br.height,
        sh: sr.height,
        sameBar: sr.top < br.bottom && sr.bottom > br.top && sr.bottom <= top.bottom + 0.5,
        savedRight: sr.right,
        // the day and its "·" on one line: no line of the label starts with "·"
        dayLines: text.querySelector('.nw')?.getClientRects().length ?? 0,
      };
    });
    if (r.label !== '12월 25일 · 서귀포 시내 근처') problems.push(`${tag} label "${r.label}"`);
    if (r.sw !== r.cw) problems.push(`${tag} scrollWidth ${r.sw} ≠ ${r.cw}`);
    if (r.right > r.cw + 0.5 || r.textRight > r.cw + 0.5) problems.push(`${tag} label right edge ${Math.round(r.textRight)} off screen (${r.cw})`);
    if (r.savedRight > r.cw + 0.5) problems.push(`${tag} ♥ off screen`);
    if (r.cut) problems.push(`${tag} label cut`);
    if (r.dayLines !== 1) problems.push(`${tag} "12월 25일 ·" on ${r.dayLines} lines`);
    if (!r.sameBar) problems.push(`${tag} ♥ N not on the label's bar`);
    if (r.h < 43.5 || r.sh < 43.5) problems.push(`${tag} heights ${r.h}/${r.sh}`);
    if (width === 320 && pct === 200) await shot(page, 'label-320-200');
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

await check('QA4-datein', 'no showPicker: 날짜 고르기 shows the date field with 이 날로 (min today, max +365); typing a day digit by digit applies nothing until 이 날로 or Enter; out of range is ignored — in the 다른 날로 sheet and the basis sheet 언제', async () => {
  const problems = [];
  const today = seoulDay();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', reducedMotion: 'reduce' });
  await ctx.addInitScript(GEO_STUB);
  await ctx.addInitScript(() => {
    delete HTMLInputElement.prototype.showPicker;
  });
  await ctx.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
  const page = await ctx.newPage();
  await page.goto(BASE);
  const [a, b] = SPOT_IDS;
  await page.evaluate(
    ({ a, b, today }) => {
      localStorage.clear();
      localStorage.setItem('jeju.saved.v2', JSON.stringify([{ id: a, date: today, order: 0 }, { id: b, date: today, order: 1 }]));
    },
    { a, b, today },
  );
  await page.reload();
  const saved = () => page.evaluate(() => localStorage.getItem('jeju.saved.v2'));
  const open = () => visible(page, '#sheet .sheet');
  const field = async (tag) => {
    const f = await page.evaluate(() => {
      const i = document.querySelector('#sheet input[type="date"]');
      const ok = document.querySelector('#sheet [data-action="day-ok"]');
      const ir = i.getBoundingClientRect();
      const or = ok?.getBoundingClientRect();
      return { min: i.min, max: i.max, shown: ir.width > 1 && ir.height >= 43.5, focused: document.activeElement === i, ok: ok && !ok.hidden && or.height >= 43.5 ? ok.textContent : null, okTbtn: ok?.classList.contains('tbtn'), okRight: or?.right, vw: innerWidth };
    });
    if (f.min !== today || f.max !== addDaysIso(today, 365)) problems.push(`${tag} min/max ${f.min}/${f.max}`);
    if (!f.shown || !f.focused) problems.push(`${tag} field shown ${f.shown} focused ${f.focused}`);
    if (f.ok !== '이 날로' || !f.okTbtn || f.okRight > f.vw) problems.push(`${tag} confirm ${f.ok} tbtn ${f.okTbtn}`);
  };
  // The field's segment order follows the browser's own language (not the page locale): find it, then type
  // year and month first and the day last, a digit at a time — its first digit already makes a whole date.
  const probe = await ctx.newPage();
  let order = null;
  for (const o of ['ymd', 'mdy', 'dmy']) {
    await probe.setContent('<input type="date">');
    await probe.focus('input');
    await probe.keyboard.type([...o].map((c) => ({ y: '2003', m: '11', d: '02' })[c]).join(''));
    if ((await probe.inputValue('input')) === '2003-11-02') order = o;
  }
  await probe.close();
  assert(order, 'could not tell the date field order');
  const typeDay = async (day, tag, still) => {
    const [y, m, d] = day.split('-');
    for (const [seg, digits] of [['y', y], ['m', m], ['d', d]]) {
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < order.indexOf(seg); i++) await page.keyboard.press('ArrowRight');
      for (const k of digits) {
        await page.keyboard.type(k);
        await sleep(80);
        if (!(await still())) {
          problems.push(`${tag} applied after typing ${seg} "${k}"`);
          await ctx.close();
          assert(false, problems.join(' | '));
        }
      }
    }
  };
  /** The 15th/25th of a month to come: the day's first digit alone ("1"/"2") is still a day from today on. */
  const monthAhead = (n, dd) => {
    const [y, m] = today.split('-').map(Number);
    return `${new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)}-${dd}`;
  };
  // 다른 날로
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card:not(.ghost)');
  await tapText(page, `#savedView .card[data-id="${a}"] [data-action="move-day"]`);
  await tapText(page, '#sheet [data-action="pick-day"]');
  await field('move');
  const before = await saved();
  const target = monthAhead(1, '15');
  await typeDay(target, 'move', async () => (await open()) && (await saved()) === before);
  if ((await page.inputValue('#sheet input[type="date"]')) !== target) problems.push(`move typed value ${await page.inputValue('#sheet input[type="date"]')}`);
  // out of range: ignored, nothing moves
  await page.fill('#sheet input[type="date"]', seoulDay(400));
  await tapText(page, '#sheet [data-action="day-ok"]');
  if (!(await open()) || (await saved()) !== before) problems.push('move: a day past +365 was applied');
  await page.fill('#sheet input[type="date"]', target);
  await tapText(page, '#sheet [data-action="day-ok"]');
  await sleep(250);
  if (await open()) problems.push('move: 이 날로 left the sheet open');
  const moved = JSON.parse(await saved());
  if (!moved.some((e) => e.id === a && e.date === target)) problems.push(`move: not moved ${JSON.stringify(moved)}`);
  // 기준 sheet 언제
  await tapText(page, '#basis');
  await tapText(page, '#sheet [data-action="pick-day"]');
  await field('basis');
  const label0 = (await page.textContent('#basis')).trim();
  const when = monthAhead(2, '25');
  await typeDay(when, 'basis', async () => (await page.evaluate(() => localStorage.getItem('jeju.when'))) === null && (await page.textContent('#basis')).trim() === label0);
  await page.keyboard.press('Enter');
  await sleep(200);
  const stored = await page.evaluate(() => localStorage.getItem('jeju.when'));
  if (stored !== JSON.stringify(when)) problems.push(`basis: Enter did not apply (${stored})`);
  if (!(await page.textContent('#basis')).includes('일 · ')) problems.push(`basis label ${await page.textContent('#basis')}`);
  if (!(await open())) problems.push('basis: the sheet closed');
  await ctx.close();
  assert(problems.length === 0, problems.join(' | '));
});

await check('QA4-when-row', '언제 is one compact row (지금 · 내일 · 날짜 고르기, each ≥ 44px, check and weight, no fill): at 320×568 the 어디 heading is in view on open and 얼마나 is reachable above 닫기', async () => {
  const problems = [];
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const tag = `${width}×${height}`;
    const { ctx, page } = await fresh({ width, height });
    await tapText(page, '#basis');
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('#sheet .sheet');
      const close = document.querySelector('#sheet .sheet-close').getBoundingClientRect();
      const cells = [...document.querySelectorAll('#sheet [data-when], #sheet [data-action="pick-day"]')].map((b) => {
        const x = b.getBoundingClientRect();
        return { t: b.querySelector('.nm').textContent, top: Math.round(x.top), h: x.height, bg: getComputedStyle(b).backgroundColor, pressed: b.getAttribute('aria-pressed'), w: getComputedStyle(b.querySelector('.nm')).fontWeight, check: getComputedStyle(b.querySelector('.i-check')).display !== 'none' };
      });
      const where = document.querySelector('#where-h').getBoundingClientRect();
      return { cells, whereIn: where.top >= sheet.getBoundingClientRect().top && where.bottom <= close.top + 0.5, scrollTop: sheet.scrollTop };
    });
    if (r.cells.map((c) => c.t).join() !== '지금,내일,날짜 고르기') problems.push(`${tag} cells ${r.cells.map((c) => c.t)}`);
    if (new Set(r.cells.map((c) => c.top)).size !== 1) problems.push(`${tag} 언제 not one row: tops ${r.cells.map((c) => c.top)}`);
    for (const c of r.cells) {
      if (c.h < 43.5) problems.push(`${tag} ${c.t} ${c.h}px`);
      if (c.bg !== 'rgba(0, 0, 0, 0)') problems.push(`${tag} ${c.t} filled`);
      if ((c.pressed === 'true') !== c.check || (c.pressed === 'true') !== (c.w === '600')) problems.push(`${tag} ${c.t} pressed ${c.pressed} check ${c.check} weight ${c.w}`);
    }
    if (!r.whereIn || r.scrollTop !== 0) problems.push(`${tag} 어디 heading not in view on open`);
    await page.locator('#sheet [data-reach="drive60"]').scrollIntoViewIfNeeded();
    const reach = await page.$eval('#sheet [data-reach="drive60"]', (b) => b.getBoundingClientRect().bottom <= document.querySelector('#sheet .sheet-close').getBoundingClientRect().top + 0.5);
    if (!reach) problems.push(`${tag} 얼마나 not reachable`);
    const m = await page.evaluate(dayMeasure);
    if (m.over > 0 || m.small.length || m.centred) problems.push(`${tag} measure ${JSON.stringify(m)}`);
    if (width === 320) await shot(page, 'basis-sheet-320');
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- hit areas of the controls tapped most (design.md T2) ---
// A control's hit area is its box joined with any absolutely positioned ::before/::after it draws (the card's
// own whole-card link excepted, which lies under everything on purpose).
const hitMeasure = (targetSel) => {
  const layer = document.querySelector('#sheet:not([hidden]) .sheet') ?? document;
  const shown = (e) => e.offsetParent !== null && !e.closest('[inert]') && !e.closest('[hidden]') && !e.classList.contains('sr') && (layer === document ? !e.closest('#sheet') : true);
  const area = (el) => {
    const r = el.getBoundingClientRect();
    const b = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (el.matches('.card-link')) return b;
    for (const p of ['::before', '::after']) {
      const cs = getComputedStyle(el, p);
      if (cs.content === 'none' || cs.position !== 'absolute' || cs.pointerEvents === 'none') continue;
      const v = (k) => (Number.isFinite(parseFloat(cs[k])) ? parseFloat(cs[k]) : 0);
      b.left = Math.min(b.left, r.left + v('left'));
      b.top = Math.min(b.top, r.top + v('top'));
      b.right = Math.max(b.right, r.right - v('right'));
      b.bottom = Math.max(b.bottom, r.bottom - v('bottom'));
    }
    return b;
  };
  const label = (e) => `${e.dataset.action || e.dataset.when || e.dataset.sub || e.className}"${e.textContent.trim().slice(0, 8)}"`;
  const targets = [...layer.querySelectorAll(targetSel)].filter(shown);
  const others = [...layer.querySelectorAll('button, a[href], input')].filter((e) => shown(e) && !e.matches('.card-link'));
  const small = [];
  const overlap = [];
  const blocked = [];
  for (const t of targets) {
    t.scrollIntoView({ block: 'center' });
    const a = area(t);
    const w = a.right - a.left;
    const h = a.bottom - a.top;
    if (w < 47.5 || h < 47.5) small.push(`${label(t)} ${Math.round(w)}×${Math.round(h)}`);
    for (const o of others) {
      if (o === t || o.contains(t) || t.contains(o)) continue;
      const b = area(o);
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 0.5 && y > 0.5) overlap.push(`${label(t)} × ${label(o)} ${Math.round(x)}×${Math.round(y)}`);
    }
    // every point of the area reaches this control (nothing covers part of it)
    let miss = 0;
    for (let x = a.left + 0.5; x < a.right; x += 2)
      for (let y = a.top + 0.5; y < a.bottom; y += 2) if (document.elementFromPoint(x, y)?.closest('button, a, input') !== t) miss++;
    if (miss) blocked.push(`${label(t)} ${miss} points`);
  }
  scrollTo(0, 0);
  const de = document.documentElement;
  const sheet = document.querySelector('#sheet:not([hidden]) .sheet');
  return { n: targets.length, small, overlap, blocked, over: de.scrollWidth - de.clientWidth, sheetOver: sheet ? sheet.scrollWidth - sheet.clientWidth : 0 };
};
await check('T2-hit', 'at 320·390: card heart, 길찾기, 바꾸기·돌아가기, 식사 tabs, 언제 options, 위로·아래로·다른 날로, 이 날로 each reach a ≥ 48×48 area that no other control overlaps or covers; drawn size unchanged (44); no sideways scroll', async () => {
  const problems = [];
  const today = seoulDay();
  const [a, b, c] = SPOT_IDS;
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', locale: 'ko-KR' });
    await ctx.addInitScript(GEO_STUB);
    // no date picker: 날짜 고르기 shows the date field and 이 날로 under the 언제 row
    await ctx.addInitScript(() => {
      delete HTMLInputElement.prototype.showPicker;
    });
    await ctx.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(
      ({ a, b, c, today }) => {
        localStorage.clear();
        localStorage.setItem('jeju.saved.v2', JSON.stringify([a, b, c].map((id, order) => ({ id, date: today, order }))));
      },
      { a, b, c, today },
    );
    await page.reload();
    const want = {};
    const measure = async (tag, sel, n) => {
      const r = await page.evaluate(hitMeasure, sel);
      if (r.n < n) problems.push(`${width} ${tag}: ${r.n} targets (want ≥ ${n})`);
      for (const k of ['small', 'overlap', 'blocked']) if (r[k].length) problems.push(`${width} ${tag} ${k}: ${r[k].join(', ')}`);
      if (r.over > 0 || r.sheetOver > 0) problems.push(`${width} ${tag} overflows ${r.over}/${r.sheetOver}`);
      const drawn = await page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => Math.round(e.getBoundingClientRect().height)));
      want[tag] = drawn;
    };
    await tapText(page, '[data-mood="food"]');
    await waitCards(page);
    await measure('results', '.card .heart, .card .go, #results .change, #foodSub .tab', 3 + 3 + 1 + 2);
    await tapText(page, '#saved');
    await page.waitForSelector('#savedView .card:not(.ghost)');
    await measure('saved', '#savedView .heart, #savedView .go, #savedView .back, #savedView .ctl .tbtn', 3 + 3 + 1 + 7);
    await tapText(page, '#basis');
    await tapText(page, '#sheet [data-action="pick-day"]');
    await measure('basis sheet', '#sheet .when-row .opt, #sheet [data-action="day-ok"]', 3 + 1);
    if (width === 320) await shot(page, 'hit-basis-320');
    await tapText(page, '#sheet .sheet-close');
    await sleep(450);
    await tapText(page, `#savedView .card[data-id="${b}"] [data-action="move-day"]`);
    await tapText(page, '#sheet [data-action="pick-day"]');
    await measure('move sheet', '#sheet [data-action="day-ok"]', 1);
    // the drawn buttons keep their 44px (only the hit area grew)
    for (const [tag, hs] of Object.entries(want)) if (hs.some((h) => h !== 44)) problems.push(`${width} ${tag} drawn heights ${hs}`);
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- ADR-0064, specs/new-sub.md N4: 새로운 거 섞어서 · 구경 · 체험 ---
await check('N4-new-tabs', '새로운 거 at 320·390: 섞어서 · 구경 · 체험 under the head (섞어서 pressed), each tab a ≥ 48×48 area no other control overlaps, drawn 44; each tab shows 3 cards of its kind, no sideways scroll; the tab survives a reload; history unchanged by a tab', async () => {
  const problems = [];
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const { ctx, page } = await fresh({ width, height });
    await tapText(page, '[data-mood="new"]');
    await waitCards(page);
    const labels = await page.$$eval('#newSub .tab', (els) => els.map((e) => `${e.textContent}:${e.getAttribute('aria-pressed')}`));
    if (labels.join() !== '섞어서:true,구경:false,체험:false') problems.push(`${width} tabs ${labels}`);
    if (await visible(page, '#foodSub')) problems.push(`${width} food tabs shown`);
    const r = await page.evaluate(hitMeasure, '#newSub .tab');
    if (r.n !== 3) problems.push(`${width}: ${r.n} tab targets`);
    for (const k of ['small', 'overlap', 'blocked']) if (r[k].length) problems.push(`${width} ${k}: ${r[k].join(', ')}`);
    const drawn = await page.$$eval('#newSub .tab', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    if (drawn.some((h) => h !== 44)) problems.push(`${width} drawn ${drawn}`);
    const depth = (await hstate(page)).depth;
    const kinds = () =>
      page.evaluate(async () => {
        const subOf = new Map((await (await fetch('/spots.json')).json()).map((x) => [x.id, x.sub]));
        return [...document.querySelectorAll('#cards .card:not(.ghost)')].map((c) => subOf.get(c.dataset.id));
      });
    for (const sub of ['sight', 'do', 'mix']) {
      await tapText(page, `#newSub [data-sub="${sub}"]`);
      await waitCards(page);
      const now = await kinds();
      if (now.length !== 3) problems.push(`${width} ${sub}: ${now.length} cards`);
      if (sub !== 'mix' && now.some((k) => k !== sub)) problems.push(`${width} ${sub}: cards of kind ${now}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) problems.push(`${width} ${sub} overflows ${over}`);
      if ((await page.getAttribute(`#newSub [data-sub="${sub}"]`, 'aria-pressed')) !== 'true') problems.push(`${width} ${sub} not pressed`);
      if (width === 390 && sub === 'sight') await shot(page, '12-new-tabs');
    }
    if ((await hstate(page)).depth !== depth) problems.push(`${width} a tab pushed history`);
    await tapText(page, '#newSub [data-sub="do"]');
    await waitCards(page);
    const doing = await names(page);
    await page.reload();
    await waitCards(page);
    if ((await page.getAttribute('#newSub [data-sub="do"]', 'aria-pressed')) !== 'true') problems.push(`${width} reload lost 체험`);
    if ((await names(page)).join() !== doing.join()) problems.push(`${width} reload changed the cards`);
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- ADR-0065, specs/indoor.md I4: 비 와요(실내만) ---
await check('I4-indoor', '비 와요(실내만) at 320·390: one row under 얼마나 (off), a ≥ 48×48 area no other control overlaps; on, the sheet closes, history unchanged, 3 indoor cards each saying 실내, no sideways scroll; kept across a reload (session); off again, no 실내', async () => {
  const problems = [];
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const { ctx, page } = await fresh({ width, height });
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    if ((await page.$$('#cards .indoor')).length) problems.push(`${width} 실내 while off`);
    const depth = (await hstate(page)).depth;
    await tapText(page, '#basis');
    const row = await page.$eval('#sheet [data-indoor]', (b) => `${b.querySelector('.nm').textContent}:${b.getAttribute('aria-pressed')}:${b.closest('.opts').getAttribute('aria-labelledby')}`);
    if (row !== '비 와요(실내만):false:weather-h') problems.push(`${width} row ${row}`);
    const r = await page.evaluate(hitMeasure, '#sheet [data-indoor]');
    if (r.n !== 1) problems.push(`${width}: ${r.n} toggle targets`);
    // like every sheet row (얼마나, 어디), the rounded corners of its pressed face are not the button: only the
    // area and overlap are measured here, and the row's middle must reach it
    for (const k of ['small', 'overlap']) if (r[k].length) problems.push(`${width} ${k}: ${r[k].join(', ')}`);
    const mid = await page.$eval('#sheet [data-indoor]', (b) => {
      b.scrollIntoView({ block: 'center' });
      const q = b.getBoundingClientRect();
      return document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest('button') === b && q.height >= 48;
    });
    if (!mid) problems.push(`${width} toggle covered or under 48`);
    if (r.over > 0 || r.sheetOver > 0) problems.push(`${width} sheet overflows ${r.over}/${r.sheetOver}`);
    if (width === 390) await shot(page, '13-indoor-sheet');
    await page.locator('#sheet [data-indoor]').scrollIntoViewIfNeeded();
    await tapText(page, '#sheet [data-indoor]');
    await sleep(250);
    if (await visible(page, '#sheet .sheet')) problems.push(`${width} sheet still open`);
    await waitCards(page);
    const hs = await hstate(page);
    if (hs.depth !== depth || hs.overlay !== null || hs.view !== 'cards') problems.push(`${width} history ${JSON.stringify(hs)}`);
    if ((await page.evaluate(() => sessionStorage.getItem('jeju.indoor'))) !== 'true') problems.push(`${width} not kept for the session`);
    if ((await page.evaluate(() => localStorage.getItem('jeju.indoor'))) !== null) problems.push(`${width} kept on the device`);
    const look = () =>
      page.evaluate(async () => {
        const indoorOf = new Map((await (await fetch('/spots.json')).json()).map((x) => [x.id, x.indoor]));
        const de = document.documentElement;
        return {
          cards: [...document.querySelectorAll('#cards .card:not(.ghost)')].map((c) => ({ indoor: indoorOf.get(c.dataset.id), word: c.querySelector('.meta .indoor')?.textContent ?? null, metas: c.querySelectorAll('.meta').length })),
          over: de.scrollWidth - de.clientWidth,
        };
      });
    const on = await look();
    if (on.cards.length !== 3) problems.push(`${width} ${on.cards.length} cards`);
    for (const c of on.cards) {
      if (c.indoor !== true) problems.push(`${width} an outdoor card`);
      if (c.word !== '실내') problems.push(`${width} card says ${c.word}`);
      if (c.metas !== 1) problems.push(`${width} ${c.metas} meta lines`);
    }
    if (on.over > 0) problems.push(`${width} results overflow ${on.over}`);
    if (width === 390) await shot(page, '14-indoor-cards');
    const shown = await names(page);
    await page.reload();
    await waitCards(page);
    if ((await names(page)).join() !== shown.join()) problems.push(`${width} reload changed the cards`);
    if ((await look()).cards.some((c) => c.word !== '실내')) problems.push(`${width} reload lost 실내`);
    await tapText(page, '#basis');
    await page.locator('#sheet [data-indoor]').scrollIntoViewIfNeeded();
    await tapText(page, '#sheet [data-indoor]');
    await sleep(250);
    await waitCards(page);
    if ((await look()).cards.some((c) => c.word !== null)) problems.push(`${width} 실내 after off`);
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- ADR-0066, specs/market-days.md M4: 오일장 장날 ---
await check('M4-market', '오일장 at 320·390 on 2026-10-02 (KST): 구경 cards near 제주시 are markets, each with one meta line starting with its day words (제주민속 오늘 장 서는 날, 함덕 장날: 1·6일), no sideways scroll; 날짜 모드 10/6 turns 함덕 into 이날 장 서는 날', async () => {
  const problems = [];
  const all = JSON.parse(readFileSync(join(appDir, 'public/spots.json'), 'utf8'));
  const only = JSON.stringify(all.filter((s) => s.market || s.mood === 'rest'));
  const byName = new Map(all.filter((s) => s.market).map((s) => [s.name, s.id]));
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const { ctx, page } = await fresh({ width, height });
    await page.clock.setFixedTime(new Date('2026-10-02T09:00:00+09:00'));
    await ctx.route((u) => u.pathname.endsWith('/spots.json'), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: only }));
    await page.reload();
    await tapText(page, '[data-mood="new"]');
    await waitCards(page);
    await tapText(page, '[data-sub="sight"]');
    await waitCards(page);
    const look = () =>
      page.evaluate(() => {
        const de = document.documentElement;
        return {
          cards: [...document.querySelectorAll('#cards .card:not(.ghost)')].map((c) => ({
            id: c.dataset.id,
            word: c.querySelector('.meta .market')?.textContent ?? null,
            first: c.querySelector('.meta')?.firstElementChild?.className ?? null,
            metas: c.querySelectorAll('.meta').length,
          })),
          over: de.scrollWidth - de.clientWidth,
        };
      });
    const now = await look();
    if (now.cards.length !== 3) problems.push(`${width} ${now.cards.length} cards`);
    for (const c of now.cards) {
      if (!c.word) problems.push(`${width} a card without its day words`);
      if (c.first !== 'market') problems.push(`${width} meta starts with ${c.first}`);
      if (c.metas !== 1) problems.push(`${width} ${c.metas} meta lines`);
    }
    const word = (cards, name) => cards.find((c) => c.id === byName.get(name))?.word;
    if (word(now.cards, '제주민속오일시장') !== '오늘 장 서는 날') problems.push(`${width} 제주민속 says ${word(now.cards, '제주민속오일시장')}`);
    if (word(now.cards, '함덕민속오일시장') !== '장날: 1·6일') problems.push(`${width} 함덕 says ${word(now.cards, '함덕민속오일시장')}`);
    if (now.over > 0) problems.push(`${width} results overflow ${now.over}`);
    if (width === 390) await shot(page, '15-market-cards');
    await page.evaluate(() => localStorage.setItem('jeju.when', JSON.stringify('2026-10-06')));
    await page.reload();
    await waitCards(page);
    const dated = await look();
    if (word(dated.cards, '함덕민속오일시장') !== '이날 장 서는 날') problems.push(`${width} 날짜 모드 함덕 says ${word(dated.cards, '함덕민속오일시장')}`);
    if (dated.over > 0) problems.push(`${width} dated overflow ${dated.over}`);
    await ctx.close();
  }
  assert(problems.length === 0, problems.join(' | '));
});

// --- ADR-0063: hosting (no SPA fallback, 404.html, absolute paths) and keeping saves without a login ---
const KAKAO_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5';
await check('K-404', 'an unknown address gets 404.html (status 404, a way home), never a blank page; /privacy is a page; with the worker installed a 404 stays a 404; index.html served at a deep address (a fallback) runs the app (absolute asset paths)', async () => {
  const deep = `${BASE}nope/deep`;
  const r = await fetch(deep, { headers: { accept: 'text/html' } });
  assert(r.status === 404, `status ${r.status}`);
  const priv = await fetch(`${BASE}privacy`);
  assert(priv.status === 200 && (await priv.text()).includes('개인정보 처리 안내'), `/privacy ${priv.status}`);
  const { ctx, page } = await fresh({ sw: true });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 8000 });
  await waitCards(await (async () => (await tapText(page, '[data-mood="rest"]'), page))()); // the data is cached now
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const res = await page.goto(deep);
  assert(res.status() === 404, `deep link with the worker: ${res.status()}`);
  assert((await page.textContent('h1')) === '없는 주소예요.', '404 page not shown');
  await shot(page, '11-404');
  await page.click('a.tbtn');
  await page.waitForSelector('#home:not([hidden]) .mood');
  assert(new URL(page.url()).pathname === '/', `home link went to ${page.url()}`);
  await ctx.close();
  // The review's blank page: a host SPA fallback (or the worker's offline shell) serving index.html at a deep
  // address. With absolute asset paths the app runs there.
  const shell = readFileSync(join(appDir, 'dist/index.html'));
  const spa = await fresh();
  spa.page.on('pageerror', (e) => errors.push(String(e)));
  await spa.page.route(deep, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: shell }));
  await spa.page.goto(deep);
  await spa.page.waitForSelector('#home .mood');
  await tapText(spa.page, '[data-mood="walk"]');
  await waitCards(spa.page);
  await spa.ctx.close();
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
});

await check('K-backup', 'saved list (390 light): 링크로 백업 copies a #s= link, the attribution and the privacy link are in its footer; that link opened in another browser asks to merge (hash cleared), 합치기 brings the places over', async () => {
  const today = seoulDay();
  const [a, b, c] = SPOT_IDS;
  const { ctx, page } = await fresh({ storage: { 'jeju.saved.v2': [a, b].map((id, order) => ({ id, date: today, order })).concat([{ id: c, date: seoulDay(1), order: 0 }]) } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  await tapText(page, '#saved');
  await page.waitForSelector('#savedView .card:not(.ghost)');
  await tapText(page, '#savedView [data-action="backup"]');
  await page.waitForFunction(() => document.querySelector('#backupNote').textContent.length > 0);
  const note = await page.textContent('#backupNote');
  assert(note.startsWith('링크를 복사했어요.'), `note: ${note}`);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert(link.startsWith(`${BASE}#s=`), `copied ${link}`);
  assert((await page.textContent('#savedView .about .credit')) === '정보·사진: 비짓제주(제주관광공사) · visitjeju.net', 'no attribution');
  const site = await page.$eval('#savedView .about .credit a', (a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, color: getComputedStyle(a).color, p: getComputedStyle(a.parentElement).color, line: getComputedStyle(a).textDecorationLine }));
  assert(site.href === 'https://www.visitjeju.net' && site.target === '_blank' && site.rel === 'noopener', `site link ${JSON.stringify(site)}`);
  assert(site.color === site.p && site.line === 'underline', `site link look ${JSON.stringify(site)}`);
  assert((await page.getAttribute('#savedView .about > a', 'href')) === '/privacy', 'no privacy link');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await sleep(100);
  const footer = await page.evaluate(() => {
    const vh = innerHeight;
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return ['#savedView .foot', '#savedView .backup', '#savedView .about'].every((s) => r(s).top >= 0 && r(s).bottom <= vh);
  });
  assert(footer, 'footer not in view at the bottom');
  await shot(page, '11-saved-footer');
  await ctx.close();
  // another browser (a fresh context = its own storage): one place already here
  const other = await fresh({ storage: { 'jeju.saved.v2': [{ id: b, date: today, order: 0 }] } });
  await other.page.goto(link);
  await other.page.waitForSelector('#homeNote:not([hidden]) [data-action="restore-merge"]');
  assert(new URL(other.page.url()).hash === '', `hash left in the address: ${other.page.url()}`);
  const ask = await other.page.textContent('#homeNote p');
  assert(ask === '링크에 저장한 곳이 3곳 있어요. 이 기기에 합칠까요?', `prompt: ${ask}`);
  const sizes = await other.page.evaluate(() => [...new Set([...document.querySelectorAll('#home *')].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize))]);
  assert(sizes.length <= 3, `first screen text sizes: ${sizes}`);
  const small = await other.page.$$eval('#homeNote .tbtn', (els) => els.filter((e) => e.getBoundingClientRect().height < 48).length);
  assert(small === 0, 'a notice button under 48px');
  await shot(other.page, '11-restore');
  await tapText(other.page, '#homeNote [data-action="restore-merge"]');
  const done = await other.page.textContent('#homeNote p');
  assert(done === '2곳을 합쳤어요. 맨 위 하트 버튼에 모여요.', `done: ${done}`);
  const stored = await other.page.evaluate(() => JSON.parse(localStorage.getItem('jeju.saved.v2')).length);
  assert(stored === 3, `stored ${stored}`);
  await other.ctx.close();
});

await check('K-inapp', 'KakaoTalk in-app browser: one calm notice under the moods with 브라우저로 열기 (kakaotalk:// link) and 닫기; closed, it stays closed after a reload', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ko-KR', userAgent: KAKAO_UA });
  await ctx.addInitScript(GEO_STUB);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('#homeNote:not([hidden])');
  assert((await page.textContent('#homeNote p')) === '카카오톡 안에서 저장한 곳은 카카오톡에만 남아요.', 'notice text');
  const href = await page.getAttribute('#homeNote a[data-action="inapp-open"]', 'href');
  assert(href === `kakaotalk://web/openExternal?url=${encodeURIComponent(BASE)}`, `href ${href}`);
  const layout = await page.evaluate(() => {
    const de = document.documentElement;
    const n = document.querySelector('#homeNote').getBoundingClientRect();
    const any = document.querySelector('.any').getBoundingClientRect();
    return { over: de.scrollWidth - de.clientWidth, below: n.top >= any.bottom, left: Math.round(n.left), inView: n.bottom <= innerHeight, align: getComputedStyle(document.querySelector('#homeNote p')).textAlign };
  });
  assert(layout.over === 0 && layout.below && layout.left === 16 && layout.inView && layout.align !== 'center', JSON.stringify(layout));
  await shot(page, '11-inapp');
  await tapText(page, '#homeNote [data-action="inapp-close"]');
  assert(!(await visible(page, '#homeNote')), 'not closed');
  await page.reload();
  await page.waitForSelector('#home .mood');
  assert(!(await visible(page, '#homeNote')), 'came back after a reload');
  await ctx.close();
});

await check('DR-go', '길찾기 (ADR-0067) at 320·390 × light·dark: one per card on the results and the saved list, one line, drawn 44 (its 48 hit area: T2-hit), inside its card, Kakao car-directions link; no sideways scroll', async () => {
  const problems = [];
  for (const width of [320, 390])
    for (const dark of [false, true]) {
      const { ctx, page } = await fresh({ width, height: width === 320 ? 568 : 844, dark, storage: { 'jeju.region': '성산', 'jeju.basis': 'region', 'jeju.hintSeen': true } });
      const measure = (sel) =>
        page.$$eval(sel, (cards) => {
          const de = document.documentElement;
          return {
            over: de.scrollWidth - de.clientWidth,
            cards: cards.map((c) => {
              const go = c.querySelectorAll('a.go');
              const a = go[0];
              if (!a) return { n: 0 };
              a.scrollIntoView({ block: 'center' });
              const r = a.getBoundingClientRect();
              const cr = c.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(a);
              return {
                n: go.length,
                h: r.height,
                lines: new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size,
                inCard: r.right <= cr.right + 0.5 && r.left >= cr.left - 8.5,
                href: a.getAttribute('href'),
                hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('a') === a,
              };
            }),
          };
        });
      const tag = `${width} ${dark ? 'dark' : 'light'}`;
      await tapText(page, '[data-mood="new"]');
      await waitCards(page);
      await tapText(page, '#cards .card .heart');
      for (const [where, sel] of [['results', '#cards .card:not(.ghost)'], ['saved', '#savedView .card:not(.ghost)']]) {
        if (where === 'saved') {
          await tapText(page, '#saved');
          await page.waitForSelector(sel);
        }
        await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel);
        const r = await measure(sel);
        if (r.over > 0) problems.push(`${tag} ${where} overflows ${r.over}px`);
        for (const c of r.cards) {
          if (c.n !== 1) problems.push(`${tag} ${where}: ${c.n} 길찾기`);
          else if (Math.round(c.h) !== 44 || c.lines !== 1 || !c.inCard || !c.hit || !/^https:\/\/map\.naver\.com\/p\/directions\/-\/126\.\d+,33\.\d+,[^/]+,,\/-\/(car|walk)$/.test(c.href)) problems.push(`${tag} ${where}: ${JSON.stringify(c)}`);
        }
      }
      if (width === 320 && !dark) await shot(page, 'go-saved-320');
      await ctx.close();
    }
  assert(!problems.length, problems.join(' | '));
});

await check('DR-ferry', '길찾기 (ADR-0069, ADR-0071) at 320·390: the 차귀도 card from 한경 says 배 타는 곳까지 길찾기 on one line, drawn 44, to the pier; with 걸어서 from 구제주 the food cards take Naver walking directions (no start); no sideways scroll', async () => {
  const problems = [];
  for (const width of [320, 390]) {
    for (const reach of ['drive30', 'walk']) {
      const { ctx, page } = await fresh({ width, height: width === 320 ? 568 : 844, storage: { 'jeju.region': reach === 'walk' ? '구제주' : '한경', 'jeju.basis': 'region', 'jeju.reach': reach, 'jeju.hintSeen': true } });
      await tapText(page, reach === 'walk' ? '[data-mood="food"]' : '[data-mood="new"]');
      await waitCards(page);
      const r = await page.$$eval('#cards .card:not(.ghost) a.go', (as) => {
        const de = document.documentElement;
        return {
          over: de.scrollWidth - de.clientWidth,
          go: as.map((a) => {
            a.scrollIntoView({ block: 'center' });
            const b = a.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(a);
            return { text: a.textContent, href: a.getAttribute('href'), h: Math.round(b.height), lines: new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size };
          }),
        };
      });
      const tag = `${width} ${reach}`;
      if (r.over > 0) problems.push(`${tag} overflows ${r.over}px`);
      for (const g of r.go) if (g.h !== 44 || g.lines !== 1) problems.push(`${tag}: ${JSON.stringify(g)}`);
      if (reach === 'drive30') {
        const ferry = r.go.filter((g) => g.text === '배 타는 곳까지 길찾기');
        if (ferry.length !== 1 || ferry[0].href !== 'https://map.naver.com/p/directions/-/126.16537,33.30931,' + encodeURIComponent('자구내포구 차귀도 유람선') + ',,/-/car') problems.push(`${tag} ferry: ${JSON.stringify(r.go)}`);
      } else if (!r.go.every((g) => /^https:\/\/map\.naver\.com\/p\/directions\/-\/126\.\d+,33\.\d+,[^/]+,,\/-\/walk$/.test(g.href))) problems.push(`${tag} no walking link: ${JSON.stringify(r.go)}`);
      if (width === 320 && reach === 'drive30') await shot(page, 'go-ferry-320');
      await ctx.close();
    }
  }
  assert(!problems.length, problems.join(' | '));
});

await check('DL-open', 'deep link /?mood=walk&area=aewol&reach=drive60&indoor=1 opens the results for 애월 (no location asked), the query leaves the address, a reload keeps the same 3, back = the moods', async () => {
  const { ctx, page } = await fresh({ geo: { mode: 'deny' } });
  await page.goto(`${BASE}?mood=walk&area=aewol&reach=drive60&indoor=1`);
  await waitCards(page);
  const first = await names(page);
  const url = new URL(page.url());
  assert(url.search === '' && url.pathname === '/', `address ${page.url()}`);
  const label = await page.textContent('#basis');
  assert(label.includes('애월'), `label ${label}`);
  const indoor = await page.$$eval('#cards .card .indoor', (e) => e.length);
  assert(indoor >= 1, `실내 ${indoor}`);
  await page.reload();
  await waitCards(page);
  assert(JSON.stringify(await names(page)) === JSON.stringify(first), 'reload changed the cards');
  await back(page);
  assert((await hstate(page))?.view === 'home' && (await visible(page, '#home .mood')), `back: ${JSON.stringify(await hstate(page))}`);
  await ctx.close();
});

// --- 지도 앱 (ADR-0071) and ♥ N open as an underline (ADR-0070, decided) ---
await check('MA-line', '지도 앱 (ADR-0071) at 320·390, light·dark: 지도 앱 · 네이버지도 · 카카오맵 · TMAP on one line at the foot of 저장한 곳, each 44 tall, no sideways scroll; not on the first screen; 카카오맵 tapped = underlined, kept after a reload, and the cards open Kakao', async () => {
  const problems = [];
  for (const width of [320, 390]) {
    for (const dark of [false, true]) {
      const { ctx, page } = await fresh({ width, dark, storage: { 'jeju.region': '애월', 'jeju.basis': 'region', 'jeju.hintSeen': true } });
      const tag = `${width} ${dark ? 'dark' : 'light'}`;
      if (await page.$('#home .mapapp, #results .mapapp')) problems.push(`${tag}: the setting is outside 저장한 곳`);
      await tapText(page, '[data-mood="rest"]');
      await waitCards(page);
      await tapText(page, '#cards .card .heart');
      await tapText(page, '#saved');
      await page.waitForSelector('#savedView .card:not(.ghost)');
      const m = await page.evaluate(() => {
        const box = document.querySelector('#savedView .mapapp');
        box.scrollIntoView({ block: 'center' });
        const items = [box.querySelector('p'), ...box.querySelectorAll('button')].map((e) => e.getBoundingClientRect());
        const de = document.documentElement;
        return { over: de.scrollWidth - de.clientWidth, tops: items.map((r) => Math.round(r.top + r.height / 2)), hs: items.slice(1).map((r) => Math.round(r.height)) };
      });
      if (m.over > 0) problems.push(`${tag}: overflows ${m.over}px`);
      if (new Set(m.tops).size !== 1) problems.push(`${tag}: not one line ${JSON.stringify(m.tops)}`);
      if (m.hs.some((h) => h < 44)) problems.push(`${tag}: heights ${m.hs}`);
      if (width === 320 && !dark) await shot(page, 'map-app-320');
      if (width === 390 && !dark) {
        await tapText(page, '#savedView [data-app="kakao"]');
        await page.reload();
        await page.waitForSelector('#savedView .card:not(.ghost)');
        const k = await page.evaluate(() => {
          const b = document.querySelector('#savedView [data-app="kakao"]');
          const cs = getComputedStyle(b);
          return { pressed: b.getAttribute('aria-pressed'), line: cs.textDecorationLine, thick: cs.textDecorationThickness, href: document.querySelector('#savedView .card-link').getAttribute('href'), dest: document.querySelector('#savedView .dest')?.textContent };
        });
        if (k.pressed !== 'true' || !k.line.includes('underline') || k.thick !== '3px') problems.push(`${tag} kakao chosen: ${JSON.stringify(k)}`);
        if (!/^https:\/\/(place\.map|map)\.kakao\.com\//.test(k.href) || k.dest !== '카카오맵') problems.push(`${tag} kakao links: ${JSON.stringify(k)}`);
      }
      await ctx.close();
    }
  }
  assert(!problems.length, problems.join(' | '));
});

await check('HN-open', '♥ N open (ADR-0070, decided): no fill, a 3px main-colour underline like a tab; the heart measured on what is really under it ≥ 3:1 in light and dark', async () => {
  const problems = [];
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const dark of [false, true]) {
    const { ctx, page } = await fresh({ dark, storage: { 'jeju.region': '애월', 'jeju.basis': 'region', 'jeju.hintSeen': true } });
    await tapText(page, '[data-mood="rest"]');
    await waitCards(page);
    await tapText(page, '#cards .card .heart');
    await tapText(page, '#saved');
    await page.waitForSelector('#savedView .card:not(.ghost)');
    await page.mouse.move(0, 0);
    const r = await page.evaluate(() => {
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 4).map(Number);
      const btn = document.querySelector('#saved');
      const under = (el) => {
        for (let e = el; e; e = e.parentElement) {
          const c = rgb(getComputedStyle(e).backgroundColor);
          if (c.length < 4 || c[3] > 0) return c.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const after = getComputedStyle(btn, '::after');
      return {
        pressed: btn.getAttribute('aria-pressed'),
        own: getComputedStyle(btn).backgroundColor,
        heart: rgb(getComputedStyle(btn.querySelector('svg')).color).slice(0, 3),
        ground: under(btn),
        rule: { w: after.borderBottomWidth, c: rgb(after.borderBottomColor).slice(0, 3), content: after.content },
      };
    });
    const tag = dark ? 'dark' : 'light';
    const heart = ratio(r.heart, r.ground);
    const rule = ratio(r.rule.c, r.ground);
    console.log(`      HN-open ${tag}: heart ${heart.toFixed(2)}:1, underline ${rule.toFixed(2)}:1 on rgb(${r.ground})`);
    if (r.pressed !== 'true') problems.push(`${tag}: not pressed`);
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(r.own)) problems.push(`${tag}: filled ${r.own}`);
    if (r.rule.w !== '3px' || r.rule.content === 'none') problems.push(`${tag}: rule ${JSON.stringify(r.rule)}`);
    if (heart < 3) problems.push(`${tag}: heart ${heart.toFixed(2)}`);
    if (rule < 3) problems.push(`${tag}: underline ${rule.toFixed(2)}`);
    if (!dark) await shot(page, 'saved-open-underline');
    await ctx.close();
  }
  assert(!problems.length, problems.join(' | '));
});

// --- static landing pages (ADR-0072, specs/seo-landing.md): built by scripts/build-landing.mjs ---
await check('LP1', 'hub → area → place: 200, no script, fits 390px (light and dark), every link on them answers; the deep link opens the app on that area', async () => {
  const problems = [];
  for (const dark of [false, true]) {
    const { ctx, page } = await fresh({ dark });
    const tag = dark ? 'dark' : 'light';
    const visit = async (path) => {
      const res = await page.goto(new URL(path, BASE).href);
      if (res?.status() !== 200) problems.push(`${tag} ${path}: ${res?.status()}`);
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scripts: [...document.scripts].filter((s) => s.type !== 'application/ld+json').length,
        h1: document.querySelectorAll('h1').length,
        bg: getComputedStyle(document.body).backgroundColor,
        links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')),
      }));
      if (r.overflow > 0) problems.push(`${tag} ${path}: ${r.overflow}px sideways`);
      if (r.scripts) problems.push(`${tag} ${path}: ${r.scripts} script(s)`);
      if (r.h1 !== 1) problems.push(`${tag} ${path}: ${r.h1} h1`);
      if (r.bg !== (dark ? 'rgb(15, 19, 25)' : 'rgb(255, 255, 255)')) problems.push(`${tag} ${path}: background ${r.bg}`);
      return r.links;
    };
    const hubLinks = await visit('/jeju/');
    if (!dark) await shot(page, 'landing-hub-390-light');
    const areaLinks = await visit('/jeju/aewol/');
    if (!dark) await shot(page, 'landing-area-390-light');
    const place = areaLinks.find((h) => /^\/jeju\/aewol\/[a-z0-9-]+\/$/.test(h) && !/\/(rest|walk|new|food)\/$/.test(h));
    const placeLinks = await visit(place);
    if (!dark) await shot(page, 'landing-place-390-light');
    if (!dark) {
      const all = [...new Set([...hubLinks, ...areaLinks.slice(0, 80), ...placeLinks])];
      const bad = await page.evaluate(async (hrefs) => {
        const out = [];
        for (const h of hrefs) {
          const r = await fetch(h, { redirect: 'manual' });
          if (r.status !== 200) out.push(`${h} ${r.status}`);
        }
        return out;
      }, all);
      problems.push(...bad.map((b) => `link ${b}`));
      // 앱에서 근처 3곳 받기 → /?area=aewol&mood=… → the app's results for 애월
      await page.goto(new URL(place, BASE).href);
      await page.locator('a[href^="/?area=aewol&mood="]').first().click();
      await waitCards(page);
      const label = await page.textContent('#basis');
      if (!label.includes('애월')) problems.push(`deep link opened on "${label}"`);
    }
    await ctx.close();
  }
  assert(!problems.length, problems.join(' | '));
});

await check('LP2', 'the service worker leaves /jeju/** alone: not cached, and offline it is not answered with the app shell', async () => {
  const { ctx, page } = await fresh({ sw: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await sleep(300);
  await page.goto(new URL('/jeju/', BASE).href);
  const cached = await page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (new URL(r.url).pathname.startsWith('/jeju')) out.push(r.url);
    return out;
  });
  assert(!cached.length, `cached: ${cached.join(', ')}`);
  await ctx.setOffline(true);
  const shell = await page
    .goto(new URL('/jeju/aewol/', BASE).href, { timeout: 8000 })
    .then(() => page.locator('[data-mood="rest"]').count())
    .catch(() => 0);
  await ctx.setOffline(false);
  assert(shell === 0, 'offline /jeju/aewol/ got the app shell');
  await ctx.close();
});

await check('LP3', 'an address under /jeju/ that is no page: 404 with the 404 page, which links home and to /jeju/', async () => {
  const { ctx, page } = await fresh();
  const res = await page.goto(new URL('/jeju/aewol/no-such-place/', BASE).href);
  assert(res?.status() === 404, `status ${res?.status()}`);
  const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')));
  assert(hrefs.includes('/') && hrefs.includes('/jeju/'), `links ${hrefs}`);
  await ctx.close();
});

await browser.close();
server.kill();

const width = Math.max(...results.map((r) => r.id.length));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(width)}  ${r.name}${r.ok ? '' : `\n      → ${r.err}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
process.exit(failed ? 1 : 0);
