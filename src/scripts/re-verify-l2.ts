#!/usr/bin/env tsx
/**
 * L2 cosine 재검증 스크립트
 * Run 1에서 Voyage 429로 l2_cosine=null로 저장된 330건을 재검증.
 *
 * 실행: npx tsx src/scripts/re-verify-l2.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

// ── Voyage embed ──────────────────────────────────────────────────

let _lastVoyageCall = 0;
const VOYAGE_MIN_INTERVAL_MS = Number(process.env['VOYAGE_INTERVAL_MS'] ?? 30_000);

async function voyageEmbed(apiKey: string, texts: string[]): Promise<number[][]> {
  const wait = _lastVoyageCall + VOYAGE_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  let delay = 10_000;
  for (let attempt = 0; attempt < 5; attempt++) {
    _lastVoyageCall = Date.now();
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-3-large', input: texts }),
    });
    if (res.ok) {
      const data = await res.json() as { data: { embedding: number[]; index: number }[] };
      return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const backoff = retryAfter ? Number(retryAfter) * 1000 : delay;
      console.warn(`[Voyage] 429 rate limit — waiting ${Math.round(backoff / 1000)}s (attempt ${attempt + 1}/5)`);
      await new Promise(r => setTimeout(r, backoff));
      delay = Math.min(delay * 2, 60_000);
      continue;
    }
    throw new Error(`Voyage API ${res.status}`);
  }
  throw new Error('Voyage API 429: max retries exceeded');
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na  += (a[i] ?? 0) ** 2;
    nb  += (b[i] ?? 0) ** 2;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ── 메인 ─────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun = process.argv.includes('--dry-run');
  const voyageKey = process.env['VOYAGE_API_KEY'] ?? '';
  if (!voyageKey) { console.error('VOYAGE_API_KEY 미설정'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  interface SpotRow {
    id: number;
    name: string;
    comment_draft: string;
    comment_verified: string;
  }

  const { rows } = await pool.query<SpotRow>(`
    SELECT id, name, comment_draft, comment_verified
    FROM curation_candidates
    WHERE selected_tier = 'reference'
      AND comment_draft IS NOT NULL
      AND (comment_verified::jsonb->>'l2_cosine') IS NULL
    ORDER BY id
  `);

  console.log(`[re-verify-l2] 대상: ${rows.length}건 (L2=null)`);
  if (isDryRun) console.log('[re-verify-l2] dry-run 모드');
  console.log();

  const stats = {
    ok: 0, below_threshold: 0, error: 0,
    cosineScores: [] as number[],
  };
  const belowThreshold: { name: string; l2: number }[] = [];

  let processed = 0;
  const total = rows.length;

  for (const row of rows) {
    processed++;
    const draft = JSON.parse(row.comment_draft) as { comment: string; evidence_quote: string };
    const verification = JSON.parse(row.comment_verified) as Record<string, unknown>;

    try {
      const [commentEmb, quoteEmb] = await voyageEmbed(voyageKey, [draft.comment, draft.evidence_quote]);
      const cosine = cosineSimilarity(commentEmb!, quoteEmb!);
      stats.cosineScores.push(cosine);

      if (cosine < 0.70) {
        stats.below_threshold++;
        belowThreshold.push({ name: row.name, l2: cosine });
        console.log(`[${processed}/${total}] ${row.name} → L2=${cosine.toFixed(3)} ⚠️ <0.70`);
      } else {
        stats.ok++;
        console.log(`[${processed}/${total}] ${row.name} → L2=${cosine.toFixed(3)} ✅`);
      }

      if (!isDryRun) {
        const updated = { ...verification, l2_cosine: cosine };
        await pool.query(
          `UPDATE curation_candidates SET comment_verified = $1 WHERE id = $2`,
          [JSON.stringify(updated), row.id],
        );
      }
    } catch (e) {
      stats.error++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${processed}/${total}] ${row.name} → 에러: ${msg}`);
    }
  }

  await pool.end();

  const avgL2 = stats.cosineScores.length > 0
    ? (stats.cosineScores.reduce((a, b) => a + b, 0) / stats.cosineScores.length).toFixed(3)
    : 'n/a';
  const minL2 = stats.cosineScores.length > 0
    ? Math.min(...stats.cosineScores).toFixed(3)
    : 'n/a';

  console.log('\n=== L2 재검증 결과 ===');
  console.log(`  통과 (≥0.70):   ${stats.ok}건`);
  console.log(`  미달 (<0.70):   ${stats.below_threshold}건`);
  console.log(`  에러:            ${stats.error}건`);
  console.log(`  L2 cosine:       평균 ${avgL2} / 최저 ${minL2}`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');

  if (belowThreshold.length > 0) {
    console.log('\n⚠️  L2 미달 목록 (수동 검토 필요):');
    for (const s of belowThreshold) {
      console.log(`  - ${s.name}: L2=${s.l2.toFixed(3)}`);
    }
  }
})();
