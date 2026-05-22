#!/usr/bin/env tsx
/**
 * Phase E.0: spot_snippets 사전 배치 수집
 * Naver 블로그·카페 검색 → spot_snippets 테이블 저장
 *
 * 실행: npx tsx src/scripts/collect-snippets.ts [--dry-run] [--limit=N]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

// ── Naver Search API 타입 ──────────────────────────────────────────

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  bloggername?: string;
  cafename?: string;
}

interface NaverSearchResponse {
  total: number;
  display: number;
  items: NaverSearchItem[];
}

type SourceType = 'blog' | 'cafe';

// ── 환경변수 로드 ─────────────────────────────────────────────────

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

// ── HTML 엔티티 디코딩 ────────────────────────────────────────────

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ''); // bold 태그 등 제거
}

// ── Naver 검색 API 호출 ───────────────────────────────────────────

async function fetchNaverSearch(
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
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json() as NaverSearchResponse;
      return data.items ?? [];
    } catch {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return [];
}

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const rowLimit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

  const clientId     = process.env['NAVER_CLIENT_ID']     ?? '';
  const clientSecret = process.env['NAVER_CLIENT_SECRET'] ?? '';

  if (!clientId || !clientSecret) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정');
    process.exit(1);
  }

  const naverHeaders: Record<string, string> = {
    'X-Naver-Client-Id':     clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  const BLOG_ENDPOINT = 'https://openapi.naver.com/v1/search/blog';
  const CAFE_ENDPOINT = 'https://openapi.naver.com/v1/search/cafearticle';
  const DISPLAY = 10;

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // 이미 snippet이 있는 spot 제외 (재수집 방지)
  const limitClause = rowLimit ? `LIMIT ${rowLimit}` : '';
  const { rows: spots } = await pool.query<{ id: string; name: string }>(
    `SELECT c.id, c.name
     FROM curation_candidates c
     WHERE c.selected_tier = 'reference'
       AND NOT EXISTS (
         SELECT 1 FROM spot_snippets s WHERE s.spot_id = c.id
       )
     ORDER BY c.id
     ${limitClause}`,
  );

  console.log(`[collect-snippets] 대상: ${spots.length}건`);
  if (isDryRun) console.log('[collect-snippets] dry-run 모드');

  const stats = {
    spots: spots.length,
    blogTotal: 0,
    cafeTotal: 0,
    zeroSpots: 0,
    errors: 0,
  };

  const categorySnippetCounts = new Map<string, number[]>();

  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i]!;
    const query = `${spot.name} 제주`;

    const [blogItems, cafeItems] = await Promise.all([
      fetchNaverSearch(BLOG_ENDPOINT, query, DISPLAY, naverHeaders),
      fetchNaverSearch(CAFE_ENDPOINT, query, DISPLAY, naverHeaders),
    ]);

    const allItems: Array<{ item: NaverSearchItem; type: SourceType }> = [
      ...blogItems.map(item => ({ item, type: 'blog' as SourceType })),
      ...cafeItems.map(item => ({ item, type: 'cafe' as SourceType })),
    ];

    if (allItems.length === 0) {
      stats.zeroSpots++;
    }

    stats.blogTotal += blogItems.length;
    stats.cafeTotal += cafeItems.length;

    if (isDryRun) {
      console.log(`  ${spot.name} → blog=${blogItems.length}, cafe=${cafeItems.length}`);
      if (blogItems[0]) {
        console.log(`    sample: "${decodeHtml(blogItems[0].description).slice(0, 60)}"`);
      }
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    // DB 저장
    for (const { item, type } of allItems) {
      const title       = decodeHtml(item.title);
      const description = decodeHtml(item.description);
      const sourceUrl   = item.link;

      if (!sourceUrl || !description) continue;

      try {
        await pool.query(
          `INSERT INTO spot_snippets (spot_id, source_type, source_url, title, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [spot.id, type, sourceUrl, title, description],
        );
      } catch (err) {
        console.error(`[collect-snippets] INSERT 실패 ${spot.name}:`, err);
        stats.errors++;
      }
    }

    // 진행 로그 (50건마다)
    if ((i + 1) % 50 === 0) {
      console.log(`[collect-snippets] ${i + 1}/${spots.length}건 처리`);
    }

    // rate limit: 200ms delay (blog + cafe 2회 호출)
    await new Promise(r => setTimeout(r, 200));
  }

  await pool.end();

  // ── 결과 리포트 ──
  console.log('\n=== Phase E.0 Snippet 수집 결과 ===');
  console.log(`  대상 spot: ${stats.spots}건`);
  console.log(`  블로그 snippet: ${stats.blogTotal}건`);
  console.log(`  카페 snippet:   ${stats.cafeTotal}건`);
  console.log(`  합계:           ${stats.blogTotal + stats.cafeTotal}건`);
  console.log(`  0건 spot:       ${stats.zeroSpots}건`);
  if (stats.errors > 0) console.log(`  INSERT 오류:    ${stats.errors}건`);

  if (!isDryRun && stats.spots > 0) {
    console.log(`  spot당 평균:    ${((stats.blogTotal + stats.cafeTotal) / stats.spots).toFixed(1)}건`);
  }
})();
