import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { analyticsEnv, type AnalyticsEnv } from './scripts/analytics-env';
import { buildServiceWorker, spotsVersion } from './scripts/sw-build';

const root = __dirname;
const PUBLIC_SHELL = ['spots.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const SPOTS_V = spotsVersion(readFileSync(resolve(root, 'public/spots.json')));
/** ADR-0093: the translated place files' version, one for the three (a missing file counts as empty). */
const PLACES_V = spotsVersion(
  ['en', 'zh-Hans', 'ja']
    .map((l) => {
      const f = resolve(root, `public/i18n/places.${l}.json`);
      return existsSync(f) ? readFileSync(f, 'utf8') : '';
    })
    .join('\0'),
);
/** plans/busan.md: Busan's own file, fetched only on a Busan visit; '' while there is none (the switch is off then). */
const BUSAN_FILE = resolve(root, 'public/spots-busan.json');
const BUSAN_V = existsSync(BUSAN_FILE) ? spotsVersion(readFileSync(BUSAN_FILE)) : '';
/** ADR-0093 Amendment 9: Busan's translated place files, one version for the three; fetched only on a Busan visit in that language. */
const BUSAN_PLACES = ['en', 'zh-Hans', 'ja'].map((l) => `i18n/places-busan.${l}.json`);
const BUSAN_PLACES_V = spotsVersion(BUSAN_PLACES.map((f) => (existsSync(resolve(root, 'public', f)) ? readFileSync(resolve(root, 'public', f), 'utf8') : '')).join('\0'));
/** 자동 지역 (plans/nationwide-app.md 2): the files data/nation/*.json (scripts/nation/build.mjs), shipped under /nation/ by
 * the nation build only; `__NATION_V__` is the index's version, '' while there is none. */
const NATION_DIR = resolve(root, 'data/nation');
const NATION_INDEX = resolve(NATION_DIR, 'index.json');
const NATION_V = existsSync(NATION_INDEX) ? spotsVersion(readFileSync(NATION_INDEX)) : '';
/** the nation files a new worker carries over: the index and each file it names, at their `?v=` */
function nationCarry(): string[] {
  if (!NATION_V) return [];
  const files = (JSON.parse(readFileSync(NATION_INDEX, 'utf8')) as { files?: Record<string, string> }).files ?? {};
  return [`nation/index.json?v=${NATION_V}`, ...Object.entries(files).map(([f, v]) => `nation/${f}.json?v=${v}`)];
}
/** ADR-0081: the version sent with 의견 보내기 (events/feedback.ts accepts [0-9a-z.-]{1,20}). */
function appVersion(): string {
  try {
    const v = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{4,20}$/.test(v) ? v : 'dev';
  } catch {
    return 'dev';
  }
}

/** Emits sw.js with the built file list, without a PWA plugin (plan: 직접 작성). */
function serviceWorker(mode: string, nation: boolean): Plugin {
  return {
    name: 'tomorrow-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      // ADR-0093: the other languages' words (src/i18n) are not precached — a Korean visit never downloads them. Each
      // language's own files (its chunk, the shared apply chunk, their stylesheets, its place texts) go to the worker
      // (kept on devices that use it) and to index.html's early script (asked for before the app's own code runs).
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const words = chunks.filter((c) => c.type === 'chunk' && c.moduleIds.length && c.moduleIds.every((m) => m.replace(/\\/g, '/').includes('/src/i18n/')));
      const skip = new Set(words.flatMap((c) => (c.type === 'chunk' ? [c.fileName, ...(c.viteMetadata?.importedCss ?? [])] : [])));
      const langs = Object.fromEntries(
        ['en', 'zh-Hans', 'ja'].map((l) => {
          const entry = words.find((c) => c.type === 'chunk' && c.facadeModuleId?.replace(/\\/g, '/').endsWith(`/src/i18n/${l}.ts`));
          const own = entry && entry.type === 'chunk' ? [entry, ...words.filter((c) => entry.imports.includes(c.fileName))] : [];
          const files = own.flatMap((c) => (c.type === 'chunk' ? [...(c.viteMetadata?.importedCss ?? []), c.fileName] : []));
          return [l, [...new Set(files), `i18n/places.${l}.json?v=${PLACES_V}`]];
        }),
      );
      if (html && html.type === 'asset') html.source = String(html.source).replace('__I18N__', JSON.stringify(langs));
      const { source } = buildServiceWorker({
        template: readFileSync(resolve(root, 'sw/sw.js'), 'utf8'),
        built: Object.keys(bundle).filter((f) => !skip.has(f)),
        indexHtml: html && html.type === 'asset' ? html.source : null,
        publicFiles: PUBLIC_SHELL.map((f) => [f, readFileSync(resolve(root, 'public', f))]),
        spotsV: SPOTS_V,
        langs,
        // ADR-0093 Amendment 8: Busan's file is carried over by a new worker where the old cache had it (switched-on build only)
        ...(mode === 'busan' ? { busanFile: [`spots-busan.json?v=${BUSAN_V}`, ...BUSAN_PLACES.map((f) => `${f}?v=${BUSAN_PLACES_V}`)] } : {}),
        ...(nation ? { carry: nationCarry() } : {}),
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Link previews need absolute URLs: `__SITE__` in index.html becomes the build env SITE_URL (docs/deploy.md),
 * or nothing (relative) when it is unset. */
function siteUrl(): Plugin {
  const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
  let outDir = '';
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE__', site).replaceAll('__SPOTS_V__', SPOTS_V),
    configResolved: (c) => void (outDir = resolve(c.root, c.build.outDir)),
    // public/privacy.html is copied as is: its canonical gets the same address after the copy (SEO, as the landing pages)
    closeBundle() {
      const f = resolve(outDir, 'privacy.html');
      if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replaceAll('__SITE__', site));
    },
  };
}

/** 출시 스위치 (plans/busan.md): Busan's file goes out with the build only in mode `busan`. With the switch off, Vite's copy
 * of public/spots-busan.json is taken out of the build again, so a Jeju deploy carries no Busan file at all. */
function busanFile(mode: string): Plugin {
  let outDir = '';
  return {
    name: 'busan-file',
    apply: 'build',
    configResolved: (c) => void (outDir = resolve(c.root, c.build.outDir)),
    closeBundle() {
      // with it, Busan's place texts (ADR-0093 Amendment 9)
      for (const f of ['spots-busan.json', ...BUSAN_PLACES].map((p) => resolve(outDir, p))) if (mode !== 'busan' && existsSync(f)) rmSync(f);
      // plans/busan.md m4: always asked for as spots-busan.json?v=<content hash> — immutable, like spots.json
      const h = resolve(outDir, '_headers');
      if (mode === 'busan' && existsSync(h))
        writeFileSync(h, readFileSync(h, 'utf8').replace('/i18n/*\n', '/spots-busan.json\n  Cache-Control: public, max-age=31536000, immutable\n/i18n/*\n'));
    },
  };
}

/** 자동 지역 스위치 (plans/nationwide-app.md U4): the nation build copies data/nation/*.json to dist/nation/ (none there yet:
 * nothing copied); every other build has no dist/nation at all. */
function nationFiles(nation: boolean): Plugin {
  let outDir = '';
  return {
    name: 'nation-files',
    apply: 'build',
    configResolved: (c) => void (outDir = resolve(c.root, c.build.outDir)),
    closeBundle() {
      const out = resolve(outDir, 'nation');
      rmSync(out, { recursive: true, force: true });
      if (!nation || !existsSync(NATION_DIR)) return;
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(NATION_DIR).filter((f) => f.endsWith('.json'))) cpSync(resolve(NATION_DIR, f), resolve(out, f));
      // U16: always asked for as nation/<f>.json?v=<content hash> (nation-part) — immutable, like spots-busan.json
      const h = resolve(outDir, '_headers');
      if (existsSync(h)) writeFileSync(h, readFileSync(h, 'utf8').replace('/i18n/*\n', '/nation/*\n  Cache-Control: public, max-age=31536000, immutable\n/i18n/*\n'));
    },
  };
}

/** 시작 화면 (ADR-0096): index.html's `<!--busan-->…<!--/busan-->` blocks (the destination decided before the first paint,
 * the start screen) go out with a switched-on build only; with the switch off they are taken out whole, so the Jeju page
 * is the same bytes as before (plans/busan.md M3 b). `<!--nation-->…<!--/nation-->` the same way, with the 자동 지역 only. */
function busanBlock(mode: string, nation: boolean): Plugin {
  return {
    name: 'busan-block',
    transformIndexHtml: (html) => {
      const h = nation ? html.replace(/<!--\/?nation-->/g, '') : html.replace(/<!--nation-->[\s\S]*?<!--\/nation-->/g, '');
      return mode === 'busan' ? h.replace(/<!--\/?busan-->/g, '') : h.replace(/<!--busan-->[\s\S]*?<!--\/busan-->/g, '');
    },
  };
}

/** `vite preview` answers like Cloudflare Pages with a 404.html (docs/deploy.md): no SPA fallback — a path
 * that is no file gets 404.html with status 404. The e2e checks run against this. */
function pagesNotFound(): Plugin {
  return {
    name: 'pages-404',
    configurePreviewServer(server) {
      const dist = resolve(server.config.root, server.config.build.outDir);
      return () => {
        server.middlewares.use((req, res, next) => {
          let file = '';
          try {
            file = resolve(dist, `.${decodeURIComponent((req.url ?? '/').split('?')[0])}`);
          } catch {
            /* a malformed path is no file */
          }
          if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) return next();
          // a folder with an index.html is a page, as on Pages (the static landing pages /jeju/**, ADR-0072)
          if (file.startsWith(dist) && existsSync(resolve(file, 'index.html'))) return next();
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(resolve(dist, '404.html')));
        });
      };
    },
  };
}

/** ADR-0078: the analytics ids into the app (import.meta.env) and a marker into the page head that smoke.sh
 * reads, so a deploy shows what it measures. Unset (dev, tests): nothing is loaded or sent. */
function analytics(env: AnalyticsEnv | null): Plugin {
  if (!env) return { name: 'analytics' }; // dev server: Vite's own VITE_* env as is
  return {
    name: 'analytics',
    config: () => ({ define: Object.fromEntries(Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)])) }),
    transformIndexHtml: (html) =>
      env.VITE_GA4_ID || env.VITE_NAVER_WA
        ? html.replace('</head>', `  <meta name="analytics" content="ga4=${env.VITE_GA4_ID} naver-wa=${env.VITE_NAVER_WA}" />
  </head>`)
        : html,
  };
}

/** 출시 스위치 (plans/busan.md S7, 2026-10-20): on in every build (`vite build`, the production one) and in `vitest run
 * --mode busan`; off in `vitest run` (npm test) and in `vite build --mode jeju`, the Jeju-only build kept to switch back to
 * until the 4-week check after the release removes it. */
const switchOn = (command: string, mode: string) => mode === 'busan' || (command === 'build' && mode !== 'jeju');

export default defineConfig(({ command, mode: given }) => {
  // 자동 지역 (plans/nationwide-app.md U19): on in the production build (`vite build`) and in mode `nation` (`vitest run
  // --mode nation`), Busan on with it; off in `--mode busan` (Jeju and Busan only) and `--mode jeju`, the builds kept to switch back to
  const nation = given === 'nation' || (command === 'build' && given !== 'busan' && given !== 'jeju');
  const mode = nation || switchOn(command, given) ? 'busan' : given;
  return {
  // Absolute: index.html served at any path (a deep link, a fallback) still finds /assets/… (ADR-0063).
  base: '/',
  // No SPA fallback in dev/preview either: the app has no routes, an unknown path is a 404 (as on the host).
  appType: 'mpa',
  // 출시 스위치: switchOn above, read in src/release.ts
  define: {
    __SPOTS_V__: JSON.stringify(SPOTS_V),
    __PLACES_V__: JSON.stringify(PLACES_V),
    __APP_V__: JSON.stringify(appVersion()),
    __BUSAN__: JSON.stringify(mode === 'busan'),
    __BUSAN_V__: JSON.stringify(BUSAN_V),
    __BUSAN_PLACES_V__: JSON.stringify(BUSAN_PLACES_V),
    __NATION__: JSON.stringify(nation),
    __NATION_V__: JSON.stringify(nation ? NATION_V : ''),
  },
  // a production build (SITE_URL) without the three analytics settings fails here (ADR-0078 2)
  plugins: [busanBlock(mode, nation), serviceWorker(mode, nation), siteUrl(), busanFile(mode), nationFiles(nation), pagesNotFound(), analytics(command === 'build' ? analyticsEnv(process.env) : null)],
  // no preload helper (ADR-0093): the dynamic imports are the other languages' words, which a Korean visit never asks for,
  // and Busan's part (switched-on build only, src/release.ts). terser (ADR-0098): the Korean entry ≤ 50 kB gzip with the
  // switch on
  build: { target: 'es2020', modulePreload: false, minify: 'terser' },
  };
});
