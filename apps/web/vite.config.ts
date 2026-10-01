import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildServiceWorker, spotsVersion } from './scripts/sw-build';

const root = __dirname;
const PUBLIC_SHELL = ['spots.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const SPOTS_V = spotsVersion(readFileSync(resolve(root, 'public/spots.json')));

/** Emits sw.js with the built file list, without a PWA plugin (plan: 직접 작성). */
function serviceWorker(): Plugin {
  return {
    name: 'tomorrow-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      const { source } = buildServiceWorker({
        template: readFileSync(resolve(root, 'sw/sw.js'), 'utf8'),
        built: Object.keys(bundle),
        indexHtml: html && html.type === 'asset' ? html.source : null,
        publicFiles: PUBLIC_SHELL.map((f) => [f, readFileSync(resolve(root, 'public', f))]),
        spotsV: SPOTS_V,
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Link previews need absolute URLs: `__SITE__` in index.html becomes the build env SITE_URL (docs/deploy.md),
 * or nothing (relative) when it is unset. */
function siteUrl(): Plugin {
  const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
  return { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE__', site) };
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
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(resolve(dist, '404.html')));
        });
      };
    },
  };
}

export default defineConfig({
  // Absolute: index.html served at any path (a deep link, a fallback) still finds /assets/… (ADR-0063).
  base: '/',
  // No SPA fallback in dev/preview either: the app has no routes, an unknown path is a 404 (as on the host).
  appType: 'mpa',
  define: { __SPOTS_V__: JSON.stringify(SPOTS_V) },
  plugins: [serviceWorker(), siteUrl(), pagesNotFound()],
  build: { target: 'es2020', modulePreload: { polyfill: false } },
});
