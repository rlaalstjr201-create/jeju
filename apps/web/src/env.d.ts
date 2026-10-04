/** sha256 of public/spots.json (first 10 hex chars), injected by vite.config.ts. */
declare const __SPOTS_V__: string;
/** the commit the app was built from (git short hash, 'dev' without git), injected by vite.config.ts; sent with 의견 보내기. */
declare const __APP_V__: string;

interface ImportMetaEnv {
  /** collection address for anonymous usage counts (ADR-0061); unset = nothing is sent. */
  readonly VITE_EVENTS_URL?: string;
  /** GA4 measurement ID (ADR-0078); required with SITE_URL (scripts/analytics-env.ts). */
  readonly VITE_GA4_ID?: string;
  /** 네이버 애널리틱스 wcs_add.wa (ADR-0078); required with SITE_URL. */
  readonly VITE_NAVER_WA?: string;
}
