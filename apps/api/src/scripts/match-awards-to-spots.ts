/**
 * official_awards → curation_candidates.awards_hint 매칭
 *
 * 매칭 룰:
 *   (a) 정규화 이름 동일 (공백·괄호·특수문자 제거)
 *   (b) AND haversine(candidate 좌표, official 좌표) ≤ 500m
 *   (c) 둘 다 통과 → awards_hint에 award_type 추가
 *       red_ribbon_coca는 awards_hint 제외 (official_awards 보존만)
 *
 * 실행: npx tsx src/scripts/match-awards-to-spots.ts [--dry-run] [--source=bluerribbon]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..', '..');

function loadEnv() {
  try {
    const lines = readFileSync(path.join(ROOT, '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* .env 없음 */ }
}

function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R     = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface OfficialAward {
  id: number;
  award_type: string;
  spot_name: string;
  spot_lat: number;
  spot_lng: number;
}

interface Candidate {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  awards_hint: string[];
}

const MATCH_RADIUS_M = 500;

async function main() {
  loadEnv();
  const isDryRun  = process.argv.includes('--dry-run');
  const sourceArg = process.argv.find(a => a.startsWith('--source='));
  const source    = sourceArg ? sourceArg.split('=')[1]! : 'bluerribbon';

  const db = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // red_ribbon_coca는 매칭 대상 제외
  const { rows: awards } = await db.query<OfficialAward>(
    `SELECT id, award_type, spot_name, spot_lat, spot_lng
     FROM official_awards
     WHERE source = $1
       AND award_type != 'red_ribbon_coca'
       AND spot_lat IS NOT NULL
       AND spot_lat != -1
       AND spot_lng IS NOT NULL`,
    [source],
  );

  const { rows: candidates } = await db.query<Candidate>(
    `SELECT id, name,
       lat, lng,
       COALESCE(awards_hint, '{}') AS awards_hint
     FROM curation_candidates`,
  );

  console.log(`[match-awards] official_awards (좌표 있음, red 제외): ${awards.length}건`);
  console.log(`[match-awards] curation_candidates: ${candidates.length}건`);

  // 후보 이름 인덱스 (정규화 → 후보 배열)
  const candIndex = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const norm = normalizeName(c.name);
    if (!candIndex.has(norm)) candIndex.set(norm, []);
    candIndex.get(norm)!.push(c);
  }

  const updates: Array<{ candidateId: string; hint: string; dist: number; officialName: string }> = [];
  const unmatchedAwards: OfficialAward[] = [];
  const suspiciousMatches: Array<{ award: string; candidate: string; dist: number }> = [];

  for (const award of awards) {
    const normAward  = normalizeName(award.spot_name);
    const nameCands  = candIndex.get(normAward) ?? [];

    let best: Candidate | null = null;
    let bestDist = Infinity;

    for (const c of nameCands) {
      if (c.lat == null || c.lng == null) continue;
      const dist = haversineMeters(c.lat, c.lng, award.spot_lat, award.spot_lng);
      if (dist <= MATCH_RADIUS_M && dist < bestDist) {
        bestDist = dist;
        best     = c;
      }
    }

    if (best) {
      if (!best.awards_hint.includes(award.award_type)) {
        updates.push({ candidateId: best.id, hint: award.award_type, dist: Math.round(bestDist), officialName: award.spot_name });
      }
      if (bestDist > 300) {
        suspiciousMatches.push({ award: award.spot_name, candidate: best.name, dist: Math.round(bestDist) });
      }
    } else {
      unmatchedAwards.push(award);
    }
  }

  if (!isDryRun) {
    for (const { candidateId, hint } of updates) {
      await db.query(
        `UPDATE curation_candidates
         SET awards_hint = array_append(COALESCE(awards_hint, '{}'), $2::text)
         WHERE id = $1
           AND NOT ($2::text = ANY(COALESCE(awards_hint, '{}')))`,
        [candidateId, hint],
      );
    }
  }

  await db.end();

  // ── 리포트 ─────────────────────────────────────────────────────

  const byType: Record<string, number> = {};
  for (const u of updates) {
    byType[u.hint] = (byType[u.hint] ?? 0) + 1;
  }

  const matched = updates.length;
  console.log(`\n[match-awards] 결과`);
  console.log(`  매칭 성공: ${matched}건`);
  console.log(`  매칭 실패 (우리 DB 미수록): ${unmatchedAwards.length}건`);
  console.log(`  awards_hint 업데이트: ${updates.length}건`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');

  console.log('\n  등급별 매칭:');
  for (const [type, cnt] of Object.entries(byType).sort()) {
    console.log(`    ${type}: ${cnt}건`);
  }

  console.log('\n  매칭 샘플 (상위 20건):');
  for (const u of updates.slice(0, 20)) {
    console.log(`    "${u.officialName}" (${u.dist}m) → hint:${u.hint}`);
  }

  if (suspiciousMatches.length > 0) {
    console.log(`\n  의심 케이스 (300m 초과 매칭):`);
    for (const s of suspiciousMatches) {
      console.log(`    [${s.dist}m] "${s.award}" → "${s.candidate}"`);
    }
  }

  console.log(`\n  미매칭 (우리 DB 없음) 상위 30건:`);
  const byTierUnmatched: Record<string, string[]> = {};
  for (const u of unmatchedAwards) {
    if (!byTierUnmatched[u.award_type]) byTierUnmatched[u.award_type] = [];
    byTierUnmatched[u.award_type]!.push(u.spot_name);
  }
  for (const [type, names] of Object.entries(byTierUnmatched).sort()) {
    console.log(`    [${type}]`);
    for (const n of names.slice(0, 10)) console.log(`      - ${n}`);
    if (names.length > 10) console.log(`      ... 외 ${names.length - 10}건`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
