// GET /api/rain?area=<slug> (ADR-0076): 기상청 단기예보 → will it rain in this area within 3 hours.
// GET /api/rain?grid=<nx>,<ny> (plans/nationwide-app.md 5): the same for one KMA grid cell — a 시군구 centre's, never a GPS point.
// Only the area's name or the cell comes in; the service key stays here (env KMA_SERVICE_KEY, `wrangler pages secret put`).
import { areaBySlug, baseTime, kmaGrid, maxPop } from '../_lib/kma';

const ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const TIMEOUT_MS = 4000;

interface Ctx {
  request: Request;
  env: { KMA_SERVICE_KEY?: string };
  waitUntil?(p: Promise<unknown>): void;
}

/** No answer: the app hides the row. Never cached anywhere. `why` (X-Rain-Reason) says which step failed, for
 * whoever runs the site — the agency's own error words or a status, never the key. */
const none = (why: string) =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Rain-Reason': why.replace(/[^\w .:-]/g, '').slice(0, 80) } });

/** Why the agency's answer is not a forecast: its XML error words (returnAuthMsg / returnReasonCode), its JSON
 * resultCode and resultMsg, or that it had no POP in the window. */
function upstreamWhy(text: string): string {
  // the gateway's error envelope: in XML the code is in returnAuthMsg (errMsg says SERVICE ERROR); in the JSON a 403
  // carries it is errMsg (returnAuthMsg is Korean). Take whichever is an ASCII code, e.g. SERVICE_KEY_IS_NOT_REGISTERED_ERROR.
  const code = (field: string) => new RegExp(`${field}["\\s:>]+([A-Z][A-Z_]+[A-Z])\\b`).exec(text)?.[1];
  const env = code('returnAuthMsg') ?? code('errMsg');
  if (env) return `gw ${env}`;
  try {
    const h = (JSON.parse(text) as { response?: { header?: { resultCode?: unknown; resultMsg?: unknown } } })?.response?.header;
    return h?.resultCode !== '00' ? `result ${String(h?.resultCode)} ${String(h?.resultMsg)}` : 'no-pop';
  } catch {
    return 'not-json';
  }
}

/** Cloudflare's edge cache (caches.default); absent outside the Workers runtime. */
const edge = (): Cache | null =>
  typeof caches !== 'undefined' ? ((caches as unknown as { default?: Cache }).default ?? null) : null;

/** `<nx>,<ny>` inside the agency's grid (1–149, 1–253), no leading zero; else null. */
function gridOf(v: string | null): { nx: number; ny: number } | null {
  const m = /^([1-9]\d{0,2}),([1-9]\d{0,2})$/.exec(v ?? '');
  if (!m) return null;
  const nx = Number(m[1]), ny = Number(m[2]);
  return nx <= 149 && ny <= 253 ? { nx, ny } : null;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const params = new URL(ctx.request.url).searchParams;
  // an area, when asked, wins: its path is as it was
  const area = params.has('area') ? areaBySlug(params.get('area')) : null;
  const grid = area ? kmaGrid(area.lat, area.lng) : params.has('area') ? null : gridOf(params.get('grid'));
  if (!grid) return new Response('bad area', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  // data.go.kr shows the key twice, 인코딩 and 디코딩: an encoded one (it has %) would be encoded again below, so
  // whichever was pasted, it is used decoded
  const raw = ctx.env.KMA_SERVICE_KEY?.trim();
  let key = raw;
  if (raw?.includes('%')) {
    try {
      key = decodeURIComponent(raw);
    } catch {
      key = raw;
    }
  }
  if (!key) return none('no-key');

  const now = Date.now();
  const base = baseTime(now);
  const cache = edge();
  const cacheKey = new Request(`https://rain.cache/${area ? area.slug : `g${grid.nx}-${grid.ny}`}/${base.base_date}${base.base_time}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const { nx, ny } = grid;
  const q = new URLSearchParams({ serviceKey: key, dataType: 'JSON', numOfRows: '1000', pageNo: '1', ...base, nx: String(nx), ny: String(ny) });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let pop: number | null;
  let text = '';
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, { signal: ctl.signal });
    if (!res.ok) return none(`http ${res.status} ${upstreamWhy(await res.text().catch(() => ''))}`);
    text = await res.text();
    pop = maxPop(JSON.parse(text), now); // the agency answers errors in XML: a parse failure is a failure
  } catch (e) {
    return none(text ? upstreamWhy(text) : (e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  if (pop === null) return none(upstreamWhy(text));

  const out = new Response(JSON.stringify({ ...(area ? { area: area.slug } : { grid: `${nx},${ny}` }), pop, rain: pop >= 60, base: `${base.base_date}${base.base_time}`, from: '기상청' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=1800' },
  });
  if (cache) {
    const put = cache.put(cacheKey, out.clone()).catch(() => undefined);
    if (ctx.waitUntil) ctx.waitUntil(put);
  }
  return out;
}
