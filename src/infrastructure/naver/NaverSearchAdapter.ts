import type { NaverSearchApiPort, NaverSearchItem, NaverSearchResult } from '../../application/ports/NaverSearchApiPort.js';

export class NaverSearchApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NaverSearchApiError';
  }
}

interface NaverSearchAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly baseUrl?: string;
}

interface NaverApiItem {
  title: string;
  link: string;
  description: string;
  postdate: string;
}

interface NaverApiResponse {
  items: NaverApiItem[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function toSearchItem(raw: NaverApiItem): NaverSearchItem {
  return {
    title: stripHtml(raw.title),
    link: raw.link,
    description: stripHtml(raw.description),
    postdate: raw.postdate,
  };
}

export class NaverSearchAdapter implements NaverSearchApiPort {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(options: NaverSearchAdapterOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.baseUrl = options.baseUrl ?? 'https://openapi.naver.com';
  }

  async searchBlog(query: string, display = 10): Promise<NaverSearchResult> {
    return this.search(`${this.baseUrl}/v1/search/blog`, query, display);
  }

  async searchCafe(query: string, display = 10): Promise<NaverSearchResult> {
    return this.search(`${this.baseUrl}/v1/search/cafearticle`, query, display);
  }

  private async search(endpoint: string, query: string, display: number): Promise<NaverSearchResult> {
    const url = new URL(endpoint);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(display));

    let data: NaverApiResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      if (!res.ok) {
        throw new NaverSearchApiError(`Naver Search API returned ${res.status}`);
      }
      data = (await res.json()) as NaverApiResponse;
    } catch (err) {
      if (err instanceof NaverSearchApiError) throw err;
      throw new NaverSearchApiError('Naver Search API network error', err);
    }

    return {
      query,
      items: (data.items ?? []).map(toSearchItem),
    };
  }
}
