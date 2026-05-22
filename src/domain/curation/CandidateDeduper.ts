import { haversineMeters } from './haversine.js';

const RADIUS_METERS = 100;

interface Coordinate {
  readonly lat: number;
  readonly lng: number;
}

function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\s/g, '')
    .toLowerCase();
}

export class CandidateDeduper {
  private readonly seen: Coordinate[];
  private readonly seenNames: Set<string>;

  constructor(existing: Coordinate[]) {
    this.seen = [...existing];
    this.seenNames = new Set();
  }

  isDuplicate(lat: number, lng: number): boolean {
    return this.seen.some((c) => haversineMeters(c.lat, c.lng, lat, lng) <= RADIUS_METERS);
  }

  accept(lat: number, lng: number): void {
    this.seen.push({ lat, lng });
  }

  isNameDuplicate(name: string): boolean {
    return this.seenNames.has(normalizeName(name));
  }

  acceptName(name: string): void {
    this.seenNames.add(normalizeName(name));
  }
}
