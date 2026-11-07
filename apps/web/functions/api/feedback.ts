// POST /api/feedback (ADR-0081, specs/survey.md): 의견 보내기 into D1 (binding EVENTS_DB, table feedback).
// functions/_lib/events/feedback.ts does the work: one JSON object ≤ 4 KB of known answers; the server adds the Jeju day only.
// No IP, user agent, cookie or other header is read.
import { d1FeedbackStore, type D1Like } from '../_lib/events/d1';
import { handleFeedback } from '../_lib/events/feedback';

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
    return noStore(await handleFeedback(ctx.request, d1FeedbackStore(db)));
  } catch {
    return noStore(new Response(null, { status: 503 }));
  }
}
