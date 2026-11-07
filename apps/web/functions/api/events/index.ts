// POST /api/events (ADR-0078 1): the anonymous usage counts (ADR-0061) into D1 (binding EVENTS_DB, wrangler.toml).
// functions/_lib/events/handler.ts does the work as it is: a JSON array ≤ 8 KB / 50 events, no IP, user agent or cookie read.
import { d1Store, type D1Like } from '../../_lib/events/d1';
import { handleEvents } from '../../_lib/events/handler';

interface Ctx {
  request: Request;
  env: { EVENTS_DB?: D1Like };
}

/** Never cached anywhere: the answer is about this request only. */
function noStore(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const db = ctx.env.EVENTS_DB;
  if (!db) return noStore(new Response('no store', { status: 503 }));
  try {
    return noStore(await handleEvents(ctx.request, d1Store(db)));
  } catch {
    return noStore(new Response(null, { status: 503 }));
  }
}
