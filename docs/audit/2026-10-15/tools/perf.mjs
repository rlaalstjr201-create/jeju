// 여차나 렉 점검 (docs/audit/2026-10-15/criteria.md §2): 운영 주소, 375×812 DPR2 터치, CPU 4배 느림, 동작마다 5번.
// 본 측정은 한 번만 돌린다. `--smoke` 는 스크립트 점검용(세션 1개·짧은 반복)이고 그 수치는 쓰지 않는다.
// playwright-core 는 tests/e2e/browser.e2e.mjs 와 같이 전역 npm 에서 가져온다(저장소에 의존성이 없다).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GLOBAL = 'C:/Users/rlaal/AppData/Roaming/npm/node_modules';
const pw = createRequire(join(GLOBAL, 'noop.js'))('playwright-core');
const PW_VERSION = JSON.parse(readFileSync(join(GLOBAL, 'playwright-core/package.json'), 'utf8')).version;

const argv = process.argv.slice(2);
const SMOKE = argv.includes('--smoke');
const OUT = (argv.find((a) => a.startsWith('--out=')) ?? '').slice(6) || join(here, SMOKE ? 'smoke.json' : 'run.json');
const TRACE_OUT = join(here, SMOKE ? 'smoke-trace.json' : 'run-trace.json');
const ORIGIN = 'https://yeochana.com';
const START = `${ORIGIN}/?area=aewol&reach=drive30`;
const MOODS = SMOKE ? ['walk'] : ['rest', 'walk', 'new', 'food', 'any'];
const LEAK_MOOD = 'food';
const MORE_N = SMOKE ? 3 : 30;
const RATE = 4;
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
// 기록 끄기(ADR-0061, store.ts KEYS.track): JSON false. 아래 차단은 그 위에 한 겹 더(요청이 생기면 막히고 기록된다).
const OPT_OUT = { name: 'jeju.track', value: 'false' };
// Cloudflare Web Analytics: its script (static.cloudflareinsights.com) loads for every visitor whatever 기록 says, so it
// stays (its cost is part of a real first visit); only its report (/cdn-cgi/rum) is blocked, so throttled visits do not
// land in the site's own statistics.
const BLOCK_URLS = ['*yeochana.com/api/events*', '*yeochana.com/api/feedback*', '*/cdn-cgi/rum*', '*google-analytics.com*', '*googletagmanager.com*', '*analytics.google.com*', '*doubleclick.net*', '*wcs.naver*', '*wcs.pstatic.net*'];
// smoke only: a harmless URL on the same list, fetched once, shows the block list really applies
if (SMOKE) BLOCK_URLS.push('*yeochana.com/robots.txt*');
const FORBIDDEN = /\/api\/(events|feedback)|\/cdn-cgi\/rum|google-analytics|googletagmanager|analytics\.google|doubleclick|wcs\.(naver|pstatic)/;
const HOST_RULES = ['www.googletagmanager.com', '*.google-analytics.com', 'analytics.google.com', '*.doubleclick.net', 'wcs.naver.com', 'wcs.naver.net', 'wcs.pstatic.net']
  .map((h) => `MAP ${h} ~NOTFOUND`)
  .join(', ');
// 판정 규칙(측정 전 고정)
const RULES = {
  interactionMs: 200,
  domRatio: 1.5,
  heapBytes: 5_000_000,
  longTaskMs: 50,
  longTasksMax: 1,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);

// ---------------------------------------------------------------- in-page instrumentation (before any page script)
function INIT() {
  if (window.__perf) return;
  const P = (window.__perf = { lt: [], loaf: [], ev: [], inputs: [], paint: [], lcp: [], err: [], homeMoreAt: null, cur: null, last: null });
  const desc = (t) => {
    try {
      if (!t || !t.tagName) return t ? String(t.nodeName) : null;
      let s = t.tagName.toLowerCase();
      if (t.id) s += '#' + t.id;
      const c = t.getAttribute('class');
      if (c) s += '.' + c.trim().split(/\s+/).join('.');
      const a = t.getAttribute('data-mood') || t.getAttribute('data-action');
      if (a) s += '[' + a + ']';
      return s;
    } catch (e) {
      return '?';
    }
  };
  const po = (type, fn, extra) => {
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) fn(e);
      }).observe(Object.assign({ type, buffered: true }, extra || {}));
    } catch (e) {
      P.err.push(type + ': ' + (e && e.message));
    }
  };
  po('longtask', (e) =>
    P.lt.push({ s: e.startTime, d: e.duration, attr: Array.from(e.attribution || []).map((a) => ({ n: a.name, ct: a.containerType, cs: a.containerSrc, ci: a.containerId, cn: a.containerName })) }),
  );
  po('long-animation-frame', (e) =>
    P.loaf.push({
      s: e.startTime,
      d: e.duration,
      rs: e.renderStart,
      sls: e.styleAndLayoutStart,
      bd: e.blockingDuration,
      fui: e.firstUIEventTimestamp,
      scripts: Array.from(e.scripts || []).map((x) => ({ s: x.startTime, d: x.duration, es: x.executionStart, inv: x.invoker, it: x.invokerType, url: x.sourceURL, fn: x.sourceFunctionName, cp: x.sourceCharPosition, fsl: x.forcedStyleAndLayoutDuration, pd: x.pauseDuration })),
    }),
  );
  po('event', (e) => P.ev.push({ n: e.name, s: e.startTime, ps: e.processingStart, pe: e.processingEnd, d: e.duration, id: e.interactionId, t: desc(e.target) }), { durationThreshold: 16 });
  po('paint', (e) => P.paint.push({ n: e.name, s: e.startTime }));
  po('largest-contentful-paint', (e) => P.lcp.push({ s: e.startTime, rt: e.renderTime, lt: e.loadTime, size: e.size, url: e.url, el: desc(e.element) }));
  const onInput = (e) => {
    P.inputs.push({ t: e.type, ts: e.timeStamp, at: performance.now(), tgt: desc(e.target) });
    const c = P.cur;
    if (c && !c.started && (e.type === 'touchstart' || e.type === 'pointerdown')) {
      c.started = true;
      c.t0 = e.timeStamp;
      requestAnimationFrame(c.loop);
    }
  };
  for (const t of ['touchstart', 'pointerdown', 'touchend', 'pointerup', 'click']) addEventListener(t, onInput, { capture: true, passive: true });
  const watchHome = () => {
    const hm = document.getElementById('homeMore');
    if (!hm) return;
    const hit = () => {
      if (P.homeMoreAt == null && hm.childElementCount > 0) {
        P.homeMoreAt = performance.now();
        console.debug('__perf_home');
        return true;
      }
      return false;
    };
    if (hit()) return;
    const mo = new MutationObserver(() => {
      if (hit()) mo.disconnect();
    });
    mo.observe(hm, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchHome);
  else watchHome();
  const cardIds = () =>
    Array.from(document.querySelectorAll('#cards .card[data-id]:not(.ghost)'))
      .map((c) => c.getAttribute('data-id'))
      .join(',');
  const shown = (el) => !!el && !el.hidden && !el.closest('[hidden]');
  P.arm = (kind, sel) => {
    const before = { ids: cardIds() };
    const target = sel ? document.querySelector(sel) : null;
    if (kind === 'heart') before.pressed = target ? target.getAttribute('aria-pressed') : null;
    const cond = () => {
      if (kind === 'mood') return shown(document.getElementById('results')) && document.querySelectorAll('#cards .card[data-id]:not(.ghost)').length >= 3;
      if (kind === 'more') {
        const now = cardIds();
        return now !== '' && now !== before.ids && now.split(',').length >= 3;
      }
      if (kind === 'heart') return !!target && target.getAttribute('aria-pressed') !== before.pressed;
      if (kind === 'sheet') {
        const sh = document.getElementById('sheet');
        return !!sh && !sh.hidden && !!sh.querySelector('.sheet');
      }
      return false;
    };
    const c = { kind, armAt: performance.now(), ev0: P.ev.length, in0: P.inputs.length, lt0: P.lt.length, loaf0: P.loaf.length, ic0: performance.interactionCount, t0: null, started: false, domAt: null, rafAt: null, paintAt: null, frames: 0, animEndAt: null, timeout: false, before };
    const mo = new MutationObserver(() => {
      if (c.domAt == null && cond()) c.domAt = performance.now();
    });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'hidden'] });
    const finish = () => {
      mo.disconnect();
      c.ic1 = performance.interactionCount;
      P.cur = null;
      P.last = c;
      console.debug('__perf_done');
    };
    c.loop = () => {
      c.frames++;
      if (c.domAt == null && cond()) c.domAt = performance.now();
      if (c.domAt != null) {
        c.rafAt = performance.now();
        const ch = new MessageChannel();
        ch.port1.onmessage = () => {
          c.paintAt = performance.now();
          finish();
        };
        ch.port2.postMessage(0);
        return;
      }
      if (performance.now() - c.armAt > 15000) {
        c.timeout = true;
        finish();
        return;
      }
      requestAnimationFrame(c.loop);
    };
    if (kind === 'sheet') {
      const onEnd = (e) => {
        const t = e.target;
        if (c.animEndAt == null && t && t.classList && t.classList.contains('sheet')) {
          c.animEndAt = performance.now();
          document.removeEventListener('animationend', onEnd, true);
        }
      };
      document.addEventListener('animationend', onEnd, true);
    }
    P.cur = c;
    return { before, hasTarget: !!target };
  };
}

// ---------------------------------------------------------------- browser
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true, args: [`--host-resolver-rules=${HOST_RULES}`] });
const out = {
  meta: {
    when: new Date().toISOString(),
    smoke: SMOKE,
    url: START,
    playwright: PW_VERSION,
    browser: browser.version(),
    channel: 'chrome (headless)',
    ua: UA,
    viewport: '375x812',
    dpr: 2,
    touch: true,
    cpuThrottle: RATE,
    serviceWorkers: 'block',
    optOut: `localStorage ${OPT_OUT.name}=${OPT_OUT.value} via context storageState (before load)`,
    blocked: { cdpBlockedURLs: BLOCK_URLS, hostResolverRules: HOST_RULES },
    moods: MOODS,
    leakMood: LEAK_MOOD,
    moreTaps: MORE_N,
    rules: RULES,
    method: {
      interaction:
        'Event Timing interactionId duration (max over the tap’s entries, INP definition) when the target DOM state was reached inside the click handler (MutationObserver time ≤ click processingEnd); otherwise rAF+MessageChannel after the frame that first shows it, measured from the tap’s touchstart/pointerdown timeStamp.',
      tap: 'page.touchscreen.tap at the element centre (CDP Input.dispatchTouchEvent), no Playwright actionability during the measured window',
      longTask:
        'From navigation start to just before the first tap: PerformanceObserver longtask entries (>50ms), attributed with long-animation-frame scripts (sourceURL host; third-party when ≥50% of the script time in the task is another host), plus every long-animation-frame whose rendering phase (frame end − renderStart) is >50ms with no longtask entry over it (one rendering task the Long Tasks API did not report; ours unless third-party rAF scripts dominate).',
      calibration: 'same page at the end of each visit: the loop 5× at rate 4, then 5× at rate 1; slowdown = median of the last 3 at rate 4 / median of the last 3 at rate 1.',
      memory: 'CDP HeapProfiler.collectGarbage ×2, then Performance.getMetrics (JSHeapUsedSize, Nodes, JSEventListeners), Memory.getDOMCounters, in-page element counts.',
    },
  },
  env: {},
  sessions: [],
  leak: null,
  trace: null,
  results: null,
  errors: [],
};
const save = () => writeFileSync(OUT, JSON.stringify(out, null, 1));

async function newSession() {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    serviceWorkers: 'block',
    storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: [OPT_OUT] }] },
  });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await cdp.send('Network.enable');
  let blockedVia = 'urls';
  try {
    await cdp.send('Network.setBlockedURLs', { urls: BLOCK_URLS });
  } catch (e) {
    blockedVia = 'urlPatterns';
    await cdp.send('Network.setBlockedURLs', { urlPatterns: BLOCK_URLS.map((u) => ({ urlPattern: u.replace(/\*/g, '*'), block: true })) });
  }
  const net = { requests: [], failed: [], finished: [] };
  page.on('request', (r) => net.requests.push({ url: r.url(), type: r.resourceType(), method: r.method() }));
  page.on('requestfailed', (r) => net.failed.push({ url: r.url(), err: r.failure()?.errorText }));
  page.on('requestfinished', (r) => {
    r.sizes()
      .then((s) => net.finished.push({ url: r.url(), type: r.resourceType(), body: s.responseBodySize }))
      .catch(() => undefined);
  });
  return { ctx, page, cdp, net, blockedVia };
}

const waitConsole = (page, text, timeout) => page.waitForEvent('console', { predicate: (m) => m.text() === text, timeout });

/** Images that are on screen (in the viewport, not hidden) have finished, or `timeout` passed. */
async function imagesSettled(page, timeout = 8000) {
  const t = Date.now();
  const ok = await page
    .waitForFunction(
      () =>
        Array.from(document.images)
          .filter((i) => {
            if (!i.isConnected || i.closest('[hidden]')) return false;
            const r = i.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.width > 0;
          })
          .every((i) => i.complete),
      null,
      { polling: 300, timeout },
    )
    .then(() => true)
    .catch(() => false);
  return { ok, ms: Date.now() - t };
}

async function load(s) {
  const home = waitConsole(s.page, '__perf_home', 90000);
  home.catch(() => undefined);
  const t = Date.now();
  await s.page.goto(START, { waitUntil: 'load', timeout: 90000 });
  const loadMs = Date.now() - t;
  await home;
  const img = await imagesSettled(s.page, 10000);
  await sleep(2500);
  return { loadWallMs: loadMs, imagesSettled: img };
}

async function snapshotFirst(page) {
  return page.evaluate(() => {
    const P = window.__perf;
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource').map((e) => ({ n: e.name, it: e.initiatorType, s: e.startTime, re: e.responseEnd, d: e.duration, ts: e.transferSize, eb: e.encodedBodySize, db: e.decodedBodySize }));
    const trackBtn = document.querySelector('#savedView [data-action="track"]');
    return {
      now: performance.now(),
      homeMoreAt: P.homeMoreAt,
      lt: P.lt.slice(),
      loaf: P.loaf.slice(),
      paint: P.paint.slice(),
      lcp: P.lcp.slice(),
      err: P.err.slice(),
      nav: nav && { rs: nav.responseStart, re: nav.responseEnd, di: nav.domInteractive, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, ts: nav.transferSize, eb: nav.encodedBodySize },
      res,
      dom: { elements: document.getElementsByTagName('*').length, images: document.images.length },
      checks: {
        track: localStorage.getItem('jeju.track'),
        trackBtn: trackBtn && trackBtn.textContent,
        gtag: typeof window.gtag,
        wcs: typeof window.wcs,
        dataLayer: Array.isArray(window.dataLayer),
        basis: (document.querySelector('#basis') || {}).textContent,
        url: location.href,
        swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      },
    };
  });
}

function resetBuffers(page) {
  return page.evaluate(() => {
    const P = window.__perf;
    P.ev = [];
    P.inputs = [];
    P.lt = [];
    P.loaf = [];
  });
}

/** One measured tap. `kind`: mood | more | heart | sheet. */
async function measure(s, kind, sel) {
  const { page } = s;
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
  await sleep(300);
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${sel}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const armed = await page.evaluate(([k, q]) => window.__perf.arm(k, q), [kind, sel]);
  const done = waitConsole(page, '__perf_done', 20000);
  done.catch(() => undefined);
  await page.touchscreen.tap(x, y);
  await done;
  await sleep(kind === 'sheet' ? 900 : 700); // Event Timing / LoAF entries (and the sheet's animationend) arrive after the frame
  const r = await page.evaluate(() => {
    const P = window.__perf;
    const c = P.last;
    return {
      armAt: c.armAt,
      t0: c.t0,
      domAt: c.domAt,
      rafAt: c.rafAt,
      paintAt: c.paintAt,
      frames: c.frames,
      animEndAt: c.animEndAt,
      timeout: c.timeout,
      ic0: c.ic0,
      ic1: c.ic1,
      ev: P.ev.slice(c.ev0),
      inputs: P.inputs.slice(c.in0),
      lt: P.lt.slice(c.lt0),
      loaf: P.loaf.slice(c.loaf0),
      cards: Array.from(document.querySelectorAll('#cards .card[data-id]:not(.ghost)')).map((e) => e.getAttribute('data-id')),
      scrollY: scrollY,
    };
  });
  await resetBuffers(page);
  return { kind, sel, tapAt: { x: r1(x), y: r1(y) }, armed, ...evaluateTap(r), raw: r };
}

/** The rule fixed before measuring (meta.method.interaction). */
function evaluateTap(r) {
  if (r.timeout || r.t0 == null || r.paintAt == null) return { value: null, method: 'failed', note: r.timeout ? 'target state not reached in 15s' : 'tap not seen' };
  const click = r.ev.find((e) => e.n === 'click' && e.id > 0) ?? null;
  const iid = click ? click.id : (r.ev.find((e) => e.id > 0) ?? {}).id ?? null;
  const entries = iid ? r.ev.filter((e) => e.id === iid) : [];
  const inp = entries.length ? Math.max(...entries.map((e) => e.d)) : null;
  const domInHandler = click && r.domAt != null ? r.domAt <= click.pe + 1 : null;
  const raf = r.paintAt - r.t0;
  const overlap = (a0, a1) => (x) => x.s < a1 && x.s + x.d > a0;
  const loaf = r.loaf.filter(overlap(r.t0, r.paintAt + 50));
  const lt = r.lt.filter(overlap(r.t0, r.paintAt + 50));
  const base = {
    inp,
    rafMs: r1(raf),
    domMs: r.domAt != null ? r1(r.domAt - r.t0) : null,
    domInHandler,
    click: click && { start: r1(click.s - r.t0), procStart: r1(click.ps - r.t0), procEnd: r1(click.pe - r.t0), d: click.d },
    entries: entries.map((e) => ({ n: e.n, d: e.d, s: r1(e.s - r.t0), ps: r1(e.ps - r.t0), pe: r1(e.pe - r.t0) })),
    interactionCountDelta: r.ic1 != null && r.ic0 != null ? r.ic1 - r.ic0 : null,
    animEndMs: r.animEndAt != null ? r1(r.animEndAt - r.t0) : null,
    longTasks: lt.map((x) => ({ s: r1(x.s - r.t0), d: r1(x.d) })),
    loaf: loaf.map((f) => ({
      s: r1(f.s - r.t0),
      d: r1(f.d),
      renderStart: r1(f.rs - r.t0),
      styleLayoutStart: r1(f.sls - r.t0),
      blocking: r1(f.bd),
      scripts: f.scripts.map((x) => ({ inv: x.inv, it: x.it, url: x.url, fn: x.fn, d: r1(x.d), fsl: r1(x.fsl), s: r1(x.s - r.t0) })),
    })),
  };
  if (inp != null && domInHandler) return { value: inp, method: 'event-timing', ...base };
  return { value: r1(raf), method: inp == null ? 'raf (no Event Timing entry ≥16ms)' : 'raf (DOM changed after the click handler)', ...base };
}

async function settleAfter(page, ms = 1500) {
  const img = await imagesSettled(page, 8000);
  await sleep(ms);
  return img;
}

async function snapshotImages(page) {
  return page.evaluate(() => {
    const res = new Map(performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img').map((e) => [e.name, e]));
    return Array.from(document.images)
      .filter((i) => i.isConnected)
      .map((i) => {
        const e = res.get(i.currentSrc || i.src);
        return {
          src: i.currentSrc || i.src,
          where: i.closest('#cards') ? 'cards' : i.closest('#home') ? 'home' : 'other',
          hidden: !!i.closest('[hidden]'),
          loading: i.getAttribute('loading'),
          fetchpriority: i.getAttribute('fetchpriority'),
          complete: i.complete,
          nw: i.naturalWidth,
          nh: i.naturalHeight,
          cw: i.clientWidth,
          ch: i.clientHeight,
          dur: e ? Math.round(e.duration) : null,
        };
      });
  });
}

const CAL = () => {
  const t = performance.now();
  let x = 0;
  for (let i = 0; i < 1e7; i++) x += Math.sqrt(i);
  return [performance.now() - t, x];
};
async function calRuns(page) {
  const v = [];
  for (let k = 0; k < 5; k++) v.push(r1((await page.evaluate(CAL))[0]));
  return { runs: v, warm: median(v.slice(2)) };
}
/** At the end of a visit (nothing measured after it): the same loop at rate 4, then at rate 1, on the same page. */
async function calibrate(s) {
  const at4 = await calRuns(s.page);
  await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const at1 = await calRuns(s.page);
  return { at4, at1, slowdown: at4.warm && at1.warm ? r1((at4.warm / at1.warm) * 100) / 100 : null };
}

function summarizeNet(net) {
  const byHost = {};
  for (const r of net.requests) {
    let h = '?';
    try {
      h = new URL(r.url).host;
    } catch {
      /* data: */
    }
    const k = `${h} ${r.type}`;
    byHost[k] = (byHost[k] ?? 0) + 1;
  }
  const bytes = {};
  for (const f of net.finished) {
    let h = '?';
    try {
      h = new URL(f.url).host;
    } catch {
      /* data: */
    }
    const k = `${h} ${f.type}`;
    bytes[k] = (bytes[k] ?? 0) + (f.body ?? 0);
  }
  const images = net.finished.filter((f) => f.type === 'image').map((f) => ({ url: f.url, body: f.body }));
  const pick = (re) => net.finished.filter((f) => re.test(f.url)).map((f) => ({ url: f.url, body: f.body }));
  return {
    count: net.requests.length,
    byHost,
    bytes,
    forbidden: net.requests.filter((r) => FORBIDDEN.test(r.url)).map((r) => r.url),
    failed: net.failed,
    spots: pick(/spots\.json/),
    bundle: pick(/\/assets\/.*\.(js|css)/),
    rain: net.requests.filter((r) => /\/api\/rain/.test(r.url)).map((r) => r.url),
    others: net.requests.filter((r) => r.type !== 'image').map((r) => `${r.method} ${r.type} ${r.url.slice(0, 120)}`),
    images,
  };
}

const hostOf = (u) => {
  try {
    return u ? new URL(u).host : '(no url)';
  } catch {
    return u || '(no url)';
  }
};
/** First-screen long tasks: our code vs others, by the LoAF scripts inside each task (sourceURL host); plus the
 * rendering tasks only LoAF saw (meta.method.longTask). */
function firstScreenTasks(first, endAt) {
  const lts = first.lt.filter((x) => x.s < endAt && x.d > RULES.longTaskMs);
  const rendering = first.loaf
    .filter((f) => f.s < endAt && f.rs > 0 && f.s + f.d - f.rs > RULES.longTaskMs)
    .filter((f) => !first.lt.some((t) => t.s < f.s + f.d && t.s + t.d > f.rs))
    .map((f) => {
      const rafScripts = f.scripts.filter((x) => x.s >= f.rs);
      const third = rafScripts.filter((x) => hostOf(x.url) !== 'yeochana.com').reduce((a, x) => a + x.d, 0);
      const total = rafScripts.reduce((a, x) => a + x.d, 0);
      return {
        s: r1(f.rs),
        d: r1(f.s + f.d - f.rs),
        source: 'LoAF rendering phase (no longtask entry)',
        owner: total > 0 && third / total >= 0.5 ? 'third-party' : 'ours',
        frame: { s: r1(f.s), d: r1(f.d), renderStart: r1(f.rs), styleLayoutStart: r1(f.sls), blocking: r1(f.bd) },
      };
    });
  const reported = lts.map((t) => {
    const t1 = t.s + t.d;
    const frames = first.loaf.filter((f) => f.s < t1 && f.s + f.d > t.s);
    const scripts = frames.flatMap((f) => f.scripts).filter((x) => x.s >= t.s - 1 && x.s < t1 + 1);
    const byHost = {};
    for (const x of scripts) {
      const h = hostOf(x.url);
      byHost[h] = r1((byHost[h] ?? 0) + x.d);
    }
    const third = Object.entries(byHost)
      .filter(([h]) => h !== 'yeochana.com' && h !== '(no url)')
      .reduce((a, [, v]) => a + v, 0);
    const total = Object.values(byHost).reduce((a, v) => a + v, 0);
    return {
      s: r1(t.s),
      d: r1(t.d),
      source: 'longtask entry',
      owner: total > 0 && third / total >= 0.5 ? 'third-party' : 'ours',
      scriptMsByHost: byHost,
      scripts: scripts.map((x) => ({ inv: x.inv, it: x.it, url: x.url, fn: x.fn, d: r1(x.d), fsl: r1(x.fsl) })),
      frames: frames.map((f) => ({ s: r1(f.s), d: r1(f.d), renderStart: r1(f.rs), styleLayoutStart: r1(f.sls), blocking: r1(f.bd) })),
    };
  });
  return [...reported, ...rendering].sort((a, b) => a.s - b.s);
}

async function memSnap(s) {
  const { cdp, page } = s;
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(400);
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(400);
  await cdp.send('Performance.enable');
  const pm = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await cdp.send('Performance.disable');
  const dc = await cdp.send('Memory.getDOMCounters').catch((e) => ({ error: e.message }));
  const hu = await cdp.send('Runtime.getHeapUsage').catch((e) => ({ error: e.message }));
  const inPage = await page.evaluate(() => {
    let all = 0;
    const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    while (w.nextNode()) all++;
    const P = window.__perf;
    return {
      elements: document.getElementsByTagName('*').length,
      allNodes: all + 1,
      cardsElements: document.querySelectorAll('#cards *').length,
      images: document.images.length,
      scrollY,
      perfMemory: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
      perfBuffers: { ev: P.ev.length, lt: P.lt.length, loaf: P.loaf.length, inputs: P.inputs.length },
      session: (sessionStorage.getItem('jeju.session') || '').length,
    };
  });
  const keys = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'JSEventListeners', 'Documents', 'Frames', 'LayoutObjects', 'LayoutCount', 'RecalcStyleCount', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
  return { metrics: Object.fromEntries(keys.filter((k) => k in pm).map((k) => [k, pm[k]])), domCounters: dc, heapUsage: hu, inPage };
}

// ---------------------------------------------------------------- trace (observation only)
function analyzeTrace(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const evs = Array.isArray(raw) ? raw : raw.traceEvents;
  const names = new Map();
  for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name);
  const score = new Map();
  for (const e of evs) {
    if (e.ph !== 'X') continue;
    const d = e.args?.data;
    const url = d?.url ?? d?.stackTrace?.[0]?.url;
    if (typeof url === 'string' && url.includes('yeochana.com')) score.set(`${e.pid}:${e.tid}`, (score.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
  }
  const main = [...score.entries()].filter(([k]) => names.get(k) === 'CrRendererMain').sort((a, b) => b[1] - a[1])[0];
  if (!main) return { error: 'no renderer main thread with yeochana.com events' };
  const [pid, tid] = main[0].split(':').map(Number);
  const th = evs.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number').sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const navStart = evs.filter((e) => e.name === 'navigationStart' && String(e.args?.data?.documentLoaderURL ?? '').includes('yeochana.com')).sort((a, b) => a.ts - b.ts)[0];
  const T0 = navStart ? navStart.ts : th[0].ts;
  const TASK = new Set(['RunTask', 'ThreadControllerImpl::RunTask']);
  const tasks = [];
  let lastEnd = -1;
  for (const e of th) {
    if (!TASK.has(e.name) || e.ts < lastEnd) continue;
    tasks.push(e);
    lastEnd = e.ts + e.dur;
  }
  const short = (u) => (typeof u === 'string' ? u.replace(/^https?:\/\/[^/]+/, '').slice(0, 60) : '');
  const keyOf = (e) => {
    const d = e.args?.data ?? {};
    if (e.name === 'EvaluateScript' || e.name === 'v8.compile' || e.name === 'v8.compileModule' || e.name === 'v8.evaluateModule') return `${e.name} ${short(d.url ?? e.args?.fileName)}`;
    if (e.name === 'FunctionCall') return `FunctionCall ${short(d.url)}${d.functionName ? ` ${d.functionName}` : ''}`;
    if (e.name === 'EventDispatch') return `EventDispatch ${d.type ?? ''}`;
    if (e.name === 'ParseHTML') return 'ParseHTML';
    return e.name;
  };
  function breakdown(task) {
    const end = task.ts + task.dur;
    const inner = th.filter((e) => e !== task && e.ts >= task.ts && e.ts + e.dur <= end + 1);
    const all = [task, ...inner].sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const self = new Map(all.map((e) => [e, e.dur]));
    const stack = [];
    for (const e of all) {
      while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur < e.ts + e.dur - 1) stack.pop();
      if (stack.length) {
        const p = stack[stack.length - 1];
        self.set(p, self.get(p) - e.dur);
      }
      stack.push(e);
    }
    const agg = {};
    for (const [e, v] of self) {
      if (e === task) continue;
      const k = keyOf(e);
      agg[k] = (agg[k] ?? 0) + v;
    }
    const top = Object.entries(agg)
      .filter(([, v]) => v >= 1000)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([k, v]) => ({ what: k, selfMs: r1(v / 1000) }));
    // what the task did, one level down past the scheduler's own wrappers
    const WRAP = new Set([...TASK, 'BlinkScheduler_PerformMicrotaskCheckpoint', 'Receive mojo message', 'ThreadPool_RunTask']);
    const work = inner.filter((e) => !WRAP.has(e.name));
    const children = work
      .filter((e) => !work.some((p) => p !== e && p.ts <= e.ts && p.ts + p.dur >= e.ts + e.dur && p.dur > e.dur))
      .filter((e) => e.dur >= 2000)
      .map((e) => ({ what: keyOf(e), ms: r1(e.dur / 1000) }));
    return { atMs: r1((task.ts - T0) / 1000), ms: r1(task.dur / 1000), selfTop: top, children };
  }
  const clicks = th.filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'click');
  const firstClick = clicks.length ? clicks[0].ts : Infinity;
  // the first screen: from navigationStart to the first tap, as the Long Tasks API would see it if it saw everything
  const firstScreen = tasks.filter((e) => e.ts >= T0 && e.ts < firstClick && e.dur > 50000).map(breakdown);
  const long = tasks.filter((e) => e.dur > 50000).map(breakdown);
  const interactions = clicks.map((c) => {
    const task = tasks.find((t) => t.ts <= c.ts && t.ts + t.dur >= c.ts + c.dur);
    const after = tasks.filter((t) => t.ts > c.ts && t.ts < c.ts + 400000 && t.dur >= 3000).slice(0, 6);
    return { clickAtMs: r1((c.ts - T0) / 1000), task: task ? breakdown(task) : null, next: after.map(breakdown) };
  });
  return { pid, tid, navStartFound: !!navStart, tasks: tasks.length, firstScreen, longTasks: long, interactions, sizeMB: r1(statSync(path).size / 1e6) };
}

// ---------------------------------------------------------------- local self-test of the changed parts (no network)
if (argv.includes('--selftest')) {
  const sm = JSON.parse(readFileSync(join(here, 'smoke.json'), 'utf8'));
  const f0 = sm.sessions[0].first;
  console.log('firstScreenTasks on smoke data:', JSON.stringify(firstScreenTasks(f0, f0.now).map((t) => [t.s, t.d, t.source, t.owner])));
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.goto('about:blank');
  console.log('calibrate:', JSON.stringify(await calibrate({ page, cdp })));
  await ctx.addInitScript(() => {
    const sh = new CSSStyleSheet();
    sh.replaceSync('html, body, button, input, textarea, select { font-family: "Malgun Gothic", sans-serif !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
  });
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent('<html><head><style>body{font-family:Pretendard,sans-serif}</style></head><body><p>안녕하세요</p><button>버튼</button></body></html>'));
  console.log('font override:', await page.evaluate(() => [getComputedStyle(document.body).fontFamily, getComputedStyle(document.querySelector('button')).fontFamily]));
  console.log('summarizeNet:', JSON.stringify(summarizeNet({ requests: [{ url: 'https://yeochana.com/cdn-cgi/rum?x', type: 'xhr', method: 'POST' }], failed: [], finished: [] }).forbidden));
  await browser.close();
  process.exit(0);
}

// ---------------------------------------------------------------- run
try {
  // environment: the GPU in use
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('about:blank');
    out.env.gpu = await page.evaluate(() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        if (!gl) return 'no webgl';
        const x = gl.getExtension('WEBGL_debug_renderer_info');
        return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } catch (e) {
        return String(e);
      }
    });
    await ctx.close();
  }
  save();

  // (a)–(d), (f): one fresh visit per mood
  for (const [i, mood] of MOODS.entries()) {
    const rec = { i, mood, errors: [] };
    out.sessions.push(rec);
    let s;
    try {
      s = await newSession();
      rec.blockedVia = s.blockedVia;
      rec.load = await load(s);
      rec.first = await snapshotFirst(s.page);
      rec.firstTasks = firstScreenTasks(rec.first, rec.first.now);
      rec.firstImages = await snapshotImages(s.page);
      await resetBuffers(s.page);
      if (SMOKE) rec.blockTest = await s.page.evaluate(() => fetch('/robots.txt').then((r) => `status ${r.status}`, (e) => `failed: ${e}`));
    } catch (e) {
      rec.errors.push(`load: ${e.message}`);
    }
    const step = async (key, kind, sel, needs) => {
      if (needs && !(rec[needs] && rec[needs].value != null)) {
        rec[key] = { value: null, method: 'skipped', note: `needs ${needs}` };
        return;
      }
      try {
        rec[key] = await measure(s, kind, sel);
      } catch (e) {
        rec[key] = { value: null, method: 'failed', error: e.message.split('\n')[0] };
        rec.errors.push(`${key}: ${e.message.split('\n')[0]}`);
      }
      try {
        rec[`${key}Settle`] = await settleAfter(s.page);
      } catch (e) {
        rec.errors.push(`${key} settle: ${e.message.split('\n')[0]}`);
      }
    };
    if (rec.first) {
      await step('a', 'mood', `[data-mood="${mood}"]`);
      await step('b', 'more', '#cards [data-action="more"]', 'a');
      await step('c', 'heart', '#cards .card.lead .heart', 'a');
      await step('d', 'sheet', '#basis');
      try {
        rec.images = await snapshotImages(s.page);
        rec.calibration = await calibrate(s);
      } catch (e) {
        rec.errors.push(`end: ${e.message.split('\n')[0]}`);
      }
    }
    if (s) {
      rec.net = summarizeNet(s.net);
      await s.ctx.close().catch(() => undefined);
    }
    save();
  }

  // (e): 30 × 다른 3곳 보기 in one visit
  {
    const rec = { mood: LEAK_MOOD, errors: [], taps: [] };
    out.leak = rec;
    let s;
    try {
      s = await newSession();
      rec.load = await load(s);
      rec.first = await snapshotFirst(s.page);
      rec.firstTasks = firstScreenTasks(rec.first, rec.first.now);
      await resetBuffers(s.page);
      rec.a = await measure(s, 'mood', `[data-mood="${LEAK_MOOD}"]`);
      await settleAfter(s.page, 2500);
      rec.before = await memSnap(s);
      for (let k = 0; k < MORE_N; k++) {
        try {
          const m = await measure(s, 'more', '#cards [data-action="more"]');
          rec.taps.push({ k, value: m.value, method: m.method, inp: m.inp, rafMs: m.rafMs, domInHandler: m.domInHandler, longTasks: m.longTasks, cards: m.raw.cards });
        } catch (e) {
          rec.taps.push({ k, value: null, method: 'failed', error: e.message.split('\n')[0] });
          rec.errors.push(`tap ${k}: ${e.message.split('\n')[0]}`);
        }
        await imagesSettled(s.page, 4000);
        await sleep(500);
      }
      await settleAfter(s.page, 2500);
      rec.after = await memSnap(s);
      rec.images = await snapshotImages(s.page);
      rec.calibration = await calibrate(s);
    } catch (e) {
      rec.errors.push(e.message.split('\n')[0]);
    }
    if (s) {
      rec.net = summarizeNet(s.net);
      await s.ctx.close().catch(() => undefined);
    }
    save();
  }

  // observation: a CDP trace of one visit (load + mood + more + sheet), for what the long tasks are made of
  {
    const rec = { errors: [] };
    out.trace = rec;
    let s;
    try {
      s = await newSession();
      await browser.startTracing(s.page, {
        path: TRACE_OUT,
        screenshots: false,
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'v8.execute', 'blink.user_timing', 'loading', 'latencyInfo', 'fonts', 'blink.fonts'],
      });
      rec.load = await load(s);
      const first = await snapshotFirst(s.page);
      rec.firstLongTasks = first.lt.filter((x) => x.d > 50).map((x) => ({ s: r1(x.s), d: r1(x.d) }));
      await resetBuffers(s.page);
      const a = await measure(s, 'mood', '[data-mood="walk"]');
      await settleAfter(s.page);
      const b = await measure(s, 'more', '#cards [data-action="more"]');
      await settleAfter(s.page);
      const d = await measure(s, 'sheet', '#basis');
      rec.values = { a: a.value, b: b.value, d: d.value };
      await sleep(500);
      await browser.stopTracing();
      rec.summary = analyzeTrace(TRACE_OUT);
    } catch (e) {
      rec.errors.push(e.message.split('\n')[0]);
      await browser.stopTracing().catch(() => undefined);
    }
    if (s) await s.ctx.close().catch(() => undefined);
    save();
  }

  // observation (diagnostic, not a verdict): the same first visit with one installed Korean font first in the stack, to
  // see how much of the first rendering is font matching on this Windows machine rather than the page
  {
    const rec = { errors: [], override: 'html, body, button, input, textarea, select { font-family: "Malgun Gothic", sans-serif !important } (adoptedStyleSheets at document start)' };
    out.fontProbe = rec;
    let s;
    try {
      s = await newSession();
      await s.ctx.addInitScript(() => {
        try {
          const sh = new CSSStyleSheet();
          sh.replaceSync('html, body, button, input, textarea, select { font-family: "Malgun Gothic", sans-serif !important; }');
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
        } catch (e) {
          console.debug('font override failed ' + e.message);
        }
      });
      rec.load = await load(s);
      const first = await snapshotFirst(s.page);
      rec.firstTasks = firstScreenTasks(first, first.now);
      rec.loaf = first.loaf.map((f) => ({ s: r1(f.s), d: r1(f.d), renderStart: r1(f.rs), render: r1(f.s + f.d - f.rs), blocking: r1(f.bd) }));
      rec.lt = first.lt.map((x) => ({ s: r1(x.s), d: r1(x.d) }));
      rec.paint = first.paint;
      rec.fontApplied = await s.page.evaluate(() => getComputedStyle(document.body).fontFamily);
    } catch (e) {
      rec.errors.push(e.message.split('\n')[0]);
    }
    if (s) await s.ctx.close().catch(() => undefined);
    save();
  }
} catch (e) {
  out.errors.push(String(e?.stack ?? e));
} finally {
  // ---------------------------------------------------------------- results (rules in RULES, fixed before running)
  const vals = (k) => out.sessions.map((x) => x[k]?.value ?? null);
  const verdict = (k) => {
    const v = vals(k);
    const m = median(v);
    return { values: v, n: v.filter((x) => x != null).length, median: m, pass: m == null ? null : m <= RULES.interactionMs, methods: out.sessions.map((x) => x[k]?.method ?? null) };
  };
  const L = out.leak;
  let e = null;
  if (L?.before && L?.after) {
    const b = L.before;
    const a = L.after;
    const elRatio = a.inPage.elements / b.inPage.elements;
    const nodeRatio = a.metrics.Nodes / b.metrics.Nodes;
    const heapDelta = a.metrics.JSHeapUsedSize - b.metrics.JSHeapUsedSize;
    e = {
      tapsDone: L.taps.filter((t) => t.value != null).length,
      elements: [b.inPage.elements, a.inPage.elements, r1(elRatio * 100) / 100],
      cdpNodes: [b.metrics.Nodes, a.metrics.Nodes, r1(nodeRatio * 100) / 100],
      allNodesInDoc: [b.inPage.allNodes, a.inPage.allNodes],
      listeners: [b.metrics.JSEventListeners, a.metrics.JSEventListeners],
      heapUsed: [b.metrics.JSHeapUsedSize, a.metrics.JSHeapUsedSize, heapDelta],
      pass: elRatio <= RULES.domRatio && nodeRatio <= RULES.domRatio && heapDelta <= RULES.heapBytes && L.taps.filter((t) => t.value != null).length === MORE_N,
      warmMore: { median: median(L.taps.map((t) => t.value)), max: Math.max(...L.taps.map((t) => t.value ?? 0)) },
    };
  }
  const counts = out.sessions.map((x) => (x.firstTasks ? x.firstTasks.filter((t) => t.owner === 'ours').length : null));
  const fm = median(counts);
  out.results = {
    a: verdict('a'),
    b: verdict('b'),
    c: verdict('c'),
    d: verdict('d'),
    e,
    f: { countsOurs: counts, countsAll: out.sessions.map((x) => (x.firstTasks ? x.firstTasks.length : null)), median: fm, pass: fm == null ? null : fm <= RULES.longTasksMax },
  };
  save();
  await browser.close().catch(() => undefined);
  console.log(JSON.stringify(out.results, null, 1));
  console.log(`written: ${OUT}`);
}
