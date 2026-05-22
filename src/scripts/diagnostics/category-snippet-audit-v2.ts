#!/usr/bin/env tsx
/**
 * category-snippet-audit-v2.ts
 * ADR-0051 Amendment 1 재정의 기준 재진단.
 * 키워드 사전 v2: sightseeing 확장, cultural_space 축소, cafe·restaurant 확장.
 * snippet LIMIT 10 (v1 대비 증가).
 * 목표: polluted < 10%.
 *
 * 실행: npx tsx src/scripts/diagnostics/category-snippet-audit-v2.ts
 */
import { Pool } from 'pg';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

// ── 키워드 사전 v2 ────────────────────────────────────────────────
// 각 카테고리 정의: ADR-0051 Amendment 1

const KEYWORDS: Record<string, string[]> = {
  restaurant: [
    // 식사 유형
    '맛집', '식당', '레스토랑', '밥집', '한식', '일식', '중식', '양식', '고깃집',
    // 메뉴 키워드
    '흑돼지', '갈치', '고기', '해물', '해산물', '횟집', '회', '국수', '면',
    '탕', '찌개', '구이', '볶음', '돼지고기',
    // 식사 행위
    '먹', '메뉴', '음식', '한끼', '요리', '셰프', '주문', '시킴', '나왔',
    // 분식·패스트푸드 (Amendment 1 이전 cafe → restaurant 이동 항목)
    '분식', '버거', '피자', '김밥', '국밥', '우동', '라면', '떡볶이',
  ],
  cafe: [
    // 음료
    '카페', '커피', '에스프레소', '아메리카노', '라떼', '드립', '핸드드립',
    '로스터리', '원두', '티하우스', '찻집', '차',
    // 디저트·베이커리 (Amendment 1 확장)
    '디저트', '베이커리', '빵', '빵집', '도넛', '케이크', '마카롱', '와플',
    '크로아상', '타르트', '스콘', '빙수', '아이스크림',
    // 분위기
    '카페인테리어', '좌석', '테라스', '창가', '뷰맛집', '감성',
  ],
  sightseeing: [
    // 자연 경관 (핵심)
    '오름', '해수욕장', '해변', '바다', '포구', '항', '폭포', '동굴', '절벽',
    '해안', '계곡', '숲', '봉우리', '산', '봉', '연못', '호수', '곶',
    // 자연 현상
    '일출', '일몰', '노을', '석양', '달빛', '별빛',
    // 전망·풍경
    '전망', '뷰', '경치', '풍경', '파노라마', '뷰포인트', '조망',
    // 이동·탐방
    '산책', '등산', '트레킹', '올레', '코스', '드라이브', '탐방',
    // 테마파크·레저 (Amendment 1: cultural_space → sightseeing)
    '테마파크', '워터파크', '놀이', '체험존', '관광지',
    // 역사·유적 (Amendment 1: cultural_space → sightseeing)
    '기념관', '유적', '평화공원', '항일', '4.3', '역사', '문화재', '성지',
    // 일반 관광
    '관광', '명소', '포인트', '촬영지', '인스타',
  ],
  experience: [
    '체험', '만들기', '클래스', '공방', '수업', '강좌', '배움',
    '액티비티', '레포츠', '스포츠',
    '패러글라이딩', '승마', '낚시', '다이빙', '스쿠버', '서핑', '카약',
    '카누', '래프팅', '번지', 'ATV',
    '투어', '프로그램', '가이드투어',
  ],
  cultural_space: [
    // Amendment 1 축소 기준: 예술·문화 콘텐츠 감상 공간만
    '미술관', '박물관', '갤러리', '공연장', '전시관', '전시회', '전시',
    '아트센터', '아트', '예술', '작품', '작가', '조각', '회화', '조형',
    '공연', '콘서트', '오페라', '연극', '뮤지컬',
  ],
};

function matchCount(snippetTexts: string[], category: string): number {
  const kws = KEYWORDS[category] ?? [];
  return snippetTexts.filter(text => kws.some(kw => text.includes(kw))).length;
}

function classify(count: number): 'clean' | 'warning' | 'polluted' {
  if (count >= 4) return 'clean';
  if (count >= 2) return 'warning';
  return 'polluted';
}

interface SpotRow {
  id: string;
  name: string;
  category: string;
  region: string;
}

interface AuditEntry {
  spot_id: string;
  name: string;
  category: string;
  region: string;
  match_count: number;
  grade: 'clean' | 'warning' | 'polluted';
}

if (!process.env['VITEST']) await (async () => {
  loadEnv();
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const { rows: spots } = await pool.query<SpotRow>(
    `SELECT id, name, category, region
     FROM curation_candidates
     WHERE selected_tier = 'reference'
     ORDER BY category, final_score DESC`,
  );

  console.log(`[audit-v2] 대상: ${spots.length}건`);

  const entries: AuditEntry[] = [];

  for (const spot of spots) {
    const { rows: snips } = await pool.query<{ description: string | null; title: string | null }>(
      `SELECT description, title FROM spot_snippets WHERE spot_id = $1 ORDER BY id LIMIT 10`,
      [spot.id],
    );
    const texts = snips.map(s => s.description ?? s.title ?? '');

    // spot 이름 자체도 신호로 포함 (중복 매칭 방지: 1개로 카운트)
    const nameText = spot.name;
    const allTexts = [nameText, ...texts];

    const count = matchCount(allTexts, spot.category);
    entries.push({
      spot_id:     spot.id,
      name:        spot.name,
      category:    spot.category,
      region:      spot.region,
      match_count: count,
      grade:       classify(count),
    });
  }

  await pool.end();

  // ── 집계 ────────────────────────────────────────────────────────

  const byGrade = { clean: 0, warning: 0, polluted: 0 };
  const byCategoryGrade: Record<string, { clean: number; warning: number; polluted: number }> = {};
  const polluted: AuditEntry[] = [];

  for (const e of entries) {
    byGrade[e.grade]++;
    if (!byCategoryGrade[e.category]) byCategoryGrade[e.category] = { clean: 0, warning: 0, polluted: 0 };
    byCategoryGrade[e.category]![e.grade]++;
    if (e.grade === 'polluted') polluted.push(e);
  }

  const total = entries.length;

  console.log('\n=== 전체 분포 ===');
  for (const grade of ['clean', 'warning', 'polluted'] as const) {
    const n = byGrade[grade];
    const pct = ((n / total) * 100).toFixed(1);
    console.log(`  ${grade.padEnd(8)}: ${String(n).padStart(4)}건  (${pct}%)`);
  }

  console.log('\n=== 카테고리별 분포 ===');
  for (const [cat, g] of Object.entries(byCategoryGrade).sort((a, b) => a[0].localeCompare(b[0]))) {
    const catTotal = g.clean + g.warning + g.polluted;
    const pollutedPct = ((g.polluted / catTotal) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(14)}: clean ${g.clean} / warning ${g.warning} / polluted ${g.polluted} (${pollutedPct}%)`);
  }

  console.log(`\n=== polluted 전체 (${polluted.length}건) ===`);
  for (const e of polluted) {
    console.log(`  [${String(e.match_count)}매칭] ${e.category.padEnd(14)} | ${e.name} (${e.region})`);
  }

  // ── JSON 저장 ──────────────────────────────────────────────────

  const outDir = resolve(process.cwd(), 'diagnostics');
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(outDir, `category-snippet-audit-v2-${ts}.json`);

  const report = {
    generated_at: new Date().toISOString(),
    keyword_version: 'v2',
    total,
    distribution: {
      clean:    { count: byGrade.clean,    pct: +((byGrade.clean    / total) * 100).toFixed(1) },
      warning:  { count: byGrade.warning,  pct: +((byGrade.warning  / total) * 100).toFixed(1) },
      polluted: { count: byGrade.polluted, pct: +((byGrade.polluted / total) * 100).toFixed(1) },
    },
    by_category: byCategoryGrade,
    polluted_list: polluted,
    all_entries: entries,
  };

  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n[audit-v2] JSON 저장: ${outPath}`);
  console.log(`\n목표: polluted < 10% (100건). 현재: ${byGrade.polluted}건 (${((byGrade.polluted / total) * 100).toFixed(1)}%)`);
})();
