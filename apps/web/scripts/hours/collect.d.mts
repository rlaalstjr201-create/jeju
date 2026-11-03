export function normName(name: string): string;
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
export function matchSpots(
  spots: { id: string; name: string; mood: string; lat: number; lng: number }[],
  items: Record<string, unknown>[],
  exclude?: Set<string>,
): { id: string; contentid: string; type: number; title: string; km: number; same: boolean }[];
