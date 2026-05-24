export type SpotCategory =
  | 'sightseeing'
  | 'restaurant'
  | 'cultural_space'
  | 'experience'
  | 'cafe';

export const SPOT_CATEGORIES: readonly SpotCategory[] = [
  'sightseeing',
  'restaurant',
  'cultural_space',
  'experience',
  'cafe',
];

export const SPOT_CATEGORY_LABELS: Record<SpotCategory, string> = {
  sightseeing: '관광지',
  restaurant: '맛집',
  cultural_space: '문화공간',
  experience: '체험',
  cafe: '카페',
};

export interface SpotCard {
  id: string;
  name: string;
  category: SpotCategory;
  lat: number;
  lng: number;
  thumbnailUrl: string | null;
  imageUrl?: string | null;
  curatorComment: string | null;
  region: string;
}

export interface SpotsResponse {
  spots: SpotCard[];
}

export interface SpotDetail extends SpotCard {
  source: string | null;
}

export interface SpotDetailResponse {
  spot: SpotDetail;
}
