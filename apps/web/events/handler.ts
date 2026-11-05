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

/** 시작 화면 (specs/busan.md 7): the counter ids of its two events — `start:view`, and `start:<how>:<why>:<dest>` for each
 * way it was left. Not places (`start:` prefix). */
export const START_IDS: readonly string[] = [
  'start:view',
  ...['gps', 'pick'].flatMap((how) => ['denied', 'outside', 'unavailable', 'none'].flatMap((why) => ['jeju', 'busan', 'gangwon', 'seoul', 'nation'].map((dest) => `start:${how}:${why}:${dest}`))),
];

/** 오늘 서울 둘러보기 (ADR-0114 7): the counter ids of its events — `browse:open`, `browse:card`, `browse:go` / `browse:more` / `browse:post` (ADR-0118), and
 * for each time it was left one under each of `browse:secs:<0…600 in fives>`, `browse:rows:<0…10>`, `browse:cards:<0…2>` (so the
 * median stay and the share of openings with a card pressed can be read). Not places (`browse:` prefix). */
export const BROWSE_IDS: readonly string[] = [
  'browse:open',
  'browse:card',
  'browse:go',
  'browse:more',
  'browse:post',
  ...Array.from({ length: 121 }, (_, i) => `browse:secs:${i * 5}`),
  ...Array.from({ length: 11 }, (_, i) => `browse:rows:${i}`),
  ...[0, 1, 2].map((n) => `browse:cards:${n}`),
];

/** The counter ids an event goes up under (day and event stay its own). */
function idsOf(ev: UsageEvent): string[] {
  if (ev.id?.startsWith('src:')) return [ev.id]; // 숙소 링크 (ADR-0089)
  if (ev.e === 'start_view') return ['start:view'];
  if (ev.e === 'start_done') return [`start:${ev.how}:${ev.why}:${ev.dest}`];
  if (ev.e === 'browse_open') return ['browse:open'];
  if (ev.e === 'browse_card') return ['browse:card'];
  if (ev.e === 'browse_link') return [`browse:${ev.link}`];
  if (ev.e === 'browse_done') return [`browse:secs:${ev.secs}`, `browse:rows:${ev.rows}`, `browse:cards:${ev.cards}`];
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
  // no more than MAX_BYTES is ever read. A length that says more is turned away at once; a missing one is not
  // (unlike /api/feedback): this is what the pilot is measured with, and reading stops past MAX_BYTES anyway
  const length = req.headers.get('content-length');
  if (length !== null && !(Number(length) <= MAX_BYTES)) return new Response(null, { status: 413 });
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
