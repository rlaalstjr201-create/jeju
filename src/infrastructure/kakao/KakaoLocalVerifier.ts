import type { KakaoLocalVerifierPort, KakaoVerification } from '../../application/ports/KakaoLocalVerifierPort.js';

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

    return {
      matched: true,
      kakaoPlaceId: doc.id,
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      address: doc.road_address_name || doc.address_name,
      categoryName: doc.category_name,
    };
  }
}
