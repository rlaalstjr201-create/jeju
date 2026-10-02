// GET /api/rain?area=<slug> (ADR-0076): 기상청 단기예보 → will it rain in this area within 3 hours.
// Only the area's name comes in; the service key stays here (env KMA_SERVICE_KEY, `wrangler pages secret put`).
import { areaBySlug, baseTime, kmaGrid, maxPop } from '../_lib/kma';

const ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const TIMEOUT_MS = 4000;

interface Ctx {
  request: Request;
  env: { KMA_SERVICE_KEY?: string };
  waitUntil?(p: Promise<unknown>): void;
}

/** No answer: the app hides the row. Never cached anywhere. */
const none = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/** Cloudflare's edge cache (caches.default); absent outside the Workers runtime. */
const edge = (): Cache | null =>
  typeof caches !== 'undefined' ? ((caches as unknown as { default?: Cache }).default ?? null) : null;

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const area = areaBySlug(new URL(ctx.request.url).searchParams.get('area'));
  if (!area) return new Response('bad area', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const key = ctx.env.KMA_SERVICE_KEY;
  if (!key) return none();

  const now = Date.now();
  const base = baseTime(now);
  const cache = edge();
  const cacheKey = new Request(`https://rain.cache/${area.slug}/${base.base_date}${base.base_time}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const { nx, ny } = kmaGrid(area.lat, area.lng);
  const q = new URLSearchParams({ serviceKey: key, dataType: 'JSON', numOfRows: '1000', pageNo: '1', ...base, nx: String(nx), ny: String(ny) });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let pop: number | null;
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, { signal: ctl.signal });
    if (!res.ok) return none();
    pop = maxPop(JSON.parse(await res.text()), now); // the agency answers errors in XML: a parse failure is a failure
  } catch {
    return none();
  } finally {
    clearTimeout(timer);
  }
  if (pop === null) return none();

  const out = new Response(JSON.stringify({ area: area.slug, pop, rain: pop >= 60, base: `${base.base_date}${base.base_time}`, from: '기상청' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
  });
  if (cache) {
    const put = cache.put(cacheKey, out.clone()).catch(() => undefined);
    if (ctx.waitUntil) ctx.waitUntil(put);
  }
  return out;
}
