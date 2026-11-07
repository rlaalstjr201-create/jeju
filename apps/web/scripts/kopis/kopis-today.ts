// KOPIS 공연을 섞은 그날 목록 (ADR-0113): a day's Seoul show list and every show's detail from KOPIS (paced, kopis-venues.ts
// kopisGet), saved raw, then turned into items by the function's own code (functions/_lib/kopis.ts kopisItems) and merged
// with a saved Seoul list. Prints the counts and the KOPIS share of the picks at the quality run's scenes.
//   npx tsx scripts/kopis/kopis-today.ts --out <dir> --seoul <rows.json> [--day YYYY-MM-DD] [--raw]
// --raw: no KOPIS calls, the saved <dir> only. <rows.json>: { rows: SeoulRow[] } (culture-quality-0N/01-rows-fetched.json).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cultureItems, type SeoulRow } from '../../functions/_lib/culture-filter';
import { kopisDrop, kopisItems, listIds, mergeCulture, parseShow, xmlRecords, xmlTag, type KopisShow } from '../../functions/_lib/kopis';
import VENUES from '../../functions/_lib/kopis-venues.json';
import { pickCulture, type Now } from '../../src/culture/culture';
import { kopisGet, kopisKey } from './kopis-venues';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = arg('out');
const seoulFile = arg('seoul');
if (!out || !seoulFile) throw new Error('--out <dir> --seoul <rows.json>');
const day = arg('day') ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const raw = process.argv.includes('--raw');
const d8 = day.replace(/-/g, '');

/** Saved raw data: the list pages' XML, each show's detail XML, venues asked beyond the table. */
interface Raw {
  day: string;
  fetchedAt: string;
  list: string[];
  details: Record<string, string>;
  venues: Record<string, string>;
}

const rawFile = join(out, `kopis-${day}.json`);
let data: Raw;
if (raw) data = JSON.parse(readFileSync(rawFile, 'utf8')) as Raw;
else {
  const key = kopisKey();
  mkdirSync(out, { recursive: true });
  // a run cut short keeps what it has: details already saved are not asked again
  data = existsSync(rawFile) ? (JSON.parse(readFileSync(rawFile, 'utf8')) as Raw) : { day, fetchedAt: '', list: [], details: {}, venues: {} };
  if (!data.list.length) {
    for (let page = 1; page <= 5; page++) {
      const xml = await kopisGet(key, 'pblprfr', `&stdate=${d8}&eddate=${d8}&cpage=${page}&rows=100&signgucode=11`);
      data.list.push(xml);
      if (xmlRecords(xml).length < 100) break;
    }
  }
  const ids = [...new Set(data.list.flatMap(listIds))];
  console.log(`listed: ${ids.length}`);
  let n = 0;
  for (const id of ids) {
    if (data.details[id]) continue;
    data.details[id] = await kopisGet(key, `pblprfr/${id}`);
    if (++n % 25 === 0) {
      writeFileSync(rawFile, JSON.stringify(data));
      console.log(`  details ${Object.keys(data.details).length}/${ids.length}`);
    }
  }
  for (const s of Object.values(data.details).map(parseShow)) {
    if (s?.venue && !(s.venue in VENUES) && !data.venues[s.venue]) data.venues[s.venue] = await kopisGet(key, `prfplc/${s.venue}`);
  }
  data.fetchedAt = new Date().toISOString();
  writeFileSync(rawFile, JSON.stringify(data));
}

const venues: Record<string, [number, number]> = { ...(VENUES as unknown as Record<string, [number, number]>) };
for (const [id, xml] of Object.entries(data.venues)) {
  const r = xmlRecords(xml)[0] ?? '';
  const lat = Number(xmlTag(r, 'la'));
  const lng = Number(xmlTag(r, 'lo'));
  if (lat && lng) venues[id] = [lat, lng];
}
const shows = Object.values(data.details).map(parseShow).filter((s): s is KopisShow => !!s);
const why: Record<string, number> = {};
for (const s of shows) {
  const w = kopisDrop(s, venues, day) ?? 'kept';
  why[w] = (why[w] ?? 0) + 1;
}
const shown = kopisItems(shows, venues, day);
const seoul = cultureItems((JSON.parse(readFileSync(seoulFile, 'utf8')) as { rows: SeoulRow[] }).rows, day);
const merged = mergeCulture(seoul, shown);
const kinds: Record<string, number> = {};
for (const i of shown) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
console.log(`day ${day}: KOPIS listed ${data.list.flatMap(listIds).length}, details ${shows.length}`);
console.log('KOPIS kept/left out:', why);
console.log('KOPIS kinds kept:', kinds, `with cast: ${shown.filter((i) => i.cast).length}`);
console.log(`Seoul items ${seoul.length}, KOPIS items ${shown.length}, dropped as the Seoul list's title ${seoul.length + shown.length - merged.length}, merged ${merged.length} (KOPIS ${(((merged.length - seoul.length) / merged.length) * 100).toFixed(1)}%)`);

const SCENES: [string, number, number][] = [
  ['대학로', 37.5822, 127.0019],
  ['홍대', 37.5572, 126.9245],
  ['광화문', 37.5759, 126.9768],
  ['성수', 37.5446, 127.056],
  ['강남역', 37.4979, 127.0276],
  ['잠실', 37.5133, 127.1001],
];
const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
let picked = 0;
let fromKopis = 0;
for (const h of [14, 19, 22]) {
  for (const [name, lat, lng] of SCENES) {
    const now: Now = { day, weekday, minute: h * 60 };
    const { home, list } = pickCulture(merged, { lat, lng }, now);
    picked += list.length;
    fromKopis += list.filter((p) => p.item.id.startsWith('kp-')).length;
    console.log(`${h}:00 ${name}: list ${list.length} (KOPIS ${list.filter((p) => p.item.id.startsWith('kp-')).length}), home ${home.length}`);
    for (const p of list) console.log(`    ${p.item.id.startsWith('kp-') ? 'K' : 'S'} ${p.item.kind} | ${p.item.title} | ${p.item.place} | ${p.why}${p.item.cast ? ` | ${p.item.cast}` : ''}`);
  }
}
console.log(`picks over 18 scenes: ${picked}, from KOPIS ${fromKopis} (${((fromKopis / Math.max(1, picked)) * 100).toFixed(1)}%)`);
