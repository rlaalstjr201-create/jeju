export declare const FALLBACK_POINTS: readonly { lat: number; lng: number; what: string }[];
export declare const pointKey: (s: { lat: number; lng: number }) => string;
export declare function positionProblems(
  spots: readonly { id: string; name: string; lat: number; lng: number; kakaoPlaceId: string | null }[],
  verified?: ReadonlySet<string>,
): string[];
