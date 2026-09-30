#!/usr/bin/env tsx
/**
 * Phase F: 제주 핵심 관광지 30건 전수 점검 + 미등재분 배치 추출
 *
 * [1] 30개 필수 관광지 각각: candidates 존재 여부, flag, spots 등재 여부
 * [2] candidates 있음 + spots 미등재 → dist/batch-landmarks-<date>.md
 *     (declining/l2/kakao 제한 없음)
 * [3] candidates 아예 없음 → 보고
 *
 * 실행: npx tsx src/scripts/phase-f/landmark-check-and-batch.ts [--dry-run]
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('../../.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* no .env */ }
}

// ── 30개 필수 관광지 ──────────────────────────────────────────────────────────

const LANDMARKS: Array<{ name: string; aliases?: string[] }> = [
  { name: '성산일출봉' },
  { name: '한라산국립공원', aliases: ['한라산'] },
  { name: '만장굴' },
  { name: '천지연폭포' },
  { name: '천제연폭포' },
  { name: '정방폭포' },
  { name: '협재해수욕장', aliases: ['협재해변'] },
  { name: '금능해수욕장', aliases: ['금능해변'] },
  { name: '함덕해수욕장', aliases: ['함덕서우봉해변', '함덕해변'] },
  { name: '월정리해변', aliases: ['월정리해수욕장'] },
  { name: '카멜리아힐' },
  { name: '비자림' },
  { name: '섭지코지' },
  { name: '주상절리대', aliases: ['대포주상절리', '중문대포해안주상절리'] },
  { name: '용머리해안' },
  { name: '산방산' },
  { name: '우도' },
  { name: '마라도' },
  { name: '가파도' },
  { name: '사려니숲길', aliases: ['사려니숲'] },
  { name: '에코랜드', aliases: ['에코랜드테마파크'] },
  { name: '한림공원' },
  { name: '오설록티뮤지엄', aliases: ['오설록 티뮤지엄', '오설록티museum'] },
  { name: '쇠소깍' },
  { name: '외돌개' },
  { name: '천왕사', aliases: ['천왕사'] },
  { name: '절물자연휴양림' },
  { name: '거문오름' },
  { name: '새별오름' },
  { name: '따라비오름' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentDraft {
  comment: string;
  source_id: string;
  evidence_quote?: string;
}

interface CandidateMatch {
  id: string;
  name: string;
  category: string;
  region: string;
  flag: string | null;
  has_draft: boolean;
  in_spots: boolean;
  place_url: string | null;
  comment_draft: CommentDraft | null;
}

interface LandmarkResult {
  landmark: string;
  candidates: CandidateMatch[];
  in_spots_direct: boolean; // spots 테이블 직접 이름 매칭
}

const CAT_LABELS: Record<string, string> = {
  sightseeing: '관광지·자연',
  restaurant: '음식점',
  cultural_space: '문화공간',
  experience: '체험',
  cafe: '카페',
};

const REGION_LABELS: Record<string, string> = {
  'jeju-city': '제주시',
  eastern: '동부',
  seogwipo: '서귀포시',
  western: '서부',
  hallasan: '한라산',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function regionLabel(r: string): string {
  return REGION_LABELS[r] ?? r;
}

function buildIlikePatterns(lm: { name: string; aliases?: string[] }): string[] {
  const names = [lm.name, ...(lm.aliases ?? [])];
  return names.map(n => `%${n}%`);
}

function renderCheckTable(results: LandmarkResult[]): string {
  const lines: string[] = [];
  lines.push('| # | 관광지 | candidates 수 | flag | draft | spots 등재 |');
  lines.push('|---|--------|--------------|------|-------|-----------|');

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const cnt = r.candidates.length;

    if (cnt === 0) {
      lines.push(`| ${i + 1} | **${r.landmark}** | ❌ 없음 | — | — | — |`);
      continue;
    }

    // 등재된 것이 있으면 spots 기준
    const inSpots = r.candidates.some(c => c.in_spots) || r.in_spots_direct;
    const flags = [...new Set(r.candidates.map(c => c.flag ?? 'NULL'))].join('/');
    const hasDraft = r.candidates.some(c => c.has_draft);

    const spotsStr = inSpots ? '✅' : '⬜';
    const draftStr = hasDraft ? '✅' : '—';

    lines.push(`| ${i + 1} | ${r.landmark} | ${cnt}건 | \`${flags}\` | ${draftStr} | ${spotsStr} |`);
  }
  return lines.join('\n');
}

function renderLandmarkBatch(toExtract: Array<{ lm: LandmarkResult; cand: CandidateMatch }>, date: string): string {
  const lines: string[] = [
    `# 제주 핵심 관광지 큐레이터 검토 배치`,
    ``,
    `생성일: ${date}  `,
    `대상: 필수 관광지 30건 중 spots 미등재 후보  `,
    `제한 없음: declining flag / l2 NULL / kakao 유무 관계없이 포함  `,
    ``,
    `**검토 방법**:`,
    `- approve: 초안 코멘트 그대로 사용`,
    `- edit: **코멘트** 줄의 \`> \` 뒤 텍스트를 직접 수정 후 approve`,
    `- reject: 스팟 제외`,
    ``,
    `---`,
    ``,
  ];

  for (let i = 0; i < toExtract.length; i++) {
    const { lm, cand } = toExtract[i]!;
    const draft = cand.comment_draft;

    lines.push(`### ${i + 1}. ${cand.name}`);
    lines.push(`**검색어:** ${lm.landmark}`);
    lines.push(`**카테고리:** ${CAT_LABELS[cand.category] ?? cand.category} | **지역:** ${regionLabel(cand.region)}`);
    lines.push(`**flag:** \`${cand.flag ?? 'NULL'}\``);
    if (cand.place_url) {
      lines.push(`**카카오맵:** [${cand.name} 지도보기](${cand.place_url})`);
    } else {
      lines.push(`**카카오맵:** (없음)`);
    }
    lines.push('');

    if (draft) {
      lines.push(`**초안 코멘트:**`);
      lines.push(`> ${draft.comment}`);
      lines.push('');
      if (draft.evidence_quote) {
        lines.push(`**근거 인용:** "${draft.evidence_quote}"`);
        lines.push('');
      }
    } else {
      lines.push(`**초안 코멘트:** (없음 — comment_draft IS NULL)`);
      lines.push('');
    }

    lines.push(`**결정:** [ ] approve  [ ] edit  [ ] reject`);
    lines.push('');
    lines.push(`**코멘트** (approve: 초안 그대로 / edit: 아래 수정 후 approve 체크):`);
    lines.push(`> ${draft?.comment ?? '(초안 없음 — 직접 작성 필요)'}`);
    lines.push('');
    lines.push(`<!-- id: ${cand.id} -->`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`_총 ${toExtract.length}건 / Phase F Landmarks_`);
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

loadEnv();
const isDryRun = process.argv.includes('--dry-run');
const pg = new Pool({ connectionString: process.env['DATABASE_URL'] });

console.log('\n[1] 30개 필수 관광지 전수 점검...\n');

const results: LandmarkResult[] = [];

for (const lm of LANDMARKS) {
  const patterns = buildIlikePatterns(lm);

  // candidates 검색 (이름 ILIKE 패턴)
  const { rows: candRows } = await pg.query<{
    id: string;
    name: string;
    category: string;
    region: string;
    flag: string | null;
    has_draft: boolean;
    place_url: string | null;
    comment_draft: CommentDraft | null;
  }>(`
    SELECT
      c.id,
      c.name,
      c.category,
      c.region,
      c.comment_warning_flag AS flag,
      (c.comment_draft IS NOT NULL)           AS has_draft,
      c.external_links::jsonb->'kakao'->>'place_url' AS place_url,
      c.comment_draft
    FROM curation_candidates c
    WHERE c.name ILIKE ANY($1::text[])
    ORDER BY c.name
  `, [patterns]);

  // spots 테이블 정확 이름 매칭 (랜드마크 본체만 — ILIKE는 식당 오탐 발생)
  const exactNames = [lm.name, ...(lm.aliases ?? [])];
  const { rows: spotRows } = await pg.query<{ id: string; name: string }>(
    `SELECT id, name FROM spots WHERE name = ANY($1::text[])`,
    [exactNames],
  );
  const spotNames = spotRows.map(r => r.name);
  const inSpotsDirect = spotRows.length > 0;

  // candidate가 spots에 등재됐는지: candidate 이름이 spotRows에 정확히 있는지
  const spotNameSet = new Set(spotRows.map(r => r.name));
  const candidatesWithSpots: CandidateMatch[] = [];
  for (const c of candRows) {
    const inSpots = spotNameSet.has(c.name);
    candidatesWithSpots.push({
      ...c,
      in_spots: inSpots,
    });
  }

  if (spotNames.length > 0) {
    console.log(`  ${lm.name}: candidates=${candRows.length}건, spots직접=${spotNames.join(', ')}`);
  } else if (candRows.length > 0) {
    const flags = [...new Set(candRows.map(r => r.flag ?? 'NULL'))].join('/');
    console.log(`  ${lm.name}: candidates=${candRows.length}건 [${flags}], spots=없음`);
  } else {
    console.log(`  ${lm.name}: ❌ candidates 없음, spots=없음`);
  }

  results.push({
    landmark: lm.name,
    candidates: candidatesWithSpots,
    in_spots_direct: inSpotsDirect,
  });
}

// ── 결과 표 출력 ──────────────────────────────────────────────────────────────

console.log('\n');
console.log(renderCheckTable(results));
console.log('');

// ── 분류 ──────────────────────────────────────────────────────────────────────

const missing_candidates = results.filter(r => r.candidates.length === 0);
const registered = results.filter(r =>
  r.in_spots_direct || r.candidates.some(c => c.in_spots)
);
const toExtractResults = results.filter(r =>
  r.candidates.length > 0 &&
  !r.in_spots_direct &&
  !r.candidates.some(c => c.in_spots)
);

console.log(`\n=== 분류 요약 ===`);
console.log(`  candidates 없음 (수집 누락): ${missing_candidates.length}건`);
console.log(`  spots 등재 완료             : ${registered.length}건`);
console.log(`  spots 미등재 (배치 대상)    : ${toExtractResults.length}건`);

// ── [3] candidates 없음 보고 ──────────────────────────────────────────────────

if (missing_candidates.length > 0) {
  console.log(`\n[3] candidates에 아예 없는 관광지 (수집 누락):`);
  for (const r of missing_candidates) {
    console.log(`  - ${r.landmark}`);
  }
}

// ── [2] 배치 추출 — candidates 있고 spots 미등재 ─────────────────────────────

// 각 관광지당 candidates 추출 — 식당/카페 카테고리 제외 (랜드마크 본체 대상)
// 단, candidate 이름이 랜드마크명과 정확히 일치하면 카테고리 무관 포함
const toExtract: Array<{ lm: LandmarkResult; cand: CandidateMatch }> = [];
const seenIds = new Set<string>();

for (const lm of toExtractResults) {
  const exactNames = new Set([lm.landmark, ...(
    LANDMARKS.find(l => l.name === lm.landmark)?.aliases ?? []
  )]);

  // 포함 조건: sightseeing/cultural_space/experience 이거나 이름이 정확히 랜드마크명
  const eligible = lm.candidates.filter(c =>
    !['restaurant', 'cafe'].includes(c.category) ||
    exactNames.has(c.name)
  );

  // 우선순위: has_draft=true AND flag=NULL > has_draft=true > flag=NULL > any
  const sorted = [...eligible].sort((a, b) => {
    const scoreA = (a.has_draft ? 2 : 0) + (a.flag === null ? 1 : 0);
    const scoreB = (b.has_draft ? 2 : 0) + (b.flag === null ? 1 : 0);
    return scoreB - scoreA;
  });

  for (const cand of sorted) {
    if (!seenIds.has(cand.id)) {
      seenIds.add(cand.id);
      toExtract.push({ lm, cand });
    }
  }
}

console.log(`\n[2] 배치 추출 대상: ${toExtract.length}건`);
for (const { lm, cand } of toExtract) {
  console.log(`  ${lm.landmark} → "${cand.name}" [flag=${cand.flag ?? 'NULL'}, draft=${cand.has_draft}]`);
}

if (isDryRun) {
  console.log('\n[dry-run] 파일 쓰기 건너뜀.');
  await pg.end();
  process.exit(0);
}

const dateStr = new Date().toISOString().slice(0, 10);
const md = renderLandmarkBatch(toExtract, dateStr);

mkdirSync('dist', { recursive: true });
const outPath = `dist/batch-landmarks-${dateStr}.md`;
writeFileSync(outPath, md, 'utf-8');
console.log(`\n→ ${outPath} (${md.length}바이트)`);

await pg.end();
