import type { NaverLocalVerifierPort, NaverLocalVerification } from '../../application/ports/NaverLocalVerifierPort.js';
import type { NaverSearchHit } from '../../application/ports/LlmExtractorPort.js';
import { isSubstantialMatch } from '../../application/curation/SpotNameMatcher.js';

export class NaverLocalVerifierError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NaverLocalVerifierError';
  }
}

interface NaverLocalVerifierAdapterOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly baseUrl?: string;
}

interface NaverLocalItem {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

interface NaverLocalResponse {
  items: NaverLocalItem[];
}

// Jeju bounding box (ADR-0031: extended to lat 34.0 for 추자도)
const JEJU_LAT_MIN = 33.0;
const JEJU_LAT_MAX = 34.0;
const JEJU_LNG_MIN = 126.0;
const JEJU_LNG_MAX = 127.0;

function isInJejuBbox(lat: number, lng: number): boolean {
  return lat >= JEJU_LAT_MIN && lat <= JEJU_LAT_MAX &&
         lng >= JEJU_LNG_MIN && lng <= JEJU_LNG_MAX;
}

export class NaverLocalVerifierAdapter implements NaverLocalVerifierPort {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(options: NaverLocalVerifierAdapterOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.baseUrl = options.baseUrl ?? 'https://openapi.naver.com';
  }

  async verify(spotName: string): Promise<NaverLocalVerification> {
    const url = new URL(`${this.baseUrl}/v1/search/local.json`);
    url.searchParams.set('query', spotName);
    url.searchParams.set('display', '1');

    let data: NaverLocalResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      if (!res.ok) {
        throw new NaverLocalVerifierError(`Naver Local API returned ${res.status}`);
      }
      data = (await res.json()) as NaverLocalResponse;
    } catch (err) {
      if (err instanceof NaverLocalVerifierError) throw err;
      throw new NaverLocalVerifierError('Naver Local API network error', err);
    }

    const items = data.items ?? [];
    if (items.length === 0) {
      return { matched: false, lat: null, lng: null, category: null };
    }

    const item = items[0]!;
    const lat = parseInt(item.mapy, 10) / 1e7;
    const lng = parseInt(item.mapx, 10) / 1e7;

    if (!isInJejuBbox(lat, lng)) {
      return { matched: false, lat: null, lng: null, category: null };
    }

    const cleanTitle = item.title.replace(/<[^>]+>/g, '');
    if (!isSubstantialMatch(spotName, cleanTitle)) {
      return { matched: false, lat: null, lng: null, category: null };
    }

    return { matched: true, lat, lng, category: item.category || null };
  }

  async searchRaw(query: string, limit = 5): Promise<NaverSearchHit[]> {
    const url = new URL(`${this.baseUrl}/v1/search/local.json`);
    url.searchParams.set('query', query);
    url.searchParams.set('display', String(Math.min(limit, 5)));

    let data: NaverLocalResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });
      if (!res.ok) {
        throw new NaverLocalVerifierError(`Naver API ${res.status}`);
      }
      data = (await res.json()) as NaverLocalResponse;
    } catch (err) {
      if (err instanceof NaverLocalVerifierError) throw err;
      throw new NaverLocalVerifierError('Naver API network error', err);
    }

    return (data.items ?? [])
      .map((item) => ({
        name: item.title.replace(/<[^>]+>/g, ''),
        category: item.category,
        address: item.roadAddress || item.address,
        lat: parseInt(item.mapy, 10) / 1e7,
        lng: parseInt(item.mapx, 10) / 1e7,
      }))
      .filter((hit) => isInJejuBbox(hit.lat, hit.lng));
  }
}
