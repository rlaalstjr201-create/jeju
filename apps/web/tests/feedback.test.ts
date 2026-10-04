// 의견 보내기 받는 쪽 (ADR-0081, specs/survey.md F3): what is accepted, the daily cap, and that nothing of the
// request but its answers is stored.
import { describe, expect, it } from 'vitest';
import { d1FeedbackStore, type D1Like } from '../events/d1';
import { FEEDBACK_DAILY_CAP, handleFeedback, memoryFeedbackStore, parseFeedback } from '../events/feedback';
import { onRequest } from '../functions/api/feedback';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://yeogwi.pages.dev/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
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
