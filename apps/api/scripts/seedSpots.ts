import { randomUUID } from 'crypto';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  x: string; // longitude
  y: string; // latitude
  road_address_name: string;
}

interface KakaoKeywordResponse {
  documents: KakaoDoc[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
}

type Region = 'jeju-city' | 'eastern' | 'seogwipo' | 'western' | 'hallasan';

interface SearchQuery {
  query: string;
  region: Region;
}

// ---------------------------------------------------------------------------
// Search query definitions
// ---------------------------------------------------------------------------

const SEARCH_QUERIES: SearchQuery[] = [
  // jeju-city
  { query: '제주시 관광명소', region: 'jeju-city' },
  { query: '제주시 카페', region: 'jeju-city' },
  { query: '제주시 음식점', region: 'jeju-city' },
  { query: '제주시 문화시설', region: 'jeju-city' },
  // eastern
  { query: '제주 동부 관광명소', region: 'eastern' },
  { query: '제주 동부 카페', region: 'eastern' },
  { query: '제주 동부 음식점', region: 'eastern' },
  { query: '성산 관광명소', region: 'eastern' },
  // seogwipo
  { query: '서귀포 관광명소', region: 'seogwipo' },
  { query: '서귀포 카페', region: 'seogwipo' },
  { query: '서귀포 음식점', region: 'seogwipo' },
  { query: '서귀포 문화시설', region: 'seogwipo' },
  // western
  { query: '제주 서부 관광명소', region: 'western' },
  { query: '제주 서부 카페', region: 'western' },
  { query: '제주 서부 음식점', region: 'western' },
  { query: '애월 관광명소', region: 'western' },
  // hallasan
  { query: '한라산 관광명소', region: 'hallasan' },
  { query: '한라산 등산', region: 'hallasan' },
];

const KAKAO_API_URL =
  'https://dapi.kakao.com/v2/local/search/keyword.json';

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchKakaoPage(
  apiKey: string,
  query: string,
  page: number,
): Promise<KakaoKeywordResponse> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    size: '15',
  });
  const url = `${KAKAO_API_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Kakao API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as KakaoKeywordResponse;
}

async function fetchAllPagesForQuery(
  apiKey: string,
  query: string,
  maxPages = 3,
): Promise<KakaoDoc[]> {
  const docs: KakaoDoc[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchKakaoPage(apiKey, query, page);
    docs.push(...data.documents);
    if (data.meta.is_end) break;
  }
  return docs;
}

// ---------------------------------------------------------------------------
// Category derivation
// ---------------------------------------------------------------------------

function deriveCategory(categoryName: string): string {
  const firstSegment = categoryName.split('>')[0];
  return (firstSegment ?? categoryName).trim();
}

// ---------------------------------------------------------------------------
// Upsert SQL
// ---------------------------------------------------------------------------

const UPSERT_SQL = `
  INSERT INTO spots (
    id, kakao_place_id, name, region, category,
    price_range, curation_score, popularity_score,
    curation_comment, lat, lng, thumbnail_url, is_active
  ) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8,
    $9, $10, $11, $12, $13
  )
  ON CONFLICT (kakao_place_id) DO UPDATE
    SET name = EXCLUDED.name,
        updated_at = now()
`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function seedSpots(
  pool: Pool,
): Promise<{ inserted: number; skipped: number }> {
  const apiKey = process.env.KAKAO_REST_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('KAKAO_REST_API_KEY environment variable is not set');
  }

  const seen = new Set<string>();
  let inserted = 0;
  let skipped = 0;

  for (const { query, region } of SEARCH_QUERIES) {
    let docs: KakaoDoc[];
    try {
      docs = await fetchAllPagesForQuery(apiKey, query);
    } catch (err) {
      console.warn(`[seedSpots] Failed to fetch query "${query}":`, err);
      continue;
    }

    for (const doc of docs) {
      if (seen.has(doc.id)) {
        skipped++;
        continue;
      }
      seen.add(doc.id);

      const lat = parseFloat(doc.y);
      const lng = parseFloat(doc.x);

      if (isNaN(lat) || isNaN(lng)) {
        skipped++;
        continue;
      }

      try {
        await pool.query(UPSERT_SQL, [
          randomUUID(),          // $1  id
          doc.id,                // $2  kakao_place_id
          doc.place_name,        // $3  name
          region,                // $4  region
          deriveCategory(doc.category_name), // $5 category
          'mid',                 // $6  price_range
          50,                    // $7  curation_score
          30,                    // $8  popularity_score
          null,                  // $9  curation_comment
          lat,                   // $10 lat
          lng,                   // $11 lng
          null,                  // $12 thumbnail_url
          true,                  // $13 is_active
        ]);
        inserted++;
      } catch (err) {
        console.warn(
          `[seedSpots] Upsert failed for kakao_place_id=${doc.id}:`,
          err,
        );
        skipped++;
      }
    }
  }

  console.log(`[seedSpots] Done: inserted=${inserted}, skipped=${skipped}`);
  return { inserted, skipped };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

if (process.argv[1]?.endsWith('seedSpots.js')) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
  await seedSpots(pool);
  await pool.end();
}
