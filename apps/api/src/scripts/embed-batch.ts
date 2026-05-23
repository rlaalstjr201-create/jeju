#!/usr/bin/env tsx
/**
 * embed:batch — 승인된 Spot에 Voyage AI 임베딩을 생성·저장합니다.
 *
 * 사용법:
 *   npm run embed:batch                         # 임베딩 미생성 전체 Spot 처리
 *   npm run embed:batch -- --spot-ids=id1,id2   # 특정 Spot만 처리
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresSpotRepository } from '../infrastructure/persistence/PostgresSpotRepository.js';
import { SpotMetaInfererAdapter } from '../infrastructure/llm/SpotMetaInfererAdapter.js';
import { AnthropicLlmAdapter } from '../infrastructure/llm/AnthropicLlmAdapter.js';
import { VoyageEmbeddingBatcher } from '../infrastructure/voyage/VoyageEmbeddingBatcher.js';

// ---------------------------------------------------------------------------
// Env load
// ---------------------------------------------------------------------------

function loadEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env file — rely on actual environment
  }
}

// ---------------------------------------------------------------------------
// CLI arg parsing (exported for tests)
// ---------------------------------------------------------------------------

export function parseSpotIds(argv: string[]): string[] | undefined {
  const arg = argv.find((a) => a.startsWith('--spot-ids='));
  if (!arg) return undefined;
  const ids = arg.slice('--spot-ids='.length).split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();

  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (!databaseUrl) {
    console.error('[embed:batch] DATABASE_URL is required');
    process.exit(1);
  }

  const spotIds = parseSpotIds(process.argv.slice(2));
  if (spotIds) {
    console.log(`[embed:batch] target spot IDs: ${spotIds.join(', ')}`);
  } else {
    console.log('[embed:batch] processing all spots without embeddings');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const spotRepo = new PostgresSpotRepository(pool);
    const llmProvider = new AnthropicLlmAdapter({
      model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001',
      ...(process.env['ANTHROPIC_API_KEY'] !== undefined && { apiKey: process.env['ANTHROPIC_API_KEY'] }),
    });
    const metaInferer = new SpotMetaInfererAdapter(llmProvider);
    const batcher = new VoyageEmbeddingBatcher(
      process.env['VOYAGE_API_KEY'] ?? '',
      metaInferer,
      spotRepo,
    );

    const result = await batcher.run(spotIds);
    console.log(`[embed:batch] done — processed=${result.processed} failed=${result.failed}`);
    if (result.failedIds.length > 0) {
      console.error('[embed:batch] failed IDs:', result.failedIds.join(', '));
      process.exit(2);
    }
  } finally {
    await pool.end();
  }
}

// Run only when executed directly (not imported in tests)
if (process.argv[1]?.endsWith('embed-batch.ts') || process.argv[1]?.endsWith('embed-batch.js')) {
  main().catch((err: unknown) => {
    console.error('[embed:batch] fatal:', err);
    process.exit(1);
  });
}
