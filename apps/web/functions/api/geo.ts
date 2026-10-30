// POST /api/geo, body {"q": "<주소나 장소 이름>"} (ADR-0103): 주소·숙소 검색 in the basis sheet — Kakao Local's address and
// keyword search, answered as at most 6 { name, addr, lat, lng } inside Korea. Only the words typed come in, in the body
// (never the URL, so they are not in a request log's address); the key stays here (env KAKAO_REST_API_KEY,
// `wrangler pages secret put`). Without it, or with one Kakao refuses (401/403): 503, and the app says 「검색을 쓸 수 없어요.」
const ADDRESS = 'https://dapi.kakao.com/v2/local/search/address.json';
const KEYWORD = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const TIMEOUT_MS = 4000;
/** the app sends at most 40 characters (render.ts maxlength) */
const MAX_Q = 40;
/** the body: {"q": …} of at most 40 characters, with room for JSON escapes */
const MAX_BODY = 1024;
const MAX_HITS = 6;
/** per address, per minute, in one isolate's memory only (never stored, never logged) */
const LIMIT = 20;
const WINDOW_MS = 60_000;

interface Ctx {
  request: Request;
  env: { KAKAO_REST_API_KEY?: string };
}
export interface Hit {
  name: string;
  addr: string;
  lat: number;
  lng: number;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
/** `why` (X-Geo-Reason) says which step failed, for whoever runs the site — a status or a word, never the key or the words
 * searched; kept to header-safe ASCII as rain.ts does. */
const plain = (status: number, body: string, why: string) =>
  new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Geo-Reason': why.replace(/[^\w .:-]/g, '').slice(0, 80) } });

/** The words, spaces folded, or null: empty, longer than MAX_Q, or with a control character. */
export function queryOf(v: unknown): string | null {
  const q = (typeof v === 'string' ? v : '').normalize('NFC').replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  return q && [...q].length <= MAX_Q && !/[\u0000-\u001f\u007f]/.test(q) ? q : null;
}

/** Asked from this site's own pages only (a cheap guard against other sites spending the Kakao quota through their
 * visitors' browsers): Sec-Fetch-Site same-origin; without it, an Origin of this site; without that, a Referer of it. */
export function sameSite(req: Request): boolean {
  const own = new URL(req.url).origin;
  const site = req.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';
  const origin = req.headers.get('Origin');
  if (origin) return origin === own;
  try {
    return new URL(req.headers.get('Referer') ?? '').origin === own;
  } catch {
    return false;
  }
}

/** Korea drawn wide (마라도 to the DMZ, 백령도 to 독도); Kakao answers only there, this keeps it so. */
const inKorea = (lat: number, lng: number) => lat >= 33 && lat <= 38.7 && lng >= 124.5 && lng <= 132;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const coord = (v: unknown) => Math.round(Number(v) * 1e6) / 1e6;

/** Kakao's two answers as hits: addresses first (a road address' building name, else the address), then places; inside
 * Korea, the same point once, at most MAX_HITS. */
export function hitsOf(address: unknown, keyword: unknown): Hit[] {
  const docs = (b: unknown) => ((b as { documents?: unknown })?.documents ?? []) as Record<string, unknown>[];
  const out: Hit[] = [];
  const seen = new Set<string>();
  const add = (name: string, addr: string, x: unknown, y: unknown) => {
    const lat = coord(y), lng = coord(x);
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || !inKorea(lat, lng) || seen.has(key) || out.length >= MAX_HITS) return;
    seen.add(key);
    out.push({ name, addr: addr === name ? '' : addr, lat, lng });
  };
  for (const d of Array.isArray(docs(address)) ? docs(address) : []) {
    const road = (d.road_address ?? null) as Record<string, unknown> | null;
    const addr = text(road?.address_name, 80) || text(d.address_name, 80);
    add(text(road?.building_name, 60) || addr, addr, d.x, d.y);
  }
  for (const d of Array.isArray(docs(keyword)) ? docs(keyword) : []) add(text(d.place_name, 60), text(d.road_address_name, 80) || text(d.address_name, 80), d.x, d.y);
  return out;
}

const counts = new Map<string, { n: number; since: number }>();
/** true when this address has asked more than LIMIT times in the last minute (this isolate) */
export function limited(ip: string, now: number): boolean {
  if (counts.size > 5000) for (const [k, v] of counts) if (now - v.since >= WINDOW_MS) counts.delete(k);
  const c = counts.get(ip);
  if (!c || now - c.since >= WINDOW_MS) {
    counts.set(ip, { n: 1, since: now });
    return false;
  }
  c.n++;
  return c.n > LIMIT;
}

class KakaoError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}
async function kakao(url: string, q: string, key: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${url}?${new URLSearchParams({ query: q, size: String(MAX_HITS) })}`, { headers: { Authorization: `KakaoAK ${key}` }, signal });
  if (!res.ok) throw new KakaoError(res.status);
  return res.json();
}

/** The words from the body ({"q": …}, at most MAX_BODY bytes), or null. */
async function bodyQuery(req: Request): Promise<string | null> {
  if (!/^application\/json\b/i.test(req.headers.get('Content-Type') ?? '')) return null;
  const raw = await req.text().catch(() => '');
  if (!raw || new TextEncoder().encode(raw).length > MAX_BODY) return null;
  try {
    return queryOf((JSON.parse(raw) as { q?: unknown } | null)?.q);
  } catch {
    return null;
  }
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  if (!sameSite(ctx.request)) return plain(403, '', 'cross-site');
  const q = await bodyQuery(ctx.request);
  if (!q) return plain(400, 'bad q', 'bad-q');
  const key = ctx.env.KAKAO_REST_API_KEY?.trim();
  if (!key) return plain(503, '', 'no-key');
  if (limited(ctx.request.headers.get('CF-Connecting-IP') ?? '', Date.now())) return plain(429, '', 'limit');

  // 카카오 로컬은 실시간 호출로만 쓸 수 있어 결과를 엣지에도 두지 않는다(데브톡 FAQ 「데이터의 저장 사용」).
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let hits: Hit[];
  try {
    const [address, keyword] = await Promise.allSettled([kakao(ADDRESS, q, key, ctl.signal), kakao(KEYWORD, q, key, ctl.signal)]);
    const failed = [address, keyword].flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
    // a key Kakao refuses (wrong, or 카카오맵 not switched on for it): the same as no key
    const refused = failed.find((e): e is KakaoError => e instanceof KakaoError && (e.status === 401 || e.status === 403));
    if (refused) return plain(503, '', `bad-key ${refused.status}`);
    if (failed.length === 2) return plain(502, '', ctl.signal.aborted ? 'timeout' : String((failed[1] as Error)?.message ?? 'network'));
    hits = hitsOf(address.status === 'fulfilled' ? address.value : null, keyword.status === 'fulfilled' ? keyword.value : null);
  } finally {
    clearTimeout(timer);
  }
  return new Response(JSON.stringify({ hits }), { status: 200, headers: JSON_HEADERS });
}
