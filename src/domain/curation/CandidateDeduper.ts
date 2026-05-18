import { haversineMeters } from './haversine.js';

const RADIUS_METERS = 100;

interface Coordinate {
  readonly lat: number;
  readonly lng: number;
}

export class CandidateDeduper {
  private readonly seen: Coordinate[];

  constructor(existing: Coordinate[]) {
    this.seen = [...existing];
  }

  isDuplicate(lat: number, lng: number): boolean {
    return this.seen.some((c) => haversineMeters(c.lat, c.lng, lat, lng) <= RADIUS_METERS);
  }

  accept(lat: number, lng: number): void {
    this.seen.push({ lat, lng });
  }
}
