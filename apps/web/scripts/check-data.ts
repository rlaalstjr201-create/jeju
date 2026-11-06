/**
 * S1 check (plans/tomorrow-picker.md) against apps/web/public/spots.json.
 * Restaurant / warning-flag rules are verified against the DB by id (SELECT only).
 * Exit code 1 if any rule fails.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { cardTextProblem } from '../src/pick/card-text';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });
const file = resolve(here, '../public/spots.json');
const raw = readFileSync(file);
const data = JSON.parse(raw.toString('utf8')) as Record<string, unknown>[];

const FIELDS = ['id', 'name', 'lat', 'lng', 'mood', 'reason', 'image', 'kakaoPlaceId', 'paid'];
const results: { rule: string; ok: boolean; detail: string }[] = [];
const check = (rule: string, bad: unknown[], detail = '') =>
  results.push({ rule, ok: bad.length === 0, detail: bad.length ? `${bad.length} bad, e.g. ${JSON.stringify(bad.slice(0, 3))}` : detail });
const len = (s: string) => [...s].length;

check('fields exact', data.filter((r) => Object.keys(r).sort().join() !== [...FIELDS].sort().join()));
check('types', data.filter((r) =>
  typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name ||
  typeof r.lat !== 'number' || typeof r.lng !== 'number' || typeof r.reason !== 'string' ||
  typeof r.image !== 'string' || typeof r.kakaoPlaceId !== 'string' || typeof r.paid !== 'boolean'));
check('lat 33.1~33.6, lng 126.1~127.0', data.filter((r) =>
  !((r.lat as number) >= 33.1 && (r.lat as number) <= 33.6 && (r.lng as number) >= 126.1 && (r.lng as number) <= 127.0)).map((r) => r.id));
check('image https', data.filter((r) => !String(r.image).startsWith('https://')).map((r) => r.id));
check('reason 18~120 chars', data.filter((r) => { const n = len(String(r.reason)); return n < 18 || n > 120; }).map((r) => r.id));
check('reason has no price/hours/rating/food wording', data.filter((r) => cardTextProblem({ name: String(r.name), reason: String(r.reason) })).map((r) => r.id));
check('mood in rest|walk|new', data.filter((r) => !['rest', 'walk', 'new'].includes(String(r.mood))).map((r) => r.id));
check('kakaoPlaceId numeric', data.filter((r) => !/^\d+$/.test(String(r.kakaoPlaceId))).map((r) => r.id));
const seen = new Map<string, number>();
for (const r of data) seen.set(String(r.kakaoPlaceId), (seen.get(String(r.kakaoPlaceId)) ?? 0) + 1);
check('kakaoPlaceId unique', [...seen].filter(([, n]) => n > 1).map(([k]) => k));
check('id unique', data.length === new Set(data.map((r) => r.id)).size ? [] : ['dup id']);

// Counts are taken on records the app can actually show (card-text rule applied at load).
const shown = data.filter((r) => !cardTextProblem({ name: String(r.name), reason: String(r.reason) }));
const byMood = { rest: 0, walk: 0, new: 0 } as Record<string, number>;
for (const r of shown) byMood[String(r.mood)] = (byMood[String(r.mood)] ?? 0) + 1;
check('total >= 400 (card-safe)', shown.length >= 400 ? [] : [shown.length], `${shown.length}`);
for (const m of ['rest', 'walk', 'new']) check(`${m} >= 80 (card-safe)`, byMood[m] >= 80 ? [] : [byMood[m]], `${byMood[m]}`);
const gz = gzipSync(raw).length / 1024;
check('gzip <= 120KB', gz <= 120 ? [] : [gz.toFixed(1)], `${gz.toFixed(1)}KB`);

// DB cross-check: category and warning flag of every exported id
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const ids = data.map((r) => String(r.id));
  const { rows } = await client.query<{ id: string; category: string; flag: string | null }>(
    `SELECT s.id::text, s.category, c.comment_warning_flag AS flag
       FROM spots s LEFT JOIN curation_candidates c ON c.synthetic_id = s.synthetic_id AND s.synthetic_id IS NOT NULL
      WHERE s.id::text = ANY($1)
     UNION ALL
     SELECT c.id::text, c.category, c.comment_warning_flag FROM curation_candidates c WHERE c.id::text = ANY($1)`,
    [ids],
  );
  await client.query('ROLLBACK');
  const found = new Set(rows.map((r) => r.id));
  check('every id exists in DB', ids.filter((i) => !found.has(i)));
  check('restaurant 0', rows.filter((r) => r.category === 'restaurant').map((r) => r.id));
  check('flag rejected|needs_fix|declining 0', rows.filter((r) => r.flag && ['rejected', 'needs_fix', 'declining'].includes(r.flag)).map((r) => r.id));
} finally {
  await client.end();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.rule}${r.detail ? `  (${r.detail})` : ''}`);
console.log(JSON.stringify({ total: data.length, cardSafe: shown.length, byMood, gzipKB: +gz.toFixed(1) }));
process.exit(results.every((r) => r.ok) ? 0 : 1);
