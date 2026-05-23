import type { SpotsResponse, SpotCategory } from '@jeju/shared';
import { API_BASE } from '../config/api';

export async function getSpots(category?: SpotCategory): Promise<SpotsResponse> {
  const url = category
    ? `${API_BASE}/api/v1/spots?category=${category}`
    : `${API_BASE}/api/v1/spots`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`getSpots failed: ${res.status}`);
  }
  return res.json() as Promise<SpotsResponse>;
}
