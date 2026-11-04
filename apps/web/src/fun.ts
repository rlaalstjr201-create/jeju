// 서울 즐길 거리 (ADR-0115): the curated places (data/seoul/fun-seoul.json, review/seoul-fun) and the named 동네, as items of
// the day's list so the state's card sheet can find them (app.ts·state.ts look an id up in culture.items). Pure; in the
// culture chunk only (ADR-0100). These places have no opening hours: a kind's usual hours (HOURS) keep a bar off the
// morning and a market off the night, and nothing on a card says 「열림」.
import FILE from '../data/seoul/fun-seoul.json';
import type { CultureItem } from './culture';

export type FunG = 'G1' | 'G2' | 'G4' | 'G5' | 'G6' | 'G7';
interface FunRow {
  id: string;
  name: string;
  g: FunG;
  word: string;
  lat: number;
  lng: number;
  line: string;
  walkin: boolean;
  url: string;
  hood?: string;
}
/** A curated place or a 동네 among the day's items: `fun` says which. */
export type FunItem = CultureItem & { fun: { g: FunG | 'hood'; word: string; walkin: boolean; hood?: string } };
export const isFun = (i: CultureItem): i is FunItem => 'fun' in i;
/** The day's own list (events, shows) without the curated places. */
export const realItems = (items: readonly CultureItem[]): CultureItem[] => items.filter((i) => !isFun(i));

/** 동네 반경: a place within this of a 동네's middle is in it (scripts/seoul-fun/ship.mjs HOOD_M) */
export const HOOD_KM = 0.7;
export const HOOD_PREFIX = 'hood:';

/** The curated places and the 동네 as items of `day`'s list. */
export function funItems(day: string): FunItem[] {
  const base = { gu: '', start: day, end: day, time: '', free: false, forAll: true, image: '' };
  const places = (FILE.places as FunRow[]).map((p) => ({ ...base, id: p.id, title: p.name, kind: p.word, place: p.line, lat: p.lat, lng: p.lng, link: p.url, fun: { g: p.g, word: p.word, walkin: p.walkin, ...(p.hood ? { hood: p.hood } : {}) } }));
  const hoods = FILE.hoods.map((h) => ({ ...base, id: `${HOOD_PREFIX}${h.name}`, title: h.name, kind: '동네', place: '', lat: h.lat, lng: h.lng, link: '', fun: { g: 'hood' as const, word: '동네', walkin: true } }));
  return [...places, ...hoods];
}

/** A kind's usual hours, minutes after midnight KST (close past 24:00 runs into the night): no hours are in the data. */
const H = (open: number, close: number) => [open * 60, close * 60] as const;
const HOURS: [RegExp, readonly [number, number]][] = [
  [/LP바|재즈바|재즈클럽|라이브바|포장마차|포차거리|노가리골목|야장/, H(18, 26)],
  [/야시장/, H(18, 23)],
  [/전통시장/, H(9, 19)],
  [/찜질방/, H(0, 24)],
  [/한강공원|피크닉|노을|한강 다리/, H(5, 24)],
  [/전망대/, H(10, 22)],
  [/루프탑/, H(12, 24)],
  [/야경/, H(18, 24)],
  [/방탈출|보드게임|볼링|클라이밍/, H(10, 23)],
  [/영화관|시네마/, H(10, 24)],
  [/대안공간/, H(12, 19)],
  [/서점|편집|빈티지|레코드샵|팝업/, H(12, 20)],
  [/야구장/, H(13, 22)],
];
const ALL_DAY = H(0, 24);
/** Live venues and small theatres: evenings and weekend afternoons (KOPIS, 소극장, 라이브클럽) */
const VENUE = H(13, 23);
export function hoursOf(word: string): readonly [number, number] {
  return HOURS.find(([re]) => re.test(word))?.[1] ?? (/KOPIS|소극장|라이브|인디|버스킹/.test(word) ? VENUE : ALL_DAY);
}
/** Likely open at `minute` (KST) with `travel` minutes to get there, at least half an hour before its usual close. 직관 only in
 * the season (March to October). */
export function likelyOpen(it: FunItem, minute: number, travel: number, month: number): boolean {
  if (it.fun.g === 'G6' && (month < 3 || month > 10)) return false;
  const [open, close] = hoursOf(it.fun.word);
  const at = minute + travel;
  return (at >= open && at <= close - 30) || (close > 1440 && at + 1440 <= close - 30);
}

/** 지금 시간대 (ADR-0115 6): the sunset ± its hour decides 노을; night after it, late past midnight. */
export type Band = 'late' | 'morning' | 'day' | 'dusk' | 'night';
export function bandOf(minute: number, sunset: number): Band {
  if (minute < 6 * 60) return 'late';
  if (minute >= sunset - 60 && minute < sunset + 40) return 'dusk';
  if (minute >= sunset + 40) return 'night';
  return minute < 11 * 60 ? 'morning' : 'day';
}
