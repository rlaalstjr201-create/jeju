import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { buildServer } from './interface/api/server.js';
import { runMigrations } from './infrastructure/persistence/migrationRunner.js';
import { PostgresTravellerRepository } from './infrastructure/persistence/PostgresTravellerRepository.js';
import { PostgresTripRepository } from './infrastructure/persistence/PostgresTripRepository.js';
import { PostgresShortlistRepository } from './infrastructure/persistence/PostgresShortlistRepository.js';
import { PostgresDayPlanRepository } from './infrastructure/persistence/PostgresDayPlanRepository.js';
import { PostgresSpotRepository } from './infrastructure/persistence/PostgresSpotRepository.js';
import { PostgresRecommenderAdapter } from './infrastructure/recommender/PostgresRecommenderAdapter.js';
import { PostgresTransactionManager } from './infrastructure/persistence/PostgresTransactionManager.js';
import { KakaoAuthAdapter } from './infrastructure/kakao/KakaoAuthAdapter.js';
import { DevAuthProvider } from './infrastructure/kakao/DevAuthProvider.js';
import { TravellerAuthService } from './infrastructure/kakao/TravellerAuthService.js';
import { LLMParseFreeTextAdapter } from './infrastructure/llm/LLMParseFreeTextAdapter.js';
import { ComposeDayPlanService } from './application/core-flow/ComposeDayPlanService.js';
import { CreateTripUseCase } from './application/core-flow/CreateTripUseCase.js';
import { GetRecommendationsUseCase } from './application/core-flow/GetRecommendationsUseCase.js';
import { UpdateShortlistUseCase } from './application/core-flow/UpdateShortlistUseCase.js';
import { ComposeDayPlanUseCase } from './application/core-flow/ComposeDayPlanUseCase.js';
import { EditDayPlanUseCase } from './application/core-flow/EditDayPlanUseCase.js';

// ---------------------------------------------------------------------------
// Load .env (manual parse — no dotenv dependency)
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
    // No .env file — rely on actual environment
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const IS_DEV = process.env['NODE_ENV'] === 'development';

if (!DATABASE_URL) {
  console.error('[startup] DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Auth provider: DevAuthProvider in development, KakaoAuthAdapter in production
const authProvider = IS_DEV
  ? new DevAuthProvider()
  : new KakaoAuthAdapter({
      clientId: process.env['KAKAO_REST_API_KEY'] ?? '',
      clientSecret: process.env['KAKAO_CLIENT_SECRET'] ?? '',
    });

// Repositories
const travellerRepo = new PostgresTravellerRepository(pool);
const tripRepo = new PostgresTripRepository(pool);
const shortlistRepo = new PostgresShortlistRepository(pool);
const dayPlanRepo = new PostgresDayPlanRepository(pool);
const spotRepo = new PostgresSpotRepository(pool);

// Services
const authService = new TravellerAuthService(authProvider, travellerRepo);
const recommender = new PostgresRecommenderAdapter(pool);
const txManager = new PostgresTransactionManager(pool);
const composeSvc = new ComposeDayPlanService();
const parsePort = new LLMParseFreeTextAdapter(process.env['ANTHROPIC_API_KEY']);

// Use cases
const deps = {
  createTripUseCase: new CreateTripUseCase(authService, parsePort, tripRepo),
  getRecommendationsUseCase: new GetRecommendationsUseCase(authService, tripRepo, shortlistRepo, recommender),
  updateShortlistUseCase: new UpdateShortlistUseCase(authService, spotRepo, shortlistRepo),
  composeDayPlanUseCase: new ComposeDayPlanUseCase(authService, tripRepo, shortlistRepo, dayPlanRepo, recommender, composeSvc, txManager),
  editDayPlanUseCase: new EditDayPlanUseCase(authService, tripRepo, dayPlanRepo, spotRepo),
};

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  await runMigrations(pool);
  console.log('[startup] Migrations applied (idempotent)');

  const fastify = buildServer(deps);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[startup] Server listening on port ${PORT} (NODE_ENV=${process.env['NODE_ENV'] ?? 'production'})`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[shutdown] ${signal} received — closing`);
    await fastify.close();
    await pool.end();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
