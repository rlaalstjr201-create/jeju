// scripts/seo/diagnosis-record.mjs — 진단 기록 검증·렌더 (seoulist lib/diagnosis-record.mjs를 옮김).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderRecord, sortOrderOf, validateRecord } from '../scripts/seo/diagnosis-record.mjs';

const iv = (over: Record<string, unknown> = {}) => ({
  rank: 1, title: 't', severity: 'P1', qualifies: 'seo:crawl:x', cause_layer: '색인', affected_impressions: null,
  verifiable: true, sort_id: 'a', check: 'page:/:x', evidence: 'e', verify: '다음 빌드에서 page:/:x가 사라진다', ...over,
});
const rec = (over: Record<string, unknown> = {}) => ({
  run_id: '2026-10-01T1610', diagnosed_at: '2026-10-01', phase: 'pre-deploy', instruments: [{ name: 'seo:crawl', status: 'ok' }],
  interventions: [iv()], ...over,
});

describe('validateRecord', () => {
  it('a well-formed record passes', () => {
    expect(validateRecord(rec(), { filename: '2026-10-01T1610.json' }).errors).toEqual([]);
  });
  it('run_id must equal the filename', () => {
    expect(validateRecord(rec(), { filename: 'x.json' }).errors.join()).toMatch(/파일명/);
  });
  it('vague verify, missing evidence, disqualified verdicts are errors', () => {
    expect(validateRecord(rec({ interventions: [iv({ verify: '노출이 개선되면' })] })).errors.join()).toMatch(/채점 불가/);
    expect(validateRecord(rec({ interventions: [iv({ evidence: '' })] })).errors.join()).toMatch(/evidence/);
    expect(validateRecord(rec({ interventions: [iv({ qualifies: 'keywords:gate:kill' })] })).errors.join()).toMatch(/자격 없는/);
  });
  it('content/landing work must name a keyword (the gate comes first)', () => {
    expect(validateRecord(rec({ interventions: [iv({ queue_kind: 'landing' })] })).errors.join()).toMatch(/keyword/);
    expect(validateRecord(rec({ interventions: [iv({ queue_kind: 'landing', keyword: '제주도 무계획 여행' })] })).errors).toEqual([]);
  });
  it('order must follow the keys: severity → impressions → verifiable → sort_id', () => {
    const a = iv({ title: 'A', severity: 'P1', sort_id: 'a' });
    const b = iv({ title: 'B', severity: 'P0', sort_id: 'b' });
    expect(sortOrderOf([a, b]).map((x) => x.title)).toEqual(['B', 'A']);
    expect(validateRecord(rec({ interventions: [a, b] })).errors.join()).toMatch(/정렬/);
  });
  it('more than 5 interventions is an error; graded without grading is an error', () => {
    const six = Array.from({ length: 6 }, (_, i) => iv({ title: `t${i}`, sort_id: `s${i}` }));
    expect(validateRecord(rec({ interventions: six })).errors.join()).toMatch(/상한/);
    expect(validateRecord(rec({ graded: 'x' })).errors.join()).toMatch(/grading/);
  });
});

describe('renderRecord', () => {
  it('first run says so; empty sections are not drawn', () => {
    const md = renderRecord(rec());
    expect(md).toContain('첫 가동');
    expect(md).not.toContain('손대지 않기로 한 것');
    expect(renderRecord(rec({ not_touching: ['x'] }))).toContain('손대지 않기로 한 것');
  });
});

describe('data/seo/diagnoses', () => {
  const dir = resolve(__dirname, '../data/seo/diagnoses');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    it(`${f} validates with no errors`, () => {
      expect(validateRecord(JSON.parse(readFileSync(resolve(dir, f), 'utf8')), { filename: f }).errors).toEqual([]);
    });
  }
});
