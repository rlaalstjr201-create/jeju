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

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const area = areaBySlug(new URL(ctx.request.url).searchParams.get('area'));
  if (!area) return new Response('bad area', { status: 400, headers: { 'Cache-Control': 'no-store' } });
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
  const cacheKey = new Request(`https://rain.cache/${area.slug}/${base.base_date}${base.base_time}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const { nx, ny } = kmaGrid(area.lat, area.lng);
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

  const out = new Response(JSON.stringify({ area: area.slug, pop, rain: pop >= 60, base: `${base.base_date}${base.base_time}`, from: '기상청' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=1800' },
  });
  if (cache) {
    const put = cache.put(cacheKey, out.clone()).catch(() => undefined);
    if (ctx.waitUntil) ctx.waitUntil(put);
  }
  return out;
}
