// A home-screen app that stays resident never navigates, so after a deploy it would keep running the old
// code with its old data until the OS kills it. The new service worker takes over at once (skipWaiting +
// clients.claim); this module then swaps the page for the new code at a moment nobody is using it: right
// away if the first screen is idle, otherwise the next time the app goes to the background. A reload loses
// nothing — the results and saved list come back from the session record (S54).
// A page that already runs the new code is left alone: the old worker answers navigations network-first, so
// reopening the app after a deploy usually loads the new build before the new worker claims it, and a reload
// then would only flash the screen (and could eat a tap).

export interface UpdateDeps {
  sw: { readonly controller: unknown; addEventListener(type: 'controllerchange', fn: () => void): void };
  doc: Pick<Document, 'visibilityState' | 'addEventListener'>;
  /** the first screen, nothing open, nothing loading. */
  idle(): boolean;
  /** true when the code this page runs is what the new worker serves (checked when it takes over). */
  current(): Promise<boolean>;
  reload(): void;
}

export function reloadOnUpdate({ sw, doc, idle, current, reload }: UpdateDeps): void {
  // The first install also fires controllerchange (clients.claim) — that one brings no new code.
  let controlled = !!sw.controller;
  let stale = false;
  const maybe = () => {
    if (!stale || (doc.visibilityState !== 'hidden' && !idle())) return;
    stale = false;
    reload();
  };
  sw.addEventListener('controllerchange', () => {
    const update = controlled;
    controlled = true;
    if (!update) return;
    // Unknown (the check failed) counts as old code: a needless reload is better than a stale app.
    void Promise.resolve()
      .then(current)
      .catch(() => false)
      .then((same) => {
        if (same) return;
        stale = true;
        maybe();
      });
  });
  doc.addEventListener('visibilitychange', maybe);
}

type Worker = Pick<ServiceWorker, 'state' | 'addEventListener' | 'removeEventListener'>;

/**
 * Resolves once `worker` has finished activating — its activate handler has deleted the old caches. A page the
 * old worker controlled is handed to the new one *before* the activate event runs (the spec's Activate
 * algorithm), so at controllerchange the old build's files are still cached. Gives up after `maxMs`.
 */
export function activated(worker: Worker | null | undefined, maxMs = 10_000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => worker?.state === 'activated' || worker?.state === 'redundant';
    if (!worker || done()) return resolve();
    const finish = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      resolve();
    };
    const check = () => done() && finish();
    const timer = setTimeout(finish, maxMs);
    worker.addEventListener('statechange', check);
  });
}

/**
 * `current()` for the browser: once the new worker has activated, this page's own content-hashed script
 * (`script`, its import.meta.url) and stylesheet are still in the cache — only the new build's cache is left
 * then, so they are the new build's. (An index.html-only edit changes neither and waits for the next launch.)
 * `worker`: the one that just took over — by default this page's controller at the time of the check.
 */
export async function runsCachedCode(
  doc: Pick<Document, 'querySelector'>,
  cache: Pick<CacheStorage, 'match'> | undefined,
  script: string,
  worker: Worker | null | undefined = globalThis.navigator?.serviceWorker?.controller,
): Promise<boolean> {
  if (!cache) return false;
  await activated(worker);
  const css = doc.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href;
  const own = [script, ...(css ? [css] : [])];
  const hits = await Promise.all(own.map((u) => cache.match(u)));
  return hits.every(Boolean);
}
