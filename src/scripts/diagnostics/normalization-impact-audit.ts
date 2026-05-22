#!/usr/bin/env tsx
/**
 * normalization-impact-audit.ts
 * 1,000건 알파 셋에 normalizeSpotName 적용 영향 추정.
 * DB UPDATE 없음 — 분석 전용.
 *
 * 실행: npx tsx src/scripts/diagnostics/normalization-impact-audit.ts
 */
import { Pool } from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSpotName } from '../../lib/normalize-spot-name.js';

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

type ChangePattern = 'parenthesis' | 'trailing_region' | 'whitespace' | 'combined';

function detectPattern(raw: string, normalized: string): ChangePattern {
  const hasParen = /[(（][^)）]*[)）]/.test(raw);
  const hasTrailing = raw.trimEnd().endsWith(' 제주') && !normalized.endsWith('제주');
  const hasWhitespace = raw.replace(/[(（][^)）]*[)）]/g, '').replace(/\s+/g, ' ').trim() !== raw.replace(/[(（][^)）]*[)）]/g, '').trim() && !hasParen && !hasTrailing;

  if (hasParen && hasTrailing) return 'combined';
  if (hasParen) return 'parenthesis';
  if (hasTrailing) return 'trailing_region';
  return 'whitespace';
}

interface AuditEntry {
  spot_id: string;
  raw_name: string;
  normalized_name: string;
  pattern: ChangePattern;
  was_polluted: boolean;
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows: spots } = await pool.query<{
    id: string; name: string; category: string; region: string;
  }>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE selected_tier = 'reference'
     ORDER BY name`,
  );

  await pool.end();

  // audit-v2 JSON에서 polluted spot_id 목록 로드
  const auditV2Path = resolve(process.cwd(), 'diagnostics', 'category-snippet-audit-v2-2026-05-21T18-21-06.json');
  let pollutedIds = new Set<string>();
  try {
    const auditData = JSON.parse(readFileSync(auditV2Path, 'utf-8')) as {
      polluted_list: Array<{ spot_id: string }>;
    };
    pollutedIds = new Set(auditData.polluted_list.map(e => e.spot_id));
  } catch {
    console.warn('[warn] audit-v2 JSON 로드 실패 — polluted 교집합 생략');
  }

  // 정규화 적용
  const changed: AuditEntry[] = [];
  const unchanged: number[] = [];

  for (const spot of spots) {
    const normalized = normalizeSpotName(spot.name);
    if (normalized === spot.name) {
      unchanged.push(0);
    } else {
      changed.push({
        spot_id:         spot.id,
        raw_name:        spot.name,
        normalized_name: normalized,
        pattern:         detectPattern(spot.name, normalized),
        was_polluted:    pollutedIds.has(spot.id),
      });
    }
  }

  const total = spots.length;
  const changedCount = changed.length;

  // 패턴별 분포
  const patternCounts: Record<ChangePattern, number> = {
    parenthesis:     0,
    trailing_region: 0,
    whitespace:      0,
    combined:        0,
  };
  for (const e of changed) patternCounts[e.pattern]++;

  const pollutedIntersect = changed.filter(e => e.was_polluted);

  // ── 출력 ──────────────────────────────────────────────────────────

  console.log(`\n[normalization-audit] 대상: ${total}건\n`);

  console.log('=== 전체 영향 ===');
  console.log(`  변경: ${changedCount}건 (${((changedCount / total) * 100).toFixed(1)}%)`);
  console.log(`  유지: ${total - changedCount}건`);

  console.log('\n=== 패턴별 분포 ===');
  for (const [pat, cnt] of Object.entries(patternCounts) as [ChangePattern, number][]) {
    if (cnt === 0) continue;
    const pct = ((cnt / changedCount) * 100).toFixed(1);
    const label: Record<ChangePattern, string> = {
      parenthesis:     '괄호 제거',
      trailing_region: '지역명 접미어 제거 ( 제주)',
      whitespace:      '공백 정규화',
      combined:        '복합 (괄호 + 지역명)',
    };
    console.log(`  ${label[pat].padEnd(25)}: ${cnt}건 (${pct}%)`);
  }

  console.log(`\n=== audit-v2 polluted와의 교집합 ===`);
  console.log(`  polluted 총 ${pollutedIds.size}건 중 정규화 영향: ${pollutedIntersect.length}건`);
  if (pollutedIntersect.length > 0) {
    for (const e of pollutedIntersect) {
      console.log(`    [${e.pattern}] "${e.raw_name}" → "${e.normalized_name}"`);
    }
  }

  console.log('\n=== 변경 전체 목록 ===');
  for (const e of changed) {
    const pollTag = e.was_polluted ? ' [polluted]' : '';
    console.log(`  [${e.pattern}] "${e.raw_name}" → "${e.normalized_name}"${pollTag}`);
  }

  // JSON dump
  const outPath = resolve(process.cwd(), 'diagnostics', 'normalization-impact-audit.json');
  writeFileSync(outPath, JSON.stringify({
    generated_at:       new Date().toISOString(),
    total,
    changed_count:      changedCount,
    pattern_counts:     patternCounts,
    polluted_intersect: pollutedIntersect.length,
    changed_list:       changed,
  }, null, 2), 'utf-8');
  console.log(`\n[audit] JSON 저장: ${outPath}`);
})();
