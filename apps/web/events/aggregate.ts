// Build-time popularity (ADR-0061 6): a dump of the collector's counters → review/popularity.json,
// `{ id, shown, save, map, book }[]` per place over all days. `save` is net of `unsave` (never below 0).
// Mood taps (`mood:*`) and the feedback cap count (`feedback:capped`, ADR-0081) are not places and stay out.
//   npx tsx events/aggregate.ts <counters.json> [out.json]   (out defaults to review/popularity.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Counter } from './store';

export interface Popularity {
  id: string;
  shown: number;
  save: number;
  map: number;
  book: number;
}

export function aggregate(counters: readonly Counter[]): Popularity[] {
  const by = new Map<string, Popularity & { unsave: number }>();
  for (const c of counters) {
    if (c.id.startsWith('mood:') || c.id.startsWith('feedback:') || !Number.isFinite(c.n)) continue;
    const p = by.get(c.id) ?? { id: c.id, shown: 0, save: 0, unsave: 0, map: 0, book: 0 };
    if (c.e === 'shown' || c.e === 'save' || c.e === 'unsave' || c.e === 'map' || c.e === 'book') p[c.e] += c.n;
    by.set(c.id, p);
  }
  return [...by.values()]
    .map(({ id, shown, save, unsave, map, book }) => ({ id, shown, save: Math.max(0, save - unsave), map, book }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, out = resolve(fileURLToPath(new URL('..', import.meta.url)), 'review/popularity.json')] = process.argv.slice(2);
  if (!input) {
    console.error('usage: tsx events/aggregate.ts <counters.json> [out.json]');
    process.exit(1);
  }
  const rows = aggregate(JSON.parse(readFileSync(input, 'utf8')) as Counter[]);
  writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${rows.length} places → ${out}`);
}
