// 시작 화면 (ADR-0096, specs/busan.md 1.2): index.html's inline scripts decide that it shows and draw it before the first
// paint (`.yc-start`, #ycStart, the words of the page's language in window.__ycT). This module takes it over once the app
// runs: the big button reads the position (the app's locate: inside an open destination or `outside`), the two
// destination buttons choose, and with location already allowed it reads without asking (M4: the cover is there from
// the first paint and only ever goes away). Used only with the switch on (app.ts).
import type { Dest } from './dest';
import { locateGps, type GeoDeps } from './effects';
import type { Point } from './pick';
import { releasedDestOf } from './release';
import type { NoOrigin } from './types';

/** The start screen's words, in the order index.html's table keeps them per language (window.__ycT). */
export interface StartWords {
  title: string;
  gps: string;
  note: string;
  or: string;
  jeju: string;
  busan: string;
  locating: string;
  denied: string;
  unavailable: string;
  retry: string;
  outside: string;
}

export interface StartScreen {
  /** what it shows now: the first state, reading, or why the position could not be used */
  state(): 'start' | 'locating' | NoOrigin;
}

interface Inline {
  __ycT?: string[];
  __startPick?: string;
  __startTap?: unknown;
}

export interface StartDeps {
  geo: GeoDeps;
  signal: AbortSignal;
  /** chosen: by the position (`point`) or a button (`why` = what the position said before, if anything) */
  choose(d: Dest, how: 'gps' | 'pick', why: NoOrigin | null, point?: Point): void;
}

export function mountStart(doc: Document, deps: StartDeps): StartScreen | null {
  const box = doc.getElementById('ycStart');
  const w = doc.defaultView as (Window & Inline) | null;
  const a = w?.__ycT;
  const T: Pick<StartWords, 'gps' | 'locating' | NoOrigin> | null = a ? { gps: a[1], locating: a[6], denied: a[7], unavailable: a[8], outside: a[10] } : null;
  const big = doc.getElementById('ycGps') as HTMLButtonElement | null;
  const msg = doc.getElementById('ycMsg');
  const note = doc.getElementById('ycNote');
  const retry = doc.getElementById('ycRetry');
  if (!box || !T || !big || !msg || !note || !retry) return null;
  let now: 'start' | 'locating' | NoOrigin = 'start';
  let done = false;

  function close() {
    done = true;
    doc.documentElement.classList.remove('yc-start');
    box!.remove();
  }
  function show(next: 'start' | 'locating' | NoOrigin) {
    now = next;
    const failed = next !== 'start' && next !== 'locating';
    big!.hidden = failed;
    big!.disabled = next === 'locating';
    big!.textContent = next === 'locating' ? T!.locating : T!.gps;
    note!.hidden = failed;
    msg!.hidden = !failed;
    msg!.textContent = failed ? T![next] : '';
    retry!.hidden = next !== 'unavailable';
    // the big button that had the focus is gone: the message's first way on takes it
    const lost = !doc.activeElement || doc.activeElement === doc.body || doc.activeElement === big;
    if (failed && lost) (next === 'unavailable' ? retry! : box!.querySelector<HTMLElement>('[data-dest]'))?.focus();
  }
  function pick(d: string | undefined) {
    if (done || (d !== 'jeju' && d !== 'busan')) return;
    const why = now === 'start' || now === 'locating' ? null : now;
    close();
    deps.choose(d, 'pick', why);
  }
  /** `quiet`: location already allowed, nobody pressed anything — a failure leaves the first state (outside says so) */
  function gps(quiet = false) {
    if (done || now === 'locating') return;
    show('locating');
    void locateGps(deps.geo).then((r) => {
      if (done || deps.signal.aborted) return;
      const d = r.ok ? releasedDestOf(r.point) : null;
      if (r.ok && d) {
        close();
        deps.choose(d, 'gps', null, r.point);
      } else show(quiet && (r.ok || r.why !== 'outside') ? 'start' : r.ok ? 'outside' : r.why);
    });
  }

  const on = (type: string, fn: (e: Event) => void) => doc.addEventListener(type, fn, { signal: deps.signal });
  on('yc:dest', (e) => pick((e as CustomEvent<string>).detail));
  on('yc:start-gps', () => gps());
  // pressed before this module ran (index.html kept it)
  const early = w!.__startPick ?? null;
  const tapped = !!w!.__startTap;
  delete w!.__startPick;
  delete w!.__startTap;
  if (early) pick(early);
  else if (tapped) gps();
  else
    void deps.geo.geoPermission?.().then(
      (p) => p === 'granted' && gps(true),
      () => undefined,
    );
  return { state: () => now };
}
