// Service worker build helpers (used by vite.config.ts; pure, so tests can check them).
import { createHash } from 'node:crypto';

/** First 10 hex chars of sha256(spots.json) — the `?v=` the app fetches and the SW precaches (S26). */
export function spotsVersion(spotsJson: Uint8Array | string): string {
  return createHash('sha256').update(spotsJson).digest('hex').slice(0, 10);
}

export interface SwInput {
  template: string;
  /** every emitted file name (index.html included), without source maps */
  built: string[];
  indexHtml: Uint8Array | string | null;
  /** public files precached as-is, [published path, contents] */
  publicFiles: [string, Uint8Array | string][];
  spotsV: string;
  /** ADR-0093: each other language's own files (published paths), kept only on devices that use it */
  langs?: Record<string, string[]>;
  /** ADR-0093 Amendment 8 (plans/busan.md S5, switched-on build only): Busan's file `spots-busan.json?v=<hash>`. Not
   * precached; a new worker takes it where the cache it replaces had any spots-busan.json, apart from the precache
   * chain (a failure there never stops the install, m12). Amendment 9: with it, Busan's place texts in each language
   * (`i18n/places-busan.<lang>.json?v=`), each carried over where the replaced cache had that file. */
  busanFile?: string | string[];
}

/** The install step that carries Busan's file over, put into the worker only by a switched-on build: the template, and so
 * a Jeju deploy's sw.js, stays as it was. */
const INSTALL_TAIL = '          .then((langs) => Promise.all(langs.map((l) => addLang(cache, l)))),\n';
export function withBusanFile(template: string, file: string | string[]): string {
  const eol = template.includes('\r\n') ? '\r\n' : '\n';
  const tail = INSTALL_TAIL.replace(/\n/g, eol);
  if (!template.includes(tail)) throw new Error('sw.js: the install chain to carry Busan\'s file over was not found');
  const carry = [
    `/** ADR-0093 Amendment 8·9: Busan's files (its list, its place texts per language), each kept only where the replaced`,
    ` * cache had it; their own catch (m12). */`,
    `const BUSAN_FILES = ${JSON.stringify([file].flat())};`,
    `const carryBusan = (cache) =>`,
    `  caches`,
    `    .keys()`,
    `    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tomorrow-') && k !== CACHE).map((k) => caches.open(k).then((c) => c.keys()))))`,
    `    .then((lists) => Promise.all(BUSAN_FILES.filter((f) => lists.some((reqs) => reqs.some((r) => r.url.includes('/' + f.split('?')[0])))).map((f) => cache.add(new Request(scoped(f))).catch(() => undefined))))`,
    `    .catch(() => undefined);`,
    ``,
  ].join(eol);
  return template
    .replace(tail, tail.replace(`)))),${eol}`, `))))${eol}          .then(() => carryBusan(cache)),${eol}`))
    .replace(`self.addEventListener('install'`, `${carry}self.addEventListener('install'`);
}

/**
 * VERSION changes when any built file name, index.html, a precached public file, or the SW template
 * itself changes — so a copy/meta-only edit of index.html also refreshes the offline shell.
 */
export function buildServiceWorker(given: SwInput): { version: string; precache: string[]; source: string } {
  const input = given.busanFile ? { ...given, template: withBusanFile(given.template, given.busanFile) } : given;
  const built = [...input.built].filter((f) => !f.endsWith('.map')).sort();
  const pub = input.publicFiles.map(([p]) => (p === 'spots.json' ? `spots.json?v=${input.spotsV}` : p));
  const precache = ['./', ...built.filter((f) => f !== 'index.html'), ...pub];
  const hash = createHash('sha256');
  hash.update(built.join('\n'));
  hash.update('\0');
  if (input.indexHtml) hash.update(input.indexHtml);
  for (const [p, body] of input.publicFiles) {
    hash.update(`\0${p}\0`);
    hash.update(body);
  }
  hash.update('\0');
  hash.update(input.template);
  hash.update(JSON.stringify(input.langs ?? {}));
  const version = hash.digest('hex').slice(0, 12);
  const source = input.template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)).replace('__LANGS__', JSON.stringify(input.langs ?? {}));
  return { version, precache, source };
}
