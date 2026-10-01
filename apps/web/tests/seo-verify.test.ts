// scripts/seo/score.mjs (seoulist test-seo-verify.mjs의 해석해) + keyword-gate.mjs (게이트·순위 추적 규칙).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adherenceOf, calibration, scoreRows, skill, verdictOf } from '../scripts/seo/score.mjs';
import { judge, pivotOf, validateKeywords, type Candidate } from '../scripts/seo/keyword-gate.mjs';

describe('skill / adherence (closed form)', () => {
  it('skill', () => {
    expect(skill(100, 100, 50)).toBe(1);
    expect(skill(100, 90, 80)).toBeCloseTo(0.5);
    expect(skill(100, 80, 120)).toBeCloseTo(0);
    expect(skill(100, 60, 80)).toBeCloseTo(-1);
    expect(skill(100, 100, 100)).toBe(0);
    expect(skill(100, 90, 100)).toBe(-1);
  });
  it('adherence never exceeds the plan, unplanned levers do not count', () => {
    expect(adherenceOf({}, {})).toBe(1);
    expect(adherenceOf({ a: 2, b: 2 }, { a: 2 })).toBe(0.5);
    expect(adherenceOf({ a: 2 }, { a: 10 })).toBe(1);
    expect(adherenceOf({ a: 2 }, { z: 99 })).toBe(0);
  });
});

const fc = (over = {}) => ({
  model_hash: 'abc', baseline_layers: { landing: { pages: 16, activation: 0.1 } },
  predictions: [{ id: 'total_impressions', p10: 500, p50: 650, p90: 800 }, { id: 'landing.activation', p10: 0.1, p50: 0.15, p90: 0.22 }],
  nulls: { no_change: { impressions: 406, clicks: 11 }, trend: { impressions: 450, clicks: 12 } }, ...over,
});

describe('scoreRows / verdictOf', () => {
  it('interval bounds are inclusive; a missing actual is skipped, not zero', () => {
    const rows = scoreRows(fc(), (id) => (id === 'total_impressions' ? 500 : null));
    expect(rows[0].hit).toBe(true);
    expect(rows[1].skipped).toBeTruthy();
  });
  it('a changed model or <50% adherence is 「판정 불가」, never 「기각」', () => {
    const rows = scoreRows(fc(), () => 650);
    expect(verdictOf({ forecast: fc(), rows, adherence: 1, currentModelHash: 'zzz' }).verdict).toBe('판정 불가');
    expect(verdictOf({ forecast: fc(), rows, adherence: 0.4 }).verdict).toBe('판정 불가');
  });
  it('not beating the no-change null rejects the model', () => {
    const rows = scoreRows(fc(), (id) => (id === 'total_impressions' ? 406 : 0.15));
    expect(verdictOf({ forecast: fc(), rows, adherence: 1 }).verdict).toBe('모델 기각');
  });
  it('calibration flags small samples', () => {
    expect(calibration([])).toBeNull();
    expect(calibration(scoreRows(fc(), () => 650))?.underpowered).toBe(true);
  });
});

const base: Candidate = { query: 'q', scores: { demand: 2, competition: 1, intent_fit: 2, uniqueness: 1, inventory: 2 }, kills: [], serp: { checked_at: '2026-10-01', source: 's', observed: 'proxy' } };

describe('keyword gate', () => {
  it('target needs ≥7, competition ≥1 and full intent fit', () => {
    expect(judge(base).verdict).toBe('target');
    expect(judge({ ...base, scores: { ...base.scores, intent_fit: 1 } }).verdict).toBe('watch');
    expect(judge({ ...base, scores: { ...base.scores, competition: 0 } }).verdict).toBe('watch');
  });
  it('any kill wins over a high score; a head with competition 0 is killed', () => {
    expect(judge({ ...base, kills: ['K2_data'] }).verdict).toBe('kill');
    expect(judge({ ...base, head: true, scores: { ...base.scores, competition: 0 } }).verdict).toBe('kill');
  });
  it('no demand or an unobserved SERP stays watch', () => {
    expect(judge({ ...base, scores: { ...base.scores, demand: 0 } }).verdict).toBe('watch');
    expect(judge({ ...base, serp: { ...base.serp, observed: false } }).verdict).toBe('watch');
  });
  it('brand is its own verdict; missing axes are invalid', () => {
    expect(judge({ ...base, brand: true }).verdict).toBe('brand');
    expect(judge({ query: 'x', scores: { demand: 3 } }).verdict).toBe('invalid');
  });
  it('validate: recorded verdict must equal the rule, competition 2 needs an observed Naver SERP', () => {
    const doc = { rubric_version: 1, candidates: [{ ...base, verdict: 'kill', rationale: 'r' }] };
    expect(validateKeywords(doc).errors.join()).toMatch(/규칙 판정 target/);
    const c2 = { ...base, verdict: 'target', rationale: 'r', landing: '/x', scores: { ...base.scores, competition: 2 } };
    expect(validateKeywords({ rubric_version: 1, candidates: [c2] }).errors.join()).toMatch(/네이버/);
  });
  it('data/seo/keywords.json passes the gate as recorded', () => {
    const doc = JSON.parse(readFileSync(resolve(__dirname, '../data/seo/keywords.json'), 'utf8'));
    expect(validateKeywords(doc).errors).toEqual([]);
  });
});

describe('rank tracking (pivotOf)', () => {
  const t: Candidate = { ...base, verdict: 'target', indexed_at: '2026-11-01' };
  it('waits before indexing and for the first 4 weeks', () => {
    expect(pivotOf({ ...t, indexed_at: undefined }, '2026-12-01').action).toBe('wait');
    expect(pivotOf(t, '2026-11-20').action).toBe('wait');
  });
  it('8 weeks with no impressions → kill; beyond 20 after 8 weeks → pivot', () => {
    expect(pivotOf(t, '2026-12-28').action).toBe('kill');
    expect(pivotOf({ ...t, track: [{ week: '2026-12-21', google_pos: 34, impressions: 12 }] }, '2026-12-28').action).toBe('pivot');
  });
  it('11–20 → push; top 10 with impressions and no clicks → meta; top 10 with clicks → hold', () => {
    expect(pivotOf({ ...t, track: [{ week: 'w', naver_pos: 14, impressions: 40 }] }, '2026-12-05').action).toBe('push');
    expect(pivotOf({ ...t, track: [{ week: 'w', google_pos: 6, impressions: 40, clicks: 0 }] }, '2026-12-05').action).toBe('meta');
    expect(pivotOf({ ...t, track: [{ week: 'w', google_pos: 6, impressions: 40, clicks: 3 }] }, '2026-12-05').action).toBe('hold');
  });
});
