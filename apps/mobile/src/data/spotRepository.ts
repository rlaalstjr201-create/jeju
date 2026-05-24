import type { SpotsResponse, SpotDetailResponse, SpotCategory } from '@jeju/shared';
import { API_BASE } from '../config/api';

const TIMEOUT_MS = 10_000;

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function getSpots(category?: SpotCategory): Promise<SpotsResponse> {
  const url = category
    ? `${API_BASE}/api/v1/spots?category=${category}`
    : `${API_BASE}/api/v1/spots`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`getSpots failed: ${res.status}`);
  }
  return res.json() as Promise<SpotsResponse>;
}

export async function getSpotById(id: string): Promise<SpotDetailResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/spots/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error(`getSpotById failed: ${res.status}`);
  }
  return res.json() as Promise<SpotDetailResponse>;
}
