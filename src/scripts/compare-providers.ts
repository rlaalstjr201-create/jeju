#!/usr/bin/env tsx
/**
 * compare-providers — 동일한 Naver 스니펫에 대해 Claude v6 vs Gemma v6 추출 결과를 비교합니다.
 *
 * 사용법:
 *   npm run compare:providers
 *
 * 환경변수 필요:
 *   NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 *   ANTHROPIC_API_KEY (Claude provider)
 *   OPENROUTER_API_KEY (Gemma provider)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NaverSearchAdapter } from '../infrastructure/naver/NaverSearchAdapter.js';
import { LlmExtractorAdapter } from '../infrastructure/llm/LlmExtractorAdapter.js';
import { AnthropicLlmAdapter } from '../infrastructure/llm/AnthropicLlmAdapter.js';
import { OpenRouterLlmAdapter } from '../infrastructure/llm/OpenRouterLlmAdapter.js';
import type { LlmExtraction } from '../application/ports/LlmExtractorPort.js';

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
// Types
// ---------------------------------------------------------------------------

interface SnippetResult {
  query: string;
  snippet: string;
  claude: LlmExtraction | null;
  gemma: LlmExtraction | null;
  claudeError?: string;
  gemmaError?: string;
}

interface ComparisonReport {
  totalSnippets: number;
  bothNull: number;
  bothNonNull: number;
  mismatch: number;
  claudeNullRate: number;
  gemmaNullRate: number;
  claudeAvgAuthenticity: number;
  gemmaAvgAuthenticity: number;
  claudeAvgOrdinariness: number;
  gemmaAvgOrdinariness: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();

  // Load queries
  const queriesPath = resolve(process.cwd(), 'src/config/naver-queries-minidryrun.json');
  const queries = JSON.parse(readFileSync(queriesPath, 'utf-8')) as string[];

  console.log(`[compare-providers] Loaded ${queries.length} queries from naver-queries-minidryrun.json`);

  // Build adapters
  const naverAdapter = new NaverSearchAdapter({
    clientId: process.env['NAVER_CLIENT_ID'] ?? '',
    clientSecret: process.env['NAVER_CLIENT_SECRET'] ?? '',
  });

  const claudeProvider = new AnthropicLlmAdapter({
    model: process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001',
    ...(process.env['ANTHROPIC_API_KEY'] !== undefined && { apiKey: process.env['ANTHROPIC_API_KEY'] }),
  });

  const gemmaProvider = new OpenRouterLlmAdapter({
    model: process.env['OPENROUTER_MODEL'] ?? 'google/gemma-4-26b-a4b-it',
    ...(process.env['OPENROUTER_API_KEY'] !== undefined && { apiKey: process.env['OPENROUTER_API_KEY'] }),
  });

  const claudeExtractor = new LlmExtractorAdapter(claudeProvider);
  const gemmaExtractor = new LlmExtractorAdapter(gemmaProvider);

  // Collect snippets
  const snippets: Array<{ query: string; snippet: string }> = [];
  for (const query of queries) {
    console.log(`[compare-providers] Searching Naver for: "${query}"`);
    try {
      const [blogResult, cafeResult] = await Promise.all([
        naverAdapter.searchBlog(query, 5),
        naverAdapter.searchCafe(query, 5),
      ]);
      for (const item of [...blogResult.items, ...cafeResult.items]) {
        snippets.push({ query, snippet: item.description });
      }
    } catch (err) {
      console.error(`[compare-providers] Naver search failed for "${query}":`, err);
    }
  }

  console.log(`[compare-providers] Total snippets to compare: ${snippets.length}`);
  console.log('[compare-providers] Running Claude v6 vs Gemma v6 extraction...\n');

  // Run comparisons
  const results: SnippetResult[] = [];
  for (const { query, snippet } of snippets) {
    const [claudeResult, gemmaResult] = await Promise.allSettled([
      claudeExtractor.extract({ query, snippet }),
      gemmaExtractor.extract({ query, snippet }),
    ]);

    const result: SnippetResult = {
      query,
      snippet: snippet.slice(0, 80) + (snippet.length > 80 ? '...' : ''),
      claude: null,
      gemma: null,
    };

    if (claudeResult.status === 'fulfilled') {
      result.claude = claudeResult.value;
    } else {
      result.claudeError = String(claudeResult.reason);
    }

    if (gemmaResult.status === 'fulfilled') {
      result.gemma = gemmaResult.value;
    } else {
      result.gemmaError = String(gemmaResult.reason);
    }

    results.push(result);
  }

  // Aggregate
  const report: ComparisonReport = {
    totalSnippets: results.length,
    bothNull: 0,
    bothNonNull: 0,
    mismatch: 0,
    claudeNullRate: 0,
    gemmaNullRate: 0,
    claudeAvgAuthenticity: 0,
    gemmaAvgAuthenticity: 0,
    claudeAvgOrdinariness: 0,
    gemmaAvgOrdinariness: 0,
  };

  let claudeNullCount = 0;
  let gemmaNullCount = 0;
  let claudeAuthSum = 0;
  let gemmaAuthSum = 0;
  let claudeOrdSum = 0;
  let gemmaOrdSum = 0;
  let claudeAuthCount = 0;
  let gemmaAuthCount = 0;

  for (const r of results) {
    const claudeNull = r.claude?.spot_name == null;
    const gemmaNull = r.gemma?.spot_name == null;

    if (claudeNull) claudeNullCount++;
    if (gemmaNull) gemmaNullCount++;

    if (claudeNull && gemmaNull) {
      report.bothNull++;
    } else if (!claudeNull && !gemmaNull) {
      report.bothNonNull++;
    } else {
      report.mismatch++;
    }

    if (r.claude) {
      claudeAuthSum += r.claude.authenticity_score;
      claudeOrdSum += r.claude.ordinariness_score;
      claudeAuthCount++;
    }
    if (r.gemma) {
      gemmaAuthSum += r.gemma.authenticity_score;
      gemmaOrdSum += r.gemma.ordinariness_score;
      gemmaAuthCount++;
    }
  }

  report.claudeNullRate = results.length > 0 ? claudeNullCount / results.length : 0;
  report.gemmaNullRate = results.length > 0 ? gemmaNullCount / results.length : 0;
  report.claudeAvgAuthenticity = claudeAuthCount > 0 ? claudeAuthSum / claudeAuthCount : 0;
  report.gemmaAvgAuthenticity = gemmaAuthCount > 0 ? gemmaAuthSum / gemmaAuthCount : 0;
  report.claudeAvgOrdinariness = claudeAuthCount > 0 ? claudeOrdSum / claudeAuthCount : 0;
  report.gemmaAvgOrdinariness = gemmaAuthCount > 0 ? gemmaOrdSum / gemmaAuthCount : 0;

  // Print report
  console.log('='.repeat(60));
  console.log('PROVIDER COMPARISON REPORT — Claude v6 vs Gemma v6 (v6 English prompt)');
  console.log('='.repeat(60));
  console.log(`Total snippets:          ${report.totalSnippets}`);
  console.log(`Both null:               ${report.bothNull} (${pct(report.bothNull, report.totalSnippets)})`);
  console.log(`Both non-null:           ${report.bothNonNull} (${pct(report.bothNonNull, report.totalSnippets)})`);
  console.log(`Mismatch (one null):     ${report.mismatch} (${pct(report.mismatch, report.totalSnippets)})`);
  console.log('');
  console.log(`Claude null rate:        ${(report.claudeNullRate * 100).toFixed(1)}%`);
  console.log(`Gemma null rate:         ${(report.gemmaNullRate * 100).toFixed(1)}%`);
  console.log('');
  console.log(`Claude avg authenticity: ${report.claudeAvgAuthenticity.toFixed(3)}`);
  console.log(`Gemma avg authenticity:  ${report.gemmaAvgAuthenticity.toFixed(3)}`);
  console.log('');
  console.log(`Claude avg ordinariness: ${report.claudeAvgOrdinariness.toFixed(3)}`);
  console.log(`Gemma avg ordinariness:  ${report.gemmaAvgOrdinariness.toFixed(3)}`);
  console.log('='.repeat(60));

  // Print mismatches for manual review
  const mismatches = results.filter((r) => {
    const claudeNull = r.claude?.spot_name == null;
    const gemmaNull = r.gemma?.spot_name == null;
    return claudeNull !== gemmaNull;
  });

  if (mismatches.length > 0) {
    console.log('\nMISMATCH DETAILS (manual review):');
    for (const r of mismatches) {
      console.log(`  Query: ${r.query}`);
      console.log(`  Snippet: ${r.snippet}`);
      console.log(`  Claude: ${r.claude?.spot_name ?? 'null'}`);
      console.log(`  Gemma:  ${r.gemma?.spot_name ?? 'null'}`);
      console.log('');
    }
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((err: unknown) => {
  console.error('[compare-providers] fatal:', err);
  process.exit(1);
});
