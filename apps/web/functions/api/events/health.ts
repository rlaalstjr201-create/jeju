// GET /api/events/health (ADR-0078 2): how many events came in lately, a count only — for smoke.sh and the
// daily scripts/analytics/analytics-health.mjs. Counters have days, not times: `last24h` sums yesterday and today (Seoul),
// so it covers at least the last 24 hours (and tomorrow, which a phone a little ahead at midnight may send).
import { countSince, type D1Like } from '../../_lib/events/d1';
import { addDays, dayOf } from '../../../src/dates';

interface Ctx {
  env: { EVENTS_DB?: D1Like };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const db = ctx.env.EVENTS_DB;
  if (!db) return json({ error: 'no store' }, 503);
  try {
    const today = dayOf(new Date());
    return json({ last24h: await countSince(db, addDays(today, -1), addDays(today, 1)) });
  } catch {
    return json({ error: 'query failed' }, 503);
  }
}
