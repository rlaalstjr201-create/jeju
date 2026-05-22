#!/usr/bin/env tsx
// Phase A: VisitJeju 전체 적재 (dedup v3, 5분류, 지역 정규화)
// ADR-0051 (카테고리/점수), ADR-0053 (dedup v3)
// Usage: npx tsx seed-visitjeju-v2.ts [--dry-run]
//   --dry-run: c1 첫 10건만 처리, INSERT 없이 통계 출력

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';

// ── Types ─────────────────────────────────────────────────────────

export type Category = 'sightseeing' | 'restaurant' | 'cafe' | 'experience' | 'cultural_space';
export type Region = 'jeju-city' | 'seogwipo' | 'island';

export type CoordState =
  | { state: 'ok';   lat: number; lng: number }
  | { state: 'bbox'; lat: number; lng: number }
  | { state: 'null' };

export interface DedupItem {
  contentsid: string;
  normName: string;
  category: Category;
  lat: number;
  lng: number;
}

// ── Keyword lists ──────────────────────────────────────────────────

const CULTURAL_SPACE_KW = ['박물관', '미술관', '갤러리', '전시관', '기념관', '문학관', '아트센터', '도서관'];
const EXPERIENCE_KW     = ['체험', '만들기', '클래스', '공방', '액티비티', '패러글라이딩', '승마', '낚시', '다이빙', '서핑', '카약'];
const CAFE_KW           = ['카페', '베이커리', '디저트', '빙수', '빵', '로스터리', '티하우스', '찻집'];

// ── Static maps ────────────────────────────────────────────────────

const REGION_MAP: Record<string, Region> = {
  region1: 'jeju-city',
  region2: 'seogwipo',
  region3: 'island',
};

const SUBREGION_MAP: Record<string, string> = {
  '11': '제주시내', '12': '애월',    '13': '한림', '14': '한경', '15': '조천', '16': '구좌', '17': '성산',
  '21': '서귀포시내', '22': '대정', '23': '안덕', '24': '중문', '25': '남원', '26': '표선',
  '31': '우도',   '32': '추자도', '33': '마라도', '34': '비양도', '35': '차귀도', '36': '가파도',
};

const JEJU_LAT: [number, number] = [33.10, 33.60];
const JEJU_LON: [number, number] = [126.10, 126.99];

// ── Pure functions (exported for tests) ───────────────────────────

/**
 * ADR-0051: 5분류. 우선순위 — c1: 문화공간 > 체험 > 관광 / c4: 카페 > 맛집
 * 매칭 대상: title + introduction + tag 합산 텍스트
 */
export function classifyCategory(
  contentscd: string,
  title: string,
  introduction: string,
  tag: string,
): Category {
  const text = `${title} ${introduction} ${tag}`;
  if (contentscd === 'c1') {
    if (CULTURAL_SPACE_KW.some(kw => text.includes(kw))) return 'cultural_space';
    if (EXPERIENCE_KW.some(kw => text.includes(kw))) return 'experience';
    return 'sightseeing';
  }
  // c4
  if (CAFE_KW.some(kw => text.includes(kw))) return 'cafe';
  return 'restaurant';
}

/** region1cd flattenValue 값("region1/region2/region3") → 도메인 enum */
export function normalizeRegion(region1cd: string): Region {
  return REGION_MAP[region1cd] ?? 'jeju-city';
}

/** 좌표 null 체크 + 제주 bbox 체크. 'bbox'는 coords 존재하나 제주 범위 밖 */
export function validateCoords(lat: unknown, lng: unknown): CoordState {
  if (lat == null || lng == null) return { state: 'null' };
  const latN = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const lngN = typeof lng === 'number' ? lng : parseFloat(String(lng));
  if (isNaN(latN) || isNaN(lngN)) return { state: 'null' };
  if (latN < JEJU_LAT[0] || latN > JEJU_LAT[1] || lngN < JEJU_LON[0] || lngN > JEJU_LON[1]) {
    return { state: 'bbox', lat: latN, lng: lngN };
  }
  return { state: 'ok', lat: latN, lng: lngN };
}

/** ADR-0053 normalize: 공백·괄호·특수문자 제거, 소문자화 */
export function normalizeForDedup(name: string): string {
  return name.replace(/[\s\(\)\[\]（）\.\·\-\_]/g, '').toLowerCase();
}

/** ADR-0053 Jaccard bigram 유사도 */
export function jaccardBigram(a: string, b: string): number {
  if (a.length < 2 && b.length < 2) return a === b ? 1 : 0;
  const ba = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) ba.add(a.slice(i, i + 2));
  const bb = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bb.add(b.slice(i, i + 2));
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const bi of ba) if (bb.has(bi)) intersection++;
  return intersection / (ba.size + bb.size - intersection);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * ADR-0053 dedup v3 판정 (coords 있는 두 항목 대상).
 * contentsid 경로는 coords 없어도 작동 — 이 함수는 coords 필수 경로만.
 */
export function isDedupMatch(a: DedupItem, b: DedupItem): boolean {
  if (a.contentsid === b.contentsid) return true;
  if (a.category !== b.category) return false;
  if (Math.abs(a.normName.length - b.normName.length) >= 3) return false;
  if (haversineMeters(a.lat, a.lng, b.lat, b.lng) >= 100) return false;
  return jaccardBigram(a.normName, b.normName) >= 0.7;
}

// ── DedupIndex ─────────────────────────────────────────────────────

class DedupIndex {
  private readonly contentIds = new Set<string>();
  private readonly grid = new Map<string, DedupItem[]>();

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat * 1000)}_${Math.floor(lng * 1000)}`;
  }

  add(item: { contentsid: string; normName: string; category: Category; lat: number | null; lng: number | null }): void {
    this.contentIds.add(item.contentsid);
    if (item.lat != null && item.lng != null) {
      const key = this.cellKey(item.lat, item.lng);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(item as DedupItem);
    }
  }

  isDuplicate(candidate: { contentsid: string; normName: string; category: Category; lat: number | null; lng: number | null }): boolean {
    if (this.contentIds.has(candidate.contentsid)) return true;
    if (candidate.lat == null || candidate.lng == null) return false;

    const ci = Math.floor(candidate.lat * 1000);
    const cj = Math.floor(candidate.lng * 1000);

    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const entries = this.grid.get(`${ci + di}_${cj + dj}`);
        if (!entries) continue;
        for (const e of entries) {
          if (e.category !== candidate.category) continue;
          if (Math.abs(e.normName.length - candidate.normName.length) >= 3) continue;
          if (haversineMeters(e.lat, e.lng, candidate.lat, candidate.lng) >= 100) continue;
          if (jaccardBigram(e.normName, candidate.normName) >= 0.7) return true;
        }
      }
    }
    return false;
  }
}

// ── Env loader ─────────────────────────────────────────────────────

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}

// ── Insert types ───────────────────────────────────────────────────

interface InsertRow {
  name: string;
  region: Region;
  subregion: string | null;
  category: Category;
  llm_summary: string | null;
  llm_tags: string[];
  status: 'pending';
  discovered_at: string;
  sourced_from: 'visitjeju';
  lat: number | null;
  lng: number | null;
  thumbnail_url: string | null;
  visitjeju_content_id: string;
  review_excluded: boolean;
  tier: null;
  raw_alltag: string | null;
}

const INSERT_FIELDS = [
  'name', 'region', 'subregion', 'category', 'llm_summary', 'llm_tags',
  'status', 'discovered_at', 'sourced_from', 'lat', 'lng', 'thumbnail_url',
  'visitjeju_content_id', 'review_excluded', 'tier', 'raw_alltag',
] as const;

function rowToValues(r: InsertRow): unknown[] {
  return [
    r.name, r.region, r.subregion, r.category, r.llm_summary, r.llm_tags,
    r.status, r.discovered_at, r.sourced_from, r.lat, r.lng, r.thumbnail_url,
    r.visitjeju_content_id, r.review_excluded, r.tier, r.raw_alltag,
  ];
}

async function batchInsert(pool: Pool, rows: InsertRow[]): Promise<void> {
  const BATCH = 200;
  const nFields = INSERT_FIELDS.length;

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const params: unknown[] = [];
    const rowPh = batch.map((row, i) => {
      params.push(...rowToValues(row));
      return `(${Array.from({ length: nFields }, (_, fi) => `$${i * nFields + fi + 1}`).join(', ')})`;
    });
    await pool.query(
      `INSERT INTO curation_candidates (${INSERT_FIELDS.join(', ')})
       VALUES ${rowPh.join(', ')}
       ON CONFLICT DO NOTHING`,
      params,
    );
    process.stdout.write(`  적재 ${Math.min(start + BATCH, rows.length)}/${rows.length}\n`);
  }
}

// ── Validation queries ─────────────────────────────────────────────

async function runValidation(pool: Pool): Promise<void> {
  process.stdout.write('\n=== 적재 후 자동 검증 ===\n');

  // 1. category distinct
  const q1 = await pool.query(`
    SELECT category, COUNT(*) AS cnt
    FROM curation_candidates WHERE sourced_from='visitjeju'
    GROUP BY category ORDER BY cnt DESC
  `);
  process.stdout.write('\n[1] category distinct (기대: 5종)\n');
  for (const r of q1.rows) process.stdout.write(`  ${r.category}: ${r.cnt}\n`);

  // 2. region distinct
  const q2 = await pool.query(`
    SELECT region, COUNT(*) AS cnt
    FROM curation_candidates WHERE sourced_from='visitjeju'
    GROUP BY region
  `);
  process.stdout.write('\n[2] region distinct (기대: jeju-city/seogwipo/island)\n');
  for (const r of q2.rows) process.stdout.write(`  ${r.region}: ${r.cnt}\n`);

  // 3. subregion distinct
  const q3 = await pool.query(`
    SELECT subregion, COUNT(*) AS cnt
    FROM curation_candidates WHERE sourced_from='visitjeju'
    GROUP BY subregion ORDER BY cnt DESC
  `);
  process.stdout.write(`\n[3] subregion distinct (기대: 16종) → ${q3.rows.length}종 확인\n`);
  for (const r of q3.rows) process.stdout.write(`  ${r.subregion ?? '(null)'}: ${r.cnt}\n`);

  // 4. thumbnail_url NULL 비율
  const q4 = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE thumbnail_url IS NULL) AS null_cnt,
      COUNT(*) AS total,
      ROUND(100.0 * COUNT(*) FILTER (WHERE thumbnail_url IS NULL) / NULLIF(COUNT(*),0), 2) AS null_pct
    FROM curation_candidates WHERE sourced_from='visitjeju'
  `);
  const { null_cnt, total, null_pct } = q4.rows[0]!;
  const pctOk = parseFloat(null_pct) < 10;
  process.stdout.write(`\n[4] thumbnail_url NULL ${null_cnt}/${total} (${null_pct}%) ${pctOk ? '✅ < 10%' : '⚠️ ≥ 10%'}\n`);

  // 5. llm_summary (introduction) NULL 건수
  const q5 = await pool.query(`
    SELECT COUNT(*) AS null_cnt
    FROM curation_candidates WHERE sourced_from='visitjeju' AND llm_summary IS NULL
  `);
  const introNull = parseInt(q5.rows[0]!.null_cnt, 10);
  process.stdout.write(`\n[5] llm_summary NULL: ${introNull}건 ${introNull === 0 ? '✅' : '⚠️'}\n`);

  // 6. review_excluded 분포
  const q6 = await pool.query(`
    SELECT review_excluded, COUNT(*) AS cnt
    FROM curation_candidates WHERE sourced_from='visitjeju'
    GROUP BY review_excluded
  `);
  process.stdout.write('\n[6] review_excluded 분포\n');
  for (const r of q6.rows) process.stdout.write(`  ${r.review_excluded}: ${r.cnt}\n`);

  // 7. 총 적재 건수
  const q7 = await pool.query(`
    SELECT COUNT(*) AS inserted FROM curation_candidates WHERE sourced_from='visitjeju'
  `);
  process.stdout.write(`\n[7] 총 적재: ${q7.rows[0]!.inserted}건\n`);
}

// ── Main (guard: skip when imported by test runner or other scripts) ─

const _isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (!process.env['VITEST'] && _isMain) await (async () => {
const DRY_RUN = process.argv.includes('--dry-run');
const DRY_LIMIT = 10;

loadEnv();

const whitelistRaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/visitjeju-whitelist.json'), 'utf-8'),
) as Array<{ contentsid: string }>;
const WHITELIST_IDS = new Set(whitelistRaw.map(w => w.contentsid));

const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });
const pool = DRY_RUN ? null : new Pool({ connectionString: process.env['DATABASE_URL'] });

const stats = { fetched: 0, garbage: 0, dedup: 0, review_excluded: 0 };
const rows: InsertRow[] = [];
const dedupIdx = new DedupIndex();
const TODAY = new Date().toISOString().slice(0, 10);

process.stdout.write(DRY_RUN
  ? `[DRY-RUN] c1 첫 ${DRY_LIMIT}건만 처리. INSERT 없음.\n\n`
  : '[FULL-RUN] c1+c4 전체 적재 시작\n\n',
);

outer: for (const cat of ['c1', 'c4'] as const) {
  for await (const spot of adapter.fetchAll({ category: cat })) {
    if (DRY_RUN && stats.fetched >= DRY_LIMIT) break outer;
    stats.fetched++;

    const category  = classifyCategory(spot.contentscd, spot.title, spot.introduction ?? '', spot.tag ?? '');
    const region    = normalizeRegion(spot.region1cd);
    const subregion = SUBREGION_MAP[spot.region2cd] ?? null;
    const coord     = validateCoords(spot.latitude, spot.longitude);
    const introLen  = spot.introduction?.trim().length ?? 0;
    const isWl      = WHITELIST_IDS.has(spot.contentsid);

    // Garbage filter: 좌표 null + intro < 10자 (whitelist 제외)
    if (!isWl) {
      if (introLen === 0) { stats.garbage++; continue; }
      if (coord.state === 'null' && introLen < 10) { stats.garbage++; continue; }
    }

    // Dedup v3
    const normName = normalizeForDedup(spot.title);
    const lat = coord.state !== 'null' ? coord.lat : null;
    const lng = coord.state !== 'null' ? coord.lng : null;

    if (dedupIdx.isDuplicate({ contentsid: spot.contentsid, normName, category, lat, lng })) {
      stats.dedup++;
      continue;
    }
    dedupIdx.add({ contentsid: spot.contentsid, normName, category, lat, lng });

    // review_excluded: 좌표 문제 (null 또는 bbox 밖). whitelist는 항상 false.
    const reviewExcluded = !isWl && coord.state !== 'ok';
    if (reviewExcluded) stats.review_excluded++;

    const row: InsertRow = {
      name: spot.title,
      region,
      subregion,
      category,
      llm_summary:         spot.introduction || null,
      llm_tags:            spot.tag ? spot.tag.split(',').map(t => t.trim()).filter(Boolean) : [],
      status:              'pending',
      discovered_at:       TODAY,
      sourced_from:        'visitjeju',
      lat,
      lng,
      thumbnail_url:       spot.repPhoto?.thumbnailpath ?? null,
      visitjeju_content_id: spot.contentsid,
      review_excluded:     reviewExcluded,
      tier:                null,
      raw_alltag:          spot.alltag || null,
    };

    rows.push(row);

    if (DRY_RUN) {
      process.stdout.write(`[${stats.fetched}] ${spot.title}\n`);
      process.stdout.write(`  category:        ${category}\n`);
      process.stdout.write(`  region:          ${region} / subregion: ${subregion ?? '(null)'}\n`);
      process.stdout.write(`  coord:           ${coord.state} lat=${lat} lng=${lng}\n`);
      process.stdout.write(`  review_excluded: ${reviewExcluded}\n`);
      process.stdout.write(`  intro:           ${introLen}자\n`);
      process.stdout.write(`  thumbnail_url:   ${row.thumbnail_url ? 'ok' : 'null'}\n`);
      process.stdout.write(`  alltag:          ${spot.alltag?.slice(0, 60) || '(empty)'}\n\n`);
    }
  }
}

// ── Stats ──────────────────────────────────────────────────────────

process.stdout.write('=== 처리 통계 ===\n');
process.stdout.write(`  fetched:         ${stats.fetched}\n`);
process.stdout.write(`  garbage_skip:    ${stats.garbage}\n`);
process.stdout.write(`  dedup_skip:      ${stats.dedup}\n`);
process.stdout.write(`  review_excluded: ${stats.review_excluded}\n`);
process.stdout.write(`  to_insert:       ${rows.length}\n`);

if (DRY_RUN) {
  const catMap = new Map<string, number>();
  const regMap = new Map<string, number>();
  let nullThumb = 0, nullIntro = 0;
  for (const r of rows) {
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + 1);
    regMap.set(r.region,   (regMap.get(r.region)   ?? 0) + 1);
    if (!r.thumbnail_url) nullThumb++;
    if (!r.llm_summary)   nullIntro++;
  }
  process.stdout.write('\n=== dry-run 분포 ===\n');
  process.stdout.write('  category: ' + [...catMap.entries()].map(([k, v]) => `${k}=${v}`).join(', ') + '\n');
  process.stdout.write('  region:   ' + [...regMap.entries()].map(([k, v]) => `${k}=${v}`).join(', ') + '\n');
  process.stdout.write(`  thumbnail_url null: ${nullThumb}/${rows.length}\n`);
  process.stdout.write(`  llm_summary null:   ${nullIntro}/${rows.length}\n`);
  process.stdout.write('\n[DRY-RUN 완료] INSERT 없음. 승인 후 TRUNCATE → 풀런.\n');
} else {
  if (!pool) throw new Error('unreachable');
  process.stdout.write('\n=== DB 적재 시작 ===\n');
  await batchInsert(pool, rows);
  await runValidation(pool);
  await pool.end();
  process.stdout.write('\n[FULL-RUN 완료]\n');
}
})();
