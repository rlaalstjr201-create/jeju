// build-spots.mjs dedup rule (scripts/duplicates.mjs). Kept apart from data.test.ts, which also needs the
// review/out verdict files that this checkout does not carry.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileSpots } from './fixtures';

const root = resolve(__dirname, '..');

describe('QA 2026-09-30 중복 — 오타로 두 번 들어간 한 곳', () => {
  it('general rule: a one-character name typo within 10 m is flagged, real neighbours are not, and every flagged source pair is resolved', async () => {
    const { typoTwins, unresolvedTwins } = await import('../scripts/duplicates.mjs');
    const at = (id: string, name: string, lat: number, lng: number) => ({ id, name, lat, lng });
    const names = (pairs: { name: string }[][]) => pairs.map((p) => p.map((s) => s.name));
    expect(names(typoTwins([
      at('a', '물질식육식당', 33.261562, 126.49447),
      at('b', '몰질식육식당', 33.2615636, 126.49447),
      at('c', '덕승식당(신관)', 33.2, 126.2), at('d', '덕승식당(구관)', 33.20013, 126.2), // ~15 m: two buildings
      at('e', '용두암', 33.5, 126.5), at('f', '용두성', 33.5008, 126.5), // ~90 m: different places
      at('g', '카페 A', 33.4, 126.4), at('h', '카페 AB', 33.4, 126.4), // different length
    ]))).toEqual([['물질식육식당', '몰질식육식당']]);
    // The source records (review/input) hold exactly one such pair, the DUPLICATES entry resolves it, and
    // the shipped file has none left.
    const input = readdirSync(resolve(root, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f))
      .flatMap((f) => JSON.parse(readFileSync(resolve(root, 'review/input', f), 'utf8')) as { id: string; name: string; lat: number; lng: number }[]);
    expect(names(typoTwins(input))).toEqual([['물질식육식당', '몰질식육식당']]);
    expect(unresolvedTwins(input)).toEqual([]);
    expect(typoTwins(fileSpots)).toEqual([]);
    expect(readFileSync(resolve(root, 'scripts/build-spots.mjs'), 'utf8')).toMatch(/unresolvedTwins\(kept\)/);
  });
});
