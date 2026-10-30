// POST /api/addr, body {"addr": "<고른 결과의 주소>"} (ADR-0103 Amendment 2): a 주소·숙소 answer picked, found again in the
// 행정안전부 도로명주소 API (business.juso.go.kr) — its 검색 API for the address' codes, its 좌표제공 API for the point — and
// answered as { addr, lat, lng } from there. Kakao Local's address and point may be used only as they come (never kept);
// this public one is what the device keeps as the 숙소. Keys stay here (env JUSO_SEARCH_KEY, JUSO_COORD_KEY,
// `wrangler pages secret put`); without them, or with one refused: 503, and the app uses the point for this visit only.
import { limited, plain, sameSite } from './geo';

const SEARCH = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const COORD = 'https://business.juso.go.kr/addrlink/addrCoordApi.do';
const TIMEOUT_MS = 4000;
/** the app sends a hit's address (at most 80 characters) or its name (60) */
const MAX_ADDR = 80;
const MAX_BODY = 1024;

interface Ctx {
  request: Request;
  env: { JUSO_SEARCH_KEY?: string; JUSO_COORD_KEY?: string };
}
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

/** The address, spaces folded, without what the 검색 API refuses (%, =, <, >, [, ]), or null: empty, too long, a control
 * character. */
export function addrOf(v: unknown): string | null {
  const a = (typeof v === 'string' ? v : '').normalize('NFC').replace(/[%=<>[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  return a && [...a].length <= MAX_ADDR && !/[\u0000-\u001f\u007f]/.test(a) ? a : null;
}

/** UTM-K (EPSG:5179, GRS80 — the 좌표제공 API's entX·entY) to latitude·longitude (WGS84; GRS80 differs by under a
 * millimetre). Transverse Mercator inverse, Snyder (1987) 8-18 to 8-25. */
export function utmkToWgs84(x: number, y: number): { lat: number; lng: number } {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lat0 = (38 * Math.PI) / 180, lon0 = (127.5 * Math.PI) / 180;
  const e2 = f * (2 - f), e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
  const m = (p: number) =>
    a * ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * p - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * p) + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * p) - ((35 * e6) / 3072) * Math.sin(6 * p));
  const mu = (m(lat0) + (y - 2_000_000) / k0) / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const c1 = ep2 * c * c, t1 = t * t, n1 = a / Math.sqrt(1 - e2 * s * s), r1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const d = (x - 1_000_000) / (n1 * k0);
  const lat = p1 - ((n1 * t) / r1) * (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng = lon0 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / c;
  const r6 = (v: number) => Math.round(((v * 180) / Math.PI) * 1e6) / 1e6;
  return { lat: r6(lat), lng: r6(lng) };
}

class JusoError extends Error {
  constructor(readonly code: string) {
    super(`juso ${code}`);
  }
}
/** One answer of the 도로명주소 API: its first `juso`, or null when there is none; an error code (`E…`) thrown. */
async function juso(url: string, params: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${url}?${new URLSearchParams({ ...params, resultType: 'json' })}`, { signal });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const r = ((await res.json()) as { results?: { common?: { errorCode?: string }; juso?: unknown } } | null)?.results;
  const code = String(r?.common?.errorCode ?? '');
  if (code !== '0') throw new JusoError(code || 'bad');
  return Array.isArray(r?.juso) && r.juso.length ? (r.juso[0] as Record<string, unknown>) : null;
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** E0001 a key not approved, E0014 a development key past its days: the same as no key */
const KEY_CODES = new Set(['E0001', 'E0014']);

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  if (!sameSite(ctx.request)) return plain(403, '', 'cross-site');
  const addr = await bodyAddr(ctx.request);
  if (!addr) return plain(400, 'bad addr', 'bad-addr');
  const searchKey = ctx.env.JUSO_SEARCH_KEY?.trim();
  const coordKey = ctx.env.JUSO_COORD_KEY?.trim();
  if (!searchKey || !coordKey) return plain(503, '', 'no-key');
  if (limited(ctx.request.headers.get('CF-Connecting-IP') ?? '', Date.now())) return plain(429, '', 'limit');

  // asked as it comes, nothing kept here either
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const found = await juso(SEARCH, { confmKey: searchKey, currentPage: '1', countPerPage: '1', keyword: addr }, ctl.signal);
    if (!found) return plain(404, '', 'none');
    const codes = Object.fromEntries(['admCd', 'rnMgtSn', 'udrtYn', 'buldMnnm', 'buldSlno'].map((k) => [k, str(found[k])]));
    if (Object.values(codes).some((v) => !v)) return plain(404, '', 'none');
    const at = await juso(COORD, { confmKey: coordKey, ...codes }, ctl.signal);
    const x = Number(str(at?.entX)), y = Number(str(at?.entY));
    if (!at || !Number.isFinite(x) || !Number.isFinite(y) || !x || !y) return plain(404, '', 'none');
    const p = utmkToWgs84(x, y);
    const name = (str(found.roadAddrPart1) || str(found.roadAddr)).replace(/\s+/g, ' ').slice(0, MAX_ADDR);
    return new Response(JSON.stringify({ addr: name, lat: p.lat, lng: p.lng }), { status: 200, headers: JSON_HEADERS });
  } catch (e) {
    if (e instanceof JusoError) return KEY_CODES.has(e.code) ? plain(503, '', `bad-key ${e.code}`) : plain(404, '', `none ${e.code}`);
    return plain(502, '', ctl.signal.aborted ? 'timeout' : String((e as Error)?.message ?? 'network'));
  } finally {
    clearTimeout(timer);
  }
}

/** The address from the body ({"addr": …}, at most MAX_BODY bytes), or null. */
async function bodyAddr(req: Request): Promise<string | null> {
  if (!/^application\/json\b/i.test(req.headers.get('Content-Type') ?? '')) return null;
  const raw = await req.text().catch(() => '');
  if (!raw || new TextEncoder().encode(raw).length > MAX_BODY) return null;
  try {
    return addrOf((JSON.parse(raw) as { addr?: unknown } | null)?.addr);
  } catch {
    return null;
  }
}
