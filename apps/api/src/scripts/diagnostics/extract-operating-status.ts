#!/usr/bin/env tsx
/**
 * extract-operating-status.ts
 * ADR-0056: curation_candidates.name 괄호 운영 상태 분리 + spot name 정규화.
 *
 * 49건 분류:
 *   a. parenthesis + 운영 키워드 → name 정규화 + operating_status 추출
 *   b. parenthesis + 별명/지점    → name 정규화만, status NULL
 *   c. trailing_region (11건)     → name 정규화만
 *   d. whitespace (5건)           → name 정규화만
 *
 * 실행: npx tsx src/scripts/diagnostics/extract-operating-status.ts          # dry-run
 *       npx tsx src/scripts/diagnostics/extract-operating-status.ts --apply  # 실제 UPDATE
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
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

// 운영 상태 키워드
const OPERATING_KEYWORDS = /공사|중단|폐쇄|휴업|운영|점검|예정|이전|개관|재개방|휴관/;

// 괄호 안 내용 추출 (전각 포함)
function extractParenContent(raw: string): string | null {
  const m = raw.match(/[(（]([^)）]*)[ )）]/);
  return m ? m[1]!.trim() : null;
}

type ChangeClass =
  | 'operating_status' // 괄호 + 운영 키워드 → name + status 변경
  | 'alias'            // 괄호 + 별명/지점   → name만 변경
  | 'trailing_region'  // trailing " 제주"   → name만 변경
  | 'whitespace';      // 공백 정규화        → name만 변경

interface Entry {
  spot_id: string;
  raw_name: string;
  normalized_name: string;
  change_class: ChangeClass;
  extracted_status: string | null;
}

function classify(raw: string, normalized: string): Entry | null {
  if (raw === normalized) return null;

  const hasParen = /[(（][^)）]*[)）]/.test(raw);

  if (hasParen) {
    const parenContent = extractParenContent(raw);
    if (parenContent && OPERATING_KEYWORDS.test(parenContent)) {
      return {
        spot_id: '', raw_name: raw, normalized_name: normalized,
        change_class: 'operating_status',
        extracted_status: parenContent,
      };
    }
    return {
      spot_id: '', raw_name: raw, normalized_name: normalized,
      change_class: 'alias',
      extracted_status: null,
    };
  }

  if (raw.trimEnd().endsWith(' 제주') && !normalized.endsWith('제주')) {
    return {
      spot_id: '', raw_name: raw, normalized_name: normalized,
      change_class: 'trailing_region',
      extracted_status: null,
    };
  }

  return {
    spot_id: '', raw_name: raw, normalized_name: normalized,
    change_class: 'whitespace',
    extracted_status: null,
  };
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const isApply = process.argv.includes('--apply');

  console.log(`\n[extract-operating-status] mode: ${isApply ? 'APPLY' : 'dry-run'}\n`);

  const { rows: spots } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM curation_candidates WHERE selected_tier = 'reference' ORDER BY name`,
  );

  // 분류
  const entries: Entry[] = [];
  for (const spot of spots) {
    const normalized = normalizeSpotName(spot.name);
    const entry = classify(spot.name, normalized);
    if (entry) {
      entry.spot_id = spot.id;
      entries.push(entry);
    }
  }

  const byClass: Record<ChangeClass, Entry[]> = {
    operating_status: [],
    alias: [],
    trailing_region: [],
    whitespace: [],
  };
  for (const e of entries) byClass[e.change_class].push(e);

  // ── 출력 ──────────────────────────────────────────────────────────

  console.log(`=== 전체 영향: ${entries.length}건 ===`);
  console.log(`  operating_status 추출: ${byClass.operating_status.length}건`);
  console.log(`  alias (name만 정규화): ${byClass.alias.length}건`);
  console.log(`  trailing_region:       ${byClass.trailing_region.length}건`);
  console.log(`  whitespace:            ${byClass.whitespace.length}건`);

  console.log('\n=== [a] 운영 키워드 포함 → name 정규화 + operating_status 추출 ===');
  for (const e of byClass.operating_status) {
    console.log(`  "${e.raw_name}"`);
    console.log(`    → name: "${e.normalized_name}"`);
    console.log(`    → operating_status: "${e.extracted_status}"`);
    console.log(`    → source: 'visitjeju'`);
  }

  console.log('\n=== [b] 별명/지점 괄호 → name 정규화만 ===');
  for (const e of byClass.alias) {
    console.log(`  "${e.raw_name}" → "${e.normalized_name}"`);
  }

  console.log('\n=== [c] trailing_region → name 정규화만 ===');
  for (const e of byClass.trailing_region) {
    console.log(`  "${e.raw_name}" → "${e.normalized_name}"`);
  }

  console.log('\n=== [d] whitespace → name 정규화만 ===');
  for (const e of byClass.whitespace) {
    console.log(`  "${e.raw_name}" → "${e.normalized_name}"`);
  }

  if (!isApply) {
    console.log('\n(dry-run: DB 변경 없음. --apply 플래그로 실제 적용)');
    await pool.end();
    return;
  }

  // ── --apply ──────────────────────────────────────────────────────

  let nameOnlyCount = 0;
  let statusCount = 0;

  for (const e of entries) {
    if (e.change_class === 'operating_status') {
      await pool.query(
        `UPDATE curation_candidates
         SET name = $1,
             operating_status = $2,
             operating_status_source = 'visitjeju',
             operating_status_updated_at = NOW()
         WHERE id = $3`,
        [e.normalized_name, e.extracted_status, e.spot_id],
      );
      statusCount++;
    } else {
      await pool.query(
        `UPDATE curation_candidates SET name = $1 WHERE id = $2`,
        [e.normalized_name, e.spot_id],
      );
      nameOnlyCount++;
    }
  }

  console.log(`\n[apply] name + status 업데이트: ${statusCount}건`);
  console.log(`[apply] name만 업데이트:          ${nameOnlyCount}건`);
  console.log(`[apply] 합계: ${statusCount + nameOnlyCount}건`);

  // 결과 검증 샘플
  const { rows: check } = await pool.query<{
    name: string; operating_status: string | null; operating_status_source: string | null;
  }>(
    `SELECT name, operating_status, operating_status_source
     FROM curation_candidates
     WHERE operating_status IS NOT NULL
     ORDER BY name`,
  );
  console.log(`\n[verify] operating_status 설정된 spot (${check.length}건):`);
  for (const r of check) {
    console.log(`  "${r.name}" → "${r.operating_status}" (source: ${r.operating_status_source})`);
  }

  await pool.end();
})();
