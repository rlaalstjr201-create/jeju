// KOPIS 서울 공연장 좌표 표 (ADR-0113 5): every Seoul venue (prfplc, signgucode=11) and its la/lo, written to
// functions/_lib/kopis-venues.json as { mt10id: [lat, lng] } (5 decimals). The function asks KOPIS only for a venue
// missing here. Run by hand now and then: `npx tsx scripts/kopis-venues.ts`. Key: repo-root .env KOPIS_API_KEY (read
// by name, never printed). KOPIS blocks bursts (60 at once: 51 blocked; at ~6 a second it blocked after ~120 calls, then
// again soon after each minute's wait), so calls here go one a second (KOPIS_GAP_MS), a block waits 5 minutes, and the
// work so far is kept in the OS temp folder: a run cut short goes on from there.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { xmlRecords, xmlTag } from '../functions/_lib/kopis';

const BASE = 'http://www.kopis.or.kr/openApi/restful';
const GAP_MS = Number(process.env.KOPIS_GAP_MS ?? 1000);
const OUT = resolve(import.meta.dirname, '../functions/_lib/kopis-venues.json');

export function kopisKey(): string {
  const env = readFileSync(resolve(import.meta.dirname, '../../../.env'), 'utf8');
  const k = env.match(/^KOPIS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)?.[1].trim();
  if (!k) throw new Error('KOPIS_API_KEY is not in .env');
  return k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
/** One KOPIS call, paced; a block (HTML 「Request Blocked」) waits 5 minutes and asks again, at most 6 times. The key never
 * appears in what comes back or in an error. */
export async function kopisGet(key: string, path: string, query = ''): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let text = '';
    let status = 0;
    try {
      const res = await fetch(`${BASE}/${path}?service=${encodeURIComponent(key)}${query}`);
      status = res.status;
      text = (await res.text()).split(key).join('KEY');
    } catch {
      status = -1;
    }
    if (status === 200 && text.trimStart().startsWith('<?xml')) return text;
    if (attempt >= 5) throw new Error(`KOPIS ${path.split('/')[0]}: ${status} after ${attempt + 1} tries`);
    console.error(`${new Date().toISOString().slice(11, 19)} KOPIS ${path.split('/')[0]}: ${status}${/Blocked/.test(text) ? ' blocked' : ''}, waiting 5 min`);
    await sleep(300_000);
  }
}

async function main() {
  const key = kopisKey();
  const progress = join(tmpdir(), 'kopis-venues-progress.json');
  const saved = existsSync(progress) ? (JSON.parse(readFileSync(progress, 'utf8')) as { ids: string[]; done: string[]; table: Record<string, [number, number]> }) : null;
  const ids: string[] = saved?.ids ?? [];
  if (!ids.length) {
    for (let page = 1; page < 100; page++) {
      const recs = xmlRecords(await kopisGet(key, 'prfplc', `&cpage=${page}&rows=100&signgucode=11`));
      ids.push(...recs.map((r) => xmlTag(r, 'mt10id')).filter(Boolean));
      if (recs.length < 100) break;
    }
  }
  console.log(`venues listed: ${ids.length}`);
  const table: Record<string, [number, number]> = saved?.table ?? {};
  const done = new Set(saved?.done ?? []);
  const keep = () => writeFileSync(progress, JSON.stringify({ ids, done: [...done], table }));
  let i = done.size;
  for (const id of [...new Set(ids)].sort()) {
    if (done.has(id)) continue;
    let xml: string;
    try {
      xml = await kopisGet(key, `prfplc/${id}`);
    } catch (e) {
      keep();
      throw e;
    }
    done.add(id);
    const rec = xmlRecords(xml)[0] ?? '';
    const lat = Number(xmlTag(rec, 'la'));
    const lng = Number(xmlTag(rec, 'lo'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat && lng) table[id] = [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
    if (++i % 50 === 0) {
      keep();
      console.log(`  ${new Date().toISOString().slice(11, 19)} ${i}/${ids.length}`);
    }
  }
  writeFileSync(OUT, JSON.stringify(table) + '\n');
  console.log(`with coordinates: ${Object.keys(table).length} → ${OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'kopis-venues.ts')) await main();
