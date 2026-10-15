// The collector (specs/usage-events.md "받는 쪽"): one host-agnostic handler on the standard Fetch API
// (Request → Response), so any host that speaks it can mount it. POST a JSON array → validated → the
// (day, place, event) counters go up. It reads nothing else from the request: no IP, no user agent, no
// cookie is looked at or stored.
import { dayOf } from '../src/dates';
import type { UsageEvent } from '../src/track';
import { readLimited } from './feedback';
import type { CounterStore } from './store';
import { MAX_BYTES, parseBatch } from './validate';

/** 저장 목록 흐름 (ADR-0085): the counter ids that are not places — fixed, and told apart from place ids by
 * their prefix (`open`, `arrange:`, `saved:`, `save:`). */
export const FLOW_IDS: readonly string[] = [
  'open',
  'open:live0',
  'open:past',
  'open:live0:past',
  ...['up', 'down', 'move', 'past'].map((op) => `arrange:${op}`),
  ...['0', '1', '2', 'x'].flatMap((a) => [`saved:a${a}:p`, `saved:a${a}:-`]),
  'save:dated',
  'save:now',
];

/** The counter ids an event goes up under (day and event stay its own). */
function idsOf(ev: UsageEvent): string[] {
  if (ev.id?.startsWith('src:')) return [ev.id]; // 숙소 링크 (ADR-0089)
  if (ev.e === 'tap') return [`mood:${ev.mood}`];
  if (ev.e === 'open') return [`open${ev.live0 ? ':live0' : ''}${ev.past ? ':past' : ''}`];
  if (ev.e === 'arrange') return [`arrange:${ev.op}`];
  if (ev.e === 'map' && ev.from === 'saved') return [ev.id!, `saved:a${ev.age ?? 'x'}:${ev.past ? 'p' : '-'}`];
  if (ev.e === 'save') return [ev.id!, ev.dated ? 'save:dated' : 'save:now'];
  return [ev.id!];
}

/** `now`: the collector's clock — an event's day must be within one of its Jeju day (validate.ts). */
export async function handleEvents(req: Request, store: CounterStore, now: () => Date = () => new Date()): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  // like /api/feedback: a length is required (a beacon's string says one) and no more than MAX_BYTES is ever read
  const length = req.headers.get('content-length');
  if (length === null) return new Response(null, { status: 411 });
  if (!(Number(length) <= MAX_BYTES)) return new Response(null, { status: 413 });
  const body = await readLimited(req, MAX_BYTES);
  if (body === null) return new Response(null, { status: 413 });
  const batch = parseBatch(body, dayOf(now()));
  if (!batch.ok) return new Response(batch.error, { status: batch.status });
  // Summed first, so a batch is one write per counter.
  const sums = new Map<string, number>();
  for (const ev of batch.events) {
    for (const id of idsOf(ev)) {
      const k = JSON.stringify([ev.d, id, ev.e]);
      sums.set(k, (sums.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of sums) {
    const [d, id, e] = JSON.parse(k) as [string, string, string];
    await store.increment(d, id, e, n);
  }
  return new Response(null, { status: 204 });
}
