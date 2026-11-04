// GET /api/culture?city=seoul (ADR-0112 6): 서울시 문화행사 → today's kept events (functions/_lib/culture-filter.ts).
// The API's own date field only finds events *starting* that day, so the whole list (1,000 rows a call) is read once
// per KST day per edge cache. No position comes in: the app filters by distance. Key: env SEOUL_OPEN_API_KEY
// (`wrangler pages secret put`). A failure is 204 — the app hides the row rather than show yesterday's list.
import { cultureItems, type SeoulRow } from '../_lib/culture-filter';

const ENDPOINT = 'http://openapi.seoul.go.kr:8088'; // http only (the API answers nothing on https)
const PAGE = 1000;
const MAX_PAGES = 25;
const TIMEOUT_MS = 8000;

interface Ctx {
  request: Request;
  env: { SEOUL_OPEN_API_KEY?: string };
  waitUntil?(p: Promise<unknown>): void;
}

const none = (why: string) =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Culture-Reason': why.replace(/[^\w .:-]/g, '').slice(0, 80) } });

const edge = (): Cache | null =>
  typeof caches !== 'undefined' ? ((caches as unknown as { default?: Cache }).default ?? null) : null;

/** KST calendar day of `ms`. */
export const kstDay = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const city = new URL(ctx.request.url).searchParams.get('city');
  if (city !== 'seoul') return new Response('bad city', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const key = ctx.env.SEOUL_OPEN_API_KEY?.trim();
  if (!key) return none('no-key');

  const day = kstDay(Date.now());
  const cache = edge();
  const cacheKey = new Request(`https://culture.cache/seoul/${day}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const rows: SeoulRow[] = [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    let total = Infinity;
    for (let page = 0; page < MAX_PAGES && page * PAGE < total; page++) {
      const from = page * PAGE + 1;
      const res = await fetch(`${ENDPOINT}/${encodeURIComponent(key)}/json/culturalEventInfo/${from}/${from + PAGE - 1}/`, { signal: ctl.signal });
      if (!res.ok) return none(`http ${res.status}`);
      const body = (await res.json()) as { culturalEventInfo?: { list_total_count?: number; row?: SeoulRow[]; RESULT?: { CODE?: string } }; RESULT?: { CODE?: string } };
      const b = body.culturalEventInfo;
      if (!b?.row) return none(`result ${b?.RESULT?.CODE ?? body.RESULT?.CODE ?? 'none'}`);
      total = Number(b.list_total_count ?? 0);
      rows.push(...b.row);
    }
  } catch (e) {
    return none((e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  const items = cultureItems(rows, day);
  const out = new Response(JSON.stringify({ city: 'seoul', day, generatedAt: new Date().toISOString(), from: '서울시 문화행사(서울 열린데이터광장)', items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
  if (cache) {
    const put = cache.put(cacheKey, out.clone()).catch(() => undefined);
    if (ctx.waitUntil) ctx.waitUntil(put);
  }
  return out;
}
