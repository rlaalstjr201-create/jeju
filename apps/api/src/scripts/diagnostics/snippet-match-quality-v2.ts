#!/usr/bin/env tsx
/**
 * snippet-match-quality-v2.ts
 * "spot명 미포함 = 오매칭" 가설 재검증.
 *
 * 판별 기준 확장:
 *   hit = description 또는 title 중 하나라도 spot명 포함
 *   true_miss = description·title 모두 미포함
 *   desc_truncation = title 포함 & description 미포함 (잘림 false-miss)
 *
 * 출력:
 *   1. 스키마 요약 (어떤 필드가 출처 식별에 유용한지)
 *   2. 만장굴 케이스 — snippet 5건 전체 (title + description 전문)
 *   3. source_type별 보정 포함률 (title 포함 반영)
 *   4. true_miss 샘플 30건 (무작위)
 *   5. 오매칭 비율 재추정
 *
 * 실행: npx tsx src/scripts/diagnostics/snippet-match-quality-v2.ts
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

interface SnippetRow {
  snippet_id: string;
  spot_id: string;
  spot_name: string;
  source_type: string;
  source_url: string;
  title: string | null;
  description: string | null;
}

// URL에서 도메인·카페ID·블로그ID 등 패턴 추출
function parseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url.slice(0, 80);
  }
}

function inDesc(row: SnippetRow): boolean {
  return (row.description ?? '').includes(row.spot_name);
}
function inTitle(row: SnippetRow): boolean {
  return (row.title ?? '').includes(row.spot_name);
}
function inEither(row: SnippetRow): boolean {
  return inDesc(row) || inTitle(row);
}

// Fisher-Yates shuffle (seed 없음 — 매 실행마다 다름)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // ── 스키마 요약 출력 ─────────────────────────────────────────────

  console.log('=== 0. 스키마 요약 (spot_snippets) ===');
  console.log('  id          : SERIAL PK');
  console.log('  spot_id     : UUID FK → curation_candidates');
  console.log('  source_type : blog | cafe | official');
  console.log('  source_url  : 원문 URL (Naver 블로그·카페 포스트 퍼머링크)');
  console.log('  title       : 포스트 제목 (Naver API title 필드) ← 출처 식별 핵심');
  console.log('  description : Naver API snippet — ~100자 내외 잘릴 수 있음 ← 판별 한계');
  console.log('  collected_at: 수집 일시');
  console.log('');
  console.log('  판별 전략: title이 description보다 신뢰도 높음.');
  console.log('            title에 spot명 포함 → 잘림(truncation) false-miss 가능성.');
  console.log('            title·description 모두 미포함 → true_miss (오매칭 의심).');
  console.log('');

  // ── 전체 snippet 로드 ────────────────────────────────────────────

  const { rows } = await pool.query<SnippetRow>(`
    SELECT
      ss.id          AS snippet_id,
      ss.spot_id,
      cc.name        AS spot_name,
      ss.source_type,
      ss.source_url,
      ss.title,
      ss.description
    FROM spot_snippets ss
    JOIN curation_candidates cc ON cc.id = ss.spot_id
    WHERE cc.selected_tier = 'reference'
  `);

  // ── 만장굴 케이스 ────────────────────────────────────────────────

  const manjanggulRows = rows.filter(r => r.spot_name.startsWith('만장굴'));
  console.log(`=== 1. 만장굴 케이스 (${manjanggulRows.length}건) ===`);

  if (manjanggulRows.length === 0) {
    console.log('  snippet 없음\n');
  } else {
    for (const r of manjanggulRows) {
      const titleHit  = inTitle(r)  ? '✓ 포함' : '✗ 미포함';
      const descHit   = inDesc(r)   ? '✓ 포함' : '✗ 미포함';
      console.log(`  snippet_id  : ${r.snippet_id}`);
      console.log(`  source_type : ${r.source_type}`);
      console.log(`  source_url  : ${r.source_url}`);
      console.log(`  title       : ${r.title ?? '(null)'}   [spot명 ${titleHit}]`);
      console.log(`  description : ${r.description ?? '(null)'}   [spot명 ${descHit}]`);
      console.log(`  판정        : ${inTitle(r) ? '잘림 false-miss (title 일치)' : inDesc(r) ? 'hit (desc 일치)' : '⚠ true_miss (오매칭 의심)'}`);
      console.log('');
    }
  }

  // ── 보정 포함률 계산 (source_type별) ───────────────────────────

  interface TypeStat {
    total: number;
    desc_only_hit: number;   // 기존 v1: desc에만 있음
    title_only_hit: number;  // 잘림 false-miss (title O, desc X)
    both_hit: number;        // desc + title 모두
    true_miss: number;       // 둘 다 없음
  }

  const typeStats: Record<string, TypeStat> = {};
  for (const r of rows) {
    const t = r.source_type;
    if (!typeStats[t]) typeStats[t] = { total: 0, desc_only_hit: 0, title_only_hit: 0, both_hit: 0, true_miss: 0 };
    const s = typeStats[t]!;
    s.total++;
    const d = inDesc(r), ti = inTitle(r);
    if (d && ti)       s.both_hit++;
    else if (d && !ti) s.desc_only_hit++;
    else if (!d && ti) s.title_only_hit++;
    else               s.true_miss++;
  }

  console.log('=== 2. source_type별 보정 포함률 ===');
  console.log('  (hit = desc 또는 title 중 하나라도 spot명 포함)\n');

  const header = `  ${'type'.padEnd(8)}  ${'total'.padStart(6)}  ${'desc+title'.padStart(10)}  ${'title only'.padStart(10)}  ${'true_miss'.padStart(9)}  ${'v1 포함률'.padStart(9)}  ${'v2 포함률'.padStart(9)}`;
  console.log(header);
  console.log(`  ${'-'.repeat(header.length - 2)}`);

  for (const [type, s] of Object.entries(typeStats).sort((a, b) => b[1].total - a[1].total)) {
    const v1hit  = s.desc_only_hit + s.both_hit;
    const v2hit  = s.desc_only_hit + s.both_hit + s.title_only_hit;
    const v1pct  = ((v1hit  / s.total) * 100).toFixed(1);
    const v2pct  = ((v2hit  / s.total) * 100).toFixed(1);
    const trueMissPct = ((s.true_miss / s.total) * 100).toFixed(1);
    console.log(
      `  ${type.padEnd(8)}  ${String(s.total).padStart(6)}  ` +
      `${String(s.both_hit).padStart(10)}  ` +
      `${(String(s.title_only_hit) + ` (${((s.title_only_hit / s.total) * 100).toFixed(1)}%)`).padStart(10)}  ` +
      `${(String(s.true_miss) + ` (${trueMissPct}%)`).padStart(9)}  ` +
      `${v1pct.padStart(8)}%  ${v2pct.padStart(8)}%`,
    );
  }

  // 전체 합계
  const allTotal    = rows.length;
  const allTrueMiss = rows.filter(r => !inEither(r)).length;
  const allV2Hit    = rows.filter(r =>  inEither(r)).length;
  const allTitleOnly = rows.filter(r => !inDesc(r) && inTitle(r)).length;
  console.log('');
  console.log(`  전체 true_miss  : ${allTrueMiss}건 / ${allTotal}건 = ${((allTrueMiss / allTotal) * 100).toFixed(1)}%`);
  console.log(`  title-only 구제 : ${allTitleOnly}건 (v1에서 오분류된 false-miss)`);
  console.log(`  v2 보정 포함률  : ${((allV2Hit / allTotal) * 100).toFixed(1)}%`);

  // ── true_miss 샘플 30건 ─────────────────────────────────────────

  const trueMissRows = rows.filter(r => !inEither(r));
  const sample30 = shuffle(trueMissRows).slice(0, 30);

  console.log(`\n=== 3. true_miss 무작위 샘플 30건 (전체 ${trueMissRows.length}건 중) ===`);
  console.log('  (title·description 모두 spot명 미포함 — 오매칭 의심)\n');

  for (let i = 0; i < sample30.length; i++) {
    const r = sample30[i]!;
    const urlStr = parseUrl(r.source_url);
    console.log(`  [${String(i + 1).padStart(2)}] snippet_id=${r.snippet_id}  type=${r.source_type}`);
    console.log(`       spot   : "${r.spot_name}"`);
    console.log(`       url    : ${urlStr}`);
    console.log(`       title  : ${r.title ?? '(null)'}`);
    console.log(`       desc   : ${r.description ?? '(null)'}`);
    console.log('');
  }

  // ── 오매칭 비율 재추정 ──────────────────────────────────────────

  console.log('=== 4. 오매칭 비율 재추정 ===');
  console.log(`  v1 (desc only)  : miss ${(rows.filter(r => !inDesc(r)).length)}건 / ${allTotal}건 = ${((rows.filter(r => !inDesc(r)).length / allTotal) * 100).toFixed(1)}%`);
  console.log(`  v2 (title 보정) : true_miss ${allTrueMiss}건 / ${allTotal}건 = ${((allTrueMiss / allTotal) * 100).toFixed(1)}%`);
  console.log(`  title-only 구제 : ${allTitleOnly}건 — 이 중 실제 매칭 가능성 높음`);
  console.log('');
  console.log('  결론: v2 true_miss 비율이 실제 오매칭 상한선.');
  console.log('  다음 단계: 샘플 30건 수동 검토 → 실제 오매칭 비율 확정.');

  await pool.end();
})();
