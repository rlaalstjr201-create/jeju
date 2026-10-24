/** sha256 of public/spots.json (first 10 hex chars), injected by vite.config.ts. */
declare const __SPOTS_V__: string;
/** the commit the app was built from (git short hash, 'dev' without git), injected by vite.config.ts; sent with 의견 보내기. */
declare const __APP_V__: string;
/** sha256 of the translated place files public/i18n/places.*.json (first 10 hex chars), injected by vite.config.ts (ADR-0093). */
declare const __PLACES_V__: string;
/** 출시 스위치 (plans/busan.md): true only with `--mode busan`. Read in src/release.ts only. */
declare const __BUSAN__: boolean;
/** sha256 of public/spots-busan.json (first 10 hex chars), '' while there is none; injected by vite.config.ts. */
declare const __BUSAN_V__: string;
/** sha256 of Busan's translated place files public/i18n/places-busan.*.json (first 10 hex chars), injected by vite.config.ts (ADR-0093 Amendment 9). */
declare const __BUSAN_PLACES_V__: string;

interface ImportMetaEnv {
  /** collection address for anonymous usage counts (ADR-0061); unset = nothing is sent. */
  readonly VITE_EVENTS_URL?: string;
  /** GA4 measurement ID (ADR-0078); required with SITE_URL (scripts/analytics-env.ts). */
  readonly VITE_GA4_ID?: string;
  /** 네이버 애널리틱스 wcs_add.wa (ADR-0078); required with SITE_URL. */
  readonly VITE_NAVER_WA?: string;
}
