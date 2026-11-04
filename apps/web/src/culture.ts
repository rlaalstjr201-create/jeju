// 지금 주변 문화생활 (ADR-0112, plans/now-culture.md §0·§2): read each event's time words, keep what is open now, and pick a
// few — 홈 2, 목록 6 — nearest and most 「지금」 first, with one line saying why now. Pure: the screen and the tests share it.
import type { CultureItem } from '../functions/_lib/culture-filter';
import { distanceKm, driveMinutes, walkMinutes, type Point } from './pick';

export type { CultureItem };

/** Time words read where sure. `days`: weekdays it runs (0 = Sun), null = every day. `spans`: open from–to (minutes);
 * `starts`: a show's start times. null overall = not read (the time-band rule applies). */
export interface CultureTime {
  days: number[] | null;
  spans: [number, number][];
  starts: number[];
}

const DAYS = '일월화수목금토';
const dayIdx = (c: string) => DAYS.indexOf(c);
function dayRange(a: string, b: string): number[] {
  const out: number[] = [];
  for (let i = dayIdx(a); ; i = (i + 1) % 7) {
    out.push(i);
    if (i === dayIdx(b) || out.length > 7) break;
  }
  return out;
}
const toMin = (h: string, m: string) => Number(h) * 60 + Number(m);

/** Weekdays named in `s` (ranges 「화-일」, lists 「수, 목, 금」, 평일·주말·매일), or null when none is named. */
function daysIn(s: string): number[] | null {
  const set = new Set<number>();
  let named = false;
  if (/매일|연중무휴|월\s*-\s*일요?일?(?!\s*휴)/.test(s)) return null;
  if (/평일/.test(s)) [1, 2, 3, 4, 5].forEach((d) => set.add(d)), (named = true);
  if (/주말/.test(s)) [0, 6].forEach((d) => set.add(d)), (named = true);
  const t = s.replace(/요일/g, '');
  for (const m of t.matchAll(/([월화수목금토일])\s*[-~]\s*([월화수목금토일])/g)) dayRange(m[1], m[2]).forEach((d) => set.add(d)), (named = true);
  const rest = t.replace(/([월화수목금토일])\s*[-~]\s*([월화수목금토일])/g, ' ');
  for (const m of rest.matchAll(/(?:^|[\s,·(/|])([월화수목금토일])(?=$|[\s,·)/|])/g)) set.add(dayIdx(m[1])), (named = true);
  return named ? [...set].sort() : null;
}

/** Closed weekdays: the day words in the clause that ends in 휴관·휴무·공연없음. */
function closedIn(s: string): number[] {
  const out = new Set<number>();
  for (const m of s.matchAll(/([^/※()\n]{0,30}?)(?:휴관|휴무|공연\s*없음)/g)) {
    const clause = m[1].replace(/공휴일|명절|추석|설날|개교기념일|\d+\/\d+|\d+\.\d+/g, ' ');
    for (const d of daysIn(clause) ?? []) out.add(d);
  }
  return [...out];
}

/** Read the time words. null: not sure (several programmes, dates, 협의, 상시, no clock time at all). */
export function parseCultureTime(raw: string): CultureTime | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || /상이|협의|상시|운영시간 내|조정|소요시간|\d+\s*월\s*\d+\s*일|\d+\.\s*\d+\.|\d+\/\d+\(|격주|마지막\s*주|째\s*주|주차/.test(s)) return null;
  // 입장 마감·이용 시간 같은 덧말은 시각으로 읽지 않는다
  const body = s.replace(/[(（][^)）]*(마감|입장|이용|까지)[^)）]*[)）]/g, ' ').replace(/(입장|관람)\s*마감\s*:?\s*\d{1,2}:\d{2}/g, ' ');
  const spans: [number, number][] = [];
  for (const m of body.matchAll(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g)) {
    const a = toMin(m[1], m[2]);
    const b = toMin(m[3], m[4]);
    if (b > a) spans.push([a, b]);
  }
  const rest = body.replace(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g, ' ');
  const starts = [...rest.matchAll(/(?<![\d:])(\d{1,2}):(\d{2})(?!\s*까지)/g)].map((m) => toMin(m[1], m[2])).filter((m) => m >= 360 && m < 1440);
  if (!spans.length && !starts.length) return null;
  const closed = closedIn(body);
  // days: what is named outside the closed clause; with nothing named, every day but the closed ones
  const openText = body.replace(/([^/※()\n]{0,30}?)(?:휴관|휴무|공연\s*없음)/g, ' ');
  let days = daysIn(openText);
  if (closed.length) days = (days ?? [0, 1, 2, 3, 4, 5, 6]).filter((d) => !closed.includes(d));
  return { days, spans, starts: [...new Set(starts)].sort((a, b) => a - b) };
}

const INDOOR_SHUT: [number, number] = [19 * 60, 9 * 60];
const within = (m: number, [from, to]: [number, number]) => (from <= to ? m >= from && m < to : m >= from || m < to);
/** Night is what these are for: an unread time keeps them in the evening (ADR-0112 4). */
const NIGHT_KIND = (it: CultureItem) => it.kind.startsWith('축제') || /야간|夜|밤|나이트|night|야경|야시장/i.test(`${it.title} ${it.time}`);

export interface Now {
  day: string; // YYYY-MM-DD (KST)
  weekday: number; // 0 = Sun
  minute: number;
}

/** Open now, by its read time; with none read, the time-band rule (ADR-0111 3 as ADR-0112 4 widens it). A show is kept
 * until an hour after its last start today. */
export function openNow(it: CultureItem, now: Now, t: CultureTime | null = parseCultureTime(it.time)): 'open' | 'later' | 'shut' | 'unknown' {
  if (now.day < it.start || now.day > it.end) return 'shut';
  if (!t) return !NIGHT_KIND(it) && within(now.minute, INDOOR_SHUT) ? 'shut' : 'unknown';
  if (t.days && !t.days.includes(now.weekday)) return 'shut';
  if (t.spans.some(([a, b]) => now.minute >= a && now.minute < b)) return 'open';
  if (t.spans.some(([a]) => now.minute < a) || t.starts.some((s) => now.minute < s)) return 'later';
  if (t.starts.some((s) => now.minute >= s && now.minute < s + 60)) return 'open';
  return 'shut';
}

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** 지금성: 오늘만·오늘까지 0, 이번 주 끝남 1, 한 달 안 2, 넉 달 안 3, 그 밖 4. */
export function nowness(it: CultureItem, day: string): number {
  const left = daysBetween(day, it.end);
  const span = daysBetween(it.start, it.end);
  if (left <= 0) return 0;
  if (left <= 6) return 1;
  if (span <= 31) return 2;
  if (span <= 120) return 3;
  return 4;
}

/** The one line: why now. */
export function whyNow(it: CultureItem, now: Now, t: CultureTime | null, state: string): string {
  const parts: string[] = [];
  const left = daysBetween(now.day, it.end);
  if (it.start === it.end) parts.push('오늘만');
  else if (left <= 0) parts.push('오늘까지');
  else if (left <= 6) parts.push(`${DAY_NAMES[(now.weekday + left) % 7]}요일까지`);
  const next = t?.starts.find((s) => s > now.minute) ?? t?.spans.find(([a]) => a > now.minute)?.[0];
  const closes = t?.spans.find(([a, b]) => now.minute >= a && now.minute < b)?.[1];
  if (state === 'open') parts.push(closes !== undefined ? `지금 열림 · ${hhmm(closes)}까지` : '지금 하는 중');
  else if (state === 'later' && next !== undefined) parts.push(`${hhmm(next)} 시작`);
  if (it.free) parts.push('무료');
  return parts.join(' · ');
}

export interface Pick {
  item: CultureItem;
  minutes: number;
  walk: boolean;
  why: string;
}

/** 홈 2, 목록 6 (ADR-0112 2·5): open or later today, within 차로 15분 for the home and 30분 for the list; nearest band,
 * then 지금성, then read time, then 누구나·무료, then distance; 같은 종류 둘·같은 장소 하나. */
export function pickCulture(items: CultureItem[], origin: Point, now: Now): { home: Pick[]; list: Pick[] } {
  const ranked = items
    .map((item) => {
      const t = parseCultureTime(item.time);
      const state = openNow(item, now, t);
      const km = distanceKm(origin, item);
      const walk = km < 1.2 && walkMinutes(km) <= 15;
      const minutes = walk ? walkMinutes(km) : driveMinutes(km);
      return { item, t, state, km, walk, minutes, band: walk ? 0 : driveMinutes(km) <= 15 ? 1 : driveMinutes(km) <= 30 ? 2 : 3 };
    })
    .filter((c) => c.state !== 'shut' && c.band <= 2)
    .sort(
      (a, b) =>
        a.band - b.band ||
        nowness(a.item, now.day) - nowness(b.item, now.day) ||
        Number(!a.t) - Number(!b.t) ||
        Number(b.item.forAll && b.item.free) - Number(a.item.forAll && a.item.free) ||
        a.km - b.km,
    );
  const list: Pick[] = [];
  const kinds = new Map<string, number>();
  const places = new Set<string>();
  for (const c of ranked) {
    if (list.length >= 6) break;
    const place = c.item.place.replace(/\s+/g, '');
    if ((kinds.get(c.item.kind) ?? 0) >= 2 || places.has(place)) continue;
    kinds.set(c.item.kind, (kinds.get(c.item.kind) ?? 0) + 1);
    places.add(place);
    list.push({ item: c.item, minutes: c.minutes, walk: c.walk, why: whyNow(c.item, now, c.t, c.state) });
  }
  const home = list.filter((p, i) => i < 6 && (p.walk || driveMinutes(distanceKm(origin, p.item)) <= 15)).slice(0, 2);
  return { home, list };
}
