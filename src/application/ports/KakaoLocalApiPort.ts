export interface KakaoLocalApiPort {
  fetchPlaceDetails(
    kakaoPlaceId: string,
  ): Promise<{ lat: number; lng: number; thumbnailUrl: string } | null>;
}
