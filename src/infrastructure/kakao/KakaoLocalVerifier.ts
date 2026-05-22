import type { KakaoLocalVerifierPort, KakaoVerification } from '../../application/ports/KakaoLocalVerifierPort.js';
import type { KakaoSearchHit } from '../../application/ports/LlmExtractorPort.js';
import { isSubstantialMatch } from '../../application/curation/SpotNameMatcher.js';

export class KakaoLocalVerifierError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KakaoLocalVerifierError';
  }
}

interface KakaoLocalVerifierOptions {
  readonly restApiKey: string;
  readonly baseUrl?: string;
  readonly searchRadiusMeters?: number;
}

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string; // lng
  y: string; // lat
}

interface KakaoSearchResponse {
  documents: KakaoDocument[];
}

// Jeju island bounding box (본도 + 부속도서 포함)
// lat 상한을 34.0으로 확장하여 추자군도(lat~33.93~33.97) 포함 (ADR-0031)
const JEJU_BBOX = { latMin: 33.0, latMax: 34.0, lngMin: 126.0, lngMax: 127.0 };

function isInJejuBbox(lat: number, lng: number): boolean {
  return lat >= JEJU_BBOX.latMin && lat <= JEJU_BBOX.latMax &&
         lng >= JEJU_BBOX.lngMin && lng <= JEJU_BBOX.lngMax;
}

export class KakaoLocalVerifier implements KakaoLocalVerifierPort {
  private readonly restApiKey: string;
  private readonly baseUrl: string;
  private readonly radius: number;

  constructor(options: KakaoLocalVerifierOptions) {
    this.restApiKey = options.restApiKey;
    this.baseUrl = options.baseUrl ?? 'https://dapi.kakao.com';
    this.radius = options.searchRadiusMeters ?? 1000;
  }

  async verify(
    spotName: string,
    hintLat?: number,
    hintLng?: number,
  ): Promise<KakaoVerification> {
    const url = new URL(`${this.baseUrl}/v2/local/search/keyword`);
    url.searchParams.set('query', spotName);
    url.searchParams.set('size', '1');

    if (hintLat !== undefined && hintLng !== undefined) {
      url.searchParams.set('x', String(hintLng));
      url.searchParams.set('y', String(hintLat));
      url.searchParams.set('radius', String(this.radius));
    }

    let data: KakaoSearchResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${this.restApiKey}` },
      });
      if (!res.ok) {
        throw new KakaoLocalVerifierError(`Kakao Local API returned ${res.status}`);
      }
      data = (await res.json()) as KakaoSearchResponse;
    } catch (err) {
      if (err instanceof KakaoLocalVerifierError) throw err;
      throw new KakaoLocalVerifierError('Kakao Local API network error', err);
    }

    const doc = data.documents[0];
    if (!doc) {
      return { matched: false, kakaoPlaceId: null, lat: null, lng: null, address: null, categoryName: null };
    }

    const lat = parseFloat(doc.y);
    const lng = parseFloat(doc.x);

    if (!isInJejuBbox(lat, lng)) {
      return { matched: false, kakaoPlaceId: null, lat: null, lng: null, address: null, categoryName: null };
    }

    if (!isSubstantialMatch(spotName, doc.place_name)) {
      return { matched: false, kakaoPlaceId: null, lat: null, lng: null, address: null, categoryName: null };
    }

    return {
      matched: true,
      kakaoPlaceId: doc.id,
      lat,
      lng,
      address: doc.road_address_name || doc.address_name,
      categoryName: doc.category_name,
    };
  }

  async searchRaw(query: string, limit = 5): Promise<KakaoSearchHit[]> {
    const url = new URL(`${this.baseUrl}/v2/local/search/keyword`);
    url.searchParams.set('query', query);
    url.searchParams.set('size', String(Math.min(limit, 15)));

    let data: KakaoSearchResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${this.restApiKey}` },
      });
      if (!res.ok) {
        throw new KakaoLocalVerifierError(`Kakao API ${res.status}`);
      }
      data = (await res.json()) as KakaoSearchResponse;
    } catch (err) {
      if (err instanceof KakaoLocalVerifierError) throw err;
      throw new KakaoLocalVerifierError('Kakao API network error', err);
    }

    return data.documents
      .filter((doc) => isInJejuBbox(parseFloat(doc.y), parseFloat(doc.x)))
      .map((doc) => ({
        name: doc.place_name,
        category: doc.category_name,
        address: doc.road_address_name || doc.address_name,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        placeId: doc.id,
      }));
  }
}
