import { readFileSync } from 'node:fs';
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

export default defineConfig({
  base: './',
  define: { __SPOTS_V__: JSON.stringify(SPOTS_V) },
  plugins: [serviceWorker()],
  build: { target: 'es2020', modulePreload: { polyfill: false } },
});
