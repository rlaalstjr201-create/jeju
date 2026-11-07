// 서울 즐길 거리 (ADR-0115): the curated places (data/seoul/fun-seoul.json, review/seoul-fun) and the named 동네, as items of
// the day's list so the state's card sheet can find them (app.ts·state.ts look an id up in culture.items). Pure; in the
// culture chunk only (ADR-0100). These places have no opening hours: a kind's usual hours (HOURS) keep a bar off the
// morning and a market off the night, and nothing on a card says 「열림」.
import FILE from '../../data/seoul/fun-seoul.json';
import type { CultureItem } from '../culture/culture';
import { FOUND_ROWS, isWeek, weeklyItems, type FoundRow } from './weekly';
import { parseCultureTime } from '../culture/culture';
import type { Spot } from '../pick/pick';

/** NEW: 매일 발굴's new places for their first 8 weeks (새로 생긴 곳, ADR-0123 4) */
export type FunG = 'G1' | 'G2' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G10' | 'NEW';
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
  /** its official site's og:image (ADR-0123 6), loaded from there, and that site's name */
  img?: string;
  imgFrom?: string;
  /** the day it came into the data (ADR-0124 1): 새로 들어옴 for 7 days; none = the base list, never new */
  added?: string;
}
/** A curated place or a 동네 among the day's items: `fun` says which (`from`: its picture's source). */
export type FunItem = CultureItem & { fun: { g: FunG | 'hood'; word: string; walkin: boolean; hood?: string; from?: string; added?: string } };
export const isFun = (i: CultureItem): i is FunItem => 'fun' in i;
/** The day's own list (events, shows) without the curated places and the week's (ADR-0118). */
export const realItems = (items: readonly CultureItem[]): CultureItem[] => items.filter((i) => !isFun(i) && !isWeek(i));

/** 동네 반경: a place within this of a 동네's middle is in it (scripts/seoul-fun/ship.mjs HOOD_M) */
export const HOOD_KM = 0.7;
export const HOOD_PREFIX = 'hood:';

/** 매일 발굴's new places on `day` (ADR-0123 4·5): none before they open, 새로 생긴 곳 (NEW) to their end (opening + 55 days),
 * then the shelf the sweep moved them to (`stay`), else gone. */
export function foundPlaces(day: string, rows: readonly FoundRow[] = FOUND_ROWS): FunRow[] {
  return rows
    .filter((r) => r.kind === '새로 연 곳' && r.start <= day && (r.end >= day || !!r.stay))
    .map((r) => ({ id: r.id, name: r.name, g: r.end >= day ? 'NEW' : r.stay!, word: r.word, lat: r.lat, lng: r.lng, line: r.line ?? `${r.word} · ${r.hood ?? r.gu ?? ''}`, walkin: true, url: r.kakao, ...(r.hood ? { hood: r.hood } : {}), ...(r.img ? { img: r.img, imgFrom: r.imgFrom } : {}), ...(r.added ? { added: r.added } : {}) }));
}
/** The curated places and the 동네 as items of `day`'s list. */
export function funItems(day: string): FunItem[] {
  const base = { gu: '', start: day, end: day, time: '', free: false, forAll: true };
  const places = [...(FILE.places as FunRow[]), ...foundPlaces(day)].map((p) => ({ ...base, id: p.id, title: p.name, kind: p.word, place: p.line, lat: p.lat, lng: p.lng, link: p.url, image: p.img ?? '', fun: { g: p.g, word: p.word, walkin: p.walkin, ...(p.hood ? { hood: p.hood } : {}), ...(p.img && p.imgFrom ? { from: p.imgFrom } : {}), ...(p.added ? { added: p.added } : {}) } }));
  const hoods = FILE.hoods.map((h) => ({ ...base, image: '', id: `${HOOD_PREFIX}${h.name}`, title: h.name, kind: '동네', place: '', lat: h.lat, lng: h.lng, link: '', fun: { g: 'hood' as const, word: '동네', walkin: true } }));
  return [...places, ...hoods];
}

/** A kind's usual hours, minutes after midnight KST (close past 24:00 runs into the night): no hours are in the data. */
const H = (open: number, close: number) => [open * 60, close * 60] as const;
const HOURS: [RegExp, readonly [number, number]][] = [
  // 밤 놀거리 (ADR-0122 7): the kind on the card (scripts/seoul-night/curate.mjs kindOf), before the daytime 루프탑 below
  [/^클럽$/, H(22, 29)],
  [/^(칵테일바|와인바|하이볼바|루프탑바|음악바|바)$/, H(19, 26)],
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
  [/서점|편집|빈티지|레코드샵|레코드숍|팝업/, H(12, 20)],
  // 매일 발굴's new shops (ADR-0123): the shops' usual hours (ADR-0121 7)
  [/^(소품샵|문구점|향|리빙숍|플래그십)$/, H(12, 20)],
  [/야구장/, H(13, 22)],
  // 카페·디저트 (ADR-0120 5): the kind on the card (scripts/seoul-cafe/curate.mjs kindOf)
  [/^(베이커리|도넛)$/, H(8, 20)],
  [/^(카페|로스터리)$/, H(10, 22)],
  [/^(케이크|디저트|찻집)$/, H(11, 21)],
  [/^(젤라또|아이스크림)$/, H(12, 22)],
];
const ALL_DAY = H(0, 24);
/** Live venues and small theatres: evenings and weekend afternoons (KOPIS, 소극장, 라이브클럽) */
const VENUE = H(13, 23);
export function hoursOf(word: string): readonly [number, number] {
  return HOURS.find(([re]) => re.test(word))?.[1] ?? (/KOPIS|소극장|라이브|인디|버스킹/.test(word) ? VENUE : ALL_DAY);
}
/** 클럽 (ADR-0122 Amendment 1): Friday and Saturday nights only (22:00 that day to 05:00 the next) — Seoul's clubs mostly open
 * at the weekend, and a place one cannot go to now is never shown */
const WEEKEND_NIGHT = /^클럽$/;
/** Likely open at `minute` (KST) on `weekday` (0 = Sunday) with `travel` minutes to get there, at least half an hour before its
 * usual close. 직관 only in the season (March to October); a club only on a Friday or Saturday night (no `weekday`: not open). */
export function likelyOpen(it: FunItem, minute: number, travel: number, month: number, weekday?: number): boolean {
  if (it.fun.g === 'G6' && (month < 3 || month > 10)) return false;
  const [open, close] = hoursOf(it.fun.word);
  if (open === 0 && close >= 1440) return true; // all day and night (찜질방)
  const fits = (t: number) => t >= open && t <= close - 30;
  const at = minute + travel;
  if (WEEKEND_NIGHT.test(it.fun.word)) {
    // the night the arrival belongs to: before noon it is the evening before's
    const eve = weekday === undefined ? -1 : at < 12 * 60 ? (weekday + 6) % 7 : weekday;
    if (eve !== 5 && eve !== 6) return false;
  }
  // past midnight: the same minute read as late in the evening before (a bar open to 02:00), or as early on the next day
  return fits(at) || fits(at + 1440) || (at >= 1440 && fits(at - 1440));
}

/** 지금 시간대 (ADR-0115 6): the sunset ± its hour decides 노을; night after it, late past midnight. */
export type Band = 'late' | 'morning' | 'day' | 'dusk' | 'night';
export function bandOf(minute: number, sunset: number): Band {
  if (minute < 6 * 60) return 'late';
  if (minute >= sunset - 60 && minute < sunset + 40) return 'dusk';
  if (minute >= sunset + 40) return 'night';
  return minute < 11 * 60 ? 'morning' : 'day';
}

/** 놀러 가고 싶어's curated places (ADR-0128 2, specs/seoul-curated-picks.md): no 카페·디저트 (먹기's), no 동네, only those one
 * walks into (a ticketed show or a booked room is not 「지금 가기」), no 클럽 (weekend nights only) and no 직관 out of season. */
const PLAY: ReadonlySet<FunG> = new Set(['G1', 'G2', 'G4', 'G5', 'G6', 'G7', 'G10', 'NEW']);
/** Indoors (비 와요 keeps them): bookshops·LP bars, play rooms, live venues, bars, and the week's pop-ups and exhibitions. */
const INDOOR_G: ReadonlySet<FunG> = new Set(['G4', 'G5', 'G7', 'G10']);
/** 「종류 · 동네」 with our kind (LP바, 독립서점, 방탈출), not the map's (an LP bar the map calls a 카페 is not one on 놀러's card) */
const kindLine = (word: string, line: string) => (/KOPIS/.test(word) ? line : `${word} · ${line.split(' · ').slice(1).join(' · ') || line}`);
const kakaoId = (url: string) => /place\.map\.kakao\.com\/(\d+)/.exec(url)?.[1] ?? null;
const card = (id: string, name: string, lat: number, lng: number, reason: string, image: string, url: string, opening: Spot['opening'], indoor: boolean): Spot => ({
  // 서울's own prefix (DEST.seoul.idPrefix): a heart on it is 서울's, never read as 제주's (dest.ts destOfId)
  id: `nt-${id}`, name, lat, lng, mood: 'new', sub: 'do', reason, image, kakaoPlaceId: kakaoId(url), bookable: false, score: 3, walkin: true, opening, curated: true, ...(indoor ? { indoor: true } : {}),
});
/** The curated places and the week's pop-ups, exhibitions, markets and festivals of `day` as 놀러 cards: each with its hours
 * that day as Spot.opening, so 지금's open-now rule (state.ts viewingShut) reads them like the destination's own places. A week's
 * thing whose hours that day can not be read is left out (never shown as open when it may not be). */
export function curatedSpots(day: string): Spot[] {
  const month = Number(day.slice(5, 7));
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const out: Spot[] = [];
  for (const it of funItems(day)) {
    const g = it.fun.g;
    if (g === 'hood' || !PLAY.has(g) || !it.fun.walkin || WEEKEND_NIGHT.test(it.fun.word)) continue;
    if (g === 'G6' && (month < 3 || month > 10)) continue;
    const [open, close] = hoursOf(it.fun.word);
    // all night only where the kind says so (찜질방); a kind with no hours of its own is taken as daytime to evening
    const opening: Spot['opening'] = open === 0 && close >= 1440 ? (/찜질방/.test(it.fun.word) ? 'always' : [11 * 60, 22 * 60]) : [open, close];
    out.push(card(it.id, it.title, it.lat, it.lng, kindLine(it.fun.word, it.place), it.image, it.link, opening, INDOOR_G.has(g)));
  }
  for (const it of weeklyItems(day)) {
    if (it.start > day) continue;
    const spans = parseCultureTime(it.time)?.[weekday]?.spans ?? [];
    if (!spans.length) continue;
    const opening: [number, number] = [Math.min(...spans.map((x) => x[0])), Math.max(...spans.map((x) => x[1]))];
    out.push(card(it.id, it.title, it.lat, it.lng, `${it.kind} · ${it.week.where}`, it.image, it.week.kakao, opening, it.kind === '팝업' || it.kind === '전시'));
  }
  return out;
}

let ALL: Spot[] | null = null;
/** Every place curatedSpots may ever make a card of, whatever the day and the hour: what a heart or 가 봤어요 on one is looked up
 * in (state.ts withCurated) — so it stays saved on the days it is not picked. */
export function curatedAll(): Spot[] {
  if (ALL) return ALL;
  const found: FunRow[] = FOUND_ROWS.filter((r) => r.kind === '새로 연 곳').map((r) => ({ id: r.id, name: r.name, g: 'NEW', word: r.word, lat: r.lat, lng: r.lng, line: r.line ?? `${r.word} · ${r.hood ?? r.gu ?? ''}`, walkin: true, url: r.kakao, ...(r.img ? { img: r.img } : {}) }));
  const places = [...(FILE.places as FunRow[]), ...found].filter((p) => PLAY.has(p.g) && p.walkin && !WEEKEND_NIGHT.test(p.word)).map((p) => card(p.id, p.name, p.lat, p.lng, kindLine(p.word, p.line), p.img ?? '', p.url, 'always', INDOOR_G.has(p.g)));
  const weeks = weeklyItems('').map((it) => card(it.id, it.title, it.lat, it.lng, `${it.kind} · ${it.week.where}`, it.image, it.week.kakao, 'always', false));
  return (ALL = [...places, ...weeks]);
}
