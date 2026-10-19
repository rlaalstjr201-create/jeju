// The little of jsdom's own API tests/start.test.ts uses (vitest brings jsdom; its types are not installed).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; referrer?: string; runScripts?: 'dangerously' | 'outside-only'; pretendToBeVisual?: boolean; beforeParse?: (window: Window) => void });
    readonly window: Window & typeof globalThis;
  }
}
