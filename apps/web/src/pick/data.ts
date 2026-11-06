// spots.json loader. Memoized on success only: a failed fetch (offline first visit, flaky Wi-Fi, 5xx) is
// forgotten so the next tap or "다시 불러오기" fetches again (S24). Each wait times out after 10s (design.md M2); a download
// that lands after that is still kept.
import type { BookKind, Mood, Spot, Sub } from './pick';
import { validSeason } from './season';

const MOODS: readonly Mood[] = ['rest', 'walk', 'new', 'food'];
const SUBS: readonly Sub[] = ['meal', 'cafe'];
const BOOK_KINDS: readonly BookKind[] = ['naver', 'mrt', 'visitjeju', 'homepage', 'phone'];
/** Collapse any run of whitespace (tabs, U+3000 …) and trim — the build does this too (S32). */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();
/** A reason is a card caption: no final full stop whatever the ending, 돈까스 spelled 돈가스 (design/SPEC.md
 * §10·§12.4, 3판). Same rule as the build's shipReason (scripts/reason.mjs). */
export function cleanReason(s: string): string {
  return cleanName(s).replace(/돈까스/g, '돈가스').replace(/[\s.。．｡]+$/, '');
}

function validMarket(m: unknown): boolean {
  if (!m || typeof m !== 'object') return false;
  const { days, label } = m as Record<string, unknown>;
  return Array.isArray(days) && days.every((d) => Number.isInteger(d)) && typeof label === 'string' && label.length > 0;
}

/** 노을 볼 곳 (ADR-0083): a non-empty list of the three azimuths. */
const validSunset = (v: unknown): boolean => Array.isArray(v) && v.length > 0 && v.every((a) => a === 242 || a === 264 || a === 298);
/** 노을 (Amendment 1): the calculation's own azimuths, maybe none. */
const validSea = (v: unknown): boolean => Array.isArray(v) && v.every((a) => a === 242 || a === 264 || a === 298);

/** 영업시간 (specs/open-now.md 2): weekdays 0–6 (not all seven) and/or a span of minutes, start before end, start in the
 * day, end within the next. */
function validHours(h: unknown): boolean {
  if (!h || typeof h !== 'object') return false;
  const { c, o } = h as Record<string, unknown>;
  if (c === undefined && o === undefined) return false;
  if (c !== undefined && !(Array.isArray(c) && c.length > 0 && c.length < 7 && c.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return false;
  if (o !== undefined && !(Array.isArray(o) && o.length === 2 && o.every((m) => Number.isInteger(m)) && o[0] >= 0 && o[0] < 1440 && o[1] > o[0] && o[1] <= 2880)) return false;
  return true;
}

/** A booking route the card can link to (ADR-0074): a known kind and an https/http page, or tel: for phone. */
function validBook(b: unknown): boolean {
  if (!b || typeof b !== 'object') return false;
  const { k, u } = b as Record<string, unknown>;
  if (!BOOK_KINDS.includes(k as BookKind) || typeof u !== 'string') return false;
  return k === 'phone' ? /^tel:\+?\d{7,13}$/.test(u) : /^https?:\/\//.test(u);
}

/** Drops records the app cannot render and places marked hidden (ADR-0074: closed); normalizes names and reasons.
 * The shipped file already passes S1'. */
export function normalizeSpots(raw: unknown): Spot[] {
  if (!Array.isArray(raw)) throw new Error('spots.json is not an array');
  const out: Spot[] = [];
  normalizeInto(out, raw, 0, raw.length);
  return out;
}

/** normalizeSpots a slice at a time, each after a `pause()` (a turn for the browser): on a phone the whole list in
 * one go, right after its parse, was one of the first load's long tasks (audit 2026-10-15 렉 §2). The same list
 * comes out. */
export async function normalizeSpotsIn(raw: unknown, pause: () => Promise<void>, slice = 1000): Promise<Spot[]> {
  if (!Array.isArray(raw)) throw new Error('spots.json is not an array');
  const out: Spot[] = [];
  for (let i = 0; i < raw.length; i += slice) {
    await pause();
    normalizeInto(out, raw, i, Math.min(raw.length, i + slice));
  }
  return out;
}

function normalizeInto(out: Spot[], raw: unknown[], from: number, to: number) {
  for (let i = from; i < to; i++) {
    const r = raw[i] as Record<string, unknown>;
    if (!r || typeof r !== 'object') continue;
    const { id, name, lat, lng, mood, reason, image } = r;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof reason !== 'string' || typeof image !== 'string') continue;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!MOODS.includes(mood as Mood)) continue;
    if (mood === 'food' && !SUBS.includes(r.sub as Sub)) continue;
    if (r.hide) continue;
    const spot = r as unknown as Spot;
    const clean = cleanName(name);
    const why = cleanReason(reason);
    // 만족도 (ADR-0060): the shipped file always has 1–5; anything else ranks as the middle (모르면 3).
    const score = Number.isInteger(r.score) && (r.score as number) >= 1 && (r.score as number) <= 5 ? (r.score as number) : 3;
    // 오일장 (ADR-0066): a rule the app cannot read is dropped — the place stays, without 장날.
    const badMarket = 'market' in r && !validMarket(r.market);
    // 예약 경로 (ADR-0074): a route the app cannot open is dropped — the 체험 then leaves the picks.
    const badBook = 'book' in r && !validBook(r.book);
    // 철 (ADR-0080): a season the app cannot read is dropped — the place stays, without 철.
    const badSeason = 'season' in r && !validSeason(r.season);
    // 노을 (ADR-0083): a list the app cannot read is dropped — the place stays, off the 노을 row.
    const badSunset = 'sunsetView' in r && !validSunset(r.sunsetView);
    const badSea = 'sunsetSea' in r && !validSea(r.sunsetSea);
    // 야외 산길 (ADR-0091): only `true` counts — anything else is dropped, the place stays as an ordinary one.
    const badTrail = 'trail' in r && r.trail !== true;
    // 유명한 곳 (ADR-0092): the same — only `true` counts.
    const badFamous = 'famous' in r && r.famous !== true;
    // 예약 없이 가는 곳 (ADR-0074 Amendment 1): only `true` counts — anything else is dropped (the 체험 then needs a route).
    const badWalkin = 'walkin' in r && r.walkin !== true;
    // 인기 (ADR-0092 Amendment 2): a number 0–1, or it is dropped (the place ranks as the least looked for).
    const badPop = 'pop' in r && !(typeof r.pop === 'number' && r.pop >= 0 && r.pop <= 1);
    // 영업시간 (specs/open-now.md): hours the app cannot read are dropped — the place stays, its hours unknown.
    const badHours = 'hours' in r && !validHours(r.hours);
    if (clean === name && why === reason && score === r.score && !badMarket && !badBook && !badSeason && !badSunset && !badSea && !badTrail && !badFamous && !badPop && !badWalkin && !badHours) {
      out.push(spot);
      continue;
    }
    const fixed: Spot = { ...spot, name: clean, reason: why, score };
    if (badMarket) delete fixed.market;
    if (badBook) delete fixed.book;
    if (badSeason) delete fixed.season;
    if (badSunset) delete fixed.sunsetView;
    if (badSea) delete fixed.sunsetSea;
    if (badTrail) delete fixed.trail;
    if (badFamous) delete fixed.famous;
    if (badWalkin) delete fixed.walkin;
    if (badPop) delete fixed.pop;
    if (badHours) delete fixed.hours;
    out.push(fixed);
  }
}

export interface SpotSource {
  get(): Promise<Spot[]>;
  /** The loaded list, if any attempt has succeeded. */
  peek(): Spot[] | null;
  dispose(): void;
}

/**
 * `onLoad`: called once, when the list first arrives — also when it arrives after every caller has given up
 * waiting for it (a slow download that outlived its timeout), so the app can use it then.
 * `pause`: a turn for the browser between slices of the tidying (normalizeSpotsIn); missing = all at once.
 */
export function createSpotSource(load: () => Promise<unknown>, timeoutMs = 10000, onLoad?: (spots: Spot[]) => void, pause?: () => Promise<void>): SpotSource {
  let value: Spot[] | null = null;
  /** The download new callers join. The timeout only ends a caller's wait: the download keeps going, and the
   * first one to land is kept — a slow network is not sent round a 10s error loop though a full copy arrived.
   * A caller that times out unjoins it, so the next one starts afresh (a hung request is never the only hope). */
  let current: Promise<Spot[]> | null = null;
  const waiting = new Set<(spots: Spot[]) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  function start(): Promise<Spot[]> {
    const p = Promise.resolve()
      .then(load)
      .then(async (raw) => {
        if (!pause) return normalizeSpots(raw);
        const spots = await normalizeSpotsIn(raw, pause);
        await pause(); // the first draw with the list (onLoad) gets a task of its own
        return spots;
      });
    p.then(
      (spots) => {
        if (current === p) current = null;
        if (value || disposed) return;
        value = spots;
        for (const landed of [...waiting]) landed(spots);
        onLoad?.(spots);
      },
      () => {
        if (current === p) current = null; // do not memoize the failure
      },
    );
    return p;
  }

  return {
    get() {
      if (value) return Promise.resolve(value);
      const attempt = (current ??= start());
      return new Promise<Spot[]>((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          timers.delete(timer);
          waiting.delete(landed);
        };
        // any download landing ends this wait, not only the one it joined
        const landed = (spots: Spot[]) => {
          done();
          resolve(spots);
        };
        const timer = setTimeout(() => {
          done();
          if (current === attempt) current = null;
          reject(new Error('timeout'));
        }, timeoutMs);
        timers.add(timer);
        waiting.add(landed);
        attempt.catch((e) => {
          done();
          reject(e);
        });
      });
    },
    peek: () => value,
    dispose() {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      waiting.clear();
    },
  };
}
