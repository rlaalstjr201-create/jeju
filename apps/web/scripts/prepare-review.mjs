// One-off: read-only export of every prefilter-passing candidate into review batches (ADR-0028).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SQL = `
select coalesce(jsonb_agg(t), '[]'::jsonb) from (
  select c.id, c.name, c.category, coalesce(c.subregion, c.region) as area,
         c.lat, c.lng,
         coalesce(s.image_url, c.thumbnail_url) as image,
         case when coalesce(nullif(c.kakao_place_id,''), c.external_links->'kakao'->>'place_id') ~ '^[0-9]+$'
              then coalesce(nullif(c.kakao_place_id,''), c.external_links->'kakao'->>'place_id') end as "kakaoPlaceId",
         c.llm_summary as summary, c.curator_comment as comment, c.augmented_intro as intro,
         c.llm_tags as tags, c.awards_hint as awards
  from curation_candidates c
  left join spots s on s.synthetic_id is not null and s.synthetic_id = c.synthetic_id
  where c.status in ('pending','approved')
    and c.lat between 33.1 and 33.6 and c.lng between 126.1 and 127.0
    and coalesce(s.image_url, c.thumbnail_url) like 'https://%'
    and coalesce(c.comment_warning_flag,'') not in ('rejected','needs_fix','declining')
) t`;

const out = execFileSync('docker', ['exec', 'jeju-pg', 'psql', '-U', 'postgres', '-d', 'jeju', '-At',
  '-c', 'begin transaction read only;', '-c', SQL, '-c', 'commit;'], { maxBuffer: 256 * 1024 * 1024 }).toString();
const line = out.split('\n').find((l) => l.startsWith('['));
const rows = JSON.parse(line);

// Dedupe: same kakao id, or same name within ~50m.
const seen = new Set();
const items = [];
for (const r of rows) {
  const k1 = r.kakaoPlaceId ? `k:${r.kakaoPlaceId}` : null;
  const k2 = `n:${r.name.replace(/\s+/g, '')}:${r.lat.toFixed(3)}:${r.lng.toFixed(3)}`;
  if ((k1 && seen.has(k1)) || seen.has(k2)) continue;
  if (k1) seen.add(k1);
  seen.add(k2);
  const clip = (s, n) => (s ? String(s).slice(0, n) : null);
  items.push({ ...r, summary: clip(r.summary, 300), comment: clip(r.comment, 200), intro: clip(r.intro, 300) });
}

const h = (s) => createHash('sha1').update(s).digest('hex');
const CATS = ['restaurant', 'cafe', 'sightseeing', 'experience', 'cultural_space'];
items.sort((a, b) => CATS.indexOf(a.category) - CATS.indexOf(b.category) || h(a.id).localeCompare(h(b.id)));

const dir = new URL('../review/input/', import.meta.url);
mkdirSync(dir, { recursive: true });
const SIZE = 50;
let n = 0;
for (let i = 0; i < items.length; i += SIZE) {
  writeFileSync(new URL(`batch-${String(++n).padStart(3, '0')}.json`, dir), JSON.stringify(items.slice(i, i + SIZE), null, 1));
}

// Stratified calibration sample (60): deterministic by hash.
const QUOTA = { restaurant: 18, cafe: 12, sightseeing: 12, experience: 12, cultural_space: 6 };
const calib = [];
for (const c of CATS) {
  calib.push(...items.filter((x) => x.category === c).sort((a, b) => h('calib' + a.id).localeCompare(h('calib' + b.id))).slice(0, QUOTA[c]));
}
writeFileSync(new URL('calibration.json', dir), JSON.stringify(calib, null, 1));

const byCat = Object.fromEntries(CATS.map((c) => [c, items.filter((x) => x.category === c).length]));
console.log(JSON.stringify({ total: items.length, batches: n, calibration: calib.length, byCat, noKakaoId: items.filter((x) => !x.kakaoPlaceId).length }));
