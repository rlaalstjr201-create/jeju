// Where the counters live. Only an interface and an in-memory version for now: the real store (KV, D1, …)
// comes with the host (ADR-0061 5).

/** One day × place × event count. `id` is the place, or `mood:<mood>` for a mood tap. */
export interface Counter {
  d: string;
  id: string;
  e: string;
  n: number;
}

export interface CounterStore {
  increment(d: string, id: string, e: string, by?: number): Promise<void>;
  /** every counter, for the build-time aggregate. */
  dump(): Promise<Counter[]>;
}

export function memoryStore(): CounterStore {
  const m = new Map<string, Counter>();
  return {
    async increment(d, id, e, by = 1) {
      const k = JSON.stringify([d, id, e]);
      const c = m.get(k);
      if (c) c.n += by;
      else m.set(k, { d, id, e, n: by });
    },
    async dump() {
      return [...m.values()].map((c) => ({ ...c }));
    },
  };
}
