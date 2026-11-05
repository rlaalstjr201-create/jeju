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
/** 백화점·몰 안 (the store's hours) */
const MALL = /더현대|현대백화점|롯데백화점|신세계|갤러리아|AK플라자|롯데월드몰|타임스퀘어|스타필드|아이파크몰|IFC몰|코엑스몰/;
/** A kind's usual hours, where the posts gave none (ADR-0118 Amendment 1): written as the day's list writes them, so openNow
 * reads them — a pop-up in a department store or mall by the store's, else 12–20; an exhibition 11–18, shut on Mondays;
 * a market, a festival or a new place 11–20. */
export function usualTime(r: Pick<WeekRow, 'kind' | 'place'>): string {
  if (r.kind === '팝업') return MALL.test(r.place) ? '10:30~20:00' : '12:00~20:00';
  if (r.kind === '전시') return '화-일 11:00~18:00';
  return '11:00~20:00';
}
/** The rows still running on `day` (not ended) and not in the day's own list (`own`, by name), as items. */
export function weeklyItems(day: string, own: readonly CultureItem[] = [], rows: readonly WeekRow[] = FILE.items as WeekRow[]): WeekItem[] {
  const names = new Set(own.map((i) => key(i.title)));
  return rows
    .filter((r) => r.end >= day && !names.has(key(r.name)))
    .map((r) => ({ id: r.id, title: r.name, kind: r.kind, place: r.place, gu: '', lat: r.lat, lng: r.lng, start: r.start, end: r.end, time: r.time || usualTime(r), free: false, forAll: true, link: r.src, image: '', week: { reserve: r.reserve, kakao: r.kakao } }));
}
