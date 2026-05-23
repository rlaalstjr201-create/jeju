#!/usr/bin/env tsx
/**
 * SKIP_REF 292건 전수 분석
 * - Stage 1~5 dedup 로직 재실행 (dry-run 모드)
 * - SKIP_CONTENTID vs SKIP_REF 분리
 * - SKIP_REF 각 건에 대해 name 유사도 계산 (Levenshtein 정규화)
 * - 유사도 ≥ 0.7 = TRUE_DEDUP, < 0.7 = FALSE_DEDUP
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { GridIndex, haversineMeters, type GridEntry } from './seed-visitjeju-recollect.js';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';
import whitelistRaw from '../config/visitjeju-whitelist.json' with { type: 'json' };

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq === -1) continue;
      const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

// ---------------------------------------------------------------------------
// Levenshtein-based name similarity
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function nameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Constants (must match seed script)
// ---------------------------------------------------------------------------
const INTRO_MIN_LEN = 30;
const WHITELIST_IDS = new Set<string>(
  (whitelistRaw as Array<{ contentsid: string }>).map((w) => w.contentsid),
);

const REGION_MAP: Record<string, string> = { region1: 'jeju-city', region2: 'seogwipo' };

function classifyC1(tag: string): string {
  if (/박물관|미술관|갤러리|공방|전시/.test(tag)) return 'cultural_space';
  return 'sightseeing';
}
function classifyC4(intro: string, tag: string): string {
  const text = `${intro} ${tag}`;
  if (/카페|커피/.test(text)) return 'cafe';
  if (/박물관|미술관|갤러리/.test(text)) return 'cultural_space';
  return 'restaurant';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });

// Stage 4: Load DB
process.stdout.write('[Stage 4] Loading DB...\n');
const existingRows = await pool.query<{
  id: string; lat: number; lng: number; tier: string; category: string;
  visitjeju_content_id: string | null; llm_summary: string | null;
  thumbnail_url: string | null; llm_tags: string[]; awards_hint: string[] | null; name: string;
}>(
  `SELECT id, lat, lng, tier, category, visitjeju_content_id, llm_summary, thumbnail_url, llm_tags, awards_hint, name
   FROM curation_candidates WHERE lat IS NOT NULL AND lng IS NOT NULL`,
);

const grid = new GridIndex();
const existingByContentId = new Map<string, GridEntry & { name: string }>();
const nameById = new Map<string, string>();

for (const row of existingRows.rows) {
  const entry = {
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
    name: row.name,
  };
  grid.add(entry);
  if (entry.visitjejuContentId) existingByContentId.set(entry.visitjejuContentId, entry);
  nameById.set(entry.id, row.name);
}
process.stdout.write(`[Stage 4] loaded ${existingRows.rows.length} entries\n\n`);

// Stage 1+2+3: Fetch + filter
process.stdout.write('[Stage 1] Fetching c1...\n');
const processed: Array<{ contentsid: string; title: string; lat: number; lng: number; category: string }> = [];

for await (const spot of adapter.fetchAll({ category: 'c1', pageSize: 100 })) {
  const hasCoords = !!(spot.latitude && spot.longitude && !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude)));
  if (!hasCoords) continue;
  const intro = spot.introduction ?? '';
  if (intro.length < INTRO_MIN_LEN && !WHITELIST_IDS.has(spot.contentsid)) continue;
  processed.push({ contentsid: spot.contentsid, title: spot.title, lat: parseFloat(spot.latitude), lng: parseFloat(spot.longitude), category: classifyC1(spot.tag ?? '') });
}
process.stdout.write(`[Stage 1] c1 done\n`);

for await (const spot of adapter.fetchAll({ category: 'c4', pageSize: 100 })) {
  const hasCoords = !!(spot.latitude && spot.longitude && !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude)));
  if (!hasCoords) continue;
  const intro = spot.introduction ?? '';
  if (intro.length < INTRO_MIN_LEN && !WHITELIST_IDS.has(spot.contentsid)) continue;
  processed.push({ contentsid: spot.contentsid, title: spot.title, lat: parseFloat(spot.latitude), lng: parseFloat(spot.longitude), category: classifyC4(intro, spot.tag ?? '') });
}
process.stdout.write(`[Stage 1] c4 done. processed=${processed.length}\n\n`);

// Stage 5: Dedup analysis
type SkipRefRecord = {
  spotTitle: string;
  spotContentsid: string;
  matchName: string;
  matchTier: string;
  matchCid: string | null;
  distM: number;
  similarity: number;
  verdict: 'TRUE_DEDUP' | 'FALSE_DEDUP';
};

const upgradedIds = new Set<string>();
let skipContentid = 0;
let skipRef = 0;
let hiddenUpgraded = 0;
let newInsert = 0;
const skipRefRecords: SkipRefRecord[] = [];

for (const spot of processed) {
  const byContentId = existingByContentId.get(spot.contentsid);
  if (byContentId) {
    if (byContentId.tier === 'reference') {
      skipContentid++;
    } else {
      if (!upgradedIds.has(byContentId.id)) { hiddenUpgraded++; upgradedIds.add(byContentId.id); }
    }
    continue;
  }

  const match = grid.findWithin100m(spot.lat, spot.lng);
  if (match) {
    if (match.tier === 'hidden' && !upgradedIds.has(match.id)) {
      hiddenUpgraded++; upgradedIds.add(match.id);
    } else if (match.tier === 'reference') {
      skipRef++;
      const matchName = nameById.get(match.id) ?? '';
      const sim = nameSimilarity(spot.title, matchName);
      const distM = Math.round(haversineMeters(spot.lat, spot.lng, match.lat, match.lng));
      skipRefRecords.push({
        spotTitle: spot.title,
        spotContentsid: spot.contentsid,
        matchName,
        matchTier: match.tier,
        matchCid: match.visitjejuContentId,
        distM,
        similarity: Math.round(sim * 100) / 100,
        verdict: sim >= 0.7 ? 'TRUE_DEDUP' : 'FALSE_DEDUP',
      });
    } else {
      // already queued
      skipRef++;
      const matchName = nameById.get(match.id) ?? '';
      const sim = nameSimilarity(spot.title, matchName);
      const distM = Math.round(haversineMeters(spot.lat, spot.lng, match.lat, match.lng));
      skipRefRecords.push({
        spotTitle: spot.title, spotContentsid: spot.contentsid,
        matchName, matchTier: 'hidden(queued)', matchCid: match.visitjejuContentId,
        distM, similarity: Math.round(sim * 100) / 100,
        verdict: sim >= 0.7 ? 'TRUE_DEDUP' : 'FALSE_DEDUP',
      });
    }
  } else {
    newInsert++;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const trueDup = skipRefRecords.filter((r) => r.verdict === 'TRUE_DEDUP').length;
const falseDup = skipRefRecords.filter((r) => r.verdict === 'FALSE_DEDUP').length;

process.stdout.write('=== SKIP_REF 전수 분석 결과 ===\n');
process.stdout.write(`  SKIP_CONTENTID (exact contentid match → reference): ${skipContentid}\n`);
process.stdout.write(`  SKIP_REF total (grid-only match):                   ${skipRef}\n`);
process.stdout.write(`    TRUE_DEDUP  (similarity ≥ 0.7):                   ${trueDup} (${Math.round(100*trueDup/skipRef)}%)\n`);
process.stdout.write(`    FALSE_DEDUP (similarity < 0.7):                   ${falseDup} (${Math.round(100*falseDup/skipRef)}%)\n`);
process.stdout.write(`  hidden_upgraded:                                     ${hiddenUpgraded}\n`);
process.stdout.write(`  new_insert:                                          ${newInsert}\n`);
process.stdout.write('\n');

process.stdout.write('=== FALSE_DEDUP 상세 (similarity < 0.7) ===\n');
const falseRecords = skipRefRecords.filter((r) => r.verdict === 'FALSE_DEDUP').sort((a, b) => a.similarity - b.similarity);
for (const r of falseRecords) {
  process.stdout.write(
    `  sim=${String(r.similarity).padEnd(4)} dist=${String(r.distM).padEnd(5)}m  [API] ${r.spotTitle.padEnd(30)} vs [DB] ${r.matchName}\n`,
  );
}

process.stdout.write('\n=== TRUE_DEDUP 샘플 (similarity ≥ 0.7, 상위 20) ===\n');
const trueRecords = skipRefRecords.filter((r) => r.verdict === 'TRUE_DEDUP').sort((a, b) => b.similarity - a.similarity).slice(0, 20);
for (const r of trueRecords) {
  process.stdout.write(
    `  sim=${String(r.similarity).padEnd(4)} dist=${String(r.distM).padEnd(5)}m  [API] ${r.spotTitle.padEnd(30)} vs [DB] ${r.matchName}\n`,
  );
}

// Similarity distribution
process.stdout.write('\n=== 유사도 분포 ===\n');
const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
for (let i = 0; i < bins.length - 1; i++) {
  const lo = bins[i]!, hi = bins[i + 1]!;
  const count = skipRefRecords.filter((r) => r.similarity >= lo && r.similarity < hi).length;
  const bar = '█'.repeat(count);
  process.stdout.write(`  [${lo.toFixed(1)}-${hi.toFixed(1)}) ${String(count).padEnd(4)} ${bar}\n`);
}

await pool.end();
