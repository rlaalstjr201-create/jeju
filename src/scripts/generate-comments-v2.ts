#!/usr/bin/env tsx
/**
 * Phase E v2: Extractive-First 큐레이터 코멘트 생성
 * Stage 1: Claude Haiku 4.5 — evidence_quote 추출 + paraphrase (한국어 instruction)
 * Stage 2: 결정론적 3-Layer 검증
 *   L1: substring check
 *   L2: cosine(comment, evidence_quote) via Voyage AI ≥ 0.70
 *   L3: HHEM-2.1-Open NLI entailment ≥ 0.50
 * ADR-0052 Amendment 3
 *
 * 실행: npx tsx src/scripts/generate-comments-v2.ts [--dry-run] [--limit=N] [--no-hhem]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';

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

// ── 타입 ─────────────────────────────────────────────────────────

interface CommentDraftV2 {
  comment: string;
  evidence_quote: string;
  source_id: string;
}

interface VerificationResult {
  l1_substring: boolean;
  l1_relax_rescued?: boolean;
  l2_cosine: number | null;
  l2_cosine_snippet?: number | null;
  l3_hhem: number | null;
  passed: boolean;
  manual_review: boolean;
}

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
  subregion: string | null;
  llm_tags: string[];
  awards_hint: string[];
  trend_category: string | null;
  external_buzz_count: number | null;
}

interface SnippetRow {
  id: number;
  source_type: string;
  source_url: string;
  description: string | null;
  title: string | null;
}

// ── 금지 어휘 ─────────────────────────────────────────────────────

const BANNED_REGEX = /꼭\s*가봐야|인생샷|강추|현지인\s*추천|숨겨진\s*보석|[!?！？]|저는|저도|여러분|당신/;

// ── Anthropic 호출 ────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

let _anthropic: Anthropic | null = null;
let _lastHaikuCall = 0;
let _lastCallRetryExhausted = false;
const HAIKU_MIN_INTERVAL_MS = Number(process.env['HAIKU_INTERVAL_MS'] ?? 2000);

async function callWithTool(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  tool: ToolDef,
  maxTokens: number,
): Promise<Record<string, unknown> | null> {
  _anthropic ??= new Anthropic({ apiKey });
  const MAX_ATTEMPTS = 5;
  _lastCallRetryExhausted = false;
  let delay = 10_000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 최소 호출 간격 강제
    const wait = _lastHaikuCall + HAIKU_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    try {
      _lastHaikuCall = Date.now();
      const response = await _anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters as Anthropic.Tool['input_schema'] }],
        tool_choice: { type: 'tool', name: tool.name },
      });
      const toolBlock = response.content.find(b => b.type === 'tool_use');
      if (toolBlock?.type === 'tool_use') return toolBlock.input as Record<string, unknown>;
      // tool_choice 강제했는데 tool_use가 없으면 비정상 응답 — 재시도
      console.warn(`[Haiku] attempt ${attempt + 1}/${MAX_ATTEMPTS} — tool_use 없음 (stop_reason: ${response.stop_reason})`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e: unknown) {
      const status  = e instanceof Anthropic.APIError ? (e.status ?? 0) : 0;
      const message = e instanceof Error ? e.message : String(e);
      const retryable = e instanceof Anthropic.APIError && (status === 429 || status >= 500);

      console.warn(`[Haiku] attempt ${attempt + 1}/${MAX_ATTEMPTS} HTTP ${status || 'ERR'}: ${message.slice(0, 100)}`);

      if (retryable) {
        console.warn(`[Haiku] backoff ${Math.round(delay / 1000)}s`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 60_000);
        continue;
      }
      // 비재시도 에러(400, 401, 403 등)는 즉시 중단
      return null;
    }
  }
  _lastCallRetryExhausted = true;
  return null;
}

// ── Stage 1: Gemma 4 26B ──────────────────────────────────────────

function buildStage1Tool(variant: 'current' | 'B1' | 'B2'): ToolDef {
  const commentDesc = variant === 'B2'
    ? 'evidence_quote의 핵심 표현을 그대로 살린 30~50자 한국어 1문장. 장소명·위치·업종 framing 최소화. evidence_quote 표현으로 시작하거나 첫 절에 배치. 존댓말 종결어미.'
    : '30~80자 한국어 코멘트. evidence_quote를 paraphrase. 존댓말 종결어미 필수.';
  const quoteDesc = variant === 'B1'
    ? '스니펫 원문의 완결된 의미 단위. 핵심 정보(무엇·특징)를 담는 8단어 이상 구절 권장. 주어+서술어 형태 우선. 단어·순서 수정 금지.'
    : '스니펫 원문에서 그대로 복사한 substring. 단어 하나도 수정 금지.';
  return {
    name: 'generate_comment',
    description: '스니펫에서 evidence_quote를 추출하고 자연스러운 코멘트로 paraphrase합니다.',
    parameters: {
      type: 'object',
      required: ['comment', 'evidence_quote', 'source_id'],
      properties: {
        comment: { type: 'string', description: commentDesc },
        evidence_quote: { type: 'string', description: quoteDesc },
        source_id: { type: 'string', description: "evidence_quote가 위치한 스니펫 번호 ('1'~'10')." },
      },
    },
  };
}

const FEW_SHOT_EXAMPLES = `
예시 1:
Spot: 대우정 (restaurant, seogwipo)
[1] (blog) 매주 일요일 정기휴무 블루리본 맛집 대우정 위치는 제주공항 근처입니다
[2] (blog) 아주 맛있게 장식해 준 대우정 제주공항에서 가깝습니다
[3] (blog) 제주도 대우정 제주공항 전복돌솥밥 추천 대우정 주소 제주도 대우정 전복돌솥밥
→ {"comment":"제주공항 근처 \"전복돌솥밥\"으로 알려진 블루리본 맛집이에요.","evidence_quote":"전복돌솥밥","source_id":"3"}

예시 2:
Spot: 커피템플 (cafe, jeju-city)
[1] (blog) 자리가 몇자리 없어서 커피샵 웨이팅 해본적 처음이네
[2] (blog) 원두는 보장된 미래, 아름다운재앙(디카페인), You, 김득구가 있으며 원두는 블렌딩 원두로 템플만의 개성이 뚜렷합니다
[3] (blog) 커피템플 제주는 제주 흙으로 빚은 도자기 잔에 커피를 내어주신다. 손잡이가 크고 디자인이 독특해서
→ {"comment":"제주 흙으로 빚은 도자기 잔에 드립커피를 내어주는 곳입니다. 자리가 적어 웨이팅이 생기기도 합니다.","evidence_quote":"제주 흙으로 빚은 도자기 잔에 커피를 내어주신다","source_id":"3"}

예시 3:
Spot: 만장굴 (sightseeing, jeju-city)
[1] (blog) 황홀하도록 아름다운 자연이 만들어 준 멋진 곳 만장굴 동굴 코스를 관람하며 제주의 자연을 만끽하는 여행을 했습니다
[2] (blog) 2023년 12월 낙석으로 전면 통제됐던 제주 만장굴이 2년5개월 만인 5월 30일 재개방됩니다. 전체 길이 7400m, 최대 높이 25m의 세계적 규모 용암동굴로
[3] (blog) 제주도 동쪽 구좌읍에 위치한 이 용암동굴은 국내를 넘어 세계적으로도 규모가 가장 큰 축에 속하는 곳으로 손꼽혀요
[4] (blog) 수만 년 전 용암이 빚어낸 거대한 지하 세계, 제주 만장굴이 2년 5개월 만에 다시 방문객을 맞이합니다. 유네스코 세계자연유산으로 등재된 이 용암동굴은 7.4km의 미로 같은 길과
→ {"comment":"2년 5개월 만에 \"5월 30일 재개방\"하는 유네스코 세계자연유산 용암동굴이에요.","evidence_quote":"5월 30일 재개방","source_id":"2"}

예시 4:
Spot: 쇠소깍 (experience, seogwipo)
[2] (blog) 제주 쇠소깍 해변 보트/카약/나룻배 체험 인기 많은 제주 쇠소깍 제주전통나룻배체험이에요
[3] (blog) 말 그대로 트멍하기 좋은 곳, 다음번엔 온전히 트멍과 테우를 즐겨보겠습니다
[4] (blog) 효돈천이 바다와 만나는 지점에 형성된 곳으로 현무암 절벽 사이로 깊은 웅덩이와 물길이 이어져 있어요
[5] (blog) 바다 앞이지만 고요한 곳. 신비로운 제주의 명소 중 하나 쇠소깍. 꼭 한번 방문해보세요
→ {"comment":"효돈천이 바다와 만나는 협곡. \"바다 앞이지만 고요한 곳\"으로 꼽히는 명소예요.","evidence_quote":"바다 앞이지만 고요한 곳","source_id":"5"}

예시 5:
Spot: 이중섭거리 (cultural_space, seogwipo)
[1] (blog) 이중섭 거리에는 이중섭 미술관, 이중섭 생가가 있어 제주 서귀포 여행 시 많은 분들이 방문하는 코스인데요. 현재는 아쉽게도 이중섭 미술관은 공사 중이라 갈 수가 없습니다. (2027년 3월 재개관 예정)
[2] (blog) 제주 이중섭거리 맛집으로도 유명한데요. 신선한 해산물과 조개구이를 맛볼 수 있어서 인기가 많았어요
[3] (blog) 제주 서귀포 이중섭거리 흑돼지 맛집 우녁집 남편이랑 신혼여행 때 오고 다시 찾게 된 이중섭거리
→ {"comment":"이중섭 미술관과 생가가 모인 서귀포 코스예요. 미술관은 \"2027년 3월 재개관 예정\"입니다.","evidence_quote":"2027년 3월 재개관 예정","source_id":"1"}
`.trim();

function buildStage1System(variant: 'current' | 'B1' | 'B2' = 'current'): string {
  const extraRule = variant === 'B2'
    ? '\n9. comment 작성 규칙(B2): "[장소명]은/는 [위치/분류] 이에요" 패턴 금지. evidence_quote의 표현이 comment의 첫 절에 등장해야 합니다.'
    : '';
  return `당신은 한국어 여행 큐레이션 에디터입니다.
아래 스니펫만 근거로 1~2문장의 자연스러운 코멘트를 작성합니다.

규칙:
1. 스니펫의 정보만 사용 (추론 금지, 내부 지식 금지).
2. evidence_quote는 한 스니펫의 정확한 substring이어야 합니다 (텍스트 수정 X).
3. comment는 evidence_quote의 의미를 보존한 자연스러운 한국어 (paraphrase 가능).
4. 핵심 표현은 따옴표로 직접 인용 가능 (예: "720시간 숙성").
5. 광고 어휘 금지: 꼭, 강추, 인생, 숨겨진, !, ?
6. 1·2인칭 금지: 저는, 여러분, 당신
7. 존댓말 종결어미: ~좋아요, ~쉽습니다, ~납니다, ~됩니다
8. comment 길이: 30~80자${extraRule}

${FEW_SHOT_EXAMPLES}`;
}

function buildStage1User(spot: SpotRow, snippets: SnippetRow[]): string {
  const snippetBlock = snippets
    .slice(0, 10)
    .map((s, i) => `[${i + 1}] (${s.source_type}) ${s.description ?? s.title ?? ''}`)
    .join('\n');

  const decliningHint = spot.trend_category === 'declining'
    ? '\n참고: 최근 검색 관심이 감소하는 추세입니다. 과도한 긍정 표현을 피해주세요.'
    : '';

  return `Spot: ${spot.name} (${spot.category}, ${spot.region}${spot.subregion ? ' ' + spot.subregion : ''})
Tags: ${spot.llm_tags.join(', ')}
Awards: ${spot.awards_hint.length > 0 ? spot.awards_hint.join(', ') : '없음'}${decliningHint}

스니펫:
${snippetBlock}

위 스니펫에서 evidence_quote를 추출하고 comment를 작성하세요.`;
}

// ── Stage 2 Layer 2: Voyage AI cosine ────────────────────────────

let _lastVoyageCall = 0;
const VOYAGE_MIN_INTERVAL_MS = Number(process.env['VOYAGE_INTERVAL_MS'] ?? 6000);

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

// ── Stage 2 Layer 3: HHEM subprocess ────────────────────────────

class HhemBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending: Array<{ resolve: (v: number) => void; reject: (e: Error) => void }> = [];

  start(): void {
    this.proc = spawn('python', [resolve(process.cwd(), 'src/scripts/hhem_verify.py')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stderr.on('data', (d: Buffer) => process.stderr.write(d));
    this.proc.stdout.on('data', (d: Buffer) => {
      this.buffer += d.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { score: number };
          this.pending.shift()?.resolve(parsed.score ?? 0);
        } catch {
          this.pending.shift()?.reject(new Error(`HHEM parse error: ${line}`));
        }
      }
    });
    this.proc.on('error', (err) => { for (const p of this.pending) p.reject(err); });
  }

  async verify(premise: string, hypothesis: string): Promise<number> {
    if (!this.proc) throw new Error('HHEM process not started');
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.proc!.stdin.write(JSON.stringify({ premise, hypothesis }) + '\n');
    });
  }

  stop(): void {
    this.proc?.stdin.end();
    this.proc = null;
  }
}

// ── Stage 2: 3-Layer 검증 ────────────────────────────────────────

async function verify(
  draft: CommentDraftV2,
  snippets: SnippetRow[],
  voyageKey: string,
  hhem: HhemBridge | null,
  l2Target: 'quote' | 'snippet' | 'both' = 'quote',
  l1Relax = false,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    l1_substring: false,
    l2_cosine: null,
    l3_hhem: null,
    passed: false,
    manual_review: false,
  };

  // Layer 1: substring (strict: source_id 기준)
  const srcIdx = parseInt(draft.source_id, 10) - 1;
  const srcSnippet = snippets[srcIdx];
  const srcText = srcSnippet?.description ?? srcSnippet?.title ?? '';
  // Normalize typographic quotes → ASCII before substring check
  const normalize = (s: string) => s.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"');
  result.l1_substring = normalize(srcText).includes(normalize(draft.evidence_quote));

  // L1 완화: 모든 스니펫에서 재탐색 (--l1-relax)
  if (!result.l1_substring && l1Relax) {
    for (const s of snippets) {
      const t = s.description ?? s.title ?? '';
      if (normalize(t).includes(normalize(draft.evidence_quote))) {
        result.l1_substring = true;
        result.l1_relax_rescued = true;
        break;
      }
    }
  }
  if (!result.l1_substring) return result;

  // Layer 2: cosine
  try {
    const snippetText = srcSnippet?.description ?? srcSnippet?.title ?? '';
    if (l2Target === 'both') {
      // 3 texts in one Voyage call (efficient)
      const texts = snippetText
        ? [draft.comment, draft.evidence_quote, snippetText]
        : [draft.comment, draft.evidence_quote];
      const embs = await voyageEmbed(voyageKey, texts);
      result.l2_cosine = cosineSimilarity(embs[0]!, embs[1]!);
      if (embs[2]) result.l2_cosine_snippet = cosineSimilarity(embs[0]!, embs[2]!);
    } else if (l2Target === 'snippet') {
      const target = snippetText || draft.evidence_quote;
      const [commentEmb, targetEmb] = await voyageEmbed(voyageKey, [draft.comment, target]);
      result.l2_cosine = cosineSimilarity(commentEmb!, targetEmb!);
    } else {
      const [commentEmb, quoteEmb] = await voyageEmbed(voyageKey, [draft.comment, draft.evidence_quote]);
      result.l2_cosine = cosineSimilarity(commentEmb!, quoteEmb!);
    }
  } catch (e) {
    console.error('[Voyage] embed error:', e);
    result.l2_cosine = null;
  }
  if (result.l2_cosine !== null && result.l2_cosine < 0.70) return result;

  // Layer 3: HHEM (optional)
  if (hhem) {
    try {
      result.l3_hhem = await hhem.verify(srcText, draft.comment);
    } catch (e) {
      console.error('[HHEM] error:', e);
      result.l3_hhem = null;
    }
    if (result.l3_hhem !== null && result.l3_hhem < 0.50) {
      result.manual_review = true;
      result.passed = true; // 큐레이터 검토 대상, 폐기 아님
      return result;
    }
  }

  result.passed = true;
  return result;
}

// ── 독립 snippet 필터 ────────────────────────────────────────────

function deduplicateSnippets(snippets: SnippetRow[], sharedUrls: Set<string>): SnippetRow[] {
  return snippets.filter(s => !sharedUrls.has(s.source_url));
}

// ── 메인 ──────────────────────────────────────────────────────────

if (!process.env['VITEST']) await (async () => {
  loadEnv();

  const isDryRun    = process.argv.includes('--dry-run');
  const noHhem      = process.argv.includes('--no-hhem');
  const l1Relax     = process.argv.includes('--l1-relax');
  const l2Target    = (process.argv.find(a => a.startsWith('--l2-target='))?.split('=')[1] ?? 'quote') as 'quote' | 'snippet' | 'both';
  const stage1Var   = (process.argv.find(a => a.startsWith('--stage1-variant='))?.split('=')[1] ?? 'current') as 'current' | 'B1' | 'B2';
  const limitArgEq  = process.argv.find(a => a.startsWith('--limit='));
  const limitArgSp  = process.argv.includes('--limit') ? process.argv[process.argv.indexOf('--limit') + 1] : undefined;
  const rowLimit    = limitArgEq ? parseInt(limitArgEq.split('=')[1]!, 10) : limitArgSp ? parseInt(limitArgSp, 10) : undefined;

  const apiKey    = process.env['ANTHROPIC_API_KEY']   ?? '';
  const voyageKey = process.env['VOYAGE_API_KEY']      ?? '';
  if (!apiKey)    { console.error('ANTHROPIC_API_KEY 미설정'); process.exit(1); }
  if (!voyageKey) { console.error('VOYAGE_API_KEY 미설정');   process.exit(1); }

  const GEMMA = 'claude-haiku-4-5-20251001';

  // HHEM 브릿지 (--no-hhem 플래그로 비활성화 가능)
  let hhem: HhemBridge | null = null;
  if (!noHhem && !isDryRun) {
    hhem = new HhemBridge();
    hhem.start();
    console.log('[generate-comments-v2] HHEM 브릿지 시작 중...');
    await new Promise(r => setTimeout(r, 3000)); // 모델 로딩 대기
  } else if (noHhem) {
    console.log('[generate-comments-v2] HHEM Layer 3 비활성화 (--no-hhem)');
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const limitClause = rowLimit ? `LIMIT ${rowLimit}` : '';
  const { rows: spots } = await pool.query<SpotRow>(
    `SELECT id, name, category, region, subregion,
            llm_tags, awards_hint, trend_category, external_buzz_count
     FROM curation_candidates
     WHERE selected_tier = 'reference'
       AND comment_draft IS NULL
       AND comment_warning_flag IS NULL
     ORDER BY final_score DESC
     ${limitClause}`,
  );

  const { rows: sharedRows } = await pool.query<{ source_url: string }>(
    `SELECT source_url FROM spot_snippets GROUP BY source_url HAVING COUNT(DISTINCT spot_id) >= 5`,
  );
  const sharedUrls = new Set(sharedRows.map(r => r.source_url));

  console.log(`[generate-comments-v2] 대상: ${spots.length}건`);
  console.log(`[generate-comments-v2] 공유 URL 제외: ${sharedUrls.size}건`);
  if (isDryRun) {
    console.log('[generate-comments-v2] dry-run 모드');
    if (stage1Var !== 'current') console.log(`[generate-comments-v2] Stage 1 variant: ${stage1Var}`);
    if (l2Target  !== 'quote')   console.log(`[generate-comments-v2] L2 target: ${l2Target}`);
    if (l1Relax)                 console.log('[generate-comments-v2] L1 relax 모드 (모든 스니펫 재탐색)');
    console.log();
  }

  const stats = {
    success: 0, manual_review: 0,
    l1_fail: 0, l2_fail: 0, l3_manual: 0,
    stage1_fail: 0, stage1_529_fail: 0, snippet_poor: 0, regex_hit: 0,
    cosineScores: [] as number[],
  };

  let processed = 0;
  const total = spots.length;

  for (const spot of spots) {
    processed++;
    const { rows: allSnippets } = await pool.query<SnippetRow>(
      `SELECT id, source_type, source_url, title, description
       FROM spot_snippets WHERE spot_id = $1 ORDER BY id`,
      [spot.id],
    );
    const snippets = deduplicateSnippets(allSnippets, sharedUrls);

    if (snippets.length < 2) {
      stats.snippet_poor++;
      if (!isDryRun) {
        await pool.query(
          `UPDATE curation_candidates SET comment_warning_flag='snippet_poor', comment_generated_at=NOW() WHERE id=$1`,
          [spot.id],
        );
        console.log(`[${processed}/${total}] ${spot.name} → snippet_poor`);
      }
      if (isDryRun) console.log(`[${spot.name}] → snippet_poor (unique=${snippets.length})\n`);
      continue;
    }

    // Stage 1 (최대 2회: 금지어 hit 시 1회 재시도)
    let draft: CommentDraftV2 | null = null;
    let regexHit = false;

    for (let retry = 0; retry < 2; retry++) {
      const raw = await callWithTool(apiKey, GEMMA, buildStage1System(stage1Var), buildStage1User(spot, snippets), buildStage1Tool(stage1Var), 600);
      if (!raw) break;

      const candidate: CommentDraftV2 = {
        comment:        String(raw['comment'] ?? ''),
        evidence_quote: String(raw['evidence_quote'] ?? ''),
        source_id:      String(raw['source_id'] ?? '1'),
      };

      if (!candidate.comment || !candidate.evidence_quote) break;

      if (BANNED_REGEX.test(candidate.comment)) {
        regexHit = true;
        if (retry === 0) continue;
      }

      draft = candidate;
      break;
    }

    if (!draft) {
      stats.stage1_fail++;
      if (_lastCallRetryExhausted) stats.stage1_529_fail++;
      if (isDryRun) console.log(`[${spot.name}] → Stage 1 실패\n`);
      else console.log(`[${processed}/${total}] ${spot.name} → Stage 1 실패 (${_lastCallRetryExhausted ? '529' : '구조적'})`);
      continue;
    }

    if (isDryRun) {
      // dry-run: L1 + L2 실제 검증 (DB 쓰기 없음)
      const verification = await verify(draft, snippets, voyageKey, null, l2Target, l1Relax);

      console.log(`[${spot.name}] (${spot.category}, trend=${spot.trend_category})`);
      console.log(`  comment       : ${draft.comment}`);
      console.log(`  evidence_quote: "${draft.evidence_quote}"`);
      console.log(`  source_id     : [S${draft.source_id}]`);

      // L1 표시
      const l1Label = verification.l1_substring
        ? (verification.l1_relax_rescued ? '✅ (relax 구제)' : '✅')
        : '❌';
      console.log(`  L1            : ${l1Label}`);
      if (!verification.l1_substring) {
        const srcIdx  = parseInt(draft.source_id, 10) - 1;
        const srcText = snippets[srcIdx]?.description ?? snippets[srcIdx]?.title ?? '';
        if (srcText) console.log(`  snippet text  : "${srcText.slice(0, 80)}"`);
      }

      // L2 표시 (quote 기준 — l2_cosine)
      if (verification.l2_cosine !== null) {
        const pass = verification.l2_cosine >= 0.70;
        const label = l2Target === 'snippet' ? 'L2(snippet)' : 'L2(quote) ';
        console.log(`  ${label}  : ${pass ? '✅' : '❌'} ${verification.l2_cosine.toFixed(3)}${!pass ? ' (< 0.70)' : ''}`);
      } else if (verification.l1_substring) {
        console.log(`  L2 cosine     : ⚠️  null (Voyage 오류)`);
      }

      // l2Target=both 시 snippet cosine도 표시
      if (l2Target === 'both' && verification.l2_cosine_snippet !== undefined) {
        const sv = verification.l2_cosine_snippet;
        if (sv !== null) {
          console.log(`  L2(snippet)   : ${sv.toFixed(3)}`);
        }
      }

      if (regexHit) console.log(`  ⚠️  regex_hit`);
      console.log();

      // 통계 추적
      if (!verification.l1_substring) stats.l1_fail++;
      else if (verification.l2_cosine !== null && verification.l2_cosine < 0.70) stats.l2_fail++;
      else { stats.success++; if (verification.l2_cosine !== null) stats.cosineScores.push(verification.l2_cosine); }
      continue;
    }

    // Stage 2: 3-Layer
    const verification = await verify(draft, snippets, voyageKey, hhem, l2Target, l1Relax);

    if (!verification.l1_substring) {
      // L1 실패 → 재시도 1회
      const raw2 = await callWithTool(apiKey, GEMMA, buildStage1System(stage1Var), buildStage1User(spot, snippets), buildStage1Tool(stage1Var), 400);
      if (raw2) {
        const d2: CommentDraftV2 = {
          comment: String(raw2['comment'] ?? ''),
          evidence_quote: String(raw2['evidence_quote'] ?? ''),
          source_id: String(raw2['source_id'] ?? '1'),
        };
        const v2 = await verify(d2, snippets, voyageKey, hhem, l2Target, l1Relax);
        if (v2.l1_substring) {
          draft = d2;
          Object.assign(verification, v2);
        } else {
          stats.l1_fail++;
          continue;
        }
      } else {
        stats.l1_fail++;
        continue;
      }
    }

    if (verification.l2_cosine !== null && verification.l2_cosine < 0.70) {
      stats.l2_fail++;
      continue;
    }

    if (verification.manual_review) stats.manual_review++;
    stats.success++;
    if (verification.l2_cosine !== null) stats.cosineScores.push(verification.l2_cosine);

    const warningFlag = verification.manual_review ? 'regex_hit'
      : (spot.trend_category === 'declining' ? 'declining' : null);

    await pool.query(
      `UPDATE curation_candidates
       SET comment_draft        = $1,
           comment_verified     = $2,
           curator_comment      = $3,
           comment_generated_at = NOW(),
           comment_warning_flag = $4
       WHERE id = $5`,
      [
        JSON.stringify(draft),
        JSON.stringify(verification),
        draft.comment,
        warningFlag,
        spot.id,
      ],
    );

    const l2Str = verification.l2_cosine !== null ? ` L2=${verification.l2_cosine.toFixed(3)}` : '';
    const flagStr = warningFlag ? ` [${warningFlag}]` : '';
    console.log(`[${processed}/${total}] ${spot.name} → OK${l2Str}${flagStr}`);

    await new Promise(r => setTimeout(r, 400));
  }

  hhem?.stop();
  await pool.end();

  const avgL2 = stats.cosineScores.length > 0
    ? (stats.cosineScores.reduce((a, b) => a + b, 0) / stats.cosineScores.length).toFixed(3)
    : 'n/a';
  const minL2 = stats.cosineScores.length > 0
    ? Math.min(...stats.cosineScores).toFixed(3)
    : 'n/a';

  console.log('\n=== Phase E v2 결과 ===');
  console.log(`  성공:          ${stats.success}건`);
  console.log(`  수동 검토 큐: ${stats.manual_review}건`);
  console.log(`  L1 실패:       ${stats.l1_fail}건`);
  console.log(`  L2 실패:       ${stats.l2_fail}건`);
  console.log(`  L2 cosine:     평균 ${avgL2} / 최저 ${minL2}`);
  console.log(`  snippet_poor:  ${stats.snippet_poor}건`);
  console.log(`  Stage 1 실패:  ${stats.stage1_fail}건 (이 중 529: ${stats.stage1_529_fail}건)`);
  if (isDryRun) console.log('  (dry-run: DB 쓰기 없음)');
})();
