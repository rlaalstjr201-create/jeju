// The counters in Cloudflare D1 (ADR-0078 1): table `counters` (migrations/0001_events.sql), one row per
// day × place × event. Only the few D1 calls used here are typed, so the collector needs no Workers types.
import type { Counter, CounterStore } from './store';

export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
}

export function d1Store(db: D1Like): CounterStore {
  return {
    async increment(d, id, e, by = 1) {
      await db
        .prepare('INSERT INTO counters (day, id, event, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, id, event) DO UPDATE SET n = n + excluded.n')
        .bind(d, id, e, by)
        .run();
    },
    async dump() {
      const { results } = await db.prepare('SELECT day AS d, id, event AS e, n FROM counters').all<Counter>();
      return results;
    },
  };
}

/** Events counted on `day` or later (a primary-key range scan: no ids leave). */
export async function countSince(db: D1Like, day: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM counters WHERE day >= ?1').bind(day).first<{ n: number }>();
  return Number(row?.n ?? 0);
}
