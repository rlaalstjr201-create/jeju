// The counters in Cloudflare D1 (ADR-0078 1): table `counters` (migrations/0001_events.sql), one row per
// day × place × event. Only the few D1 calls used here are typed, so the collector needs no Workers types.
import type { FeedbackStore } from './feedback';
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

/** 의견 보내기 (ADR-0081): table `feedback` (migrations/0002_feedback.sql). The day's cap is checked in the same
 * statement as the insert, so two requests at once cannot both slip past it. `pains` is a JSON array. */
export function d1FeedbackStore(db: D1Like): FeedbackStore {
  return {
    async add(row, cap) {
      const res = (await db
        .prepare(
          'INSERT INTO feedback (day, went, pains, pain, wish, v) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT COUNT(*) FROM feedback WHERE day = ?1) < ?7',
        )
        .bind(row.day, row.went ?? null, row.pains ? JSON.stringify(row.pains) : null, row.pain ?? null, row.wish ?? null, row.v, cap)
        .run()) as { meta?: { changes?: number } } | undefined;
      return (res?.meta?.changes ?? 0) > 0;
    },
  };
}
