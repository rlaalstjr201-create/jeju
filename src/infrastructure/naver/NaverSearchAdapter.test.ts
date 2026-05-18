import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { NaverSearchAdapter, NaverSearchApiError } from './NaverSearchAdapter.js';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const BASE_URL = 'https://openapi.naver.com';
const BLOG_ENDPOINT = `${BASE_URL}/v1/search/blog`;
const CAFE_ENDPOINT = `${BASE_URL}/v1/search/cafearticle`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNaverItem(overrides: Record<string, string> = {}) {
  return {
    title: '<b>제주</b> 숨겨진 카페',
    link: 'https://blog.naver.com/test/123',
    description: '진짜 <b>현지인</b>만 아는 곳입니다.',
    postdate: '20260515',
    ...overrides,
  };
}

function makeNaverResponse(items: ReturnType<typeof makeNaverItem>[] = [makeNaverItem()]) {
  return {
    lastBuildDate: 'Mon, 18 May 2026 10:00:00 +0900',
    total: items.length,
    start: 1,
    display: items.length,
    items,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter() {
  return new NaverSearchAdapter({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    baseUrl: BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// searchBlog
// ---------------------------------------------------------------------------

describe('NaverSearchAdapter.searchBlog', () => {
  it('returns query + items with HTML tags stripped from title/description', async () => {
    server.use(
      http.get(BLOG_ENDPOINT, () =>
        HttpResponse.json(makeNaverResponse([
          makeNaverItem({ title: '<b>제주</b> 숨겨진 카페', description: '진짜 <b>현지인</b>만 아는 곳' }),
        ])),
      ),
    );

    const adapter = makeAdapter();
    const result = await adapter.searchBlog('제주 숨겨진 카페');

    expect(result.query).toBe('제주 숨겨진 카페');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('제주 숨겨진 카페');
    expect(result.items[0]!.description).toBe('진짜 현지인만 아는 곳');
  });

  it('sends query, display, and auth headers', async () => {
    let capturedRequest: Request | undefined;
    server.use(
      http.get(BLOG_ENDPOINT, ({ request }) => {
        capturedRequest = request;
        return HttpResponse.json(makeNaverResponse());
      }),
    );

    const adapter = makeAdapter();
    await adapter.searchBlog('제주 오름', 5);

    expect(capturedRequest).toBeDefined();
    const url = new URL(capturedRequest!.url);
    expect(url.searchParams.get('query')).toBe('제주 오름');
    expect(url.searchParams.get('display')).toBe('5');
    expect(capturedRequest!.headers.get('X-Naver-Client-Id')).toBe('test-client-id');
    expect(capturedRequest!.headers.get('X-Naver-Client-Secret')).toBe('test-client-secret');
  });

  it('empty items → returns empty array', async () => {
    server.use(
      http.get(BLOG_ENDPOINT, () => HttpResponse.json(makeNaverResponse([]))),
    );

    const adapter = makeAdapter();
    const result = await adapter.searchBlog('없는쿼리');
    expect(result.items).toHaveLength(0);
  });

  it('401 → throws NaverSearchApiError', async () => {
    server.use(
      http.get(BLOG_ENDPOINT, () =>
        HttpResponse.json({ errorCode: '024', errorMessage: 'Invalid client_id' }, { status: 401 }),
      ),
    );

    const adapter = makeAdapter();
    await expect(adapter.searchBlog('test')).rejects.toBeInstanceOf(NaverSearchApiError);
  });

  it('network error → throws NaverSearchApiError', async () => {
    server.use(http.get(BLOG_ENDPOINT, () => HttpResponse.error()));

    const adapter = makeAdapter();
    await expect(adapter.searchBlog('test')).rejects.toBeInstanceOf(NaverSearchApiError);
  });
});

// ---------------------------------------------------------------------------
// searchCafe
// ---------------------------------------------------------------------------

describe('NaverSearchAdapter.searchCafe', () => {
  it('hits cafearticle endpoint and strips HTML', async () => {
    server.use(
      http.get(CAFE_ENDPOINT, () =>
        HttpResponse.json(makeNaverResponse([
          makeNaverItem({ title: '카페 <b>추천</b>', description: '맛있는 <em>디저트</em>' }),
        ])),
      ),
    );

    const adapter = makeAdapter();
    const result = await adapter.searchCafe('제주 카페');

    expect(result.items[0]!.title).toBe('카페 추천');
    expect(result.items[0]!.description).toBe('맛있는 디저트');
  });

  it('preserves link and postdate as-is', async () => {
    server.use(
      http.get(CAFE_ENDPOINT, () =>
        HttpResponse.json(makeNaverResponse([
          makeNaverItem({ link: 'https://cafe.naver.com/x/1', postdate: '20260101' }),
        ])),
      ),
    );

    const adapter = makeAdapter();
    const result = await adapter.searchCafe('test');

    expect(result.items[0]!.link).toBe('https://cafe.naver.com/x/1');
    expect(result.items[0]!.postdate).toBe('20260101');
  });
});
