// 서울 홈 선반 최신화 (ADR-0124, specs/seoul-freshness.md): which cards lead a shelf today — the newly added first, the
// shelf shuffled by the KST day within distance (and, for the day's events, prominence) bands, a card seen often and never
// pressed a band back, and every fourth place for one seen less. Only yesterday's record is used, so a day's order is the
// same however often the home is drawn. The record (cards seen and pressed) stays on this device. In the culture chunk only.

/** what a card was on its shelf (browse_card's `slot`): 새로 들어옴, 당겨옴 (an exploring place), or 기본 */
export type Slot = 'new' | 'pull' | 'base';
export const SLOTS: readonly Slot[] = ['new', 'pull', 'base'];

/** added this many days ago or less (today − added < FRESH_DAYS) is 새로 들어옴 */
export const FRESH_DAYS = 7;
/** at most this many 새로 들어옴 lead a shelf */
export const NEW_FRONT = 3;
/** every this many-th place is an exploring one */
export const EXPLORE_EVERY = 4;
/** seen more than this and never pressed: a band back */
export const STALE_SHOWS = 3;
/** a new or pulled card is never more than this farther than the card it goes ahead of */
export const PULL_KM = 2;

/** yesterday's record of a card: seen (visits it was on screen), pressed */
export interface Prior {
  n: number;
  t: number;
}
export interface Fresh {
  /** today, KST (YYYY-MM-DD) */
  day: string;
  prior: (id: string) => Prior;
}

const DAY_MS = 86_400_000;
const dayNum = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
/** days from `added` to `day`; NaN when either is not a day */
const daysSince = (added: string, day: string) => dayNum(day) - dayNum(added);
export const isNewly = (added: string | undefined, day: string): boolean => {
  if (!added) return false;
  const n = daysSince(added, day);
  return n >= 0 && n < FRESH_DAYS;
};
/** the day's number (days since 1970-01-01): the shelves' rotation */
export const dayIndex = (day: string): number => dayNum(day) || 0;

/** FNV-1a of the day and the id: the same day, the same order */
export function seeded(day: string, id: string): number {
  let h = 0x811c9dc5;
  const s = `${day}|${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** distance bands: under 1, 2.5, 5, 10 km, beyond (no basis: one band) */
export const bandOfKm = (km: number | null): number => (km === null ? 0 : km < 1 ? 0 : km < 2.5 ? 1 : km < 5 ? 2 : km < 10 ? 3 : 4);

export interface Arrangeable {
  id: string;
  km: number | null;
  /** its band (bandOfKm, the day's events with prominence ahead of it) */
  tier: number;
  isNew: boolean;
}

/** A shelf's cards in today's order, each with its slot. `list`: every card that may go on it (open now, in reach). */
export function arrange<T extends Arrangeable>(list: readonly T[], fresh: Fresh): { card: T; slot: Slot }[] {
  const prior = new Map(list.map((c) => [c.id, fresh.prior(c.id)]));
  const seen = (c: T) => prior.get(c.id)!.n;
  const stale = (c: T) => (seen(c) > STALE_SHOWS && prior.get(c.id)!.t === 0 ? 1 : 0);
  const hash = new Map(list.map((c) => [c.id, seeded(fresh.day, c.id)]));
  // a stale card goes behind the next band (and ahead of the one after it)
  const key = (c: T) => 2 * c.tier + 3 * stale(c);
  const left = [...list].sort((a, b) => key(a) - key(b) || hash.get(a.id)! - hash.get(b.id)! || (a.id < b.id ? -1 : 1));
  const near = (c: T, at: T | undefined) => !at || c.km === null || at.km === null || c.km <= at.km + PULL_KM;
  const out: { card: T; slot: Slot }[] = [];
  const take = (c: T, slot: Slot) => {
    left.splice(left.indexOf(c), 1);
    out.push({ card: c, slot: c.isNew ? 'new' : slot });
  };
  // 새로 들어옴 first, none farther than the card it goes ahead of allows
  while (out.length < NEW_FRONT) {
    const c = left.find((x) => x.isNew && near(x, left[0]));
    if (!c) break;
    take(c, 'new');
  }
  while (left.length) {
    const head = left[0];
    if ((out.length + 1) % EXPLORE_EVERY === 0) {
      let best: T | null = null;
      for (const c of left) if (c !== head && near(c, head) && seen(c) < seen(head) && (!best || seen(c) < seen(best))) best = c;
      if (best) {
        take(best, 'pull');
        continue;
      }
    }
    take(head, 'base');
  }
  return out;
}

// --- the record on this device (ADR-0124 2): localStorage, validated on reading, never sent ---

export const CARDS_KEY = 'jeju.cards';
export const MAX_CARDS = 600;
export const KEEP_DAYS = 30;
/** [seen, pressed, last day, seen at that day's start, pressed at that day's start] */
type Entry = [number, number, string, number, number];
type Book = Record<string, Entry>;

const count = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1e6;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A stored record, repaired: bad entries and those last touched KEEP_DAYS or more before `day` dropped, at most MAX_CARDS
 * (the latest kept). */
export function parseBook(raw: unknown, day: string): Book {
  const c = raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 1 ? (raw as { c?: unknown }).c : null;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return {};
  const ok: [string, Entry][] = [];
  for (const [id, e] of Object.entries(c as Record<string, unknown>)) {
    if (!Array.isArray(e) || e.length !== 5 || !count(e[0]) || !count(e[1]) || typeof e[2] !== 'string' || !DAY.test(e[2]) || !count(e[3]) || !count(e[4])) continue;
    if (id.length > 80 || e[3] > e[0] || e[4] > e[1]) continue;
    const age = daysSince(e[2], day);
    if (!(age < KEEP_DAYS)) continue;
    ok.push([id, e as Entry]);
  }
  ok.sort((a, b) => (a[1][2] < b[1][2] ? 1 : a[1][2] > b[1][2] ? -1 : 0));
  return Object.fromEntries(ok.slice(0, MAX_CARDS));
}

/** yesterday's record of `id` on `day` */
export function priorOf(book: Book, id: string, day: string): Prior {
  const e = book[id];
  if (!e) return { n: 0, t: 0 };
  return e[2] < day ? { n: e[0], t: e[1] } : { n: e[3], t: e[4] };
}

/** One more seen (`what` 0) or pressed (1) of `id` on `day`. */
export function bump(book: Book, id: string, day: string, what: 0 | 1): void {
  const e = book[id];
  const next: Entry = !e ? [0, 0, day, 0, 0] : e[2] < day ? [e[0], e[1], day, e[0], e[1]] : e;
  next[what]++;
  book[id] = next;
}

/** The record as this visit keeps it: read once, written a second after a change and when the page is hidden. */
export interface Cards {
  fresh(day: string): Fresh;
  seen(id: string, day: string): void;
  pressed(id: string, day: string): void;
}
export function cardsStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null, today: string, later: (f: () => void) => void = (f) => void setTimeout(f, 1000)): Cards & { flush(): void } {
  let book: Book = {};
  try {
    book = parseBook(JSON.parse(storage?.getItem(CARDS_KEY) ?? 'null'), today);
  } catch {
    book = {};
  }
  let due = false;
  const flush = () => {
    due = false;
    try {
      const ids = Object.keys(book);
      if (ids.length > MAX_CARDS) book = parseBook({ v: 1, c: book }, today);
      storage?.setItem(CARDS_KEY, JSON.stringify({ v: 1, c: book }));
    } catch {
      // full or refused: kept in memory for this visit
    }
  };
  const touch = () => {
    if (due) return;
    due = true;
    later(flush);
  };
  return {
    fresh: (day) => ({ day, prior: (id) => priorOf(book, id, day) }),
    seen(id, day) {
      bump(book, id, day, 0);
      touch();
    },
    pressed(id, day) {
      bump(book, id, day, 1);
      touch();
    },
    flush,
  };
}
