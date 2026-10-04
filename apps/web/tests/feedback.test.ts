// 의견 보내기 받는 쪽 (ADR-0081, specs/survey.md F3): what is accepted, the daily cap, and that nothing of the
// request but its answers is stored.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countSince, d1FeedbackStore, type D1Like } from '../events/d1';
import { FEEDBACK_DAILY_CAP, handleFeedback, memoryFeedbackStore, parseFeedback } from '../events/feedback';
import { onRequest } from '../functions/api/feedback';

/** what the app sends: JSON with its type and length; `headers` may override either */
const post = (body: unknown, headers: Record<string, string> = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://yeogwi.pages.dev/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), ...headers },
    body: text,
  });
};
/** 2026-10-04 23:30 KST */
const lateNight = () => new Date('2026-10-04T14:30:00Z');

describe('F3 받는 쪽 — 검증', () => {
  it('accepts what the app sends: any one answer, or all of them', () => {
    expect(parseFeedback(JSON.stringify({ went: 'went', v: 'abc1234' }))).toEqual({ ok: true, feedback: { went: 'went', v: 'abc1234' } });
    const all = { went: 'yet', pains: ['far', 'slow'], pain: '  주차가 어려웠어요 ', wish: '영업시간', v: 'dev' };
    expect(parseFeedback(JSON.stringify(all))).toEqual({ ok: true, feedback: { ...all, pain: '주차가 어려웠어요' } });
    expect(parseFeedback(JSON.stringify({ wish: '가'.repeat(500), v: 'dev' })).ok).toBe(true);
  });

  it.each([
    ['no answer', { v: 'dev' }],
    ['unknown went', { went: 'maybe', v: 'dev' }],
    ['unknown pain', { pains: ['far', 'rude'], v: 'dev' }],
    ['repeated pain', { pains: ['far', 'far'], v: 'dev' }],
    ['empty pains', { pains: [], v: 'dev' }],
    ['501 characters', { wish: '가'.repeat(501), v: 'dev' }],
    ['blank text', { pain: '   ', v: 'dev' }],
    ['text not a string', { wish: 5, v: 'dev' }],
    ['unknown field', { went: 'went', v: 'dev', lat: 33.5 }],
    ['place id', { went: 'went', v: 'dev', id: 'abc' }],
    ['no version', { went: 'went' }],
    ['odd version', { went: 'went', v: '<script>' }],
    ['array', [{ went: 'went', v: 'dev' }]],
  ])('refuses %s', (_, body) => {
    const r = parseFeedback(JSON.stringify(body));
    expect(r.ok).toBe(false);
  });

  it('only POST; a body over 4 KB is refused (declared or not); not JSON is 400', async () => {
    const store = memoryFeedbackStore();
    expect((await handleFeedback(new Request('https://x/api/feedback'), store)).status).toBe(405);
    expect((await handleFeedback(post({ went: 'went', v: 'dev' }, { 'content-length': '5000' }), store)).status).toBe(413);
    expect((await handleFeedback(post(JSON.stringify({ went: 'went', v: 'dev' }) + ' '.repeat(4096)), store)).status).toBe(413);
    expect((await handleFeedback(post('{'), store)).status).toBe(400);
    expect(store.rows).toEqual([]);
  });
});

describe('F3 받는 쪽 — 저장', () => {
  it('one row: the Jeju day (no time), the answers and the version — nothing from the headers', async () => {
    const store = memoryFeedbackStore();
    const res = await handleFeedback(
      post({ went: 'not', pains: ['closed'], wish: '주차 정보', v: 'abc1234' }, { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'UA-Test/1.0', cookie: 'sid=secret' }),
      store,
      lateNight,
    );
    expect(res.status).toBe(204);
    expect(store.rows).toEqual([{ day: '2026-10-04', went: 'not', pains: ['closed'], wish: '주차 정보', v: 'abc1234' }]);
    const kept = JSON.stringify(store.rows);
    for (const s of ['203.0.113.7', 'UA-Test', 'secret', 'T14', ':30']) expect(kept).not.toContain(s);
  });

  it(`at most ${FEEDBACK_DAILY_CAP} rows a Jeju day; past it the answer is still 204 and nothing is kept; the next day starts again`, async () => {
    const store = memoryFeedbackStore();
    for (let i = 0; i < FEEDBACK_DAILY_CAP + 3; i++) expect((await handleFeedback(post({ went: 'went', v: 'dev' }), store, lateNight)).status).toBe(204);
    expect(store.rows.length).toBe(FEEDBACK_DAILY_CAP);
    await handleFeedback(post({ went: 'yet', v: 'dev' }), store, () => new Date('2026-10-04T15:00:00Z'));
    expect(store.rows.at(-1)).toEqual({ day: '2026-10-05', went: 'yet', v: 'dev' });
  });

  it('D1: one statement checks the cap and inserts; pains as a JSON array, missing answers as NULL', async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const db: D1Like = {
      prepare: (sql) => {
        const stmt = {
          args: [] as unknown[],
          bind(...a: unknown[]) {
            stmt.args = a;
            return stmt;
          },
          run: async () => (calls.push({ sql, args: stmt.args }), { meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
          first: async () => null,
        };
        return stmt as never;
      },
    };
    expect(await d1FeedbackStore(db).add({ day: '2026-10-04', pains: ['far', 'gps'], v: 'dev' }, 200)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/INSERT INTO feedback .* WHERE \(SELECT COUNT\(\*\) FROM feedback WHERE day = \?1\) < \?7/);
    expect(calls[0].args).toEqual(['2026-10-04', null, '["far","gps"]', null, null, 'dev', 200]);
  });

  it('the function: no database is 503; an error is 503; every answer no-store', async () => {
    const none = await onRequest({ request: post({ went: 'went', v: 'dev' }), env: {} });
    expect(none.status).toBe(503);
    expect(none.headers.get('cache-control')).toBe('no-store');
    const broken: D1Like = {
      prepare: () => {
        throw new Error('down');
      },
    };
    const err = await onRequest({ request: post({ went: 'went', v: 'dev' }), env: { EVENTS_DB: broken } });
    expect(err.status).toBe(503);
    expect(err.headers.get('cache-control')).toBe('no-store');
  });
});

describe('F3 받는 쪽 — 리뷰 반영', () => {
  it('JSON only (415 otherwise: a cross-site form cannot post); no length is 411', async () => {
    const store = memoryFeedbackStore();
    expect((await handleFeedback(post({ went: 'went', v: 'dev' }, { 'content-type': 'application/x-www-form-urlencoded' }), store)).status).toBe(415);
    expect((await handleFeedback(post({ went: 'went', v: 'dev' }, { 'content-type': 'text/plain' }), store)).status).toBe(415);
    const noLength = new Request('https://x/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"went":"went","v":"dev"}' });
    expect(noLength.headers.get('content-length')).toBeNull();
    expect((await handleFeedback(noLength, store)).status).toBe(411);
    expect((await handleFeedback(post({ went: 'went', v: 'dev' }, { 'content-type': 'application/json; charset=utf-8' }), store)).status).toBe(204);
  });

  it('a body longer than it said is cut off at 4 KB while it is read (413), nothing stored', async () => {
    const store = memoryFeedbackStore();
    let pulled = 0;
    const chunk = new TextEncoder().encode(' '.repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 100) c.close();
        else c.enqueue(chunk);
      },
    });
    const req = new Request('https://x/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20' }, body: stream, duplex: 'half' } as RequestInit);
    expect((await handleFeedback(req, store)).status).toBe(413);
    expect(pulled).toBeLessThan(10);
    expect(store.rows).toEqual([]);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['bell', 'a\u0007b'],
    ['carriage return', 'a\rb'],
    ['escape', 'a\u001b[31mb'],
    ['DEL', 'a\u007fb'],
    ['bidi override', 'a\u202eb'],
    ['bidi isolate', 'a\u2066b'],
  ])('text with a control or bidi character (%s) is 400', (_, wish) => {
    expect(parseFeedback(JSON.stringify({ wish, v: 'dev' })).ok).toBe(false);
  });

  it('a newline and a tab are fine', () => {
    expect(parseFeedback(JSON.stringify({ wish: '주차\n정보\t있으면', v: 'dev' })).ok).toBe(true);
  });

  it('an answer the cap turns away is counted (day only), not kept', async () => {
    const store = memoryFeedbackStore();
    for (let i = 0; i < FEEDBACK_DAILY_CAP + 2; i++) await handleFeedback(post({ went: 'went', v: 'dev' }), store, lateNight);
    expect(store.cappedByDay).toEqual(new Map([['2026-10-04', 2]]));
  });
});

describe('F3 상한 — 실제 SQLite (node:sqlite, 마이그레이션 그대로)', () => {
  it('the 201st insert of a day is not kept and is counted under feedback:capped; the next day starts again', async () => {
    // node:sqlite (Node 22.13+); @types/node 20 has no types for it, so only what is used here
    type Stmt = { run(...a: unknown[]): { changes: number | bigint }; all(...a: unknown[]): unknown[]; get(...a: unknown[]): unknown };
    type Sqlite = { exec(sql: string): void; prepare(sql: string): Stmt; close(): void };
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Sqlite };
    const sqlite = new DatabaseSync(':memory:');
    for (const f of ['0001_events.sql', '0002_feedback.sql']) sqlite.exec(readFileSync(resolve(__dirname, '../migrations', f), 'utf8'));
    const db: D1Like = {
      prepare(sql) {
        const st = sqlite.prepare(sql);
        let args: unknown[] = [];
        const stmt = {
          bind: (...a: unknown[]) => ((args = a), stmt),
          run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
          all: async () => ({ results: st.all(...args) }),
          first: async () => st.get(...args) ?? null,
        };
        return stmt as never;
      },
    };
    const store = d1FeedbackStore(db);
    for (let i = 0; i < FEEDBACK_DAILY_CAP + 1; i++) expect((await handleFeedback(post({ went: 'went', pains: ['far'], v: 'dev' }), store, lateNight)).status).toBe(204);
    await handleFeedback(post({ wish: '다음 날', v: 'dev' }), store, () => new Date('2026-10-04T15:00:00Z'));
    const days = sqlite.prepare('SELECT day, COUNT(*) AS n FROM feedback GROUP BY day ORDER BY day').all();
    expect(days).toEqual([
      { day: '2026-10-04', n: FEEDBACK_DAILY_CAP },
      { day: '2026-10-05', n: 1 },
    ]);
    expect(sqlite.prepare('SELECT day, id, event, n FROM counters').all()).toEqual([{ day: '2026-10-04', id: 'feedback:capped', event: 'capped', n: 1 }]);
    expect(sqlite.prepare('SELECT * FROM feedback LIMIT 1').get()).toEqual({ day: '2026-10-04', went: 'went', pains: '["far"]', pain: null, wish: null, v: 'dev' });
    expect(await countSince(db, '2026-10-01')).toBe(0); // the cap count is not a usage event (health)
    sqlite.close();
  });
});
