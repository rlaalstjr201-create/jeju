// The collector (specs/usage-events.md "받는 쪽"): one host-agnostic handler on the standard Fetch API
// (Request → Response), so any host that speaks it can mount it. POST a JSON array → validated → the
// (day, place, event) counters go up. It reads nothing else from the request: no IP, no user agent, no
// cookie is looked at or stored.
import type { CounterStore } from './store';
import { MAX_BYTES, parseBatch } from './validate';

export async function handleEvents(req: Request, store: CounterStore): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const declared = Number(req.headers.get('content-length'));
  if (declared > MAX_BYTES) return new Response(null, { status: 413 });
  const batch = parseBatch(await req.text());
  if (!batch.ok) return new Response(batch.error, { status: batch.status });
  // Summed first, so a batch is one write per counter.
  const sums = new Map<string, number>();
  for (const ev of batch.events) {
    const k = JSON.stringify([ev.d, ev.e === 'tap' ? `mood:${ev.mood}` : ev.id, ev.e]);
    sums.set(k, (sums.get(k) ?? 0) + 1);
  }
  for (const [k, n] of sums) {
    const [d, id, e] = JSON.parse(k) as [string, string, string];
    await store.increment(d, id, e, n);
  }
  return new Response(null, { status: 204 });
}
