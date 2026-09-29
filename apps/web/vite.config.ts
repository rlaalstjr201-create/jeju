import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = __dirname;
const PUBLIC_SHELL = ['spots.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

/** Emits sw.js with the built file list, without a PWA plugin (plan: 직접 작성). */
function serviceWorker(): Plugin {
  return {
    name: 'tomorrow-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map')).sort();
      const precache = ['./', ...built.filter((f) => f !== 'index.html'), ...PUBLIC_SHELL];
      const hash = createHash('sha256');
      hash.update(built.join('\n'));
      for (const f of PUBLIC_SHELL) hash.update(readFileSync(resolve(root, 'public', f)));
      const source = readFileSync(resolve(root, 'sw/sw.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2020', modulePreload: { polyfill: false } },
});
