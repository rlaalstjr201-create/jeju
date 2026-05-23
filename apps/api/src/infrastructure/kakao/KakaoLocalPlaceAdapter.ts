import type { KakaoLocalApiPort } from '../../application/ports/KakaoLocalApiPort.js';

// TODO: implement with Kakao Local API v2 when KAKAO_REST_API_KEY is set
export class KakaoLocalPlaceAdapter implements KakaoLocalApiPort {
  async fetchPlaceDetails(
    _kakaoPlaceId: string,
  ): Promise<{ lat: number; lng: number; thumbnailUrl: string } | null> {
    return null;
  }
}
