// scripts/seo/rank-ops.mjs — 주간 순위 운영(ADR-0079): GSC 실적 파일 검증·track 줄·밀림 경보·IndexNow 대상. 네트워크 없음.
import { describe, expect, it } from 'vitest';
import { appendTrack, dropsOf, indexnowDiff, parseSitemap, trackLinesOf, validateGscExport } from '../scripts/seo/rank-ops.mjs';
import type { Candidate } from '../scripts/seo/keyword-gate.mjs';

const gsc = (rows: unknown[]) => ({ date_range: { start: '2026-09-28', end: '2026-10-04' }, rows });
const row = { query: '제주도 무계획 여행', clicks: 1, impressions: 40, ctr: '2.5%', position: 12.34 };

describe('validateGscExport', () => {
  it('accepts a clean export and reads a percent CTR', () => {
    const { errors, rows } = validateGscExport(gsc([row, { ...row, query: '성산 근처 체험', ctr: 0 }]));
    expect(errors).toEqual([]);
    expect(rows[0].ctr).toBeCloseTo(0.025);
  });
  it('rejects bad shapes and returns no rows', () => {
    expect(validateGscExport(null).errors.length).toBe(1);
    expect(validateGscExport({ rows: [] }).errors[0]).toMatch(/date_range/);
    expect(validateGscExport({ date_range: { start: '2026-10-05', end: '2026-10-01' }, rows: [] }).errors[0]).toMatch(/>/);
    const bad = validateGscExport(gsc([{ ...row, clicks: -1 }, { ...row, query: '' }, { ...row, query: 'a', impressions: 1.5 }, { ...row, query: 'b', position: 0 }, { ...row, query: 'c', ctr: 'abc' }, { ...row, query: 'd', clicks: 5, impressions: 2 }]));
    expect(bad.rows).toEqual([]);
    expect(bad.errors.join('\n')).toMatch(/clicks가/);
    expect(bad.errors.join('\n')).toMatch(/query 없음/);
    expect(bad.errors.join('\n')).toMatch(/impressions가/);
    expect(bad.errors.join('\n')).toMatch(/position/);
    expect(bad.errors.join('\n')).toMatch(/ctr/);
    expect(bad.errors.join('\n')).toMatch(/clicks > impressions/);
  });
  it('flags duplicate queries', () => {
    expect(validateGscExport(gsc([row, row])).errors.join()).toMatch(/중복/);
  });
});

describe('trackLinesOf / appendTrack', () => {
  const cands: Candidate[] = [
    { query: '제주도 무계획 여행', verdict: 'target' },
    { query: '성산 근처 체험', verdict: 'target' },
    { query: '애월 산책로', verdict: 'watch' },
  ];
  const naver = { results: [
    { query: '제주도  무계획 여행', status: 'found', found: true, block: '웹문서', position_in_block: 4 },
    { query: '성산 근처 체험', status: 'check_failed' },
  ] };
  it('one line per target; absent GSC rows and blocked lookups stay unknown, never 0', () => {
    const { rows } = validateGscExport(gsc([row]));
    const out = trackLinesOf(cands, '2026-10-05', rows, naver);
    expect(out.map((o) => o.query)).toEqual(['제주도 무계획 여행', '성산 근처 체험']);
    expect(out[0].line).toEqual({ week: '2026-10-05', google_pos: 12.3, impressions: 40, clicks: 1, naver: 'found', naver_pos: 4, naver_block: '웹문서' });
    expect(out[1].line).toEqual({ week: '2026-10-05', gsc: 'absent', naver: 'check_failed' });
    expect(out[1].line).not.toHaveProperty('impressions');
  });
  it('no GSC file → check_failed; no naver file → no naver field', () => {
    const [a] = trackLinesOf(cands, '2026-10-05', null, null);
    expect(a.line).toEqual({ week: '2026-10-05', gsc: 'check_failed' });
  });
  it('not_found is kept distinct from check_failed', () => {
    const [a] = trackLinesOf(cands, 'w', null, { results: [{ query: '제주도 무계획 여행', status: 'not_found', found: false }] });
    expect(a.line.naver).toBe('not_found');
  });
  it('re-importing the same week replaces the line instead of adding one', () => {
    let c: Candidate = { query: 'q', verdict: 'target', track: [{ week: '2026-10-12' }] };
    c = appendTrack(c, { week: '2026-10-05', google_pos: 9 });
    c = appendTrack(c, { week: '2026-10-05', google_pos: 8 });
    expect(c.track).toEqual([{ week: '2026-10-05', google_pos: 8 }, { week: '2026-10-12' }]);
  });
});

describe('dropsOf (밀림 경보)', () => {
  const base = { verdict: 'target', indexed_at: '2026-08-01' };
  const t = (track: NonNullable<Candidate['track']>, extra: Partial<Candidate> = {}): Candidate => ({ query: 'q', ...base, ...extra, track });
  const today = '2026-10-05';
  it('more than 3 places down → flagged; exactly 3 → not', () => {
    expect(dropsOf([t([{ week: 'a', google_pos: 12 }, { week: 'b', google_pos: 16 }])], today).flagged[0]).toMatchObject({ engine: 'google', from: 12, to: 16 });
    expect(dropsOf([t([{ week: 'a', google_pos: 12 }, { week: 'b', google_pos: 15 }])], today).flagged).toEqual([]);
  });
  it('leaving the top 10 → flagged even by one place; improvement → not', () => {
    expect(dropsOf([t([{ week: 'a', google_pos: 10 }, { week: 'b', google_pos: 11 }])], today).flagged[0].why).toMatch(/10위 안 → 밖/);
    expect(dropsOf([t([{ week: 'a', google_pos: 20 }, { week: 'b', google_pos: 5 }])], today).flagged).toEqual([]);
  });
  it('naver: top 10 → not_found is a drop; check_failed is never judged', () => {
    const tr = (cur: object) => [t([{ week: 'a', naver: 'found', naver_pos: 3 } as never, { week: 'b', ...cur } as never])];
    expect(dropsOf(tr({ naver: 'not_found' }), today).flagged[0]).toMatchObject({ engine: 'naver', from: 3 });
    expect(dropsOf(tr({ naver: 'check_failed' }), today).flagged).toEqual([]);
  });
  it('suppressed within 4 weeks of indexed_at, or before indexing is confirmed', () => {
    const drop = [{ week: 'a', google_pos: 5 }, { week: 'b', google_pos: 30 }];
    const r = dropsOf([t(drop, { indexed_at: '2026-09-20' }), t(drop, { query: 'n', indexed_at: undefined })], today);
    expect(r.flagged).toEqual([]);
    expect(r.suppressed.map((s) => s.why).join()).toMatch(/4주 전/);
    expect(r.suppressed.map((s) => s.why).join()).toMatch(/색인일 미확인/);
  });
  it('non-targets and single-week tracks are ignored', () => {
    expect(dropsOf([t([{ week: 'a', google_pos: 5 }, { week: 'b', google_pos: 30 }], { verdict: 'watch' }), t([{ week: 'a', google_pos: 5 }])], today))
      .toEqual({ flagged: [], suppressed: [] });
  });
});

describe('IndexNow diff', () => {
  it('parses urlset and sitemapindex (with entity escapes)', () => {
    const set = parseSitemap('<urlset><url><loc>https://x.dev/a?b=1&amp;c=2</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://x.dev/</loc></url></urlset>');
    expect(set.urls).toEqual([{ loc: 'https://x.dev/a?b=1&c=2', lastmod: '2026-10-01' }, { loc: 'https://x.dev/', lastmod: null }]);
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://x.dev/sitemap-1.xml</loc></sitemap></sitemapindex>').sitemaps).toEqual(['https://x.dev/sitemap-1.xml']);
  });
  it('only URLs added or changed since seed; removed ones are listed, not sent', () => {
    const state = { urls: { 'https://x.dev/': '2026-10-01', 'https://x.dev/a/': '2026-10-01', 'https://x.dev/gone/': null } };
    const d = indexnowDiff(state, [
      { loc: 'https://x.dev/', lastmod: '2026-10-01' },
      { loc: 'https://x.dev/a/', lastmod: '2026-10-08' },
      { loc: 'https://x.dev/new/', lastmod: '2026-10-08' },
    ]);
    expect(d).toEqual({ added: ['https://x.dev/new/'], changed: ['https://x.dev/a/'], removed: ['https://x.dev/gone/'] });
  });
  it('seed state equal to the sitemap → nothing to send', () => {
    const cur = [{ loc: 'https://x.dev/', lastmod: null }];
    expect(indexnowDiff({ urls: { 'https://x.dev/': null } }, cur)).toEqual({ added: [], changed: [], removed: [] });
  });
});
