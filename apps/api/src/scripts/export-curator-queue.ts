/**
 * 큐레이터 검토 큐를 Label Studio import JSON으로 내보냅니다.
 *
 * 필터: source_type='naver' AND review_excluded=false AND status IN ('pending','kakao_unverified')
 * 정렬: ordinariness ASC, authenticity DESC, pending 우선 (ADR-0032)
 * 출력: dist/curator-queue-<timestamp>.json
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

function loadEnv(): void {
  try {
    const lines = readFileSync('.env', 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  } catch { /* ignore */ }
}

interface QueueRow {
  id: string;
  name: string;
  region: string;
  category: string;
  status: string;
  lat: number | null;
  lng: number | null;
  llm_summary: string | null;
  authenticity_score: number | null;
  ordinariness_score: number | null;
  naver_source_url: string | null;
  naver_snippet: string | null;
  kakao_place_id: string | null;
}

interface LabelStudioTask {
  id: number;
  data: {
    candidate_id: string;
    name: string;
    region: string;
    category: string;
    status: string;
    lat: number | null;
    lng: number | null;
    llm_summary: string | null;
    authenticity_score: number | null;
    ordinariness_score: number | null;
    // naver_source_url as plain text (HyperText widget unreliable in Label Studio)
    naver_source_url_text: string;
    naver_snippet: string | null;
    kakao_place_id: string | null;
  };
}

loadEnv();
const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query<QueueRow>(`
      SELECT
        id,
        name,
        region,
        category,
        status,
        lat,
        lng,
        llm_summary,
        authenticity_score,
        ordinariness_score,
        naver_source_url,
        naver_snippet,
        kakao_place_id
      FROM curation_candidates
      WHERE source_type = 'naver'
        AND review_excluded = FALSE
        AND status IN ('pending', 'kakao_unverified')
        AND name != 'null'
        AND verified_by IS NOT NULL
      ORDER BY
        ordinariness_score ASC NULLS LAST,
        authenticity_score DESC NULLS LAST,
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC
    `);

    const tasks: LabelStudioTask[] = result.rows.map((row, idx) => ({
      id: idx + 1,
      data: {
        candidate_id: row.id,
        name: row.name,
        region: row.region,
        category: row.category,
        status: row.status,
        lat: row.lat,
        lng: row.lng,
        llm_summary: row.llm_summary,
        authenticity_score: row.authenticity_score,
        ordinariness_score: row.ordinariness_score,
        // Plain text so Label Studio renders as copyable URL (HyperText widget unreliable)
        naver_source_url_text: row.naver_source_url ?? '(URL 없음)',
        naver_snippet: row.naver_snippet,
        kakao_place_id: row.kakao_place_id,
      },
    }));

    mkdirSync('dist', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = `dist/curator-queue-${ts}.json`;
    writeFileSync(outPath, JSON.stringify(tasks, null, 2), 'utf-8');

    console.log(`[export] ${tasks.length}건 내보냄 → ${outPath}`);

    // 상위 5건 미리보기
    console.log('\n상위 5건 (ordinariness ASC):');
    for (const t of tasks.slice(0, 5)) {
      const d = t.data;
      console.log(
        `  #${t.id} ${d.name} | ${d.status} | auth=${d.authenticity_score?.toFixed(2) ?? 'null'} ord=${d.ordinariness_score?.toFixed(2) ?? 'null'}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
