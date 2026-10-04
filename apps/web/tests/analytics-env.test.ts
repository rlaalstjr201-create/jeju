// ADR-0078 2: the build refuses to ship analytics off.
import { describe, expect, it } from 'vitest';
import { analyticsEnv } from '../scripts/analytics-env';

const SITE = 'https://yeochana.pages.dev';
const ALL = { SITE_URL: SITE, VITE_GA4_ID: 'G-P8DN26LKBC', VITE_NAVER_WA: 'abc123', VITE_EVENTS_URL: '/api/events' };

describe('analyticsEnv (build guard)', () => {
  it('no SITE_URL (dev, tests, e2e): nothing required, nothing filled in', () => {
    expect(analyticsEnv({})).toEqual({ VITE_GA4_ID: '', VITE_NAVER_WA: '', VITE_EVENTS_URL: '' });
  });

  it('SITE_URL with all three: passes through; VITE_EVENTS_URL defaults to /api/events', () => {
    expect(analyticsEnv(ALL)).toEqual({ VITE_GA4_ID: 'G-P8DN26LKBC', VITE_NAVER_WA: 'abc123', VITE_EVENTS_URL: '/api/events' });
    const { VITE_EVENTS_URL: _, ...rest } = ALL;
    expect(analyticsEnv(rest).VITE_EVENTS_URL).toBe('/api/events');
  });

  it.each(['VITE_GA4_ID', 'VITE_NAVER_WA', 'VITE_EVENTS_URL'] as const)('SITE_URL with %s empty: fails, naming it', (key) => {
    expect(() => analyticsEnv({ ...ALL, [key]: '' })).toThrow(new RegExp(`${key} empty`));
    expect(() => analyticsEnv({ ...ALL, [key]: '  ' })).toThrow(new RegExp(`${key} empty`));
  });

  it('SITE_URL alone: the site\'s own public ids are filled in (nothing to forget), and an env var still overrides', () => {
    expect(analyticsEnv({ SITE_URL: SITE })).toEqual({ VITE_GA4_ID: 'G-P8DN26LKBC', VITE_NAVER_WA: '1caa51952fb5230', VITE_EVENTS_URL: '/api/events' });
    expect(analyticsEnv({ SITE_URL: SITE, VITE_NAVER_WA: 'other' }).VITE_NAVER_WA).toBe('other');
  });

  it('names every one set empty', () => {
    expect(() => analyticsEnv({ SITE_URL: SITE, VITE_GA4_ID: '', VITE_NAVER_WA: '' })).toThrow('VITE_GA4_ID, VITE_NAVER_WA empty');
  });

  it('vite.config.ts runs the guard on build', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(cfg).toMatch(/analyticsEnv\(process\.env\)/);
  });
});
