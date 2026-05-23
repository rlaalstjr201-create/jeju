import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { PostgresCurationCandidateRepository } from './infrastructure/persistence/PostgresCurationCandidateRepository.js';
import { PostgresCurationDecisionRepository } from './infrastructure/persistence/PostgresCurationDecisionRepository.js';
import { PostgresCalibrationProfileRepository } from './infrastructure/persistence/PostgresCalibrationProfileRepository.js';
import { PostgresTrendSourceRepository } from './infrastructure/persistence/PostgresTrendSourceRepository.js';
import { KakaoAuthAdapter } from './infrastructure/kakao/KakaoAuthAdapter.js';
import { KakaoLocalPlaceAdapter } from './infrastructure/kakao/KakaoLocalPlaceAdapter.js';
import { KakaoLocalVerifier } from './infrastructure/kakao/KakaoLocalVerifier.js';
import { DevAuthProvider } from './infrastructure/kakao/DevAuthProvider.js';
import { TravellerAuthService } from './infrastructure/kakao/TravellerAuthService.js';
import { LLMParseFreeTextAdapter } from './infrastructure/llm/LLMParseFreeTextAdapter.js';
import { AnthropicLLMEnricherAdapter } from './infrastructure/llm/AnthropicLLMEnricherAdapter.js';
import { LlmExtractorAdapter } from './infrastructure/llm/LlmExtractorAdapter.js';
import { SpotMetaInfererAdapter } from './infrastructure/llm/SpotMetaInfererAdapter.js';
import { AnthropicLlmAdapter } from './infrastructure/llm/AnthropicLlmAdapter.js';
import { VisitjejuAdapter } from './infrastructure/visitjeju/VisitjejuAdapter.js';
import { NaverSearchAdapter } from './infrastructure/naver/NaverSearchAdapter.js';
import { VoyageEmbeddingBatcher } from './infrastructure/voyage/VoyageEmbeddingBatcher.js';
import { LabelStudioBridge } from './infrastructure/labelstudio/LabelStudioBridge.js';
import { DatalabVisitkoreaAdapter } from './infrastructure/trend/DatalabVisitkoreaAdapter.js';
import { JejuTourismBigdataAdapter } from './infrastructure/trend/JejuTourismBigdataAdapter.js';
import { ComposeDayPlanService } from './application/core-flow/ComposeDayPlanService.js';
import { CreateTripUseCase } from './application/core-flow/CreateTripUseCase.js';
import { GetRecommendationsUseCase } from './application/core-flow/GetRecommendationsUseCase.js';
import { UpdateShortlistUseCase } from './application/core-flow/UpdateShortlistUseCase.js';
import { ComposeDayPlanUseCase } from './application/core-flow/ComposeDayPlanUseCase.js';
import { EditDayPlanUseCase } from './application/core-flow/EditDayPlanUseCase.js';
import { DiscoverCandidatesUseCase } from './application/curation/DiscoverCandidatesUseCase.js';
import { ListCandidatesUseCase } from './application/curation/ListCandidatesUseCase.js';
import { EnrichCandidateUseCase } from './application/curation/EnrichCandidateUseCase.js';
import { ApproveCandidateUseCase } from './application/curation/ApproveCandidateUseCase.js';
import { RejectCandidateUseCase } from './application/curation/RejectCandidateUseCase.js';
import { AdjustCalibrationUseCase } from './application/curation/AdjustCalibrationUseCase.js';
import { RunDiscoveryPipelineUseCase } from './application/curation/RunDiscoveryPipelineUseCase.js';
import { PersistCurationDecisionUseCase } from './application/curation/PersistCurationDecisionUseCase.js';
import { PatchCandidateCoordinatesUseCase } from './application/curation/PatchCandidateCoordinatesUseCase.js';
import { ListApprovedSpotsUseCase } from './application/spots/ListApprovedSpotsUseCase.js';
import { GetSpotByIdUseCase } from './application/spots/GetSpotByIdUseCase.js';

// ---------------------------------------------------------------------------
// Load .env (manual parse — no dotenv dependency)
// ---------------------------------------------------------------------------

function loadEnv(): void {
  try {
    const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
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
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
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
const candidateRepo = new PostgresCurationCandidateRepository(pool);
const decisionRepo = new PostgresCurationDecisionRepository(pool);
const calibrationRepo = new PostgresCalibrationProfileRepository(pool);
const trendSourceRepo = new PostgresTrendSourceRepository(pool);

// Services
const authService = new TravellerAuthService(authProvider, travellerRepo);
const recommender = new PostgresRecommenderAdapter(pool);
const txManager = new PostgresTransactionManager(pool);
const composeSvc = new ComposeDayPlanService();
const parsePort = new LLMParseFreeTextAdapter(process.env['ANTHROPIC_API_KEY']);
const llmEnricher = new AnthropicLLMEnricherAdapter(process.env['ANTHROPIC_API_KEY']);
const kakaoLocalApi = new KakaoLocalPlaceAdapter();
const datalabAdapter = new DatalabVisitkoreaAdapter();
const ijtoAdapter = new JejuTourismBigdataAdapter();

// Phase 0 adapters
const visitjejuAdapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY'] ?? '' });
const naverSearchAdapter = new NaverSearchAdapter({
  clientId: process.env['NAVER_CLIENT_ID'] ?? '',
  clientSecret: process.env['NAVER_CLIENT_SECRET'] ?? '',
});
const defaultLlmProvider = new AnthropicLlmAdapter({
  model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001',
  ...(process.env['ANTHROPIC_API_KEY'] !== undefined && { apiKey: process.env['ANTHROPIC_API_KEY'] }),
});
const llmExtractorAdapter = new LlmExtractorAdapter(defaultLlmProvider);
const kakaoLocalVerifier = new KakaoLocalVerifier({ restApiKey: process.env['KAKAO_REST_API_KEY'] ?? '' });
const spotMetaInferer = new SpotMetaInfererAdapter(defaultLlmProvider);
const persistDecisionUseCase = new PersistCurationDecisionUseCase(decisionRepo, candidateRepo);
const labelStudioBridge = new LabelStudioBridge(
  persistDecisionUseCase,
  process.env['LABEL_STUDIO_WEBHOOK_SECRET'] ?? '',
);
const voyageBatcher = new VoyageEmbeddingBatcher(
  process.env['VOYAGE_API_KEY'] ?? '',
  spotMetaInferer,
  spotRepo,
);

// Load naver queries (populated in Phase F: src/config/naver-queries.json)
let naverQueries: string[] = [];
try {
  const queriesPath = fileURLToPath(new URL('./config/naver-queries.json', import.meta.url));
  naverQueries = JSON.parse(readFileSync(queriesPath, 'utf-8')) as string[];
} catch {
  // File does not yet exist — pipeline will run with an empty query list
}

const runPipelineUseCase = new RunDiscoveryPipelineUseCase(
  visitjejuAdapter,
  naverSearchAdapter,
  llmExtractorAdapter,
  kakaoLocalVerifier,
  candidateRepo,
  naverQueries,
);

// Use cases
const deps = {
  createTripUseCase: new CreateTripUseCase(authService, parsePort, tripRepo),
  getRecommendationsUseCase: new GetRecommendationsUseCase(
    authService, tripRepo, shortlistRepo, recommender, calibrationRepo,
  ),
  updateShortlistUseCase: new UpdateShortlistUseCase(authService, spotRepo, shortlistRepo),
  composeDayPlanUseCase: new ComposeDayPlanUseCase(
    authService, tripRepo, shortlistRepo, dayPlanRepo, recommender, composeSvc, txManager,
  ),
  editDayPlanUseCase: new EditDayPlanUseCase(authService, tripRepo, dayPlanRepo, spotRepo),
  discoverCandidatesUseCase: new DiscoverCandidatesUseCase(
    [datalabAdapter, ijtoAdapter], candidateRepo, spotRepo,
  ),
  listCandidatesUseCase: new ListCandidatesUseCase(candidateRepo),
  enrichCandidateUseCase: new EnrichCandidateUseCase(candidateRepo, llmEnricher, kakaoLocalApi),
  approveCandidateUseCase: new ApproveCandidateUseCase(candidateRepo, spotRepo, txManager),
  rejectCandidateUseCase: new RejectCandidateUseCase(candidateRepo, spotRepo, txManager),
  adjustCalibrationUseCase: new AdjustCalibrationUseCase(authService, tripRepo, calibrationRepo),
  runDiscoveryPipelineUseCase: runPipelineUseCase,
  getCandidateByIdUseCase: { execute: (id: string) => candidateRepo.findById(id) },
  patchCandidateCoordinatesUseCase: new PatchCandidateCoordinatesUseCase(candidateRepo),
  embeddingBatcher: voyageBatcher,
  labelStudioBridge,
  listApprovedSpotsUseCase: new ListApprovedSpotsUseCase(spotRepo),
  getSpotByIdUseCase: new GetSpotByIdUseCase(spotRepo),
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
