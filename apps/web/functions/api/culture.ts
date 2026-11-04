// GET /api/culture?city=seoul (ADR-0112 6): 서울시 문화행사 → today's kept events (functions/_lib/culture-filter.ts).
// The API's own date field only finds events *starting* that day, so the whole list (1,000 rows a call, ~20 calls) is read
// once per KST day per edge cache. No position comes in: the app filters by distance. Key: env SEOUL_OPEN_API_KEY
// (`wrangler pages secret put`). A failure is 204 — the app hides the row rather than show yesterday's list.
// CPU (ADR-0112 Amendment 1): the whole list is ~16MB of JSON, more to parse than one free-plan invocation may spend, so each
// page is read by its own invocation (`&page=N&day=`, a subrequest to this same function) that keeps only the rows on that
// day; the list's ask merges those few hundred rows.
// KOPIS 공연 (ADR-0113 5): the day's Seoul shows (`&shows=list`) and their details, ~10 a call (`&shows=PF…,PF…`), each
// through this same function, merged into the list (a show the Seoul list has by title is left out). Key: env KOPIS_API_KEY.
// KOPIS blocks bursts (60 at once: 51 blocked; locally also ~90-200 calls in a row at 1-6 a second), so its calls are
// paced at 4 a second over all the chunk calls at once, an ask stops starting chunks after KOPIS_BUDGET_MS, and a
// failed call stops its chunk.
// A show's detail is kept at the edge 7 days: an edge's first day fills in over a few asks (each list cut short is kept
// 10 minutes), later days ask only new shows. KOPIS failing: the Seoul list alone, kept at the edge 10 minutes only.
// Subrequests (free plan: 50 an invocation). The list's invocation: Seoul pages P (~20 on 2026-11-04, at most MAX_PAGES)
// + 1 KOPIS list + C chunks, C <= 50 - 2 (its own cache match/put, in case the Cache API counts) - P - 1; ~204 shows: 21
// chunks of 10 (P = 20: 42 + 2). With more pages the chunks grow to at most CHUNK_MAX; shows past C x CHUNK_MAX are left
// out. A chunk's invocation: per show a cache match, a detail and a cache put (<= 3 x CHUNK_MAX = 45) + at most
// VENUE_ASKS venues missing from the table. The shows-list invocation: <= KOPIS_LIST_PAGES.
import { cultureItems, day10, type CultureItem, type SeoulRow } from '../_lib/culture-filter';
import { kopisItems, kopisTime, listIds, mergeCulture, parseShow, xmlRecords, xmlTag, type KopisShow } from '../_lib/kopis';
import VENUES from '../_lib/kopis-venues.json';

const ENDPOINT = 'http://openapi.seoul.go.kr:8088'; // http only (the API answers nothing on https)
const PAGE = 1000;
const MAX_PAGES = 30;
const TIMEOUT_MS = 12000;
const KOPIS = 'http://www.kopis.or.kr/openApi/restful';
const KOPIS_LIST_PAGES = 5; // 100 a page
const KOPIS_RUNS = 2; // chunk calls at once
const KOPIS_GAP_MS = 500; // between one chunk's KOPIS calls: KOPIS_RUNS of them stay at 4 a second (blocks came at 1 a second too, after ~90)
const CHUNK = 10;
const CHUNK_MAX = 15;
const SUBREQUESTS = 50;
const VENUE_ASKS = 3;
const SHOW_KEEP_S = 7 * 86400;
const KOPIS_FAIL_S = 600;
const KOPIS_BUDGET_MS = 20000; // no new chunk after this: the app gives up at 15s, waitUntil lasts ~30s
const SHOW_ID = /^PF\d{5,8}$/;
const KOPIS_FROM = '(재)예술경영지원센터 공연예술통합전산망(KOPIS)';

interface Ctx {
  request: Request;
  env: { SEOUL_OPEN_API_KEY?: string; KOPIS_API_KEY?: string };
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

const json = (body: unknown, browserSeconds: number, edgeSeconds = toMidnight(Date.now())) =>
  new Response(JSON.stringify(body), {
    status: 200,
    // the browser keeps it a few minutes (a new day is asked again soon after midnight), the edge until KST midnight
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${browserSeconds}, s-maxage=${edgeSeconds}` },
  });

/** The edge copy under `key`, else `make()`'s answer, kept there when it is a 200 (even if the asker has gone, waitUntil).
 * `failFor`: a failure is kept that many seconds too (the list's: every app asking again would ask every page again). */
async function cached(ctx: Ctx, key: string, make: () => Promise<Response>, failFor = 0): Promise<Response> {
  const cache = edge();
  const cacheKey = new Request(key);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;
  const build = make();
  const keep = build.then((r) => {
    if (!cache) return undefined;
    if (r.status === 200) return cache.put(cacheKey, r.clone()).catch(() => undefined);
    if (!failFor) return undefined;
    const fail = new Response(null, { status: 204, headers: { 'Cache-Control': `max-age=0, s-maxage=${failFor}`, 'X-Culture-Reason': r.headers.get('X-Culture-Reason') ?? '' } });
    return cache.put(cacheKey, fail).catch(() => undefined);
  });
  if (ctx.waitUntil) ctx.waitUntil(keep);
  const out = await build;
  if (!ctx.waitUntil) await keep;
  return out;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const q = new URL(ctx.request.url).searchParams;
  if (q.get('city') !== 'seoul') return new Response('bad city', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const day = kstDay(Date.now());
  const kopisKey = ctx.env.KOPIS_API_KEY?.trim();
  if (q.has('shows')) {
    const v = q.get('shows') ?? '';
    const ids = v === 'list' ? [] : v.split(',');
    // only today's, and only the list or a few show ids: nobody can make it ask KOPIS for other days or many shows
    if (q.get('day') !== day || (v !== 'list' && (ids.length > CHUNK_MAX || new Set(ids).size !== ids.length || !ids.every((id) => SHOW_ID.test(id))))) {
      return new Response('bad shows', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!kopisKey) return none('no-key');
    if (v === 'list') return cached(ctx, `https://culture.cache/kopis/${day}/list`, () => kopisList(kopisKey, day));
    return kopisChunk(ctx, kopisKey, ids, day);
  }
  const key = ctx.env.SEOUL_OPEN_API_KEY?.trim();
  if (!key) return none('no-key');

  if (q.has('page')) {
    const n = Number(q.get('page'));
    // only today's, and only a page there can be: nobody can make it ask the city for other days or endless pages
    if (q.get('day') !== day || !Number.isInteger(n) || n < 1 || n > MAX_PAGES) return new Response('bad page', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return cached(ctx, `https://culture.cache/seoul/${day}/p${n}`, () => onePage(key, n, day));
  }
  return cached(ctx, `https://culture.cache/seoul/${day}`, () => wholeDay(ctx.request.url, day, !!kopisKey), 300);
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

const selfUrl = (self: string, search: string) => {
  const u = new URL(self);
  u.search = search;
  return u.toString();
};

/** Every page through this same function (one invocation each), merged and filtered. The first tells how many there are.
 * `shows`: KOPIS's too (ADR-0113), alongside. */
async function wholeDay(self: string, day: string, shows: boolean): Promise<Response> {
  let told: (calls: number) => void = () => undefined;
  const seoulCalls = new Promise<number>((r) => (told = r));
  const kopis = shows ? kopisDay(self, day, seoulCalls) : null;
  const pageOf = async (n: number) => {
    const res = await fetch(selfUrl(self, `?city=seoul&page=${n}&day=${day}`));
    if (res.status !== 200) throw new Error(res.headers.get('X-Culture-Reason') || `page ${n}: ${res.status}`);
    const b = (await res.json()) as { total?: unknown; rows?: unknown };
    if (typeof b?.total !== 'number' || !Array.isArray(b.rows)) throw new Error(`page ${n}: shape`);
    return { total: b.total, rows: b.rows as SeoulRow[] };
  };
  let rows: SeoulRow[];
  try {
    const first = await pageOf(1);
    const pages = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE));
    told(Math.max(1, pages));
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => pageOf(i + 2)));
    rows = [first, ...rest].flatMap((p) => p.rows);
  } catch (e) {
    told(MAX_PAGES);
    return none((e as Error)?.message || 'network');
  }
  let items;
  try {
    items = cultureItems(rows, day);
  } catch {
    return none('filter');
  }
  const body = { city: 'seoul', day, generatedAt: new Date().toISOString(), from: '서울시 문화행사(서울 열린데이터광장)', items };
  if (!kopis) return json(body, 300);
  const k = await kopis;
  const merged = { ...body, items: mergeCulture(items, k.items), ...(k.items.length ? { fromShows: KOPIS_FROM } : {}) };
  // KOPIS failing (wholly or a chunk): what came, kept at the edge 10 minutes only (the details kept make the next ask quick)
  return k.ok ? json(merged, 300) : json(merged, 300, KOPIS_FAIL_S);
}

/** The day's show items through this same function: the list, then the details a chunk at a time, KOPIS_RUNS at once.
 * `seoulCalls`: the Seoul pages' subrequests, told once page 1 is in (the chunks fit in what is left). Never throws. */
async function kopisDay(self: string, day: string, seoulCalls: Promise<number>): Promise<{ items: CultureItem[]; ok: boolean }> {
  const ask = async (shows: string) => {
    const res = await fetch(selfUrl(self, `?city=seoul&shows=${shows}&day=${day}`));
    if (res.status !== 200) throw new Error(`shows: ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  let ids: string[];
  try {
    const b = (await ask('list')) as { ids?: unknown };
    if (!Array.isArray(b?.ids)) return { items: [], ok: false };
    ids = (b.ids as unknown[]).filter((id): id is string => typeof id === 'string' && SHOW_ID.test(id));
  } catch {
    return { items: [], ok: false };
  }
  if (!ids.length) return { items: [], ok: true };
  const room = Math.max(1, SUBREQUESTS - 2 - (await seoulCalls) - 1);
  const chunks = Math.min(Math.ceil(ids.length / CHUNK), room);
  const size = Math.min(CHUNK_MAX, Math.ceil(ids.length / chunks));
  const parts = Array.from({ length: chunks }, (_, i) => ids.slice(i * size, (i + 1) * size)).filter((p) => p.length);
  const items: CultureItem[] = [];
  let ok = true;
  let next = 0;
  const t0 = Date.now();
  const run = async () => {
    while (next < parts.length) {
      // past the budget the rest wait for the next ask (the list then lasts 10 minutes at the edge; the details asked stay)
      if (Date.now() - t0 > KOPIS_BUDGET_MS) {
        ok = false;
        return;
      }
      const part = parts[next++];
      try {
        const b = (await ask(part.join(','))) as { items?: unknown; failed?: unknown };
        if (!Array.isArray(b?.items)) throw new Error('shape');
        items.push(...(b.items as CultureItem[]));
        if (b.failed) ok = false;
      } catch {
        ok = false;
      }
    }
  };
  await Promise.all(Array.from({ length: KOPIS_RUNS }, run));
  // chunks answer out of order: back in the list's order, so the same day reads the same
  const at = new Map(ids.map((id, i) => [`kp-${id}`, i]));
  items.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
  return { items, ok };
}

let lastKopis = 0;
/** One KOPIS call (paced KOPIS_GAP_MS within this invocation): its XML, or null (an error, a block's HTML, no answer). */
async function kopisGet(key: string, path: string, query = ''): Promise<string | null> {
  const wait = lastKopis + KOPIS_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastKopis = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${KOPIS}/${path}?service=${encodeURIComponent(key)}${query}`, { signal: ctl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trimStart().startsWith('<?xml') ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const ymd8 = (day: string) => day.replace(/-/g, '');

/** The day's Seoul show ids (KOPIS's list, 100 a page). */
async function kopisList(key: string, day: string): Promise<Response> {
  const ids: string[] = [];
  for (let page = 1; page <= KOPIS_LIST_PAGES; page++) {
    const xml = await kopisGet(key, 'pblprfr', `&stdate=${ymd8(day)}&eddate=${ymd8(day)}&cpage=${page}&rows=100&signgucode=11`);
    if (xml === null) return none('kopis list');
    ids.push(...listIds(xml));
    if (xmlRecords(xml).length < 100) break;
  }
  return json({ ids: [...new Set(ids)] }, 60);
}

const TABLE = VENUES as unknown as Record<string, [number, number]>;

/** A chunk's shows as items: each detail from the edge (7 days) or KOPIS; a venue from the table, else KOPIS. A failed
 * call stops the chunk's asking (a block: asking more only keeps it blocked); the rest count as failed. */
async function kopisChunk(ctx: Ctx, key: string, ids: string[], day: string): Promise<Response> {
  const cache = edge();
  const shows: KopisShow[] = [];
  let failed = 0;
  let blocked = false;
  for (const id of ids) {
    const cacheKey = new Request(`https://culture.cache/kopis/pf/${id}`);
    const hit = await cache?.match(cacheKey).catch(() => undefined);
    let show = hit ? ((await hit.json().catch(() => null)) as KopisShow | null) : null;
    if (!show && !blocked) {
      const xml = await kopisGet(key, `pblprfr/${id}`);
      if (xml === null) blocked = true;
      show = xml === null ? null : parseShow(xml);
      if (show && cache) {
        const put = cache.put(cacheKey, new Response(JSON.stringify(show), { headers: { 'Cache-Control': `s-maxage=${SHOW_KEEP_S}` } })).catch(() => undefined);
        if (ctx.waitUntil) ctx.waitUntil(put);
        else await put;
      }
    }
    if (show) shows.push(show);
    else failed++;
  }
  const venues: Record<string, [number, number]> = {};
  let asks = 0;
  for (const s of shows) {
    if (TABLE[s.venue]) venues[s.venue] = TABLE[s.venue];
    // a venue missing from the table: asked only for a show that would be kept otherwise
    else if (s.venue && !venues[s.venue] && !blocked && asks < VENUE_ASKS && s.from <= day && day <= s.to && kopisTime(s.dt)) {
      asks++;
      const rec = xmlRecords((await kopisGet(key, `prfplc/${encodeURIComponent(s.venue)}`)) ?? '')[0] ?? '';
      const lat = Number(xmlTag(rec, 'la'));
      const lng = Number(xmlTag(rec, 'lo'));
      if (lat && lng && Number.isFinite(lat) && Number.isFinite(lng)) venues[s.venue] = [lat, lng];
    }
  }
  return json({ items: kopisItems(shows, venues, day), failed }, 60);
}
