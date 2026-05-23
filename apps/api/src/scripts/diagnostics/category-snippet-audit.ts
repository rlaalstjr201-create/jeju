#!/usr/bin/env tsx
/**
 * category-snippet-audit.ts
 * 알파 1,000건 카테고리-snippet 불일치 진단.
 * LLM 호출 없음 — 순수 키워드 토큰 매칭.
 *
 * 실행: npx tsx src/scripts/diagnostics/category-snippet-audit.ts
 */
import { Pool } from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 환경변수 ──────────────────────────────────────────────────────

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

// ── 키워드 사전 ───────────────────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  restaurant:     ['맛집', '식당', '먹', '메뉴', '음식', '한끼', '요리', '셰프'],
  cafe:           ['카페', '커피', '디저트', '로스터리', '에스프레소', '라떼', '아메리카노', '베이커리'],
  sightseeing:    ['관광', '명소', '구경', '전망', '풍경', '뷰', '산책', '코스'],
  experience:     ['체험', '액티비티', '즐길', '놀이', '투어', '프로그램'],
  cultural_space: ['미술관', '박물관', '갤러리', '문화', '전시', '공연', '작품'],
};

function matchCount(snippetTexts: string[], category: string): number {
  const kws = KEYWORDS[category] ?? [];
  return snippetTexts.filter(text => kws.some(kw => text.includes(kw))).length;
}

function classify(count: number): 'clean' | 'warning' | 'polluted' {
  if (count >= 4) return 'clean';
  if (count >= 2) return 'warning';
  return 'polluted';
}

// ── 타입 ──────────────────────────────────────────────────────────

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
}

interface AuditEntry {
  spot_id: string;
  name: string;
  category: string;
  region: string;
  match_count: number;
  grade: 'clean' | 'warning' | 'polluted';
}

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows: spots } = await pool.query<SpotRow>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE selected_tier = 'reference'
     ORDER BY category, final_score DESC`,
  );

  console.log(`[audit] 대상: ${spots.length}건`);

  const entries: AuditEntry[] = [];

  for (const spot of spots) {
    const { rows: snips } = await pool.query<{ description: string | null; title: string | null }>(
      `SELECT description, title FROM spot_snippets WHERE spot_id = $1 ORDER BY id LIMIT 5`,
      [spot.id],
    );
    const texts = snips.map(s => s.description ?? s.title ?? '');
    const count = matchCount(texts, spot.category);
    entries.push({
      spot_id:     spot.id,
      name:        spot.name,
      category:    spot.category,
      region:      spot.region,
      match_count: count,
      grade:       classify(count),
    });
  }

  await pool.end();

  // ── 집계 ───────────────────────────────────────────────────────

  const byGrade = { clean: 0, warning: 0, polluted: 0 };
  const polluted: AuditEntry[] = [];
  const warningByCategory: Record<string, number> = {};

  for (const e of entries) {
    byGrade[e.grade]++;
    if (e.grade === 'polluted') polluted.push(e);
    if (e.grade === 'warning') {
      warningByCategory[e.category] = (warningByCategory[e.category] ?? 0) + 1;
    }
  }

  const total = entries.length;

  console.log('\n=== 전체 분포 ===');
  for (const grade of ['clean', 'warning', 'polluted'] as const) {
    const n = byGrade[grade];
    const pct = ((n / total) * 100).toFixed(1);
    console.log(`  ${grade.padEnd(8)}: ${String(n).padStart(4)}건  (${pct}%)`);
  }

  console.log('\n=== warning 카테고리별 ===');
  for (const [cat, n] of Object.entries(warningByCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(14)}: ${n}건`);
  }

  console.log(`\n=== polluted 전체 (${polluted.length}건) ===`);
  for (const e of polluted) {
    console.log(`  [${String(e.match_count)}매칭] ${e.category.padEnd(14)} | ${e.name} (${e.region})`);
  }

  // ── JSON 저장 ────────────────────────────────────────────────

  const outDir = resolve(process.cwd(), 'diagnostics');
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(outDir, `category-snippet-audit-${ts}.json`);

  const report = {
    generated_at: new Date().toISOString(),
    total,
    distribution: {
      clean:    { count: byGrade.clean,    pct: +((byGrade.clean    / total) * 100).toFixed(1) },
      warning:  { count: byGrade.warning,  pct: +((byGrade.warning  / total) * 100).toFixed(1) },
      polluted: { count: byGrade.polluted, pct: +((byGrade.polluted / total) * 100).toFixed(1) },
    },
    warning_by_category: warningByCategory,
    polluted_list: polluted,
    all_entries: entries,
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[audit] JSON 저장: ${outPath}`);
})();
