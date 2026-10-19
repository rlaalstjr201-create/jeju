import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
function serviceWorker(): Plugin {
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
      const f = resolve(outDir, 'spots-busan.json');
      if (mode !== 'busan' && existsSync(f)) rmSync(f);
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

export default defineConfig(({ command, mode }) => ({
  // Absolute: index.html served at any path (a deep link, a fallback) still finds /assets/… (ADR-0063).
  base: '/',
  // No SPA fallback in dev/preview either: the app has no routes, an unknown path is a 404 (as on the host).
  appType: 'mpa',
  // 출시 스위치 (plans/busan.md): on only in mode `busan` (`vite build --mode busan`, `vitest run --mode busan`), read in src/release.ts
  define: {
    __SPOTS_V__: JSON.stringify(SPOTS_V),
    __PLACES_V__: JSON.stringify(PLACES_V),
    __APP_V__: JSON.stringify(appVersion()),
    __BUSAN__: JSON.stringify(mode === 'busan'),
    __BUSAN_V__: JSON.stringify(BUSAN_V),
  },
  // a production build (SITE_URL) without the three analytics settings fails here (ADR-0078 2)
  plugins: [serviceWorker(), siteUrl(), busanFile(mode), pagesNotFound(), analytics(command === 'build' ? analyticsEnv(process.env) : null)],
  // no preload helper (ADR-0093): the one dynamic import is the other languages' words, which a Korean visit never asks for
  build: { target: 'es2020', modulePreload: false },
}));
