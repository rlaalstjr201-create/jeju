#!/usr/bin/env tsx
// DEPRECATED (2026-05-20): dedup v1 (좌표 100m 단독) — 99% 오매칭 확인, 롤백 대상.
// 후속: dedup v2 (좌표+name 유사도 ≥ 0.7) + 점수 기반 선별 (specs/visitjeju-curation-pipeline-v2.md, ADR-0051).
// Supersedes: seed-visitjeju-reference-top1000.ts
// Spec (폐기됨): specs/visitjeju-recollect-with-tier-merge.md

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import whitelistRaw from '../config/visitjeju-whitelist.json' with { type: 'json' };
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';
import type { VisitjejuRawSpot } from '../application/ports/VisitjejuApiPort.js';

if (!process.env['VITEST']) {
  throw new Error('DEPRECATED: dedup v1 (좌표 100m 단독) — 99% 오매칭. seed-visitjeju-v2.ts 사용 (specs/visitjeju-curation-pipeline-v2.md).');
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

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

loadEnv();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRID_STEP = 0.001;     // ~111m per cell at equator; adequate for Jeju (33°N)
export const DEDUP_RADIUS_M = 100;
export const INTRO_MIN_LEN = 30;

const REGION_MAP: Record<string, string> = {
  region1: 'jeju-city',
  region2: 'seogwipo',
};

const AWARD_PATTERNS: Array<{ pattern: RegExp; award: string }> = [
  { pattern: /블루리본/,                           award: 'blue_ribbon' },
  { pattern: /[1-3]리본/,                          award: 'blue_ribbon_star' },
  { pattern: /미쉐린|미슐랭/,                      award: 'michelin' },
  { pattern: /미쉐린\s*스타|미슐랭\s*스타/,        award: 'michelin_star' },
  { pattern: /빕\s*그루망|Bib\s*Gourmand/i,        award: 'bib_gourmand' },
  { pattern: /백년가게/,                           award: 'baeknyeon_gaje' },
];

const CULTURAL_SPACE_KEYWORDS = ['박물관', '미술관', '갤러리', '공방', '전시'];

// Whitelist: 유명 spot이나 API intro가 임계값 미달인 경우 intro 체크 우회
// src/config/visitjeju-whitelist.json 에서 로드
const WHITELIST_IDS = new Set<string>(
  (whitelistRaw as Array<{ contentsid: string }>).map((w) => w.contentsid),
);

// AC-1 검증 대상 famous spots (contentsid → 이름)
// 동문시장: visitjeju API에 standalone 항목 없음 (주변 식당만 존재), 추적 불가
const FAMOUS_SPOT_IDS: Record<string, string> = {
  'CONT_000000000500618': '천지연폭포',
  'CONT_000000000500469': '용두암',
  'CONT_000000000500685': '한라산국립공원',
  'CONT_000000000500477': '우도(해양도립공원)',
  'CONT_000000000500349': '성산일출봉',
  'CONT_000000000500143': '도두봉',
  'CONT_000000000500270': '비자림',
  'CONT_000000000500697': '협재해수욕장',
  'CNTS_000000000001195': '카멜리아힐',
  'CONT_000000000500182': '만장굴',        // whitelist: intro=29자 (임계값 우회)
  'CNTS_000000000020476': '주상절리대',    // whitelist: intro=20자 (임계값 우회)
};

// ---------------------------------------------------------------------------
// Exported pure functions / types (unit-testable)
// ---------------------------------------------------------------------------

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GridEntry {
  id: string;
  lat: number;
  lng: number;
  tier: string;
  category: string;
  visitjejuContentId: string | null;
  llmSummary: string | null;
  thumbnailUrl: string | null;
  llmTags: string[];
  awardsHint: string[];
}

export class GridIndex {
  private readonly cells = new Map<string, GridEntry[]>();

  private cellKey(lat: number, lng: number): string {
    const row = Math.floor(lat / GRID_STEP);
    const col = Math.floor(lng / GRID_STEP);
    return `${row},${col}`;
  }

  add(entry: GridEntry): void {
    const key = this.cellKey(entry.lat, entry.lng);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key)!.push(entry);
  }

  findWithin100m(lat: number, lng: number): GridEntry | null {
    const row = Math.floor(lat / GRID_STEP);
    const col = Math.floor(lng / GRID_STEP);
    let closest: GridEntry | null = null;
    let closestDist = Infinity;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const key = `${row + dr},${col + dc}`;
        const entries = this.cells.get(key);
        if (!entries) continue;
        for (const entry of entries) {
          const dist = haversineMeters(lat, lng, entry.lat, entry.lng);
          if (dist <= DEDUP_RADIUS_M && dist < closestDist) {
            closest = entry;
            closestDist = dist;
          }
        }
      }
    }
    return closest;
  }
}

export interface MergePayload {
  tier: 'reference';
  category: string;
  visitjejuContentId: string;
  llmSummary: string | undefined;
  llmTags: string[];
  thumbnailUrl: string | undefined;
  awardsHint: string[];
}

// Categories allowed by the DB check constraint
const VALID_CATEGORIES = new Set([
  'sightseeing', 'restaurant', 'cafe', 'experience',
  'cultural_space', 'accommodation', 'shopping', 'other',
]);

export function buildMergePayload(
  existing: GridEntry,
  spot: { contentsid: string; introduction: string; llmTags: string[]; thumbnailUrl: string | null; category: string },
  newAwards: string[],
): MergePayload {
  // Use spot.category whenever existing is invalid (raw code, 'natural', 'souvenir', etc.)
  const category = VALID_CATEGORIES.has(existing.category ?? '') ? existing.category : spot.category;
  return {
    tier: 'reference',
    category,
    visitjejuContentId: existing.visitjejuContentId ?? spot.contentsid,
    llmSummary:
      spot.introduction.length > (existing.llmSummary ?? '').length
        ? spot.introduction
        : undefined,
    llmTags: [...new Set([...existing.llmTags, ...spot.llmTags])],
    thumbnailUrl: existing.thumbnailUrl ?? spot.thumbnailUrl ?? undefined,
    awardsHint: [...new Set([...existing.awardsHint, ...newAwards])],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ProcessedSpot {
  contentsid: string;
  title: string;
  introduction: string;
  llmTags: string[];
  lat: number;
  lng: number;
  region: string;
  category: string;
  thumbnailUrl: string | null;
}

function extractAwardsHint(tag: string, introduction: string): string[] {
  const text = tag + ' ' + introduction;
  return AWARD_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ award }) => award);
}

function classifyC1(spot: VisitjejuRawSpot): 'sightseeing' | 'cultural_space' {
  const text = (spot.tag ?? '') + ' ' + (spot.introduction ?? '');
  return CULTURAL_SPACE_KEYWORDS.some((kw) => text.includes(kw)) ? 'cultural_space' : 'sightseeing';
}

function classifyC4(spot: VisitjejuRawSpot): 'cafe' | 'restaurant' {
  const tag = spot.tag ?? '';
  const intro = spot.introduction ?? '';
  if (tag.split(',').some((t) => t.trim().includes('카페'))) return 'cafe';
  if ((intro.match(/카페/g) ?? []).length >= 2) return 'cafe';
  if (/베이커리|디저트|커피|원두/.test(intro)) return 'cafe';
  return 'restaurant';
}

function passesFilter(spot: VisitjejuRawSpot): { passes: boolean; whitelistBypassed: boolean } {
  const hasCoords = !!(spot.latitude && spot.longitude &&
    !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude)));
  if (!hasCoords) return { passes: false, whitelistBypassed: false };
  if ((spot.introduction ?? '').length >= INTRO_MIN_LEN) return { passes: true, whitelistBypassed: false };
  if (WHITELIST_IDS.has(spot.contentsid)) return { passes: true, whitelistBypassed: true };
  return { passes: false, whitelistBypassed: false };
}

function toProcessedSpot(spot: VisitjejuRawSpot, category: string): ProcessedSpot {
  return {
    contentsid: spot.contentsid,
    title: spot.title,
    introduction: spot.introduction ?? '',
    llmTags: (spot.tag ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    lat: parseFloat(spot.latitude),
    lng: parseFloat(spot.longitude),
    region: REGION_MAP[spot.region1cd] ?? 'jeju-city',
    category,
    thumbnailUrl: spot.repPhoto?.thumbnailpath ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) process.stdout.write('[dry-run] DB writes disabled\n\n');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });

  let fetchedC1 = 0, fetchedC4 = 0;
  let filterPassed = 0;
  let hiddenUpgraded = 0, referenceSkip = 0, newInsert = 0, awardsFound = 0;

  const famousStatus = new Map<string, string>(
    Object.keys(FAMOUS_SPOT_IDS).map((id) => [id, 'NOT_FETCHED']),
  );

  try {
    // ---- Stage 1: Fetch all pages ----
    process.stdout.write('[Stage 1] Fetching c1 (관광지)...\n');
    const rawC1: VisitjejuRawSpot[] = [];
    for await (const spot of adapter.fetchAll({ category: 'c1', pageSize: 100 })) {
      rawC1.push(spot);
      if (rawC1.length % 200 === 0) process.stdout.write(`  c1: ${rawC1.length}\n`);
    }
    fetchedC1 = rawC1.length;
    process.stdout.write(`[Stage 1] c1 done: ${fetchedC1}\n`);

    process.stdout.write('[Stage 1] Fetching c4 (음식점)...\n');
    const rawC4: VisitjejuRawSpot[] = [];
    for await (const spot of adapter.fetchAll({ category: 'c4', pageSize: 100 })) {
      rawC4.push(spot);
      if (rawC4.length % 200 === 0) process.stdout.write(`  c4: ${rawC4.length}\n`);
    }
    fetchedC4 = rawC4.length;
    process.stdout.write(`[Stage 1] c4 done: ${fetchedC4}\n\n`);

    // Mark famous spots as fetched
    for (const spot of [...rawC1, ...rawC4]) {
      if (famousStatus.has(spot.contentsid)) famousStatus.set(spot.contentsid, 'FETCHED');
    }

    // ---- Stage 2 + 3: Filter + Classify ----
    process.stdout.write('[Stage 2+3] Filter + Classify...\n');
    const processed: ProcessedSpot[] = [];
    let whitelistPassed = 0;

    for (const spot of rawC1) {
      const { passes, whitelistBypassed } = passesFilter(spot);
      if (!passes) {
        if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'FILTERED_OUT');
        continue;
      }
      if (whitelistBypassed) whitelistPassed++;
      processed.push(toProcessedSpot(spot, classifyC1(spot)));
    }

    for (const spot of rawC4) {
      const { passes, whitelistBypassed } = passesFilter(spot);
      if (!passes) {
        if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'FILTERED_OUT');
        continue;
      }
      if (whitelistBypassed) whitelistPassed++;
      processed.push(toProcessedSpot(spot, classifyC4(spot)));
    }

    filterPassed = processed.length;
    const catCounts = processed.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1; return acc;
    }, {});
    process.stdout.write(`[Stage 2+3] filter_passed=${filterPassed} (whitelist_bypassed=${whitelistPassed}) categories=${JSON.stringify(catCounts)}\n\n`);

    // ---- Stage 4: Load existing candidates into grid ----
    process.stdout.write('[Stage 4] Loading existing candidates...\n');
    const existingRows = await pool.query<{
      id: string; lat: number; lng: number; tier: string; category: string;
      visitjeju_content_id: string | null; llm_summary: string | null;
      thumbnail_url: string | null; llm_tags: string[]; awards_hint: string[] | null;
    }>(
      `SELECT id, lat, lng, tier, category, visitjeju_content_id, llm_summary, thumbnail_url, llm_tags, awards_hint
       FROM curation_candidates WHERE lat IS NOT NULL AND lng IS NOT NULL`,
    );

    const grid = new GridIndex();
    // Map contentId→entry so we can check tier on contentId matches
    const existingByContentId = new Map<string, GridEntry>();

    for (const row of existingRows.rows) {
      const entry: GridEntry = {
        id: row.id,
        lat: Number(row.lat),
        lng: Number(row.lng),
        tier: row.tier ?? 'hidden',
        category: row.category ?? '',
        visitjejuContentId: row.visitjeju_content_id,
        llmSummary: row.llm_summary,
        thumbnailUrl: row.thumbnail_url,
        llmTags: row.llm_tags ?? [],
        awardsHint: row.awards_hint ?? [],
      };
      grid.add(entry);
      if (entry.visitjejuContentId) existingByContentId.set(entry.visitjejuContentId, entry);
    }
    process.stdout.write(`[Stage 4] loaded ${existingRows.rows.length} existing candidates\n\n`);

    // ---- Stage 5: Dedup + Tier Merge ----
    process.stdout.write('[Stage 5] Dedup + Tier Merge...\n');

    type UpgradeItem = { existingId: string; payload: MergePayload };
    type RefPatchItem = { existingId: string; contentId: string };

    const toUpgrade: UpgradeItem[] = [];
    const toRefPatch: RefPatchItem[] = [];
    const toInsert: Array<ProcessedSpot & { awardsHint: string[] }> = [];
    const upgradedIds = new Set<string>(); // guard against double-upgrade when contentId+grid overlap

    for (const spot of processed) {
      const byContentId = existingByContentId.get(spot.contentsid);
      if (byContentId) {
        if (byContentId.tier === 'reference') {
          referenceSkip++;
          if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'SKIP_CONTENTID');
        } else {
          // hidden with known contentId → upgrade via direct match
          if (!upgradedIds.has(byContentId.id)) {
            const awards = extractAwardsHint(spot.llmTags.join(','), spot.introduction);
            if (awards.length > 0) awardsFound++;
            toUpgrade.push({ existingId: byContentId.id, payload: buildMergePayload(byContentId, { ...spot, category: spot.category }, awards) });
            hiddenUpgraded++;
            upgradedIds.add(byContentId.id);
          }
          if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'UPGRADE');
        }
        continue;
      }

      const awards = extractAwardsHint(spot.llmTags.join(','), spot.introduction);
      if (awards.length > 0) awardsFound++;

      const match = grid.findWithin100m(spot.lat, spot.lng);
      if (match) {
        if (match.tier === 'hidden' && !upgradedIds.has(match.id)) {
          toUpgrade.push({ existingId: match.id, payload: buildMergePayload(match, { ...spot, category: spot.category }, awards) });
          hiddenUpgraded++;
          upgradedIds.add(match.id);
          if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'UPGRADE');
        } else if (match.tier === 'reference') {
          referenceSkip++;
          if (!match.visitjejuContentId) toRefPatch.push({ existingId: match.id, contentId: spot.contentsid });
          if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'SKIP_REF');
        } else {
          // hidden but already queued for upgrade (double-grid scenario)
          referenceSkip++;
          if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'SKIP_ALREADY_QUEUED');
        }
      } else {
        toInsert.push({ ...spot, awardsHint: awards });
        newInsert++;
        if (famousStatus.get(spot.contentsid) === 'FETCHED') famousStatus.set(spot.contentsid, 'INSERT');
      }
    }

    process.stdout.write(`[Stage 5] hidden_upgraded=${hiddenUpgraded} reference_skip=${referenceSkip} new_insert=${newInsert}\n\n`);
    process.stdout.write(`[Stage 6] awards_found=${awardsFound}\n\n`);

    // ---- Famous spot status report ----
    process.stdout.write('[famous spots AC-1 check]\n');
    for (const [id, name] of Object.entries(FAMOUS_SPOT_IDS)) {
      process.stdout.write(`  ${name} (${id}): ${famousStatus.get(id)}\n`);
    }
    process.stdout.write('\n');

    // ---- Dry-run exit ----
    if (isDryRun) {
      const refCountRow = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM curation_candidates WHERE tier = 'reference'`,
      );
      const currentRef = parseInt(refCountRow.rows[0]!.count, 10);
      const projected = currentRef + hiddenUpgraded + newInsert;

      process.stdout.write('=== [dry-run] SUMMARY ===\n');
      process.stdout.write(`[summary] fetched:         c1=${fetchedC1} c4=${fetchedC4} total=${fetchedC1 + fetchedC4}\n`);
      process.stdout.write(`[summary] filter_passed:   ${filterPassed} (whitelist_bypassed=${whitelistPassed})\n`);
      process.stdout.write(`[summary] hidden_upgraded: ${hiddenUpgraded}\n`);
      process.stdout.write(`[summary] reference_skip:  ${referenceSkip}\n`);
      process.stdout.write(`[summary] new_insert:      ${newInsert}\n`);
      process.stdout.write(`[summary] awards_found:    ${awardsFound}\n`);
      process.stdout.write(`[summary] reference_total: ${currentRef} (current) → ${projected} (projected)\n`);
      process.stdout.write(`[summary] AC-3 (≥60):      ${projected >= 60 ? '✓ OK' : '✗ MISS'}\n`);
      return;
    }

    // ---- Stage 7: DB writes ----
    process.stdout.write('[Stage 7] Writing to DB...\n');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const { existingId, payload } of toUpgrade) {
        await client.query(
          `UPDATE curation_candidates
           SET tier = 'reference',
               category = $2,
               visitjeju_content_id = COALESCE(visitjeju_content_id, $3),
               llm_summary = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE llm_summary END,
               llm_tags = $5,
               thumbnail_url = COALESCE(thumbnail_url, $6),
               awards_hint = $7,
               updated_at = NOW()
           WHERE id = $1`,
          [existingId, payload.category, payload.visitjejuContentId, payload.llmSummary ?? null, payload.llmTags, payload.thumbnailUrl ?? null, payload.awardsHint],
        );
      }

      for (const { existingId, contentId } of toRefPatch) {
        await client.query(
          `UPDATE curation_candidates
           SET visitjeju_content_id = $2, updated_at = NOW()
           WHERE id = $1 AND visitjeju_content_id IS NULL`,
          [existingId, contentId],
        );
      }

      for (const spot of toInsert) {
        await client.query(
          `INSERT INTO curation_candidates (
             id, visitjeju_content_id, source_type,
             name, region, category,
             llm_summary, llm_tags, status, discovered_at, sourced_from,
             lat, lng, thumbnail_url,
             tier, awards_hint, updated_at
           ) VALUES (
             $1, $2, 'visitjeju', $3, $4, $5, $6, $7, 'pending', NOW(), 'visitjeju',
             $8, $9, $10, 'reference', $11, NOW()
           )
           ON CONFLICT (id) DO NOTHING`,
          [
            crypto.randomUUID(),
            spot.contentsid,
            spot.title,
            spot.region,
            spot.category,
            spot.introduction || null,
            spot.llmTags,
            spot.lat,
            spot.lng,
            spot.thumbnailUrl,
            spot.awardsHint,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const refCountRow = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM curation_candidates WHERE tier = 'reference'`,
    );
    const referenceTotal = parseInt(refCountRow.rows[0]!.count, 10);

    process.stdout.write('\n=== COMPLETE ===\n');
    process.stdout.write(`[summary] fetched:         c1=${fetchedC1} c4=${fetchedC4} total=${fetchedC1 + fetchedC4}\n`);
    process.stdout.write(`[summary] filter_passed:   ${filterPassed} (whitelist_bypassed=${whitelistPassed})\n`);
    process.stdout.write(`[summary] hidden_upgraded: ${hiddenUpgraded}\n`);
    process.stdout.write(`[summary] reference_skip:  ${referenceSkip}\n`);
    process.stdout.write(`[summary] new_insert:      ${newInsert}\n`);
    process.stdout.write(`[summary] awards_found:    ${awardsFound}\n`);
    process.stdout.write(`[summary] reference_total: ${referenceTotal}\n`);
    process.stdout.write(`[summary] AC-3 (≥60):      ${referenceTotal >= 60 ? '✓ OK' : '✗ MISS'}\n`);

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
