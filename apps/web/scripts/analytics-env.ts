// ADR-0078 2: a production build (SITE_URL set) never ships with analytics off. The site's own ids are public
// and kept here, not in a shell variable someone can forget (seoulist ran without GA4 that way); an env var of
// the same name overrides one (another property, a staging site). VITE_EVENTS_URL defaults to this site's own
// collector. Without SITE_URL (dev, tests, e2e) nothing is filled in and nothing is required.
export const ANALYTICS_KEYS = ['VITE_GA4_ID', 'VITE_NAVER_WA', 'VITE_EVENTS_URL'] as const;
export type AnalyticsEnv = Record<(typeof ANALYTICS_KEYS)[number], string>;

export const DEFAULT_EVENTS_URL = '/api/events';
/** GA4 「여행귀:제주」 web stream and the 네이버 애널리틱스 site, both for https://yeogwi.pages.dev (2026-10-03). */
export const SITE_IDS = { VITE_GA4_ID: 'G-P8DN26LKBC', VITE_NAVER_WA: '1caa51952fb5230' } as const;

export function analyticsEnv(env: Record<string, string | undefined>): AnalyticsEnv {
  const prod = !!env.SITE_URL?.trim();
  const out: AnalyticsEnv = {
    VITE_GA4_ID: (env.VITE_GA4_ID ?? (prod ? SITE_IDS.VITE_GA4_ID : '')).trim(),
    VITE_NAVER_WA: (env.VITE_NAVER_WA ?? (prod ? SITE_IDS.VITE_NAVER_WA : '')).trim(),
    VITE_EVENTS_URL: (env.VITE_EVENTS_URL ?? (prod ? DEFAULT_EVENTS_URL : '')).trim(),
  };
  if (prod) {
    const missing = ANALYTICS_KEYS.filter((k) => !out[k]);
    if (missing.length)
      throw new Error(`analytics off in a production build (SITE_URL is set): ${missing.join(', ')} empty — set it (docs/deploy.md, ADR-0078)`);
  }
  return out;
}
