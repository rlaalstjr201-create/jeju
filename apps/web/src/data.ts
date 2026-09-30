// spots.json loader. Memoized on success only: a failed fetch (offline first visit, flaky Wi-Fi, 5xx) is
// forgotten so the next tap or "다시 불러오기" fetches again (S24). Each wait times out after 15s; a download
// that lands after that is still kept.
import type { Mood, Spot, Sub } from './pick';

const MOODS: readonly Mood[] = ['rest', 'walk', 'new', 'food'];
const SUBS: readonly Sub[] = ['meal', 'cafe'];
/** Collapse any run of whitespace (tabs, U+3000 …) and trim — the build does this too (S32). */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();
/** A sentence ending in 요 gets one full stop; a noun ending gets none (design/SPEC.md §10·§12.4). */
export function cleanReason(s: string): string {
  const t = cleanName(s).replace(/[.。]+$/, '');
  return t.endsWith('요') ? `${t}.` : t;
}

/** Drops records the app cannot render; normalizes names and reasons. The shipped file already passes S1'. */
export function normalizeSpots(raw: unknown): Spot[] {
  if (!Array.isArray(raw)) throw new Error('spots.json is not an array');
  const out: Spot[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const { id, name, lat, lng, mood, reason, image } = r;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof reason !== 'string' || typeof image !== 'string') continue;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!MOODS.includes(mood as Mood)) continue;
    if (mood === 'food' && !SUBS.includes(r.sub as Sub)) continue;
    const spot = r as unknown as Spot;
    const clean = cleanName(name);
    const why = cleanReason(reason);
    out.push(clean === name && why === reason ? spot : { ...spot, name: clean, reason: why });
  }
  return out;
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
 */
export function createSpotSource(load: () => Promise<unknown>, timeoutMs = 15000, onLoad?: (spots: Spot[]) => void): SpotSource {
  let value: Spot[] | null = null;
  /** The download new callers join. The timeout only ends a caller's wait: the download keeps going, and the
   * first one to land is kept — a slow network is not sent round a 15s error loop though a full copy arrived.
   * A caller that times out unjoins it, so the next one starts afresh (a hung request is never the only hope). */
  let current: Promise<Spot[]> | null = null;
  const waiting = new Set<(spots: Spot[]) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  function start(): Promise<Spot[]> {
    const p = Promise.resolve().then(load).then(normalizeSpots);
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
