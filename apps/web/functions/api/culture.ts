// GET /api/culture?city=seoul (ADR-0112 6): 서울시 문화행사 → today's kept events (functions/_lib/culture-filter.ts).
// The API's own date field only finds events *starting* that day, so the whole list (1,000 rows a call, ~20 calls) is read
// once per KST day per edge cache. No position comes in: the app filters by distance. Key: env SEOUL_OPEN_API_KEY
// (`wrangler pages secret put`). A failure is 204 — the app hides the row rather than show yesterday's list.
// CPU (ADR-0112 Amendment 1): the whole list is ~16MB of JSON, more to parse than one free-plan invocation may spend, so each
// page is read by its own invocation (`&page=N&day=`, a subrequest to this same function) that keeps only the rows on that
// day; the list's ask merges those few hundred rows.
import { cultureItems, day10, type SeoulRow } from '../_lib/culture-filter';

const ENDPOINT = 'http://openapi.seoul.go.kr:8088'; // http only (the API answers nothing on https)
const PAGE = 1000;
const MAX_PAGES = 30;
const TIMEOUT_MS = 12000;

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

/** Seconds to the next KST midnight (an edge copy lasts the day; at least a minute). */
const toMidnight = (ms: number) => Math.max(60, Math.floor((Date.parse(`${kstDay(ms)}T00:00:00+09:00`) + 86400e3 - ms) / 1000));

const json = (body: unknown, browserSeconds: number) =>
  new Response(JSON.stringify(body), {
    status: 200,
    // the browser keeps it a few minutes (a new day is asked again soon after midnight), the edge until KST midnight
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${browserSeconds}, s-maxage=${toMidnight(Date.now())}` },
  });

/** The edge copy under `key`, else `make()`'s answer, kept there when it is a 200 (even if the asker has gone, waitUntil). */
async function cached(ctx: Ctx, key: string, make: () => Promise<Response>): Promise<Response> {
  const cache = edge();
  const cacheKey = new Request(key);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;
  const build = make();
  const keep = build.then((r) => (r.ok && cache ? cache.put(cacheKey, r.clone()).catch(() => undefined) : undefined));
  if (ctx.waitUntil) ctx.waitUntil(keep);
  const out = await build;
  if (!ctx.waitUntil) await keep;
  return out;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const q = new URL(ctx.request.url).searchParams;
  if (q.get('city') !== 'seoul') return new Response('bad city', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const key = ctx.env.SEOUL_OPEN_API_KEY?.trim();
  if (!key) return none('no-key');
  const day = kstDay(Date.now());

  if (q.has('page')) {
    const n = Number(q.get('page'));
    // only today's, and only a page there can be: nobody can make it ask the city for other days or endless pages
    if (q.get('day') !== day || !Number.isInteger(n) || n < 1 || n > MAX_PAGES) return new Response('bad page', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return cached(ctx, `https://culture.cache/seoul/${day}/p${n}`, () => onePage(key, n, day));
  }
  return cached(ctx, `https://culture.cache/seoul/${day}`, () => wholeDay(ctx.request.url, day));
}

/** Page `n` of the city's list (1,000 rows), only the rows on `day`, and the list's total. */
async function onePage(key: string, n: number, day: string): Promise<Response> {
  const from = (n - 1) * PAGE + 1;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(key)}/json/culturalEventInfo/${from}/${from + PAGE - 1}/`, { signal: ctl.signal });
    if (!res.ok) return none(`http ${res.status}`);
    const body = (await res.json()) as { culturalEventInfo?: { list_total_count?: number; row?: SeoulRow[]; RESULT?: { CODE?: string } }; RESULT?: { CODE?: string } };
    const b = body.culturalEventInfo;
    if (!b?.row) return none(`result ${b?.RESULT?.CODE ?? body.RESULT?.CODE ?? 'none'}`);
    const rows = b.row.filter((r) => day10(r.STRTDATE) <= day && day <= day10(r.END_DATE));
    return json({ total: Number(b.list_total_count ?? 0), rows }, 60);
  } catch (e) {
    return none((e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** Every page through this same function (one invocation each), merged and filtered. The first tells how many there are. */
async function wholeDay(self: string, day: string): Promise<Response> {
  const pageOf = async (n: number) => {
    const u = new URL(self);
    u.search = `?city=seoul&page=${n}&day=${day}`;
    const res = await fetch(u.toString());
    if (res.status !== 200) throw new Error(res.headers.get('X-Culture-Reason') || `page ${n}: ${res.status}`);
    const b = (await res.json()) as { total?: unknown; rows?: unknown };
    if (typeof b?.total !== 'number' || !Array.isArray(b.rows)) throw new Error(`page ${n}: shape`);
    return { total: b.total, rows: b.rows as SeoulRow[] };
  };
  let rows: SeoulRow[];
  try {
    const first = await pageOf(1);
    const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE));
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => pageOf(i + 2)));
    rows = [first, ...rest].flatMap((p) => p.rows);
  } catch (e) {
    return none((e as Error)?.message || 'network');
  }
  let items;
  try {
    items = cultureItems(rows, day);
  } catch {
    return none('filter');
  }
  return json({ city: 'seoul', day, generatedAt: new Date().toISOString(), from: '서울시 문화행사(서울 열린데이터광장)', items }, 300);
}
