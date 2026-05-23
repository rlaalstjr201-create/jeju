#!/usr/bin/env tsx
/**
 * Phase E: 큐레이터 코멘트 2-Stage 생성
 * Stage 1: Gemma 26B (draft hook + supporting + sources)
 * Stage 2: GPT-4o mini (Factored CoVe grounding 검증)
 * ADR-0045 (5-Layer) + ADR-0052 Amendment 1
 *
 * 실행: npx tsx src/scripts/generate-comments.ts [--dry-run] [--limit=N]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

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

// ── 타입 정의 ─────────────────────────────────────────────────────

interface SnippetSource {
  source_type: 'blog' | 'cafe' | 'official';
  source_url: string;
  quote: string;
}

interface CommentDraft {
  hook: string | null;
  supporting: string | null;
  sources: SnippetSource[];
}

interface ClaimVerification {
  hook_supported: boolean;
  hook_reason: string;
  supporting_supported: boolean;
  supporting_reason: string;
}

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
  subregion: string | null;
  llm_summary: string | null;
  llm_tags: string[];
  awards_hint: string[];
  trend_category: string | null;
  external_buzz_count: number | null;
}

interface SnippetRow {
  id: number;
  source_type: string;
  source_url: string;
  title: string | null;
  description: string | null;
}

// ── 금지 어휘 정규식 (ADR-0052 Layer 4) ──────────────────────────

const BANNED_REGEX = /꼭\s*가봐야|인생샷|강추|현지인\s*추천|숨겨진\s*보석|[!?！？]|저는|저도|여러분|당신/;

function hasBannedPhrase(text: string): boolean {
  return BANNED_REGEX.test(text);
}

// ── OpenRouter 호출 (공통) ────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

async function callWithTool(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  tool: ToolDef,
  maxTokens: number,
): Promise<Record<string, unknown> | null> {
  let delay = 2000;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.1,
          top_p: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
          tool_choice: { type: 'function', function: { name: tool.name } },
        }),
      });

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        console.error(`[LLM] HTTP ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }

      const data = await res.json() as { choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }> };
      const args = data.choices[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) return null;
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  return null;
}

// ── Stage 1: Gemma 26B — draft 생성 ──────────────────────────────

const STAGE1_TOOL: ToolDef = {
  name: 'generate_comment_draft',
  description: 'Generate a two-sentence Korean curation comment draft with grounding sources.',
  parameters: {
    type: 'object',
    required: ['hook', 'supporting', 'sources'],
    properties: {
      hook: {
        type: ['string', 'null'],
        description: '첫 번째 문장 (30~50자 한국어, 감각·실용 후크, 존댓말 종결어미). null if insufficient data.',
      },
      supporting: {
        type: ['string', 'null'],
        description: '두 번째 문장 (30~50자 한국어, timing·practical·downside 중 1, 존댓말 종결어미). null if insufficient data.',
      },
      sources: {
        type: 'array',
        description: '코멘트 작성에 사용한 snippet 출처 목록',
        items: {
          type: 'object',
          required: ['source_type', 'source_url', 'quote'],
          properties: {
            source_type: { type: 'string', enum: ['blog', 'cafe', 'official'] },
            source_url:  { type: 'string' },
            quote:       { type: 'string', description: '사용한 원문 한 줄' },
          },
        },
      },
    },
  },
};

function buildStage1System(): string {
  return `You are a travel editor writing concise Korean curation comments in the style of Monocle.

RULES (absolute — violations will be rejected):
1. Every factual claim MUST come from the provided snippets. DO NOT use general knowledge.
2. Output KOREAN only. Use polite speech endings (존댓말): ~좋아요, ~쉽습니다, ~납니다, ~됩니다.
3. FORBIDDEN words/patterns: 꼭 가봐야, 인생샷, 강추, 현지인 추천, 숨겨진 보석, !, ?, 저는, 여러분, 당신.
4. hook: 1 sentence 30–50 Korean chars. Sensory or practical hook.
5. supporting: 1 sentence 30–50 Korean chars. Choose ONE: timing tip | practical detail | honest downside.
6. Comparison references encouraged: "교토보다 한적한", "성산보다 덜 알려진".
7. sources: cite the snippet URL(s) you drew from. quote must be verbatim from snippet.
8. If snippets provide no usable information for a field, return null for that field.`;
}

function buildStage1User(spot: SpotRow, snippets: SnippetRow[]): string {
  const snippetBlock = snippets
    .slice(0, 10)
    .map((s, i) => `[S${i + 1}] (${s.source_type}) ${s.description ?? s.title ?? ''}`)
    .join('\n');

  const decliningSuffix = spot.trend_category === 'declining'
    ? '\n⚠️ DECLINING TREND: Recent search interest is falling. Do not manufacture optimism. Reflect this subtly if supported by snippets.'
    : '';

  return `Spot name: ${spot.name}
Category: ${spot.category} | Region: ${spot.region}${spot.subregion ? ' ' + spot.subregion : ''}
Description: ${spot.llm_summary ?? '(no description)'}
Tags: ${spot.llm_tags.join(', ')}
Awards: ${spot.awards_hint.length > 0 ? spot.awards_hint.join(', ') : 'none'}
Trend: ${spot.trend_category ?? 'unknown'} | Search volume: ${spot.external_buzz_count ?? 0}${decliningSuffix}

Snippets from Naver blog/cafe searches:
${snippetBlock}

Write a curation comment draft. Draw only from the snippets above.`;
}

// ── Stage 2: GPT-4o mini — Factored CoVe 검증 ────────────────────

const STAGE2_TOOL: ToolDef = {
  name: 'verify_claims',
  description: 'Verify whether each claim in the draft is supported by the source snippets.',
  parameters: {
    type: 'object',
    required: ['hook_supported', 'hook_reason', 'supporting_supported', 'supporting_reason'],
    properties: {
      hook_supported:       { type: 'boolean' },
      hook_reason:          { type: 'string', description: 'Brief reason for hook verdict' },
      supporting_supported: { type: 'boolean' },
      supporting_reason:    { type: 'string', description: 'Brief reason for supporting verdict' },
    },
  },
};

function buildStage2System(): string {
  return `You are a strict fact-checker. Verify if each claim is supported by the provided source snippets.
Rules:
- "Supported" means the snippet explicitly mentions the fact or clearly implies it.
- "Not supported" means the snippet does not mention it, or it contradicts it.
- General knowledge does NOT count as support. Only what is in the snippets.`;
}

function buildStage2User(spot: SpotRow, snippets: SnippetRow[], draft: CommentDraft): string {
  const snippetBlock = snippets
    .slice(0, 10)
    .map((s, i) => `[S${i + 1}] ${s.description ?? s.title ?? ''}`)
    .join('\n');

  return `Spot: ${spot.name} (${spot.category})

Source snippets:
${snippetBlock}

Claims to verify:
HOOK: "${draft.hook ?? '(null)'}"
SUPPORTING: "${draft.supporting ?? '(null)'}"

For each claim, assess whether it is directly supported by the snippets above.
If a claim is null, mark it as supported=true (no verification needed).`;
}

// ── 합성: hook + supporting → curator_comment ─────────────────────

function synthesizeComment(hook: string | null, supporting: string | null): string | null {
  const parts = [hook, supporting].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

// ── 독립 snippet 필터 (URL 기준 dedup) ───────────────────────────

function deduplicateSnippets(snippets: SnippetRow[], sharedUrls: Set<string>): SnippetRow[] {
  return snippets.filter(s => !sharedUrls.has(s.source_url));
}

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const rowLimit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

  const apiKey = process.env['OPENROUTER_API_KEY'] ?? '';
  if (!apiKey) { console.error('OPENROUTER_API_KEY 미설정'); process.exit(1); }

  const GEMMA   = 'google/gemma-4-26b-a4b-it';
  const GPT4O_MINI = 'openai/gpt-4o-mini';

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  // 1. 대상 spot 조회 (comment_draft 없는 것만)
  const limitClause = rowLimit ? `LIMIT ${rowLimit}` : '';
  const { rows: spots } = await pool.query<SpotRow>(
    `SELECT id, name, category, region, subregion,
            llm_summary, llm_tags, awards_hint, trend_category, external_buzz_count
     FROM curation_candidates
     WHERE selected_tier = 'reference'
       AND comment_draft IS NULL
     ORDER BY final_score DESC
     ${limitClause}`,
  );

  console.log(`[generate-comments] 대상: ${spots.length}건`);
  if (isDryRun) console.log('[generate-comments] dry-run 모드 — DB 쓰기 없음\n');

  // 2. 공유 URL 집합 (5개 이상 spot에 걸친 URL = 모음글로 간주)
  const { rows: sharedRows } = await pool.query<{ source_url: string }>(
    `SELECT source_url FROM spot_snippets
     GROUP BY source_url HAVING COUNT(DISTINCT spot_id) >= 5`,
  );
  const sharedUrls = new Set(sharedRows.map(r => r.source_url));
  console.log(`[generate-comments] 공유 URL (5+ spot): ${sharedUrls.size}건 — CoVe 제외 대상\n`);

  const stats = { success: 0, snippetPoor: 0, stage1Fail: 0, stage2Fail: 0, regexHit: 0, errors: 0 };

  for (const spot of spots) {
    // 3. snippet 조회
    const { rows: allSnippets } = await pool.query<SnippetRow>(
      `SELECT id, source_type, source_url, title, description
       FROM spot_snippets WHERE spot_id = $1`,
      [spot.id],
    );

    const uniqueSnippets = deduplicateSnippets(allSnippets, sharedUrls);

    // Layer 3: Selective Refusal
    if (uniqueSnippets.length < 2) {
      stats.snippetPoor++;
      if (isDryRun) {
        console.log(`[${spot.name}] → snippet_poor (unique=${uniqueSnippets.length})\n`);
        continue;
      }
      await pool.query(
        `UPDATE curation_candidates
         SET comment_warning_flag = 'snippet_poor', comment_generated_at = NOW()
         WHERE id = $1`,
        [spot.id],
      );
      continue;
    }

    // Stage 1: Gemma 26B
    const s1System = buildStage1System();
    const s1User   = buildStage1User(spot, uniqueSnippets);

    let draft: CommentDraft | null = null;

    for (let retry = 0; retry < 2; retry++) {
      const raw = await callWithTool(apiKey, GEMMA, s1System, s1User, STAGE1_TOOL, 600);
      if (!raw) { stats.stage1Fail++; break; }

      const candidate: CommentDraft = {
        hook:       typeof raw['hook'] === 'string' ? raw['hook'] as string : null,
        supporting: typeof raw['supporting'] === 'string' ? raw['supporting'] as string : null,
        sources:    Array.isArray(raw['sources']) ? raw['sources'] as SnippetSource[] : [],
      };

      const allText = [candidate.hook, candidate.supporting].filter(Boolean).join(' ');
      if (hasBannedPhrase(allText)) {
        stats.regexHit++;
        if (retry === 0) continue; // 1회 재시도
        // 2회째도 hit → 통과 + 플래그
        draft = candidate;
        break;
      }

      draft = candidate;
      break;
    }

    if (!draft) {
      if (isDryRun) console.log(`[${spot.name}] → Stage 1 실패\n`);
      continue;
    }

    // Stage 2: GPT-4o mini CoVe 검증
    const s2Raw = await callWithTool(
      apiKey, GPT4O_MINI,
      buildStage2System(),
      buildStage2User(spot, uniqueSnippets, draft),
      STAGE2_TOOL,
      400,
    );

    if (s2Raw) {
      const verification: ClaimVerification = {
        hook_supported:       s2Raw['hook_supported'] as boolean ?? true,
        hook_reason:          s2Raw['hook_reason'] as string ?? '',
        supporting_supported: s2Raw['supporting_supported'] as boolean ?? true,
        supporting_reason:    s2Raw['supporting_reason'] as string ?? '',
      };

      if (!verification.hook_supported)       draft.hook       = null;
      if (!verification.supporting_supported) draft.supporting = null;

      if (isDryRun) {
        console.log(`[${spot.name}] (${spot.category}, trend=${spot.trend_category})`);
        console.log(`  hook      : ${draft.hook ?? '(null)'}`);
        console.log(`  supporting: ${draft.supporting ?? '(null)'}`);
        console.log(`  comment   : ${synthesizeComment(draft.hook, draft.supporting) ?? '(null)'}`);
        console.log(`  sources   : ${draft.sources.length}건`);
        console.log(`  CoVe      : hook=${verification.hook_supported}, supporting=${verification.supporting_supported}`);
        if (!verification.hook_supported)       console.log(`    hook drop: ${verification.hook_reason}`);
        if (!verification.supporting_supported) console.log(`    sup  drop: ${verification.supporting_reason}`);
        console.log();
      }
    } else {
      stats.stage2Fail++;
      if (isDryRun) {
        console.log(`[${spot.name}] → Stage 2 실패 (draft 보존)\n`);
      }
    }

    const finalComment = synthesizeComment(draft.hook, draft.supporting);

    // declining warning
    const warningFlag = spot.trend_category === 'declining' ? 'declining'
      : (stats.regexHit > 0 ? 'regex_hit' : null);

    if (!isDryRun) {
      await pool.query(
        `UPDATE curation_candidates
         SET comment_draft         = $1,
             comment_verified      = $2,
             curator_comment       = $3,
             comment_generated_at  = NOW(),
             comment_warning_flag  = $4
         WHERE id = $5`,
        [
          JSON.stringify(draft),
          s2Raw ? JSON.stringify(s2Raw) : null,
          finalComment,
          warningFlag,
          spot.id,
        ],
      );
    }

    stats.success++;
    await new Promise(r => setTimeout(r, 500)); // 500ms between spots
  }

  await pool.end();

  console.log('\n=== Phase E Comment 생성 결과 ===');
  console.log(`  성공:         ${stats.success}건`);
  console.log(`  snippet_poor: ${stats.snippetPoor}건`);
  console.log(`  Stage 1 실패: ${stats.stage1Fail}건`);
  console.log(`  Stage 2 실패: ${stats.stage2Fail}건`);
  console.log(`  regex_hit:    ${stats.regexHit}건`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');
})();
