#!/usr/bin/env tsx
/**
 * Phase F: thesis-aligned alpha-50 후보 추출
 *
 * 풀: L2≥0.80, trend≠declining, comment_warning_flag IS NULL (161건)
 * 배분: sightseeing 15 / restaurant 15 / cultural_space 10 / experience 6 / cafe 4
 * 정렬: rising 우선 → ordinariness_score ASC → l2 DESC
 * 지역 다양성: 각 카테고리 내 jeju-city/seogwipo 교번
 *
 * 출력: dist/alpha-50-<date>.md (큐레이터 검토용 마크다운)
 * 실행: npx tsx src/scripts/phase-f/extract-alpha-50.ts [--dry-run]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
  subregion: string | null;
  trend_category: string | null;
  curator_comment: string;
  evidence_quote: string;
  source_id: string;
  l2: number;
  final_score: number | null;
  ordinariness_score: number | null;
  llm_tags: string[];
}

const CATEGORY_QUOTA: Record<string, number> = {
  sightseeing:    15,
  restaurant:     15,
  cultural_space: 10,
  experience:      6,
  cafe:            4,
};

const TREND_ORDER: Record<string, number> = {
  rising:   0,
  new:      1,
  steady:   2,
  seasonal: 3,
};

// Pick N spots from a pool with jeju-city/seogwipo interleaving for regional diversity
function pickWithRegionBalance(pool: SpotRow[], n: number): SpotRow[] {
  const jeju  = pool.filter(r => r.region === 'jeju-city');
  const seo   = pool.filter(r => r.region === 'seogwipo');
  const other = pool.filter(r => r.region !== 'jeju-city' && r.region !== 'seogwipo');

  const picked: SpotRow[] = [];
  const [ai, bi, ci] = [{ i: 0 }, { i: 0 }, { i: 0 }];

  // Include island/other first (rare) then alternate jeju/seogwipo
  while (picked.length < n) {
    let added = false;
    if (ci.i < other.length)  { picked.push(other[ci.i++]!); added = true; if (picked.length >= n) break; }
    if (ai.i < jeju.length)   { picked.push(jeju[ai.i++]!);  added = true; if (picked.length >= n) break; }
    if (bi.i < seo.length)    { picked.push(seo[bi.i++]!);   added = true; if (picked.length >= n) break; }
    if (!added) break;
  }
  return picked.slice(0, n);
}

function sortPool(rows: SpotRow[]): SpotRow[] {
  return [...rows].sort((a, b) => {
    // 1. trend: rising first
    const ta = TREND_ORDER[a.trend_category ?? 'new'] ?? 99;
    const tb = TREND_ORDER[b.trend_category ?? 'new'] ?? 99;
    if (ta !== tb) return ta - tb;
    // 2. ordinariness ASC (low = more thesis-aligned)
    const oa = a.ordinariness_score ?? 1;
    const ob = b.ordinariness_score ?? 1;
    if (Math.abs(oa - ob) > 0.01) return oa - ob;
    // 3. l2 DESC
    return b.l2 - a.l2;
  });
}

function trendEmoji(t: string | null): string {
  return { rising: '📈', new: '🆕', steady: '🔁', seasonal: '🌸', declining: '📉' }[t ?? ''] ?? '—';
}

function renderMarkdown(spots: SpotRow[], date: string): string {
  const lines: string[] = [
    `# Phase F Alpha-50 큐레이터 검토 후보`,
    ``,
    `생성일: ${date}  `,
    `기준: L2 cosine ≥ 0.80, trend ≠ declining, warning_flag IS NULL  `,
    ``,
    `**검토 방법**: 각 스팟의 코멘트를 확인하고 approve / edit / reject 결정.`,
    `- approve: 코멘트 그대로 사용`,
    `- edit: 코멘트 수정 후 approve`,
    `- reject: 스팟 제외 (해당 줄에 ❌ 표시)`,
    ``,
    `---`,
    ``,
  ];

  const byCat: Record<string, SpotRow[]> = {};
  for (const s of spots) {
    (byCat[s.category] ??= []).push(s);
  }

  const catOrder = ['sightseeing', 'restaurant', 'cultural_space', 'experience', 'cafe'];
  let globalIdx = 1;

  for (const cat of catOrder) {
    const catSpots = byCat[cat];
    if (!catSpots || catSpots.length === 0) continue;

    const catLabel: Record<string, string> = {
      sightseeing: '관광지·자연', restaurant: '음식점', cultural_space: '문화공간',
      experience: '체험', cafe: '카페',
    };
    lines.push(`## ${catLabel[cat] ?? cat} (${catSpots.length}건)`);
    lines.push('');

    for (const s of catSpots) {
      const regionLabel = s.subregion ? `${s.region} · ${s.subregion}` : s.region;
      lines.push(`### ${globalIdx++}. ${s.name} ${trendEmoji(s.trend_category)}`);
      lines.push(`**지역:** ${regionLabel} | **L2:** ${s.l2.toFixed(3)} | **trend:** ${s.trend_category ?? '-'}`);
      if (s.llm_tags.length > 0) lines.push(`**태그:** ${s.llm_tags.slice(0, 5).join(', ')}`);
      lines.push('');
      lines.push(`**코멘트:**`);
      lines.push(`> ${s.curator_comment}`);
      lines.push('');
      lines.push(`**근거 quote:**`);
      lines.push(`> "${s.evidence_quote}"`);
      lines.push('');
      lines.push(`**결정:** [ ] approve  [ ] edit  [ ] reject`);
      lines.push('');
      lines.push(`<!-- id: ${s.id} -->`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push(`_총 ${spots.length}건 후보 / Phase F Alpha-50_`);
  return lines.join('\n');
}

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

const { rows } = await pool.query<SpotRow>(`
  SELECT
    id, name, category, region, subregion, trend_category,
    curator_comment,
    (comment_draft::jsonb->>'evidence_quote')       AS evidence_quote,
    (comment_draft::jsonb->>'source_id')            AS source_id,
    (comment_verified::jsonb->>'l2_cosine')::float  AS l2,
    final_score,
    ordinariness_score,
    llm_tags
  FROM curation_candidates
  WHERE selected_tier = 'reference'
    AND comment_draft IS NOT NULL
    AND comment_warning_flag IS NULL
    AND trend_category != 'declining'
    AND (comment_verified::jsonb->>'l2_cosine')::float >= 0.80
  ORDER BY category, trend_category, ordinariness_score ASC NULLS LAST, (comment_verified::jsonb->>'l2_cosine')::float DESC
`);

await pool.end();

console.log(`풀: ${rows.length}건`);

// Group by category, sort, and pick with region balance
const selected: SpotRow[] = [];
const byCategory: Record<string, SpotRow[]> = {};
for (const r of rows) {
  (byCategory[r.category] ??= []).push(r);
}

for (const [cat, quota] of Object.entries(CATEGORY_QUOTA)) {
  const catPool = sortPool(byCategory[cat] ?? []);
  const picked = pickWithRegionBalance(catPool, quota);
  console.log(`  ${cat}: ${picked.length}/${quota}건 선택 (풀 ${catPool.length}건)`);
  selected.push(...picked);
}

console.log(`\n선택 합계: ${selected.length}건`);

// Sort selected for markdown output (by category order then region)
const catOrder = ['sightseeing', 'restaurant', 'cultural_space', 'experience', 'cafe'];
selected.sort((a, b) => {
  const ci = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
  if (ci !== 0) return ci;
  return (TREND_ORDER[a.trend_category ?? 'new'] ?? 99) - (TREND_ORDER[b.trend_category ?? 'new'] ?? 99);
});

const dateStr = new Date().toISOString().slice(0, 10);
const md = renderMarkdown(selected, dateStr);

if (isDryRun) {
  console.log('\n[dry-run] 파일 쓰기 건너뜀. 상위 5건:');
  for (const s of selected.slice(0, 5)) {
    console.log(`  ${s.name} (${s.category}, ${s.region}) L2=${s.l2.toFixed(3)}`);
    console.log(`  → ${s.curator_comment}`);
  }
} else {
  mkdirSync('dist', { recursive: true });
  const outPath = `dist/alpha-50-${dateStr}.md`;
  writeFileSync(outPath, md, 'utf-8');
  console.log(`\n→ ${outPath}`);
}
