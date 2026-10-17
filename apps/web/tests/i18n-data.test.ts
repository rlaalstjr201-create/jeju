// ADR-0093 (review m2): every shipped place has its translations, and they were made from the Korean that ships now.
// The Korean each translation was made from is kept in review/i18n/source/batch-*.json (written by
// `node scripts/i18n-places.mjs --export`); when spots.json changes a name or reason, or ships a new place, this fails
// until that place is translated again (specs/i18n.md §5).
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const spots = (JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8')) as { id: string; name: string; reason: string; hide?: boolean }[]).filter((s) => !s.hide);
const dir = resolve(root, 'review/i18n/source');
const source = new Map<string, { name: string; reason: string }>(
  readdirSync(dir).flatMap((f) => (JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { id: string; name: string; reason: string }[]).map((r) => [r.id, r] as const)),
);

describe('translated place texts (ADR-0093 6)', () => {
  it('were made from the Korean that ships now (a changed or new place fails until it is translated again)', () => {
    const stale = spots.filter((s) => {
      const r = source.get(s.id);
      return !r || r.name !== s.name.trim() || r.reason !== s.reason;
    });
    expect(stale.map((s) => `${s.id} ${s.name}`)).toEqual([]);
  });

  for (const lang of ['en', 'zh-Hans', 'ja']) {
    it(`${lang}: every shipped place has its name and reason`, () => {
      const places = JSON.parse(readFileSync(resolve(root, `public/i18n/places.${lang}.json`), 'utf8')) as Record<string, [string, string]>;
      const missing = spots.filter((s) => !places[s.id]?.[0] || !places[s.id]?.[1]);
      expect(missing.map((s) => s.id)).toEqual([]);
    });
  }
});
