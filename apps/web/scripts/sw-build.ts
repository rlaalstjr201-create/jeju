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
}

/**
 * VERSION changes when any built file name, index.html, a precached public file, or the SW template
 * itself changes — so a copy/meta-only edit of index.html also refreshes the offline shell.
 */
export function buildServiceWorker(input: SwInput): { version: string; precache: string[]; source: string } {
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
