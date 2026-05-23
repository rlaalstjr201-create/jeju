#!/usr/bin/env tsx
/**
 * Phase F: alpha-50 큐레이터 결정 적용
 *
 * 검토된 alpha-50 마크다운 파일을 읽어 DB에 결정을 반영:
 *   approve → comment_warning_flag = 'approved'
 *   edit    → curator_comment 업데이트 + comment_warning_flag = 'approved'
 *   reject  → comment_warning_flag = 'rejected'
 *   (미결정 항목은 건너뜀)
 *
 * 실행: npx tsx src/scripts/phase-f/apply-alpha-decisions.ts [--file dist/alpha-50-YYYY-MM-DD.md] [--dry-run]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env */ }
}

interface ParsedDecision {
  id: string;
  name: string;
  decision: 'approve' | 'edit' | 'reject' | 'pending';
  comment: string | null;
}

function parseMarkdown(content: string): ParsedDecision[] {
  // Split into spot blocks by the horizontal rule divider
  const blocks = content.split(/\n---\n/);
  const results: ParsedDecision[] = [];

  for (const block of blocks) {
    const idMatch = block.match(/<!-- id: ([0-9a-f-]{36}) -->/);
    if (!idMatch) continue;
    const id = idMatch[1]!;

    // Name: ### N. [name] [optional emoji]
    const nameMatch = block.match(/^### \d+\.\s+(.+)/m);
    const name = nameMatch
      ? nameMatch[1]!.replace(/\p{Emoji_Presentation}/gu, '').trim()
      : id;

    // Decision checkboxes: [x] or [ ] for approve / edit / reject
    const decisionMatch = block.match(
      /\*\*결정:\*\*\s*\[([^\]]*)\]\s*approve\s*\[([^\]]*)\]\s*edit\s*\[([^\]]*)\]\s*reject/,
    );
    if (!decisionMatch) continue;
    const [, approveChk, editChk, rejectChk] = decisionMatch;
    let decision: ParsedDecision['decision'] = 'pending';
    if (/x/i.test(approveChk ?? '')) decision = 'approve';
    else if (/x/i.test(editChk ?? '')) decision = 'edit';
    else if (/x/i.test(rejectChk ?? '')) decision = 'reject';

    // Comment text: first `> ` line after **코멘트:** heading
    const commentMatch = block.match(/\*\*코멘트:\*\*\s*\n>\s*(.+)/);
    const comment = commentMatch ? commentMatch[1]!.trim() : null;

    results.push({ id, name, decision, comment });
  }

  return results;
}

function resolveFilePath(args: string[]): string {
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) return args[fileIdx + 1]!;

  const files = readdirSync('dist')
    .filter(f => f.startsWith('alpha-50-') && f.endsWith('.md'))
    .sort();
  if (files.length === 0) throw new Error('dist/ 안에 alpha-50-*.md 파일이 없습니다.');
  return `dist/${files[files.length - 1]!}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const filePath = resolveFilePath(args);

console.log(`파일: ${filePath}${isDryRun ? '  [dry-run]' : ''}`);

const content = readFileSync(filePath, 'utf-8');
const decisions = parseMarkdown(content);
const stats = { approve: 0, edit: 0, reject: 0, pending: 0, error: 0 };

console.log(`\n파싱 결과: ${decisions.length}건`);
for (const d of decisions) {
  const tag = d.decision === 'pending' ? '—' : d.decision;
  console.log(`  [${tag.padEnd(7)}] ${d.name.slice(0, 30)} (${d.id.slice(0, 8)}…)`);
  stats[d.decision]++;
}
console.log(
  `\n결정 통계: approve=${stats.approve} edit=${stats.edit} reject=${stats.reject} pending=${stats.pending}`,
);

const actionable = decisions.filter(d => d.decision !== 'pending');
if (actionable.length === 0) {
  console.log('\n적용할 결정 없음. 검토 파일의 [ ] 체크박스를 [x]로 표시 후 재실행.');
  process.exit(0);
}

if (isDryRun) {
  console.log('\n[dry-run] DB 업데이트 건너뜀.');
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

for (const d of actionable) {
  try {
    if (d.decision === 'approve') {
      await pool.query(
        `UPDATE curation_candidates SET comment_warning_flag = 'approved' WHERE id = $1`,
        [d.id],
      );
    } else if (d.decision === 'edit') {
      if (!d.comment) {
        console.warn(`  [SKIP] ${d.name}: edit 선택됐지만 코멘트가 비어있음`);
        stats.error++;
        continue;
      }
      await pool.query(
        `UPDATE curation_candidates
           SET comment_warning_flag = 'approved',
               curator_comment      = $2
         WHERE id = $1`,
        [d.id, d.comment],
      );
    } else if (d.decision === 'reject') {
      await pool.query(
        `UPDATE curation_candidates SET comment_warning_flag = 'rejected' WHERE id = $1`,
        [d.id],
      );
    }
    console.log(`  [OK] ${d.decision.padEnd(7)} → ${d.name}`);
  } catch (err) {
    console.error(`  [ERR] ${d.name}: ${err}`);
    stats.error++;
  }
}

await pool.end();

console.log(
  `\n완료: approve=${stats.approve} edit=${stats.edit} reject=${stats.reject} 오류=${stats.error}`,
);
if (stats.approve + stats.edit > 0) {
  console.log(`\n다음 단계: Spot 레코드 생성`);
  console.log(`  npx tsx src/scripts/phase-f/run-approve-pipeline.ts`);
}
