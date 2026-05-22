#!/usr/bin/env tsx
/**
 * exclude-experience-polluted.ts
 * category-snippet-audit-v2 결과에서 experience 카테고리 polluted spot에
 * comment_warning_flag='snippet_poor' 플래그 부여.
 *
 * 근거: experience 카테고리 polluted 69건은 비짓제주 c1의 원본 오분류
 *       (해수욕장·올레길·골프장 등이 experience로 분류됨).
 *       keyword 매칭 불가 → snippet_poor 처리로 Phase E 풀런에서 제외.
 *
 * 실행: npx tsx src/scripts/phase-e/exclude-experience-polluted.ts          # dry-run
 *       npx tsx src/scripts/phase-e/exclude-experience-polluted.ts --apply  # 실제 UPDATE
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  const isApply = process.argv.includes('--apply');

  console.log(`\n[exclude-experience-polluted] mode: ${isApply ? 'APPLY' : 'dry-run'}\n`);

  // audit-v2 JSON에서 experience polluted spot_id 목록 로드
  const auditPath = resolve(process.cwd(), 'diagnostics', 'category-snippet-audit-v2-2026-05-21T18-21-06.json');
  const auditData = JSON.parse(readFileSync(auditPath, 'utf-8')) as {
    polluted_list: Array<{ spot_id: string; name: string; category: string; region: string; match_count: number }>;
  };

  const experiencePolluted = auditData.polluted_list.filter(e => e.category === 'experience');

  console.log(`experience polluted 총 ${experiencePolluted.length}건:`);
  for (const e of experiencePolluted) {
    console.log(`  [${e.match_count}매칭] ${e.name} (${e.region})`);
  }

  // 이미 플래그 있는 spot 제외
  const ids = experiencePolluted.map(e => e.spot_id);
  const { rows: alreadyFlagged } = await pool.query<{ id: string; name: string; comment_warning_flag: string }>(
    `SELECT id, name, comment_warning_flag
     FROM curation_candidates
     WHERE id = ANY($1) AND comment_warning_flag IS NOT NULL`,
    [ids],
  );

  const alreadyFlaggedIds = new Set(alreadyFlagged.map(r => r.id));
  const toFlag = experiencePolluted.filter(e => !alreadyFlaggedIds.has(e.spot_id));

  if (alreadyFlagged.length > 0) {
    console.log(`\n이미 플래그된 spot (스킵): ${alreadyFlagged.length}건`);
    for (const r of alreadyFlagged) console.log(`  ${r.name} → ${r.comment_warning_flag}`);
  }

  console.log(`\n신규 플래그 대상: ${toFlag.length}건`);

  if (!isApply) {
    console.log('\n(dry-run: DB 변경 없음. --apply 플래그로 실제 적용)');
    await pool.end();
    return;
  }

  if (toFlag.length > 0) {
    const flagIds = toFlag.map(e => e.spot_id);
    const { rowCount } = await pool.query(
      `UPDATE curation_candidates
       SET comment_warning_flag = 'snippet_poor'
       WHERE id = ANY($1)`,
      [flagIds],
    );
    console.log(`[apply] snippet_poor 플래그 설정: ${rowCount}건`);
  }

  // 최종 분포
  const { rows: summary } = await pool.query<{ flag: string | null; cnt: string }>(
    `SELECT comment_warning_flag AS flag, COUNT(*) AS cnt
     FROM curation_candidates WHERE selected_tier = 'reference'
     GROUP BY comment_warning_flag ORDER BY flag NULLS FIRST`,
  );
  console.log('\n현재 comment_warning_flag 분포:');
  for (const r of summary) {
    console.log(`  ${(r.flag ?? '(null)').padEnd(20)}: ${r.cnt}건`);
  }

  const nullCount = summary.find(r => r.flag === null)?.cnt ?? '0';
  console.log(`\n풀런 대상 (flag IS NULL): ${nullCount}건`);

  await pool.end();
})();
