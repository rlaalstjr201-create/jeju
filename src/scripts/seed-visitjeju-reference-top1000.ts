#!/usr/bin/env tsx
// DEPRECATED: 잘못된 dedup 가정 (100m skip이 유명 spot 차단). seed-visitjeju-recollect.ts 사용.
// ADR-0023 Amendment 2 참조.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';
import type { VisitjejuRawSpot } from '../application/ports/VisitjejuApiPort.js';

throw new Error('DEPRECATED: dedup v1 (100m skip이 유명 spot 차단). seed-visitjeju-recollect.ts도 폐기 — seed-visitjeju-v2.ts 사용.');

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

const C1_TARGET = 400;
const C4_TARGET = 600;  // restaurant + cafe combined
const CAFE_TARGET = 250;
const INTRO_MIN_LEN = 50;
const DEDUP_RADIUS_M = 100;
const REGION_RATIO = 0.5;  // 50:50

const REGION_MAP: Record<string, string> = {
  region1: 'jeju-city',
  region2: 'seogwipo',
};

// ADR-0044 award patterns (applied to tag + introduction)
const AWARD_PATTERNS: Array<{ pattern: RegExp; award: string }> = [
  { pattern: /블루리본/,                              award: 'blue_ribbon' },
  { pattern: /[1-3]리본/,                             award: 'blue_ribbon_star' },
  { pattern: /미쉐린|미슐랭/,                         award: 'michelin' },
  { pattern: /미쉐린\s*스타|미슐랭\s*스타/,           award: 'michelin_star' },
  { pattern: /빕\s*그루망|Bib\s*Gourmand/i,           award: 'bib_gourmand' },
  { pattern: /백년가게/,                              award: 'baeknyeon_gaje' },
];

const CULTURAL_SPACE_KEYWORDS = ['박물관', '미술관', '갤러리', '공방', '전시'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessedSpot {
  contentsid: string;
  title: string;
  introduction: string;
  tag: string;
  lat: number;
  lng: number;
  region: string;
  category: string;  // sightseeing | restaurant | cafe | cultural_space
  thumbnailUrl: string | null;
}

interface ExistingCoord {
  id: string;
  lat: number;
  lng: number;
  tier: string;
  awardsHint: string[];
  visitjejuContentId: string | null;
}

interface ReferenceTop1000Result {
  visitjejuFetched: number;
  filteredOut: number;
  dedupSkipped: number;
  dedupUpgraded: number;
  awardsExtracted: number;
  reassignedToCulturalSpace: number;
  enqueued: number;
  totalReference: number;
  quotaShortfall: number;
}

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

function classifyC4(spot: VisitjejuRawSpot): 'cafe' | 'restaurant' {
  const tag = spot.tag ?? '';
  const intro = spot.introduction ?? '';

  // Priority 1: tag에 "카페" 직접 포함
  if (tag.split(',').some((t) => t.trim() === '카페' || t.trim().includes('카페'))) {
    return 'cafe';
  }
  // Priority 2: introduction에 "카페" 빈도 ≥ 2
  const cafeCount = (intro.match(/카페/g) ?? []).length;
  if (cafeCount >= 2) return 'cafe';
  // Priority 3: introduction에 카페 관련 키워드
  if (/베이커리|디저트|커피|원두/.test(intro)) return 'cafe';
  return 'restaurant';
}

function hasCulturalSpaceKeyword(spot: VisitjejuRawSpot): boolean {
  const text = (spot.tag ?? '') + ' ' + (spot.introduction ?? '');
  return CULTURAL_SPACE_KEYWORDS.some((kw) => text.includes(kw));
}

function extractAwardsHint(spot: VisitjejuRawSpot): string[] {
  const text = (spot.tag ?? '') + ' ' + (spot.introduction ?? '');
  return AWARD_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ award }) => award);
}

// ---------------------------------------------------------------------------
// Stage 1: Fetch
// ---------------------------------------------------------------------------

async function fetchCategory(
  adapter: VisitjejuAdapter,
  category: string,
  target: number,
  label: string,
): Promise<VisitjejuRawSpot[]> {
  const items: VisitjejuRawSpot[] = [];
  let page = 1;
  for await (const spot of adapter.fetchAll({ category, pageSize: 100 })) {
    items.push(spot);
    if (items.length % 100 === 0) {
      process.stdout.write(`[${label}] collected ${items.length}/${target}\n`);
    }
    if (items.length >= target) break;
    page++;
  }
  process.stdout.write(`[${label}] collected ${items.length}/${target} ✓\n`);
  return items;
}

// ---------------------------------------------------------------------------
// Stage 2: Filter
// ---------------------------------------------------------------------------

interface FilterBreakdown {
  noPhoto: number;
  noIntro: number;
  noCoords: number;
  noPhotoOnly: number;
  noIntroOnly: number;
  noCoordsOnly: number;
  multipleFailures: number;
}

function filterSpots(spots: VisitjejuRawSpot[]): { passed: VisitjejuRawSpot[]; filteredOut: number; breakdown: FilterBreakdown } {
  const passed: VisitjejuRawSpot[] = [];
  let filteredOut = 0;
  const bd: FilterBreakdown = { noPhoto: 0, noIntro: 0, noCoords: 0, noPhotoOnly: 0, noIntroOnly: 0, noCoordsOnly: 0, multipleFailures: 0 };

  for (const spot of spots) {
    const hasPhoto = !!(spot.repPhoto?.thumbnailpath && spot.repPhoto.thumbnailpath.length > 0);
    const introOk = (spot.introduction ?? '').length >= INTRO_MIN_LEN;
    const hasCoords = !!(spot.latitude && spot.longitude &&
      !isNaN(parseFloat(spot.latitude)) && !isNaN(parseFloat(spot.longitude)));

    if (hasPhoto && introOk && hasCoords) {
      passed.push(spot);
    } else {
      filteredOut++;
      const failCount = (!hasPhoto ? 1 : 0) + (!introOk ? 1 : 0) + (!hasCoords ? 1 : 0);
      if (!hasPhoto) bd.noPhoto++;
      if (!introOk) bd.noIntro++;
      if (!hasCoords) bd.noCoords++;
      if (failCount === 1) {
        if (!hasPhoto)  bd.noPhotoOnly++;
        if (!introOk)   bd.noIntroOnly++;
        if (!hasCoords) bd.noCoordsOnly++;
      } else {
        bd.multipleFailures++;
      }
    }
  }
  return { passed, filteredOut, breakdown: bd };
}

// ---------------------------------------------------------------------------
// Stage 3: Classify
// ---------------------------------------------------------------------------

function classifySpots(
  c1Spots: VisitjejuRawSpot[],
  c4Spots: VisitjejuRawSpot[],
): { processed: ProcessedSpot[]; reassignedToCulturalSpace: number } {
  const processed: ProcessedSpot[] = [];
  let reassignedToCulturalSpace = 0;

  for (const spot of c1Spots) {
    const lat = parseFloat(spot.latitude);
    const lng = parseFloat(spot.longitude);
    const region = REGION_MAP[spot.region1cd] ?? 'jeju-city';
    let category = 'sightseeing';
    if (hasCulturalSpaceKeyword(spot)) {
      category = 'cultural_space';
      reassignedToCulturalSpace++;
    }
    processed.push({
      contentsid: spot.contentsid,
      title: spot.title,
      introduction: spot.introduction ?? '',
      tag: spot.tag ?? '',
      lat, lng, region, category,
      thumbnailUrl: spot.repPhoto?.thumbnailpath ?? null,
    });
  }

  // Separate c4 into cafe / restaurant
  const c4Classified = c4Spots.map((spot) => ({
    spot,
    cat: classifyC4(spot),
  }));

  // Apply cafe shortage fallback (Section 6.3)
  const cafeItems = c4Classified.filter((x) => x.cat === 'cafe');
  const restaurantItems = c4Classified.filter((x) => x.cat === 'restaurant');

  let finalCafe = cafeItems;
  let finalRestaurant = restaurantItems;

  if (cafeItems.length < CAFE_TARGET) {
    // Fallback: reclassify restaurant items with 디저트/베이커리 as cafe
    const reclassified = restaurantItems.filter(
      (x) => /디저트|베이커리/.test(x.spot.introduction ?? ''),
    );
    if (reclassified.length > 0) {
      process.stdout.write(
        `[WARNING] cafe shortage: reclassifying ${reclassified.length} restaurant→cafe (디저트/베이커리)\n`,
      );
      const reclassifiedIds = new Set(reclassified.map((x) => x.spot.contentsid));
      finalCafe = [...cafeItems, ...reclassified];
      finalRestaurant = restaurantItems.filter((x) => !reclassifiedIds.has(x.spot.contentsid));
    }
  }

  for (const { spot, cat } of [...finalCafe.map((x) => ({ ...x, cat: 'cafe' as const })), ...finalRestaurant.map((x) => ({ ...x, cat: 'restaurant' as const }))]) {
    const lat = parseFloat(spot.latitude);
    const lng = parseFloat(spot.longitude);
    const region = REGION_MAP[spot.region1cd] ?? 'jeju-city';
    processed.push({
      contentsid: spot.contentsid,
      title: spot.title,
      introduction: spot.introduction ?? '',
      tag: spot.tag ?? '',
      lat, lng, region, category: cat,
      thumbnailUrl: spot.repPhoto?.thumbnailpath ?? null,
    });
  }

  return { processed, reassignedToCulturalSpace };
}

// ---------------------------------------------------------------------------
// Stage 4: Region quota
// ---------------------------------------------------------------------------

function applyRegionQuota(spots: ProcessedSpot[]): ProcessedSpot[] {
  const jejuCity = spots.filter((s) => s.region === 'jeju-city');
  const seogwipo = spots.filter((s) => s.region === 'seogwipo');
  const other = spots.filter((s) => s.region !== 'jeju-city' && s.region !== 'seogwipo');

  const total = spots.length;
  const targetJeju = Math.round(total * REGION_RATIO);
  const targetSeogwipo = total - targetJeju;

  const taken = [
    ...jejuCity.slice(0, targetJeju),
    ...seogwipo.slice(0, targetSeogwipo),
    ...other,
  ];

  // If one region is short, fill from the other
  const shortfall = targetJeju - Math.min(jejuCity.length, targetJeju)
    + targetSeogwipo - Math.min(seogwipo.length, targetSeogwipo);

  if (shortfall > 0) {
    const extraJeju = jejuCity.slice(targetJeju);
    const extraSeogwipo = seogwipo.slice(targetSeogwipo);
    return [...taken, ...extraJeju.slice(0, shortfall), ...extraSeogwipo.slice(0, shortfall)];
  }

  return taken;
}

// ---------------------------------------------------------------------------
// Stage 5: Dedup
// ---------------------------------------------------------------------------

function findExistingMatch(
  spot: ProcessedSpot,
  existing: ExistingCoord[],
): ExistingCoord | undefined {
  return existing.find(
    (ex) => ex.lat !== null && ex.lng !== null &&
      haversineMeters(spot.lat, spot.lng, ex.lat, ex.lng) <= DEDUP_RADIUS_M,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) process.stdout.write('[dry-run] DB writes disabled\n\n');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const adapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY']! });

  const result: ReferenceTop1000Result = {
    visitjejuFetched: 0,
    filteredOut: 0,
    dedupSkipped: 0,
    dedupUpgraded: 0,
    awardsExtracted: 0,
    reassignedToCulturalSpace: 0,
    enqueued: 0,
    totalReference: 0,
    quotaShortfall: 0,
  };

  try {
    // ---- Stage 1: Fetch ----
    process.stdout.write('[Stage 1] Fetching from visitjeju API...\n');
    const [rawC1, rawC4] = await Promise.all([
      fetchCategory(adapter, 'c1', C1_TARGET, 'c1'),
      fetchCategory(adapter, 'c4', C4_TARGET, 'c4'),
    ]);
    result.visitjejuFetched = rawC1.length + rawC4.length;
    process.stdout.write(`[Stage 1] fetched: c1=${rawC1.length} c4=${rawC4.length} total=${result.visitjejuFetched}\n\n`);

    // ---- Stage 2: Filter ----
    process.stdout.write('[Stage 2] Filtering...\n');
    const { passed: passedC1, filteredOut: fo1, breakdown: bd1 } = filterSpots(rawC1);
    const { passed: passedC4, filteredOut: fo2, breakdown: bd2 } = filterSpots(rawC4);
    result.filteredOut = fo1 + fo2;
    process.stdout.write(`[Stage 2] filtered out: ${result.filteredOut} (c1=${fo1} c4=${fo2})\n`);
    // Condition breakdown (items can fail multiple — counts overlap)
    const bd = { noPhoto: bd1.noPhoto + bd2.noPhoto, noIntro: bd1.noIntro + bd2.noIntro, noCoords: bd1.noCoords + bd2.noCoords, noPhotoOnly: bd1.noPhotoOnly + bd2.noPhotoOnly, noIntroOnly: bd1.noIntroOnly + bd2.noIntroOnly, noCoordsOnly: bd1.noCoordsOnly + bd2.noCoordsOnly, multipleFailures: bd1.multipleFailures + bd2.multipleFailures };
    process.stdout.write(`[Stage 2] breakdown (of ${result.filteredOut} rejected):\n`);
    process.stdout.write(`  noPhoto:  ${bd.noPhoto}  (단독 ${bd.noPhotoOnly})\n`);
    process.stdout.write(`  noIntro:  ${bd.noIntro}  (단독 ${bd.noIntroOnly})\n`);
    process.stdout.write(`  noCoords: ${bd.noCoords}  (단독 ${bd.noCoordsOnly})\n`);
    process.stdout.write(`  복합 실패: ${bd.multipleFailures}\n\n`);

    // ---- Stage 3: Classify ----
    process.stdout.write('[Stage 3] Classifying categories...\n');
    const { processed, reassignedToCulturalSpace } = classifySpots(passedC1, passedC4);
    result.reassignedToCulturalSpace = reassignedToCulturalSpace;
    const catCounts = processed.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {});
    process.stdout.write(`[Stage 3] classified: ${JSON.stringify(catCounts)}\n`);
    process.stdout.write(`[Stage 3] cultural_space reassigned from c1: ${reassignedToCulturalSpace}\n\n`);

    // ---- Stage 4: Region quota ----
    process.stdout.write('[Stage 4] Applying region quota...\n');
    const quotaApplied = applyRegionQuota(processed);
    const jejuCount = quotaApplied.filter((s) => s.region === 'jeju-city').length;
    const seogwipoCount = quotaApplied.filter((s) => s.region === 'seogwipo').length;
    process.stdout.write(`[Stage 4] region: 제주시=${jejuCount} 서귀포시=${seogwipoCount}\n\n`);

    // ---- Stage 5: Load existing coords for dedup ----
    process.stdout.write('[Stage 5] Loading existing candidates for dedup...\n');
    const existingRows = await pool.query<{
      id: string; lat: number; lng: number; tier: string;
      awards_hint: string[]; visitjeju_content_id: string | null;
    }>(
      `SELECT id, lat, lng, tier, awards_hint, visitjeju_content_id
       FROM curation_candidates WHERE lat IS NOT NULL AND lng IS NOT NULL`,
    );
    const existingCoords: ExistingCoord[] = existingRows.rows.map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      tier: r.tier,
      awardsHint: r.awards_hint ?? [],
      visitjejuContentId: r.visitjeju_content_id,
    }));
    process.stdout.write(`[Stage 5] loaded ${existingCoords.length} existing candidates\n`);

    // ---- Stage 6: Dedup + awards_hint extraction ----
    process.stdout.write('[Stage 5+6] Dedup and awards extraction...\n');

    const toInsert: ProcessedSpot[] = [];
    const toUpgrade: Array<{ existingId: string; newAwards: string[]; spot: ProcessedSpot }> = [];

    for (const spot of quotaApplied) {
      // Skip if already have this contentsid
      if (existingCoords.some((ex) => ex.visitjejuContentId === spot.contentsid)) {
        result.dedupSkipped++;
        continue;
      }

      const awards = extractAwardsHint(
        { title: spot.title, introduction: spot.introduction, tag: spot.tag } as VisitjejuRawSpot,
      );
      if (awards.length > 0) result.awardsExtracted++;

      const match = findExistingMatch(spot, existingCoords);
      if (match) {
        if (match.tier === 'hidden') {
          // hidden → reference upgrade
          const mergedAwards = [...new Set([...match.awardsHint, ...awards])];
          toUpgrade.push({ existingId: match.id, newAwards: mergedAwards, spot });
          result.dedupUpgraded++;
        } else {
          // reference → skip
          result.dedupSkipped++;
        }
      } else {
        toInsert.push({ ...spot, ...(awards.length > 0 ? { awards } : {}) } as ProcessedSpot & { awards?: string[] });
        result.enqueued++;
      }
    }

    process.stdout.write(`[Stage 5] dedup: skip=${result.dedupSkipped} upgrade=${result.dedupUpgraded}\n`);
    process.stdout.write(`[Stage 6] awards extracted: ${result.awardsExtracted}\n`);
    process.stdout.write(`[Stage 7] to insert: ${toInsert.length} to upgrade: ${toUpgrade.length}\n\n`);

    result.totalReference = result.enqueued + result.dedupUpgraded;
    result.quotaShortfall = 1000 - result.totalReference;

    if (isDryRun) {
      // ---- dry-run output ----
      process.stdout.write('=== [dry-run] SUMMARY ===\n');
      process.stdout.write(`[dry-run] stage 1 fetched:    ${result.visitjejuFetched}  (c1=${rawC1.length} c4=${rawC4.length})\n`);
      process.stdout.write(`[dry-run] stage 2 filtered:   ${result.filteredOut}\n`);
      process.stdout.write(`[dry-run] stage 3 region:     제주시=${jejuCount} / 서귀포시=${seogwipoCount}\n`);
      process.stdout.write(`[dry-run] stage 4 dedup:      skip=${result.dedupSkipped} upgrade=${result.dedupUpgraded}\n`);
      process.stdout.write(`[dry-run] stage 5 awards:     extracted=${result.awardsExtracted}\n`);
      process.stdout.write(`[dry-run] projected enqueue:  ${result.enqueued}  (target 1000 — shortfall ${result.quotaShortfall})\n`);
      process.stdout.write(`[dry-run] 600건 임계값: ${result.totalReference >= 600 ? '✓ OK' : '✗ MISS (supplement 필요)'}\n`);
      process.stdout.write(`[dry-run] DB changes: 0\n`);
      return;
    }

    // ---- Stage 7: DB writes ----
    process.stdout.write('[Stage 7] Writing to DB...\n');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // UPDATEs (hidden → reference)
      for (const { existingId, newAwards } of toUpgrade) {
        await client.query(
          `UPDATE curation_candidates
           SET tier = 'reference', awards_hint = $2, updated_at = NOW()
           WHERE id = $1`,
          [existingId, newAwards],
        );
      }

      // INSERTs
      for (const spot of toInsert) {
        const awards = extractAwardsHint(
          { title: spot.title, introduction: spot.introduction, tag: spot.tag } as VisitjejuRawSpot,
        );
        await client.query(
          `INSERT INTO curation_candidates (
             id, visitjeju_content_id, source_type,
             name, region, category,
             llm_summary, llm_tags, status, discovered_at, sourced_from,
             lat, lng, thumbnail_url,
             tier, awards_hint, updated_at
           ) VALUES (
             $1,$2,'visitjeju',$3,$4,$5,$6,$7,'pending',NOW(),'visitjeju_popular',
             $8,$9,$10,'reference',$11,NOW()
           )
           ON CONFLICT (visitjeju_content_id) WHERE visitjeju_content_id IS NOT NULL DO NOTHING`,
          [
            crypto.randomUUID(),
            spot.contentsid,
            spot.title,
            spot.region,
            spot.category,
            spot.introduction || null,
            spot.tag ? spot.tag.split(',').map((t) => t.trim()).filter(Boolean) : [],
            spot.lat,
            spot.lng,
            spot.thumbnailUrl,
            awards,
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

    // ---- Final report ----
    process.stdout.write('\n=== COMPLETE ===\n');
    process.stdout.write(`visitjejuFetched:         ${result.visitjejuFetched}\n`);
    process.stdout.write(`filteredOut:              ${result.filteredOut}\n`);
    process.stdout.write(`dedupSkipped:             ${result.dedupSkipped}\n`);
    process.stdout.write(`dedupUpgraded:            ${result.dedupUpgraded}\n`);
    process.stdout.write(`awardsExtracted:          ${result.awardsExtracted}\n`);
    process.stdout.write(`reassignedToCulturalSpace:${result.reassignedToCulturalSpace}\n`);
    process.stdout.write(`enqueued:                 ${result.enqueued}\n`);
    process.stdout.write(`totalReference:           ${result.totalReference}\n`);
    process.stdout.write(`quotaShortfall:           ${result.quotaShortfall}\n`);
    if (result.totalReference < 600) {
      process.stdout.write('[WARNING] 총 600건 미달. --supplement 플래그 실행 검토.\n');
    }

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
