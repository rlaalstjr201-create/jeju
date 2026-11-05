// 이번 주 서울 (ADR-0118, specs/seoul-weekly.md): the week's dated things (data/seoul/weekly-seoul.json, review/seoul-weekly) as
// items of the day's list, so the shelves and the card sheet treat them like the day's events (openNow: their dates and time
// words). Pure; in the culture chunk only (ADR-0100). One that has ended is never made into an item; one the day's own list
// (서울시·KOPIS) has under the same name is left to that list.
import FILE from '../data/seoul/weekly-seoul.json';
import type { CultureItem } from './culture';

export type WeekKind = '팝업' | '새로 연 곳' | '전시' | '마켓' | '축제';
export interface WeekRow {
  id: string;
  name: string;
  kind: WeekKind;
  start: string;
  end: string;
  time: string;
  place: string;
  lat: number;
  lng: number;
  kakao: string;
  src: string;
  reserve: 'none' | 'onsite';
}
/** A week's item among the day's: `week` says where it was read and whether there may be a queue. */
export type WeekItem = CultureItem & { week: { reserve: WeekRow['reserve']; kakao: string } };
export const isWeek = (i: CultureItem): i is WeekItem => 'week' in i;

const key = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
/** The rows still running on `day` (not ended) and not in the day's own list (`own`, by name), as items. */
export function weeklyItems(day: string, own: readonly CultureItem[] = [], rows: readonly WeekRow[] = FILE.items as WeekRow[]): WeekItem[] {
  const names = new Set(own.map((i) => key(i.title)));
  return rows
    .filter((r) => r.end >= day && !names.has(key(r.name)))
    .map((r) => ({ id: r.id, title: r.name, kind: r.kind, place: r.place, gu: '', lat: r.lat, lng: r.lng, start: r.start, end: r.end, time: r.time, free: false, forAll: true, link: r.src, image: '', week: { reserve: r.reserve, kakao: r.kakao } }));
}
