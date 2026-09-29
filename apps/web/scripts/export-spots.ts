/**
 * One-off export: local Postgres -> apps/web/public/spots.json (ADR-0027, plans/tomorrow-picker.md).
 * SELECT only. Run once; the JSON is the fixed data set afterwards.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { cardTextProblem } from '../src/card-text';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outPath = resolve(here, '../public/spots.json');
config({ path: resolve(repoRoot, '.env') });

export type Mood = 'rest' | 'walk' | 'new';
export interface SpotRecord {
  id: string;
  name: string;
  lat: number;
  lng: number;
  mood: Mood;
  reason: string;
  image: string;
  kakaoPlaceId: string;
  paid: boolean;
}

interface Row {
  src: 'spot' | 'candidate';
  id: string;
  name: string;
  category: string;
  lat: number | null;
  lng: number | null;
  reason: string | null;
  image: string | null;
  kakao_place_id: string | null;
  price_range: string | null;
  flag: string | null;
}

const REST_WORDS = /해변|해수욕장|바다|해안|전망|포구|비치/;
const EXCLUDED_FLAGS = new Set(['rejected', 'needs_fix', 'declining']);

function moodOf(category: string, name: string, reason: string): Mood | null {
  switch (category) {
    case 'cafe':
      return 'rest';
    case 'sightseeing':
      return REST_WORDS.test(name) || REST_WORDS.test(reason) ? 'rest' : 'walk';
    case 'oreum':
      return 'walk';
    case 'experience':
    case 'cultural_space':
      return 'new';
    default:
      return null; // restaurant, accommodation, shopping, other
  }
}

const clean = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const len = (s: string) => [...s].length;

// spots: comment from curator_comment (curation_comment is empty in the DB);
// kakao id from spots.kakao_place_id, else the source candidate's verified kakao link.
const SPOTS_SQL = `
  SELECT 'spot' AS src, s.id::text, s.name, s.category, s.lat, s.lng,
         COALESCE(NULLIF(s.curation_comment, ''), s.curator_comment) AS reason,
         COALESCE(NULLIF(s.image_url, ''), NULLIF(s.thumbnail_url, '')) AS image,
         COALESCE(NULLIF(s.kakao_place_id, ''), c.external_links->'kakao'->>'place_id') AS kakao_place_id,
         s.price_range, c.comment_warning_flag AS flag
  FROM spots s
  LEFT JOIN curation_candidates c ON c.synthetic_id = s.synthetic_id AND s.synthetic_id IS NOT NULL
  WHERE s.is_active = true
  ORDER BY s.id`;

const CANDIDATES_SQL = `
  SELECT 'candidate' AS src, c.id::text, c.name, c.category, c.lat, c.lng,
         c.curator_comment AS reason,
         NULLIF(c.thumbnail_url, '') AS image,
         COALESCE(NULLIF(c.kakao_place_id, ''), c.external_links->'kakao'->>'place_id') AS kakao_place_id,
         c.price_range, c.comment_warning_flag AS flag
  FROM curation_candidates c
  WHERE c.status = 'pending'
  ORDER BY c.final_score DESC NULLS LAST, c.id`;

// kakao ids held by any spot (active or not), for the "exclude candidates duplicating spots" rule
const SPOT_KAKAO_SQL = `
  SELECT DISTINCT COALESCE(NULLIF(s.kakao_place_id, ''), c.external_links->'kakao'->>'place_id') AS k
  FROM spots s
  LEFT JOIN curation_candidates c ON c.synthetic_id = s.synthetic_id AND s.synthetic_id IS NOT NULL`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing in repo-root .env');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  let spots: Row[], candidates: Row[], spotKakao: Set<string>;
  try {
    await client.query('BEGIN READ ONLY');
    spots = (await client.query<Row>(SPOTS_SQL)).rows;
    candidates = (await client.query<Row>(CANDIDATES_SQL)).rows;
    spotKakao = new Set(
      (await client.query<{ k: string | null }>(SPOT_KAKAO_SQL)).rows.map((r) => r.k).filter((k): k is string => !!k),
    );
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }

  const drop: Record<string, number> = {};
  const bump = (why: string) => (drop[why] = (drop[why] ?? 0) + 1);
  const out: SpotRecord[] = [];
  const seenKakao = new Set<string>();

  for (const r of [...spots, ...candidates]) {
    const name = clean(r.name);
    const reason = clean(r.reason);
    const kakao = clean(r.kakao_place_id);
    const image = clean(r.image);
    const mood = moodOf(r.category, name, reason);
    if (!mood) { bump(`category:${r.category}`); continue; }
    if (r.flag && EXCLUDED_FLAGS.has(r.flag)) { bump(`flag:${r.flag}`); continue; }
    if (r.lat == null || r.lng == null || r.lat < 33.1 || r.lat > 33.6 || r.lng < 126.1 || r.lng > 127.0) { bump('coords'); continue; }
    if (!image.startsWith('https://')) { bump('image'); continue; }
    if (len(reason) < 18 || len(reason) > 120) { bump(reason ? 'reason_length' : 'reason_missing'); continue; }
    const textProblem = cardTextProblem({ name, reason });
    if (textProblem) { bump(`card_text:${textProblem}`); continue; }
    if (!/^\d+$/.test(kakao)) { bump('kakao_missing'); continue; }
    if (r.src === 'candidate' && spotKakao.has(kakao)) { bump('dup_of_spot'); continue; }
    if (seenKakao.has(kakao)) { bump('dup_kakao'); continue; }
    seenKakao.add(kakao);
    out.push({
      id: r.id, name, lat: r.lat, lng: r.lng, mood, reason, image, kakaoPlaceId: kakao,
      paid: r.price_range != null && r.price_range !== 'free',
    });
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out));
  const byMood = out.reduce<Record<string, number>>((a, s) => ((a[s.mood] = (a[s.mood] ?? 0) + 1), a), {});
  console.log(JSON.stringify({ input: { spots: spots.length, candidates: candidates.length }, written: out.length, byMood, dropped: drop }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
