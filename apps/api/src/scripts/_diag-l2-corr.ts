import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
for (const line of lines) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('='); if (eq === -1) continue;
  const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
  if (key && !(key in process.env)) process.env[key] = val;
}

const c = new Client({ connectionString: process.env['DATABASE_URL'] });
await c.connect();

// ── 1. evidence_quote 길이 vs L2 cosine 상관관계 ─────────────────────────────
const r1 = await c.query(`
  SELECT
    name,
    comment_draft::jsonb->>'evidence_quote'              AS quote,
    (comment_verified::jsonb->>'l2_cosine')::float       AS l2,
    length(comment_draft::jsonb->>'evidence_quote')      AS quote_bytes,
    array_length(
      string_to_array(trim(comment_draft::jsonb->>'evidence_quote'), ' '),
      1
    )                                                    AS quote_words
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND (comment_verified::jsonb->>'l2_cosine') IS NOT NULL
  ORDER BY (comment_verified::jsonb->>'l2_cosine')::float
`);

interface Row { name: string; quote: string; l2: number; quote_bytes: number; quote_words: number; }
const rows = r1.rows as Row[];

const pass  = rows.filter(r => Number(r.l2) >= 0.70);
const fail  = rows.filter(r => Number(r.l2) <  0.70);

function avg(arr: number[]) { return arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 'N/A'; }
function med(arr: number[]) {
  if (!arr.length) return 'N/A';
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]!.toFixed(1) : ((s[m - 1]! + s[m]!) / 2).toFixed(1);
}

const passWords = pass.map(r => Number(r.quote_words));
const failWords = fail.map(r => Number(r.quote_words));

console.log('=== [진단 1] evidence_quote 길이 vs L2 cosine ===');
console.log(`  전체 L2 측정 건수: ${rows.length}건  (통과: ${pass.length}건 / 실패: ${fail.length}건)`);
console.log();
console.log(`  L2 통과 (≥0.70)  quote 단어 수: 평균 ${avg(passWords)}  중앙값 ${med(passWords)}  범위 ${Math.min(...passWords)}~${Math.max(...passWords)}`);
console.log(`  L2 실패 (<0.70)  quote 단어 수: 평균 ${avg(failWords)}  중앙값 ${med(failWords)}  범위 ${Math.min(...failWords)}~${Math.max(...failWords)}`);

// 단어 수 구간별 L2 통과율
const buckets: Record<string, { pass: number; fail: number }> = {
  '1~5':   { pass: 0, fail: 0 },
  '6~10':  { pass: 0, fail: 0 },
  '11~15': { pass: 0, fail: 0 },
  '16~20': { pass: 0, fail: 0 },
  '21+':   { pass: 0, fail: 0 },
};
for (const r of rows) {
  const w = Number(r.quote_words);
  const key = w <= 5 ? '1~5' : w <= 10 ? '6~10' : w <= 15 ? '11~15' : w <= 20 ? '16~20' : '21+';
  if (Number(r.l2) >= 0.70) buckets[key]!.pass++; else buckets[key]!.fail++;
}
console.log();
console.log('  단어 수 구간별 L2 통과율:');
for (const [k, v] of Object.entries(buckets)) {
  const total = v.pass + v.fail;
  if (total === 0) continue;
  const rate = ((v.pass / total) * 100).toFixed(0);
  const bar  = '█'.repeat(Math.round(Number(rate) / 5));
  console.log(`    ${k.padEnd(6)} : ${String(total).padStart(3)}건  통과 ${String(v.pass).padStart(3)}건 (${String(rate).padStart(3)}%)  ${bar}`);
}

// 피어슨 상관계수
const xs = rows.map(r => Number(r.quote_words));
const ys = rows.map(r => Number(r.l2));
const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
const my = ys.reduce((s, v) => s + v, 0) / ys.length;
const num = xs.reduce((s, v, i) => s + (v - mx) * (ys[i]! - my), 0);
const den = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) * ys.reduce((s, v) => s + (v - my) ** 2, 0));
const pearson = den ? (num / den).toFixed(3) : '0';
console.log();
console.log(`  피어슨 상관계수 r(quote_words, l2_cosine) = ${pearson}`);
console.log('  (해석: |r|>0.3 약한 상관, |r|>0.5 중간, |r|>0.7 강한 상관)');

// L2 실패 하위 10건 quote 샘플
console.log();
console.log('  L2 실패 하위 10건 (quote 단어 수 포함):');
for (const r of fail.slice(0, 10)) {
  console.log(`    [${Number(r.l2).toFixed(3)}] ${r.name} — ${r.quote_words}단어: "${(r.quote || '').slice(0, 60)}"`);
}

// ── 2. 529 Overloaded 성격 분석 ──────────────────────────────────────────────
console.log('\n=== [진단 2] Stage 1 실패 현황 ===');
const r2 = await c.query(`
  SELECT
    COUNT(*) FILTER (WHERE comment_draft IS NULL)             AS null_total,
    COUNT(*) FILTER (WHERE comment_draft IS NOT NULL)         AS draft_ok,
    COUNT(*)                                                  AS total
  FROM curation_candidates
  WHERE selected_tier = 'reference'
`);
const stat = r2.rows[0] as { null_total: string; draft_ok: string; total: string };
console.log(`  reference 전체: ${stat.total}건`);
console.log(`  comment_draft 있음: ${stat.draft_ok}건`);
console.log(`  comment_draft NULL (미처리): ${stat.null_total}건`);

// 529는 DB에 기록 없음 — 로그 기반 설명
console.log();
console.log('  529 Overloaded 특성 (로그+Anthropic 문서 기반):');
console.log('    - HTTP 529는 Anthropic 공식 "Overloaded" 코드 (rate limit=429와 별개)');
console.log('    - 서버 용량 포화 — 우리 호출 간격(2s)과 무관한 infrastructure 이슈');
console.log('    - Transient: 통상 수십 초~수 분 후 자동 해소');
console.log('    - 현재 backoff 5회(10→20→40→60→60s = 최대 190s 대기)로 대응 중');
console.log('    - 20건 dry-run에서 3건 완전 실패 → 190s 내 미해소, 재시도 필요');
console.log('    - 재시도 시 성공률 확인: 연우네(attempt 3에서 성공), 취하도(attempt 2 성공)');

// ── 3. L1 hallucination 비율 ──────────────────────────────────────────────────
console.log('\n=== [진단 3] L1 hallucination 비율 ===');
const r3 = await c.query(`
  SELECT
    COUNT(*)                                                          AS total_with_draft,
    COUNT(*) FILTER (
      WHERE (comment_verified::jsonb->>'l1_substring')::boolean = true
    )                                                                 AS l1_pass,
    COUNT(*) FILTER (
      WHERE (comment_verified::jsonb->>'l1_substring')::boolean = false
    )                                                                 AS l1_fail,
    COUNT(*) FILTER (
      WHERE comment_verified IS NULL OR comment_verified::jsonb->>'l1_substring' IS NULL
    )                                                                 AS l1_unknown
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND selected_tier = 'reference'
`);
const ls = r3.rows[0] as { total_with_draft: string; l1_pass: string; l1_fail: string; l1_unknown: string };
const l1Total = Number(ls.l1_pass) + Number(ls.l1_fail);
const l1Rate  = l1Total ? ((Number(ls.l1_fail) / l1Total) * 100).toFixed(1) : '?';
console.log(`  draft 있는 건: ${ls.total_with_draft}건`);
console.log(`  L1 측정된 건: ${l1Total}건`);
console.log(`    통과: ${ls.l1_pass}건`);
console.log(`    실패: ${ls.l1_fail}건  (실패율 ${l1Rate}%)`);
console.log(`    미측정(comment_verified NULL): ${ls.l1_unknown}건`);

// L1 실패 샘플
const r4 = await c.query(`
  SELECT name, category,
    comment_draft::jsonb->>'evidence_quote' AS quote,
    comment_draft::jsonb->>'comment'        AS comment
  FROM curation_candidates
  WHERE comment_draft IS NOT NULL
    AND (comment_verified::jsonb->>'l1_substring')::boolean = false
    AND selected_tier = 'reference'
  LIMIT 12
`);
console.log();
console.log(`  L1 실패 샘플 (최대 12건):`);
for (const r of r4.rows as { name: string; category: string; quote: string; comment: string }[]) {
  console.log(`    [${r.name}] (${r.category})`);
  console.log(`      quote  : "${(r.quote || '').slice(0, 70)}"`);
  console.log(`      comment: "${(r.comment || '').slice(0, 70)}"`);
}

await c.end();
