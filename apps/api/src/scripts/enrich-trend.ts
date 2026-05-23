#!/usr/bin/env tsx
/**
 * Phase D: 네이버 데이터랩 트렌드 → trend_category + final_score 재계산
 * ADR-0049, ADR-0051 기준
 *
 * 실행: npx tsx src/scripts/enrich-trend.ts [--dry-run] [--limit=N]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

// ── Datalab API 타입 ─────────────────────────────────────────────

interface DatalabKeywordGroup {
  groupName: string;
  keywords: string[];
}

interface DatalabRequest {
  startDate: string;
  endDate: string;
  timeUnit: 'week';
  keywordGroups: DatalabKeywordGroup[];
}

interface DatalabDataPoint {
  period: string;
  ratio: number;
}

interface DatalabResult {
  title: string;
  keywords: string[];
  data: DatalabDataPoint[];
}

interface DatalabResponse {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: DatalabResult[];
}

// ── 분류 로직 ──────────────────────────────────────────────────────

export type TrendCategory = 'rising' | 'declining' | 'seasonal' | 'new' | 'steady';

export function classifyTrend(data: DatalabDataPoint[]): TrendCategory {
  if (data.length === 0) return 'new';

  const ratios = data.map(d => d.ratio);

  // new: 12개월 중 7개월 이상 데이터 없음 (비율 0 주간이 30주 이상)
  const zeroCount = ratios.filter(r => r === 0).length;
  if (zeroCount >= 30) return 'new';

  // 최근 3개월(약 13주) vs 이전 9개월(약 39주)
  const recentSlice = ratios.slice(-13);
  const olderSlice  = ratios.slice(0, Math.max(ratios.length - 13, 1));

  const mean = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  const recentAvg = mean(recentSlice);
  const olderAvg  = mean(olderSlice);

  if (olderAvg > 0) {
    if (recentAvg > olderAvg * 1.3) return 'rising';
    if (recentAvg < olderAvg * 0.7) return 'declining';
  }

  // seasonal: 분산/평균 > 0.5 AND 상위 주간이 특정 분기에 집중
  const avg = mean(ratios);
  if (avg > 0) {
    const variance = ratios.reduce((s, r) => s + (r - avg) ** 2, 0) / ratios.length;
    const cv = Math.sqrt(variance) / avg; // 변동계수

    if (cv > 0.5) {
      // 상위 25% 주간들의 분기 분포 확인
      const threshold = avg + Math.sqrt(variance);
      const highWeeks = data
        .map((d, i) => ({ i, ratio: ratios[i] ?? 0, month: new Date(d.period).getMonth() }))
        .filter(d => d.ratio >= threshold);

      if (highWeeks.length > 0) {
        const quarterCounts = [0, 0, 0, 0];
        for (const w of highWeeks) {
          quarterCounts[Math.floor(w.month / 3)]!++;
        }
        const maxQ = Math.max(...quarterCounts);
        if (maxQ / highWeeks.length >= 0.6) return 'seasonal';
      }
    }
  }

  return 'steady';
}

// ── trend 보너스 점수 ─────────────────────────────────────────────

export function trendBonus(cat: TrendCategory): number {
  switch (cat) {
    case 'steady':   return 1.0;
    case 'rising':   return 0.5;
    case 'declining': return -2.0;
    default:         return 0.0; // seasonal, new
  }
}

// ── 날짜 계산 ─────────────────────────────────────────────────────

function buildDateRange(): { startDate: string; endDate: string } {
  const end   = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

// ── Datalab API 호출 ──────────────────────────────────────────────

async function fetchDatalab(
  req: DatalabRequest,
  clientId: string,
  clientSecret: string,
): Promise<DatalabResponse | null> {
  const url = 'https://openapi.naver.com/v1/datalab/search';
  let delay = 1000;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        body: JSON.stringify(req),
      });

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      if (!res.ok) {
        console.error(`[datalab] HTTP ${res.status}: ${await res.text()}`);
        return null;
      }
      return await res.json() as DatalabResponse;
    } catch {
      // ECONNRESET 등 네트워크 오류 → 재시도
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return null;
}

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

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun  = process.argv.includes('--dry-run');
  const limitArg  = process.argv.find(a => a.startsWith('--limit='));
  const rowLimit  = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

  const clientId     = process.env['NAVER_CLIENT_ID']     ?? '';
  const clientSecret = process.env['NAVER_CLIENT_SECRET'] ?? '';

  if (!clientId || !clientSecret) {
    console.error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const limitClause = rowLimit ? `LIMIT ${rowLimit}` : '';
  const { rows: candidates } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM curation_candidates
     WHERE selected_tier = 'reference'
       AND trend_category IS NULL
     ORDER BY id
     ${limitClause}`,
  );

  console.log(`[enrich-trend] 대상: ${candidates.length}건 (선별 1,000건 중 trend_category NULL)`);
  if (isDryRun) console.log('[enrich-trend] dry-run 모드: DB 쓰기 없음');

  const { startDate, endDate } = buildDateRange();
  console.log(`[enrich-trend] 기간: ${startDate} ~ ${endDate} (주간)`);

  const BATCH = 5;
  const counts: Record<TrendCategory, number> = { rising: 0, declining: 0, seasonal: 0, new: 0, steady: 0 };
  let errorCount = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    const req: DatalabRequest = {
      startDate,
      endDate,
      timeUnit: 'week',
      keywordGroups: batch.map(c => ({
        groupName: c.name,
        keywords: [`${c.name} 제주`],
      })),
    };

    const resp = await fetchDatalab(req, clientId, clientSecret);

    if (!resp) {
      console.error(`[enrich-trend] 배치 실패 i=${i}~${i + batch.length - 1}`);
      errorCount += batch.length;
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // results 순서가 keywordGroups 순서와 동일함 (Naver 스펙)
    for (let j = 0; j < batch.length; j++) {
      const candidate = batch[j]!;
      const result    = resp.results[j];

      if (!result) {
        console.error(`[enrich-trend] 결과 누락 ${candidate.name}`);
        errorCount++;
        continue;
      }

      const cat   = classifyTrend(result.data);
      const bonus = trendBonus(cat);
      counts[cat]++;

      if (isDryRun) {
        console.log(`  ${candidate.name} → ${cat} (bonus=${bonus > 0 ? '+' : ''}${bonus})`);
        continue;
      }

      await pool.query(
        `UPDATE curation_candidates
         SET trend_category = $1,
             final_score    = final_score + $2
         WHERE id = $3`,
        [cat, bonus, candidate.id],
      );
    }

    // 진행 로그 (10배치마다)
    const batchNum = Math.floor(i / BATCH) + 1;
    if (batchNum % 10 === 0) {
      console.log(`[enrich-trend] ${Math.min(i + BATCH, candidates.length)}/${candidates.length}건 처리`);
    }

    // rate limit: 150ms delay
    await new Promise(r => setTimeout(r, 150));
  }

  await pool.end();

  // ── 결과 리포트 ──
  console.log('\n=== Phase D Trend 결과 ===');
  console.log(`  총 처리: ${candidates.length}건`);
  console.log(`  실패: ${errorCount}건`);
  console.log('  분류 결과:');
  for (const [cat, count] of Object.entries(counts)) {
    console.log(`    ${cat}: ${count}건`);
  }
  if (!isDryRun) {
    console.log('\n  final_score 변동:');
    console.log(`    rising  (+0.5): ${counts.rising}건`);
    console.log(`    steady  (+1.0): ${counts.steady}건`);
    console.log(`    declining (-2): ${counts.declining}건`);
    console.log(`    no change:      ${counts.seasonal + counts.new}건`);
  }
})();
