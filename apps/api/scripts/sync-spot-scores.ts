/**
 * scripts/sync-spot-scores.ts
 *
 * Entry point for daily trend score batch sync.
 * Usage: tsx scripts/sync-spot-scores.ts [--dry-run]
 * Cron: 0 18 * * * tsx /app/scripts/sync-spot-scores.ts  (KST 03:00 = UTC 18:00)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresSpotRepository } from '../src/infrastructure/persistence/PostgresSpotRepository.js';
import { PostgresTrendSourceRepository } from '../src/infrastructure/persistence/PostgresTrendSourceRepository.js';
import { DatalabVisitkoreaAdapter } from '../src/infrastructure/trend/DatalabVisitkoreaAdapter.js';
import { JejuTourismBigdataAdapter } from '../src/infrastructure/trend/JejuTourismBigdataAdapter.js';
import { KakaoMapRatingAdapter } from '../src/infrastructure/trend/KakaoMapRatingAdapter.js';
import { SyncSpotScoresUseCase } from '../src/application/curation/SyncSpotScoresUseCase.js';

// ---------------------------------------------------------------------------
// Load .env
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
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // No .env — rely on env
  }
}

loadEnv();

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
if (!DATABASE_URL) {
  console.error('[sync-spot-scores] DATABASE_URL is required');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  const spotRepo = new PostgresSpotRepository(pool);
  const trendSourceRepo = new PostgresTrendSourceRepository(pool);
  const datalabAdapter = new DatalabVisitkoreaAdapter();
  const ijtoAdapter = new JejuTourismBigdataAdapter();
  const kakaoAdapter = new KakaoMapRatingAdapter();

  const useCase = new SyncSpotScoresUseCase(
    [datalabAdapter, ijtoAdapter, kakaoAdapter],
    spotRepo,
    trendSourceRepo,
  );

  console.log(`[sync-spot-scores] Starting${dryRun ? ' (dry-run)' : ''}...`);

  const result = await useCase.execute({ dryRun });

  console.log(`[sync-spot-scores] Done. updated=${result.updated}, failed=[${result.failed.join(',')}]`);

  await pool.end();
}

main().catch((err: unknown) => {
  console.error('[sync-spot-scores] Fatal error:', err);
  process.exit(1);
});
