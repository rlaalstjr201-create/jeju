// yeochana.com (ADR-0084): the old hosts send every path to the same path there, the app's own host is untouched.
import { describe, expect, it } from 'vitest';
import { CANONICAL, RETIRE_SW, onRequest } from '../functions/_middleware';

const run = (url: string) => onRequest({ request: new Request(url), next: async () => new Response('app') });

describe('주소 넘기기 (_middleware)', () => {
  it('yeochana.pages.dev and www: 301 to the same path and query on yeochana.com', async () => {
    for (const from of ['https://yeochana.pages.dev', 'https://www.yeochana.com']) {
      const res = await run(`${from}/jeju/aewol/?mood=rest`);
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe(`${CANONICAL}/jeju/aewol/?mood=rest`);
    }
    expect((await run('https://yeochana.pages.dev/')).headers.get('location')).toBe(`${CANONICAL}/`);
  });

  it('yeochana.pages.dev/sw.js is the retiring worker, not a redirect', async () => {
    const res = await run('https://yeochana.pages.dev/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const body = await res.text();
    expect(body).toBe(RETIRE_SW);
    expect(body).toContain("registration.unregister()");
    expect(body).toContain(`'${CANONICAL}'`);
  });

  it('yeochana.com itself and deploy previews go on to the app', async () => {
    for (const u of ['https://yeochana.com/', 'https://yeochana.com/sw.js', 'https://b45bc659.yeochana.pages.dev/', 'http://localhost:8788/api/rain'])
      expect(await (await run(u)).text()).toBe('app');
  });
});
