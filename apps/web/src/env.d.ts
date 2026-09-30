/** sha256 of public/spots.json (first 10 hex chars), injected by vite.config.ts. */
declare const __SPOTS_V__: string;

interface ImportMetaEnv {
  /** collection address for anonymous usage counts (ADR-0061); unset = nothing is sent. */
  readonly VITE_EVENTS_URL?: string;
}
