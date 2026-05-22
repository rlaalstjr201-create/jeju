#!/usr/bin/env tsx
/**
 * seed-pipeline — Phase 0 발굴 파이프라인을 수동으로 실행합니다.
 *
 * 사용법:
 *   npm run seed:visitjeju         # Stage 1(visitjeju) 전용
 *   npm run seed:naver-discover    # Stage 1 + Stage 2-5(Naver) 전체
 *
 * --visitjeju-only 플래그 전달 시 naverQueries를 비워 Stage 2-5를 건너뜁니다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { PostgresCurationCandidateRepository } from '../infrastructure/persistence/PostgresCurationCandidateRepository.js';
import { VisitjejuAdapter } from '../infrastructure/visitjeju/VisitjejuAdapter.js';
import { NaverSearchAdapter } from '../infrastructure/naver/NaverSearchAdapter.js';
import { LlmExtractorAdapter } from '../infrastructure/llm/LlmExtractorAdapter.js';
import { AnthropicLlmAdapter } from '../infrastructure/llm/AnthropicLlmAdapter.js';
import { OpenRouterLlmAdapter } from '../infrastructure/llm/OpenRouterLlmAdapter.js';
import { KakaoLocalVerifier } from '../infrastructure/kakao/KakaoLocalVerifier.js';
import { NaverLocalVerifierAdapter } from '../infrastructure/naver/NaverLocalVerifierAdapter.js';
import { RunDiscoveryPipelineUseCase } from '../application/curation/RunDiscoveryPipelineUseCase.js';
import type { LlmProviderPort } from '../application/ports/LlmProviderPort.js';

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
// Blocked URL patterns config
// ---------------------------------------------------------------------------

function loadBlockedUrlPatterns(): string[] {
  try {
    const p = resolve(process.cwd(), 'src/config/naver-blocked-url-patterns.json');
    return JSON.parse(readFileSync(p, 'utf-8')) as string[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Blocked categories config
// ---------------------------------------------------------------------------

function loadBlockedCategories(): string[] {
  try {
    const p = resolve(process.cwd(), 'src/config/kakao-blocked-categories.json');
    return JSON.parse(readFileSync(p, 'utf-8')) as string[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export function resolveProvider(argv: string[]): LlmProviderPort {
  const arg = argv.find((a) => a.startsWith('--provider='))?.slice('--provider='.length)
    ?? process.env['LLM_PROVIDER'];
  if (arg === 'openrouter') {
    return new OpenRouterLlmAdapter({
      model: process.env['OPENROUTER_MODEL'] ?? 'google/gemma-4-26b-a4b-it',
      ...(process.env['OPENROUTER_API_KEY'] !== undefined && { apiKey: process.env['OPENROUTER_API_KEY'] }),
    });
  }
  return new AnthropicLlmAdapter({
    model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001',
    ...(process.env['ANTHROPIC_API_KEY'] !== undefined && { apiKey: process.env['ANTHROPIC_API_KEY'] }),
  });
}

// ---------------------------------------------------------------------------
// LlmExtractor builder (with optional tool calling mode)
// ---------------------------------------------------------------------------

export function buildLlmExtractor(
  argv: string[],
  kakaoVerifier: KakaoLocalVerifier,
  naverVerifier: NaverLocalVerifierAdapter,
): LlmExtractorAdapter {
  const provider = resolveProvider(argv);
  const toolCalling = argv.includes('--tool-calling') || process.env['LLM_TOOL_CALLING'] === 'true';
  if (toolCalling) {
    return new LlmExtractorAdapter(provider, {
      kakaoSearch: (q) => kakaoVerifier.searchRaw(q),
      naverSearch: (q) => naverVerifier.searchRaw(q),
    });
  }
  return new LlmExtractorAdapter(provider);
}

// ---------------------------------------------------------------------------
// CLI arg parsing (exported for tests)
// ---------------------------------------------------------------------------

export function isVisitjejuOnly(argv: string[]): boolean {
  return argv.includes('--visitjeju-only');
}

export function loadNaverQueries(visitjejuOnly: boolean, queriesFile?: string): string[] {
  if (visitjejuOnly) return [];
  try {
    const queriesPath = queriesFile
      ? resolve(process.cwd(), queriesFile)
      : resolve(process.cwd(), 'src/config/naver-queries.json');
    return JSON.parse(readFileSync(queriesPath, 'utf-8')) as string[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseQueriesFile(argv: string[]): string | undefined {
  const arg = argv.find((a) => a.startsWith('--queries-file='));
  return arg ? arg.slice('--queries-file='.length) : undefined;
}

async function main(): Promise<void> {
  loadEnv();

  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (!databaseUrl) {
    console.error('[seed-pipeline] DATABASE_URL is required');
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  const visitjejuOnly = isVisitjejuOnly(argv);
  const queriesFile = parseQueriesFile(argv);
  const naverQueries = loadNaverQueries(visitjejuOnly, queriesFile);

  console.log(`[seed-pipeline] mode=${visitjejuOnly ? 'visitjeju-only' : 'full'} naverQueries=${naverQueries.length}${queriesFile ? ` file=${queriesFile}` : ''}`);

  const pool = new Pool({ connectionString: databaseUrl });
  const startMs = Date.now();
  try {
    const candidateRepo = new PostgresCurationCandidateRepository(pool);
    const visitjejuAdapter = new VisitjejuAdapter({ apiKey: process.env['VISITJEJU_API_KEY'] ?? '' });
    const naverAdapter = new NaverSearchAdapter({
      clientId: process.env['NAVER_CLIENT_ID'] ?? '',
      clientSecret: process.env['NAVER_CLIENT_SECRET'] ?? '',
    });
    const kakaoVerifier = new KakaoLocalVerifier({ restApiKey: process.env['KAKAO_REST_API_KEY'] ?? '' });
    const naverLocalVerifier = new NaverLocalVerifierAdapter({
      clientId: process.env['NAVER_CLIENT_ID'] ?? '',
      clientSecret: process.env['NAVER_CLIENT_SECRET'] ?? '',
    });
    const llmExtractor = buildLlmExtractor(argv, kakaoVerifier, naverLocalVerifier);

    const blockedUrlPatterns = loadBlockedUrlPatterns();
    const blockedCategories = loadBlockedCategories();
    const useCase = new RunDiscoveryPipelineUseCase(
      visitjejuAdapter,
      naverAdapter,
      llmExtractor,
      kakaoVerifier,
      candidateRepo,
      naverQueries,
      { naverLocalVerifier, blockedUrlPatterns, blockedCategories },
    );

    const result = await useCase.execute();
    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`[seed-pipeline] done in ${elapsedSec}s —`, JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

// Run only when executed directly (not imported in tests)
if (process.argv[1]?.endsWith('seed-pipeline.ts') || process.argv[1]?.endsWith('seed-pipeline.js')) {
  main().catch((err: unknown) => {
    console.error('[seed-pipeline] fatal:', err);
    process.exit(1);
  });
}
