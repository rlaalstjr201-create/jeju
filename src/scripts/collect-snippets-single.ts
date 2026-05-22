#!/usr/bin/env tsx
/**
 * collect-snippets-single.ts
 * 단일 spot snippet 재수집 (정규화된 spot name으로 검색).
 *
 * 실행 (dry-run): npx tsx src/scripts/collect-snippets-single.ts <spot명>
 * 실행 (apply):   npx tsx src/scripts/collect-snippets-single.ts <spot명> --apply
 *
 * --apply 시:
 *   1. 기존 snippet → backup/snippets-{spot_id}-old.json
 *   2. 기존 snippet DELETE
 *   3. 정규화 이름으로 Naver blog(5) + cafe(5) 수집 후 INSERT
 *   4. before/after 포함률 비교 출력
 *   5. few-shot 포맷 출력 (사용자 작성용)
 */
import { Pool } from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSpotName } from '../lib/normalize-spot-name.js';

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

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
}
interface NaverSearchResponse {
  total: number;
  display: number;
  items: NaverSearchItem[];
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '');
}

async function fetchNaver(
  endpoint: string,
  query: string,
  display: number,
  headers: Record<string, string>,
): Promise<NaverSearchItem[]> {
  const url = `${endpoint}?query=${encodeURIComponent(query)}&display=${display}`;
  let delay = 1000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) { await new Promise(r => setTimeout(r, delay)); delay *= 2; continue; }
      if (!res.ok) return [];
      return ((await res.json() as NaverSearchResponse).items) ?? [];
    } catch {
      await new Promise(r => setTimeout(r, delay)); delay *= 2;
    }
  }
  return [];
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  // 인수 파싱
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const spotArg = args.filter(a => a !== '--apply').join(' ').trim();

  if (!spotArg) {
    console.error('사용법: npx tsx collect-snippets-single.ts <spot명> [--apply]');
    process.exit(1);
  }

  const clientId     = process.env['NAVER_CLIENT_ID']     ?? '';
  const clientSecret = process.env['NAVER_CLIENT_SECRET'] ?? '';
  if (!clientId || !clientSecret) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정');
    process.exit(1);
  }
  const naverHeaders = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // spot 조회
  const { rows: spotRows } = await pool.query<{
    id: string; name: string; category: string; region: string;
  }>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE name ILIKE $1 AND selected_tier = 'reference'
     LIMIT 3`,
    [`%${spotArg}%`],
  );

  if (spotRows.length === 0) {
    console.error(`[error] "${spotArg}" — reference 셋에서 찾을 수 없음`);
    await pool.end(); process.exit(1);
  }

  const spot = spotRows[0]!;
  if (spotRows.length > 1) {
    console.log(`[warn] 복수 매칭 → 첫 번째 사용: ${spot.name}`);
    for (const r of spotRows) console.log(`  ${r.name} (${r.id})`);
  }

  const normalized = normalizeSpotName(spot.name);
  const searchQuery = `${normalized} 제주`;

  console.log(`\n[collect-single] spot: "${spot.name}" (${spot.category}, ${spot.region})`);
  console.log(`[collect-single] spot_id: ${spot.id}`);
  console.log(`[collect-single] 정규화: "${spot.name}" → "${normalized}"`);
  console.log(`[collect-single] 검색어: "${searchQuery}"`);
  console.log(`[collect-single] mode: ${isApply ? 'APPLY' : 'dry-run'}\n`);

  // 기존 snippet 조회
  const { rows: oldSnippets } = await pool.query<{
    id: number; source_type: string; source_url: string; title: string | null; description: string | null;
  }>(
    `SELECT id, source_type, source_url, title, description
     FROM spot_snippets WHERE spot_id = $1 ORDER BY id`,
    [spot.id],
  );

  console.log(`=== 기존 snippet (${oldSnippets.length}건) ===`);
  const oldHit = oldSnippets.filter(s =>
    (s.description ?? '').includes(normalized) || (s.title ?? '').includes(normalized),
  ).length;
  console.log(`  spot명("${normalized}") 포함: ${oldHit}/${oldSnippets.length}건`);
  for (const s of oldSnippets) {
    const text = (s.description ?? s.title ?? '').slice(0, 80).replace(/\n/g, ' ');
    console.log(`  [${s.id}] ${s.source_type} | ${text}`);
  }

  // 신규 수집 (blog 5 + cafe 5)
  const BLOG_EP = 'https://openapi.naver.com/v1/search/blog';
  const CAFE_EP = 'https://openapi.naver.com/v1/search/cafearticle';

  const [blogItems, cafeItems] = await Promise.all([
    fetchNaver(BLOG_EP, searchQuery, 5, naverHeaders),
    fetchNaver(CAFE_EP, searchQuery, 5, naverHeaders),
  ]);

  const newItems = [
    ...blogItems.map(i => ({ ...i, type: 'blog' as const })),
    ...cafeItems.map(i => ({ ...i, type: 'cafe' as const })),
  ];

  console.log(`\n=== 신규 수집 (${newItems.length}건: blog ${blogItems.length} + cafe ${cafeItems.length}) ===`);
  const newHit = newItems.filter(i => {
    const text = decodeHtml(i.description) + ' ' + decodeHtml(i.title);
    return text.includes(normalized);
  }).length;
  console.log(`  spot명("${normalized}") 포함: ${newHit}/${newItems.length}건`);
  console.log(`\n  포함률 before: ${oldHit}/${oldSnippets.length}건 → after: ${newHit}/${newItems.length}건\n`);

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i]!;
    const title = decodeHtml(item.title);
    const desc  = decodeHtml(item.description);
    const hasName = (title + ' ' + desc).includes(normalized);
    console.log(`  [${i + 1}] ${item.type} | ${hasName ? '✓' : '✗'} 포함`);
    console.log(`       title: ${title.slice(0, 80)}`);
    console.log(`       desc : ${desc.slice(0, 100)}`);
    console.log('');
  }

  if (!isApply) {
    console.log('(dry-run: DB 변경 없음. --apply 로 실제 적용)');
    await pool.end();
    return;
  }

  // ── --apply ──────────────────────────────────────────────────────

  // 백업
  const backupDir = resolve(process.cwd(), 'backup');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `snippets-${spot.id}-old.json`);
  writeFileSync(backupPath, JSON.stringify(oldSnippets, null, 2), 'utf-8');
  console.log(`[backup] ${backupPath}`);

  // 삭제
  await pool.query(`DELETE FROM spot_snippets WHERE spot_id = $1`, [spot.id]);
  console.log(`[apply] 기존 ${oldSnippets.length}건 삭제`);

  // 삽입
  let inserted = 0;
  for (const item of newItems) {
    const title       = decodeHtml(item.title);
    const description = decodeHtml(item.description);
    if (!item.link || !description) continue;
    await pool.query(
      `INSERT INTO spot_snippets (spot_id, source_type, source_url, title, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [spot.id, item.type, item.link, title, description],
    );
    inserted++;
  }
  console.log(`[apply] 신규 ${inserted}건 삽입 완료`);

  // few-shot 출력
  const { rows: freshSnips } = await pool.query<{
    id: number; source_type: string; title: string | null; description: string | null;
  }>(
    `SELECT id, source_type, title, description FROM spot_snippets WHERE spot_id = $1 ORDER BY id LIMIT 5`,
    [spot.id],
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(`few-shot 용 snippet (사용자 작성용)`);
  console.log(`Spot: ${spot.name} (${spot.category}, ${spot.region})`);
  console.log('─'.repeat(60));
  freshSnips.forEach((s, i) => {
    const text = (s.description ?? s.title ?? '').replace(/\s+/g, ' ').trim();
    console.log(`[${i + 1}] (${s.source_type}) ${text}`);
  });
  console.log('─'.repeat(60));
  console.log('→ {"comment":"???","evidence_quote":"???","source_id":"???"}');

  await pool.end();
})();
