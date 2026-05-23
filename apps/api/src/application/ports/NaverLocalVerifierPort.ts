export interface NaverLocalVerification {
  readonly matched: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly category: string | null;
}

export interface NaverLocalVerifierPort {
  verify(spotName: string): Promise<NaverLocalVerification>;
}
