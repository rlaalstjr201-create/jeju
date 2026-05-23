import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpotRow {
  id: string;
  name: string;
  category: string;
}

interface VoyageEmbeddingItem {
  embedding: number[];
  index: number;
}

interface VoyageResponse {
  data: VoyageEmbeddingItem[];
}

// ---------------------------------------------------------------------------
// Voyage AI helpers
// ---------------------------------------------------------------------------

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const BATCH_SIZE = 50;

async function fetchEmbeddings(
  apiKey: string,
  inputs: string[],
): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: VOYAGE_MODEL, input: inputs }),
  });

  if (!res.ok) {
    throw new Error(`Voyage AI error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as VoyageResponse;
  // Sort by index to guarantee alignment with input order
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const SELECT_NULL_EMBEDDINGS = `
  SELECT id, name, category
  FROM spots
  WHERE embedding IS NULL
  ORDER BY id
`;

const UPDATE_EMBEDDING = `
  UPDATE spots
  SET embedding = $1::vector
  WHERE id = $2
`;

function toVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateEmbeddings(
  pool: Pool,
): Promise<{ processed: number }> {
  const apiKey = process.env.VOYAGE_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY environment variable is not set');
  }

  const result = await pool.query<SpotRow>(SELECT_NULL_EMBEDDINGS);
  const spots = result.rows;

  if (spots.length === 0) {
    console.log('[generateEmbeddings] No spots with null embeddings found.');
    return { processed: 0 };
  }

  let processed = 0;

  for (let i = 0; i < spots.length; i += BATCH_SIZE) {
    const batch = spots.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((s) => `${s.name} ${s.category}`);

    let embeddings: number[][];
    try {
      embeddings = await fetchEmbeddings(apiKey, inputs);
    } catch (err) {
      console.warn(
        `[generateEmbeddings] Failed to fetch embeddings for batch starting at index ${i}:`,
        err,
      );
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const spot = batch[j];
      const embedding = embeddings[j];

      if (spot === undefined || embedding === undefined) continue;

      try {
        await pool.query(UPDATE_EMBEDDING, [
          toVectorString(embedding),
          spot.id,
        ]);
        processed++;
      } catch (err) {
        console.warn(
          `[generateEmbeddings] Failed to update embedding for spot id=${spot.id}:`,
          err,
        );
      }
    }
  }

  console.log(`[generateEmbeddings] Done: processed=${processed}`);
  return { processed };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

if (process.argv[1]?.endsWith('generateEmbeddings.js')) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
  await generateEmbeddings(pool);
  await pool.end();
}
