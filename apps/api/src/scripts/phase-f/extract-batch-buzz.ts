#!/usr/bin/env tsx
/**
 * Phase F: external_buzz_count 상위 60건 큐레이터 검토 배치 추출
 *
 * 선택 기준: comment_warning_flag IS NULL AND comment_draft IS NOT NULL
 *            AND status NOT IN ('approved')
 *            AND external_buzz_count IS NOT NULL
 *            ORDER BY external_buzz_count DESC LIMIT 60
 *
 * 출력: dist/batch-buzz-60-<date>.md
 * 실행: npx tsx src/scripts/phase-f/extract-batch-buzz.ts [--dry-run]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
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

interface CommentDraft {
  comment: string;
  source_id: string;
  evidence_quote?: string;
}

interface CandidateRow {
  id: string;
  name: string;
  category: string;
  region: string;
  comment_draft: CommentDraft;
  place_url: string | null;
  buzz_count: number;
  trend_category: string | null;
  final_score: number | null;
}

const CAT_LABELS: Record<string, string> = {
  sightseeing:    '관광지·자연',
  restaurant:     '음식점',
  cultural_space: '문화공간',
  experience:     '체험',
  cafe:           '카페',
};

const REGION_LABELS: Record<string, string> = {
  'jeju-city': '제주시',
  eastern:     '동부',
  seogwipo:    '서귀포시',
  western:     '서부',
  hallasan:    '한라산',
};

function regionLabel(r: string): string {
  return REGION_LABELS[r] ?? r;
}

function renderMarkdown(rows: CandidateRow[], date: string): string {
  const lines: string[] = [
    `# Phase F Batch-Buzz-60 큐레이터 검토`,
    ``,
    `생성일: ${date}  `,
    `선택 기준: external_buzz_count IS NOT NULL, comment_warning_flag IS NULL, spots 미등재  `,
    `정렬: external_buzz_count 내림차순 상위 60건  `,
    ``,
    `**검토 방법**:`,
    `- approve: 초안 코멘트 그대로 사용`,
    `- edit: **코멘트** 줄의 \`> \` 뒤 텍스트를 직접 수정 후 approve`,
    `- reject: 스팟 제외`,
    ``,
    `---`,
    ``,
  ];

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]!;
    const draft = s.comment_draft;
    const rank = i + 1;

    lines.push(`### ${rank}. ${s.name}`);
    lines.push(
      `**카테고리:** ${CAT_LABELS[s.category] ?? s.category}` +
      ` | **지역:** ${regionLabel(s.region)}` +
      ` | **buzz:** ${s.buzz_count.toLocaleString()}` +
      ` | **trend:** \`${s.trend_category ?? 'NULL'}\`` +
      ` | **score:** ${s.final_score ?? '-'}`,
    );
    if (s.place_url) {
      lines.push(`**카카오맵:** [${s.name} 지도보기](${s.place_url})`);
    } else {
      lines.push(`**카카오맵:** (없음)`);
    }
    lines.push('');
    lines.push(`**초안 코멘트:**`);
    lines.push(`> ${draft.comment}`);
    lines.push('');
    if (draft.evidence_quote) {
      lines.push(`**근거 인용:** "${draft.evidence_quote}"`);
      lines.push('');
    }
    lines.push(`**결정:** [ ] approve  [ ] edit  [ ] reject`);
    lines.push('');
    lines.push(`**코멘트** (approve: 초안 그대로 / edit: 아래 수정 후 approve 체크):`);
    lines.push(`> ${draft.comment}`);
    lines.push('');
    lines.push(`<!-- id: ${s.id} -->`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`_총 ${rows.length}건 / Phase F Batch-Buzz-60_`);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const { rows } = await pool.query<CandidateRow>(`
  SELECT
    id,
    name,
    category,
    region,
    comment_draft,
    external_links::jsonb->'kakao'->>'place_url' AS place_url,
    external_buzz_count                          AS buzz_count,
    trend_category,
    final_score
  FROM curation_candidates
  WHERE comment_warning_flag IS NULL
    AND comment_draft IS NOT NULL
    AND status NOT IN ('approved')
    AND external_buzz_count IS NOT NULL
  ORDER BY external_buzz_count DESC
  LIMIT 60
`);

// ── 검증 ─────────────────────────────────────────────────────────────────────

if (rows.length !== 60) {
  console.warn(`⚠ 대상 ${rows.length}건 (목표 60건 미달)`);
}

const noKakao = rows.filter(r => !r.place_url);
const catCount: Record<string, number> = {};
const trendCount: Record<string, number> = {};
for (const r of rows) {
  catCount[r.category] = (catCount[r.category] ?? 0) + 1;
  const t = r.trend_category ?? 'NULL';
  trendCount[t] = (trendCount[t] ?? 0) + 1;
}

console.log(`\n=== 추출 결과 ===`);
console.log(`  총 건수        : ${rows.length}건 ${rows.length === 60 ? '✓' : '⚠'}`);
console.log(`  buzz 범위      : ${rows.at(-1)!.buzz_count.toLocaleString()} ~ ${rows[0]!.buzz_count.toLocaleString()}`);
console.log(`  kakao URL 없음 : ${noKakao.length}건${noKakao.length > 0 ? ' (' + noKakao.map(r => r.name).join(', ') + ')' : ''}`);

console.log(`\n  카테고리 분포:`);
for (const [cat, cnt] of Object.entries(catCount).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${(CAT_LABELS[cat] ?? cat).padEnd(16)}: ${cnt}건`);
}

console.log(`\n  trend_category 분포:`);
for (const [t, cnt] of Object.entries(trendCount).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(12)}: ${cnt}건`);
}

if (isDryRun) {
  console.log('\n[dry-run] 파일 쓰기 건너뜀. 상위 5건:');
  for (const r of rows.slice(0, 5)) {
    console.log(`  [${r.buzz_count.toLocaleString()}] ${r.name} (${r.category}, ${r.trend_category})`);
    console.log(`  → ${r.comment_draft.comment.slice(0, 80)}`);
  }
  await pool.end();
  process.exit(0);
}

const dateStr = new Date().toISOString().slice(0, 10);
const md = renderMarkdown(rows, dateStr);

mkdirSync('dist', { recursive: true });
const outPath = `dist/batch-buzz-60-${dateStr}.md`;
writeFileSync(outPath, md, 'utf-8');
console.log(`\n→ ${outPath} (${md.length}바이트)`);

await pool.end();
