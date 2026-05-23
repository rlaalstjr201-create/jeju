/**
 * compare-tc.ts — Phase 2 mini dry-run comparison script.
 *
 * Compares 3 modes on the same 4 queries:
 * 1. Claude v6 single-call (Phase 1 baseline)
 * 2. Gemma v6 single-call (Phase 1 comparison)
 * 3. Gemma v7 Tool Calling (Phase 2)
 *
 * Cost cap: $5 total.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... OPENROUTER_API_KEY=... tsx src/scripts/compare-tc.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LlmExtractorAdapter } from '../infrastructure/llm/LlmExtractorAdapter.js';
import { AnthropicLlmAdapter } from '../infrastructure/llm/AnthropicLlmAdapter.js';
import { OpenRouterLlmAdapter } from '../infrastructure/llm/OpenRouterLlmAdapter.js';
import { KakaoLocalVerifier } from '../infrastructure/kakao/KakaoLocalVerifier.js';
import { NaverLocalVerifierAdapter } from '../infrastructure/naver/NaverLocalVerifierAdapter.js';
import type { LlmExtraction } from '../application/ports/LlmExtractorPort.js';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env */ }
}
loadEnv();

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

const GEMMA_COST_PER_1K_INPUT = 0.0001;  // $0.10/1M tokens
const GEMMA_COST_PER_1K_OUTPUT = 0.0002;
const CLAUDE_COST_PER_1K_INPUT = 0.00025;
const CLAUDE_COST_PER_1K_OUTPUT = 0.00125;

const COST_CAP_USD = 5.0;
let totalCostUsd = 0;

function trackCost(usage: { prompt_tokens: number; completion_tokens: number }, isGemma = true) {
  const inputRate = isGemma ? GEMMA_COST_PER_1K_INPUT : CLAUDE_COST_PER_1K_INPUT;
  const outputRate = isGemma ? GEMMA_COST_PER_1K_OUTPUT : CLAUDE_COST_PER_1K_OUTPUT;
  totalCostUsd += (usage.prompt_tokens / 1000) * inputRate + (usage.completion_tokens / 1000) * outputRate;
  if (totalCostUsd > COST_CAP_USD) {
    throw new Error(`Cost cap exceeded: $${totalCostUsd.toFixed(3)}`);
  }
}

// ---------------------------------------------------------------------------
// Test snippets (4 representative cases)
// ---------------------------------------------------------------------------

const TEST_CASES = [
  {
    query: '제주 로컬 카페',
    snippet: '선흘곶식당 입구가 너무 숨어있어서 지나칠 뻔했어요. 제주 조천읍의 진짜 로컬 맛집입니다.',
  },
  {
    query: '제주 해수욕장',
    snippet: '금능 바다가 정말 예쁘더라고요. 한림읍 쪽 해수욕장인데 에메랄드빛 물빛이 인상적이었어요.',
  },
  {
    query: '제주 카페 추천',
    snippet: '반빛당이라는 카페에 갔는데 SNS에서 많이 봤던 곳이에요. 체험단 후기라 참고만 하세요.',
  },
  {
    query: '제주 관광',
    snippet: '시골집 느낌의 식당에서 흑돼지를 먹었습니다. 중문 근처인데 분위기가 아늑했어요.',
  },
];

interface ModeResult {
  mode: string;
  results: Array<{
    query: string;
    spot_name: string | null;
    verification_status: string;
    extraction_confidence: number;
  }>;
  nullCount: number;
  avgConfidence: number;
  verificationDistribution: Record<string, number>;
}

async function runMode(
  modeName: string,
  extractor: LlmExtractorAdapter,
): Promise<ModeResult> {
  const results: ModeResult['results'] = [];
  const verDist: Record<string, number> = {};

  for (const tc of TEST_CASES) {
    console.log(`  [${modeName}] Query: ${tc.query}`);
    try {
      const r: LlmExtraction = await extractor.extract({ snippet: tc.snippet, query: tc.query });
      results.push({
        query: tc.query,
        spot_name: r.spot_name,
        verification_status: r.verification_status,
        extraction_confidence: r.extraction_confidence,
      });
      verDist[r.verification_status] = (verDist[r.verification_status] ?? 0) + 1;
      console.log(`    → ${r.spot_name ?? 'null'} [${r.verification_status}] conf=${r.extraction_confidence.toFixed(2)}`);
    } catch (err) {
      console.error(`    ERROR:`, err);
      results.push({ query: tc.query, spot_name: null, verification_status: 'error', extraction_confidence: 0 });
    }
  }

  const nullCount = results.filter((r) => r.spot_name === null).length;
  const avgConfidence = results.reduce((sum, r) => sum + r.extraction_confidence, 0) / results.length;

  return { mode: modeName, results, nullCount, avgConfidence, verificationDistribution: verDist };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const openrouterKey = process.env['OPENROUTER_API_KEY'] ?? '';
  const anthropicKey = process.env['ANTHROPIC_API_KEY'] ?? '';

  if (!openrouterKey) {
    console.warn('OPENROUTER_API_KEY not set — Gemma modes will fail');
  }
  if (!anthropicKey) {
    console.warn('ANTHROPIC_API_KEY not set — Claude mode will fail');
  }

  const kakaoVerifier = new KakaoLocalVerifier({
    restApiKey: process.env['KAKAO_REST_API_KEY'] ?? '',
  });
  const naverVerifier = new NaverLocalVerifierAdapter({
    clientId: process.env['NAVER_CLIENT_ID'] ?? '',
    clientSecret: process.env['NAVER_CLIENT_SECRET'] ?? '',
  });

  // Mode 1: Claude v6 single-call
  const claudeAdapter = new AnthropicLlmAdapter({ apiKey: anthropicKey });
  const claudeExtractor = new LlmExtractorAdapter(claudeAdapter);

  // Mode 2: Gemma v6 single-call
  const gemmaV6Adapter = new OpenRouterLlmAdapter({
    apiKey: openrouterKey,
    model: 'google/gemma-4-26b-a4b-it',
  });
  const gemmaV6Extractor = new LlmExtractorAdapter(gemmaV6Adapter);

  // Mode 3: Gemma v7 Tool Calling
  const gemmaV7Adapter = new OpenRouterLlmAdapter({
    apiKey: openrouterKey,
    model: 'google/gemma-4-26b-a4b-it',
  });
  const gemmaV7Extractor = new LlmExtractorAdapter(gemmaV7Adapter, {
    kakaoSearch: (q) => kakaoVerifier.searchRaw(q),
    naverSearch: (q) => naverVerifier.searchRaw(q),
  });

  const modeResults: ModeResult[] = [];

  console.log('\n=== Mode 1: Claude v6 Single-Call ===');
  modeResults.push(await runMode('Claude v6 single-call', claudeExtractor));

  console.log('\n=== Mode 2: Gemma v6 Single-Call ===');
  modeResults.push(await runMode('Gemma v6 single-call', gemmaV6Extractor));

  console.log('\n=== Mode 3: Gemma v7 Tool Calling ===');
  modeResults.push(await runMode('Gemma v7 tool-calling', gemmaV7Extractor));

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log('\n\n========== COMPARISON REPORT ==========\n');
  console.log(`Total estimated cost: $${totalCostUsd.toFixed(4)}\n`);

  for (const mode of modeResults) {
    console.log(`--- ${mode.mode} ---`);
    console.log(`  Null rate:        ${mode.nullCount}/${TEST_CASES.length} (${Math.round(mode.nullCount / TEST_CASES.length * 100)}%)`);
    console.log(`  Avg confidence:   ${mode.avgConfidence.toFixed(3)}`);
    console.log(`  Verification:     ${JSON.stringify(mode.verificationDistribution)}`);
  }

  console.log('\n--- Disagreement cases ---');
  for (const tc of TEST_CASES) {
    const perMode = modeResults.map((m) => m.results.find((r) => r.query === tc.query)!);
    const spotNames = perMode.map((r) => r.spot_name);
    const allSame = spotNames.every((n) => n === spotNames[0]);
    if (!allSame) {
      console.log(`\nQuery: "${tc.query}"`);
      for (const [i, mode] of modeResults.entries()) {
        const r = perMode[i]!;
        console.log(`  ${mode.mode}: ${r.spot_name ?? 'null'} [${r.verification_status}] conf=${r.extraction_confidence.toFixed(2)}`);
      }
    }
  }

  console.log('\n========================================\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
