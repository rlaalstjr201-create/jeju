export interface KakaoVerification {
  readonly matched: boolean;
  readonly kakaoPlaceId: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly address: string | null;
  readonly categoryName: string | null;
}

export interface KakaoLocalVerifierPort {
  verify(
    spotName: string,
    hintLat?: number,
    hintLng?: number,
  ): Promise<KakaoVerification>;
}
