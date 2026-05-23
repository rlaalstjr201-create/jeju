import type { SpotCategory } from '@jeju/shared';

export const SPOT_CATEGORY_LABELS: Record<SpotCategory, string> = {
  sightseeing: '관광',
  restaurant: '맛집',
  cafe: '카페',
  cultural_space: '문화',
  experience: '체험',
};

export const CATEGORY_ORDER: SpotCategory[] = [
  'sightseeing',
  'restaurant',
  'cafe',
  'cultural_space',
  'experience',
];
