import type { TrendDataSourcePort, TrendSignal } from '../../domain/ports/TrendDataSourcePort.js';

export class KakaoMapRatingAdapter implements TrendDataSourcePort {
  readonly sourceName = 'kakao-map-rating';

  async fetchSignalsForSpots(_spotIds: string[]): Promise<TrendSignal[]> {
    // TODO: integrate with Kakao Map API when KAKAO_REST_API_KEY is set
    console.warn('[KakaoMapRatingAdapter] fetchSignalsForSpots: API not yet integrated');
    return [];
  }
}
