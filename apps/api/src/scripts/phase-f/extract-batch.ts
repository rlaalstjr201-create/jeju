#!/usr/bin/env tsx
/**
 * Phase F: batch-100 큐레이터 검토용 후보 추출
 *
 * 대상: comment_draft IS NOT NULL AND comment_warning_flag IS NULL (698건)
 * 우선순위: external_links에 kakao place_id 있는 것 우선
 * 배분: 기존 spots 카테고리 현황 기반 부족분 비례 100건
 *
 * 출력: dist/batch-100-<date>.md
 * 실행: npx tsx src/scripts/phase-f/extract-batch.ts [--dry-run]
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

// ── Types ─────────────────────────────────────────────────────────────────────

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
  l2: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Target batch quota (proportional to alpha-50: 30:30:20:12:8 = 100)
const BATCH_TARGET: Record<string, number> = {
  sightseeing:    30,
  restaurant:     30,
  cultural_space: 20,
  experience:     12,
  cafe:            8,
};

const BATCH_TOTAL = 100;

const CAT_LABELS: Record<string, string> = {
  sightseeing: '관광지·자연',
  restaurant: '음식점',
  cultural_space: '문화공간',
  experience: '체험',
  cafe: '카페',
};

const REGION_LABELS: Record<string, string> = {
  'jeju-city': '제주시',
  eastern: '동부',
  seogwipo: '서귀포시',
  western: '서부',
  hallasan: '한라산',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function regionLabel(r: string): string {
  return REGION_LABELS[r] ?? r;
}

function pickWithRegionBalance(pool: CandidateRow[], n: number): CandidateRow[] {
  const jeju  = pool.filter(r => r.region === 'jeju-city');
  const seo   = pool.filter(r => r.region === 'seogwipo');
  const other = pool.filter(r => r.region !== 'jeju-city' && r.region !== 'seogwipo');
  const picked: CandidateRow[] = [];
  const idx = { j: 0, s: 0, o: 0 };
  while (picked.length < n) {
    let added = false;
    if (idx.o < other.length) { picked.push(other[idx.o++]!); added = true; if (picked.length >= n) break; }
    if (idx.j < jeju.length)  { picked.push(jeju[idx.j++]!);  added = true; if (picked.length >= n) break; }
    if (idx.s < seo.length)   { picked.push(seo[idx.s++]!);   added = true; if (picked.length >= n) break; }
    if (!added) break;
  }
  return picked.slice(0, n);
}

function computeQuotas(
  current: Record<string, number>,
  target: Record<string, number>,
  totalBatch: number,
): Record<string, number> {
  // deficit = how many more each category needs to reach its target share
  const deficits: Record<string, number> = {};
  for (const [cat, tgt] of Object.entries(target)) {
    deficits[cat] = Math.max(0, tgt - (current[cat] ?? 0));
  }
  const totalDeficit = Object.values(deficits).reduce((a, b) => a + b, 0);

  if (totalDeficit === 0) {
    // All at or above target — distribute evenly
    const cats = Object.keys(target);
    const base = Math.floor(totalBatch / cats.length);
    const rem = totalBatch - base * cats.length;
    return Object.fromEntries(cats.map((c, i) => [c, base + (i < rem ? 1 : 0)]));
  }

  // Proportional to deficit
  const quotas: Record<string, number> = {};
  let assigned = 0;
  const cats = Object.keys(deficits).sort((a, b) => (deficits[b] ?? 0) - (deficits[a] ?? 0));
  for (const cat of cats) {
    const q = Math.round((deficits[cat]! / totalDeficit) * totalBatch);
    quotas[cat] = q;
    assigned += q;
  }
  // Fix rounding drift on the category with largest quota
  const diff = totalBatch - assigned;
  if (diff !== 0 && cats[0]) quotas[cats[0]] = (quotas[cats[0]] ?? 0) + diff;

  return quotas;
}

function renderMarkdown(spots: CandidateRow[], date: string, quotas: Record<string, number>): string {
  const lines: string[] = [
    `# Phase F Batch-100 큐레이터 검토`,
    ``,
    `생성일: ${date}  `,
    `대상: comment_draft IS NOT NULL AND comment_warning_flag IS NULL  `,
    `우선: kakao place_id 보유 후보  `,
    ``,
    `**검토 방법**:`,
    `- approve: 초안 코멘트 그대로 사용`,
    `- edit: **코멘트** 줄의 \`> \` 뒤 텍스트를 직접 수정 후 approve`,
    `- reject: 스팟 제외`,
    ``,
    `배분 기준 (부족분 비례):`,
    ...Object.entries(quotas).map(([c, q]) => `- ${CAT_LABELS[c] ?? c}: ${q}건`),
    ``,
    `---`,
    ``,
  ];

  const byCat: Record<string, CandidateRow[]> = {};
  for (const s of spots) {
    (byCat[s.category] ??= []).push(s);
  }

  const catOrder = ['sightseeing', 'restaurant', 'cultural_space', 'experience', 'cafe'];
  let idx = 1;

  for (const cat of catOrder) {
    const catSpots = byCat[cat];
    if (!catSpots || catSpots.length === 0) continue;

    lines.push(`## ${CAT_LABELS[cat] ?? cat} (${catSpots.length}건)`);
    lines.push('');

    for (const s of catSpots) {
      const draft = s.comment_draft;
      lines.push(`### ${idx++}. ${s.name}`);
      lines.push(`**카테고리:** ${CAT_LABELS[s.category] ?? s.category} | **지역:** ${regionLabel(s.region)}`);
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
  }

  lines.push(`_총 ${spots.length}건 / Phase F Batch-100_`);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

// 1. Current spots distribution
const { rows: existingSpots } = await pool.query<{ category: string; cnt: string }>(
  `SELECT category, COUNT(*) AS cnt FROM spots GROUP BY category ORDER BY cnt DESC`,
);
const currentCounts: Record<string, number> = {};
let totalExisting = 0;
for (const r of existingSpots) {
  currentCounts[r.category] = parseInt(r.cnt, 10);
  totalExisting += parseInt(r.cnt, 10);
}

console.log(`\n=== 기존 spots 카테고리 현황 (총 ${totalExisting}건) ===`);
for (const r of existingSpots) {
  console.log(`  ${r.category.padEnd(16)}: ${r.cnt}건`);
}

// 2. Compute quotas
const quotas = computeQuotas(currentCounts, BATCH_TARGET, BATCH_TOTAL);
const totalDeficit = Object.entries(BATCH_TARGET).reduce(
  (sum, [cat, tgt]) => sum + Math.max(0, tgt - (currentCounts[cat] ?? 0)),
  0,
);

console.log(`\n=== 배분 계획 (부족분 비례, 총 ${BATCH_TOTAL}건) ===`);
console.log(`${'카테고리'.padEnd(18)} ${'현재'.padEnd(6)} ${'목표'.padEnd(6)} ${'부족'.padEnd(6)} ${'배분'}`);
for (const cat of Object.keys(BATCH_TARGET)) {
  const cur = currentCounts[cat] ?? 0;
  const tgt = BATCH_TARGET[cat]!;
  const def = Math.max(0, tgt - cur);
  const q = quotas[cat] ?? 0;
  console.log(`  ${(CAT_LABELS[cat] ?? cat).padEnd(16)} ${String(cur).padEnd(6)} ${String(tgt).padEnd(6)} ${String(def).padEnd(6)} ${q}건`);
}

// 3. Pool availability per category
const { rows: poolCounts } = await pool.query<{ category: string; total: string; with_kakao: string }>(`
  SELECT category, COUNT(*) AS total,
    COUNT(*) FILTER (WHERE external_links::jsonb->'kakao'->>'place_id' IS NOT NULL) AS with_kakao
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL AND comment_warning_flag IS NULL
  GROUP BY category ORDER BY category
`);

console.log(`\n=== 풀 가용 건수 (미검토) ===`);
console.log(`${'카테고리'.padEnd(18)} ${'전체'.padEnd(8)} ${'kakao있음'.padEnd(10)} ${'배분'}`);
const poolMap: Record<string, { total: number; with_kakao: number }> = {};
for (const r of poolCounts) {
  poolMap[r.category] = { total: parseInt(r.total, 10), with_kakao: parseInt(r.with_kakao, 10) };
  const q = quotas[r.category] ?? 0;
  console.log(`  ${(CAT_LABELS[r.category] ?? r.category).padEnd(16)} ${r.total.padEnd(8)} ${r.with_kakao.padEnd(10)} ${q}건`);
}

// 4. Select candidates per category (kakao-first)
const selected: CandidateRow[] = [];

for (const cat of Object.keys(BATCH_TARGET)) {
  const quota = quotas[cat] ?? 0;
  if (quota === 0) continue;

  const { rows: candidates } = await pool.query<{
    id: string;
    name: string;
    category: string;
    region: string;
    comment_draft: CommentDraft;
    place_url: string | null;
    l2: number | null;
  }>(`
    SELECT
      id, name, category, region,
      comment_draft,
      external_links::jsonb->'kakao'->>'place_url'  AS place_url,
      (comment_verified::jsonb->>'l2_cosine')::float AS l2
    FROM curation_candidates
    WHERE comment_draft IS NOT NULL
      AND comment_warning_flag IS NULL
      AND category = $1
    ORDER BY
      -- kakao먼저
      CASE WHEN external_links::jsonb->'kakao'->>'place_id' IS NOT NULL THEN 0 ELSE 1 END,
      -- l2 높은 것 먼저 (NULL은 뒤로)
      (comment_verified::jsonb->>'l2_cosine')::float DESC NULLS LAST
  `, [cat]);

  const picked = pickWithRegionBalance(candidates, quota);
  selected.push(...picked);
  console.log(`\n  [${cat}] 요청 ${quota}건 → ${candidates.length}건 중 ${picked.length}건 선택`);
}

// 5. Validation
const noKakao = selected.filter(s => !s.place_url);
console.log(`\n=== 검증 ===`);
console.log(`  총 선택 건수    : ${selected.length}건 (목표 ${BATCH_TOTAL}건) ${selected.length === BATCH_TOTAL ? '✓' : '⚠ 불일치'}`);
console.log(`  kakao URL 있음  : ${selected.length - noKakao.length}건`);
console.log(`  kakao URL 없음  : ${noKakao.length}건${noKakao.length > 0 ? ' — ' + noKakao.map(s => s.name).join(', ') : ''}`);

const catActual: Record<string, number> = {};
for (const s of selected) catActual[s.category] = (catActual[s.category] ?? 0) + 1;
console.log(`  카테고리 배분   :`);
for (const cat of Object.keys(BATCH_TARGET)) {
  const q = quotas[cat] ?? 0;
  const actual = catActual[cat] ?? 0;
  console.log(`    ${(CAT_LABELS[cat] ?? cat).padEnd(16)}: ${actual}건 (목표 ${q}건)${actual !== q ? ' ⚠' : ''}`);
}

if (isDryRun) {
  console.log('\n[dry-run] 파일 쓰기 건너뜀. 상위 5건:');
  for (const s of selected.slice(0, 5)) {
    console.log(`  ${s.name} (${s.category}, ${s.region}) l2=${s.l2?.toFixed(3) ?? 'null'}`);
    console.log(`  → ${s.comment_draft.comment.slice(0, 80)}`);
  }
  await pool.end();
  process.exit(0);
}

// 6. Write markdown
const dateStr = new Date().toISOString().slice(0, 10);
const md = renderMarkdown(selected, dateStr, quotas);

mkdirSync('dist', { recursive: true });
const outPath = `dist/batch-100-${dateStr}.md`;
writeFileSync(outPath, md, 'utf-8');
console.log(`\n→ ${outPath} (${md.length}바이트)`);

await pool.end();
