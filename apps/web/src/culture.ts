// 지금 주변 문화생활 (ADR-0112, plans/now-culture.md §0·§2): read each event's time words, keep what is open now, and pick a
// few — 홈 2, 목록 6 — nearest and most 「지금」 first, with one line saying why now. Pure: the screen and the tests share it.
// 판 2 (docs/research/culture-quality-01/04-result.md): times bound to their own weekdays, a show only before it starts (and
// only if there is time to get there), Seoul travel minutes, the clear exhibitions (museums, palaces) ahead of small notices.
import type { CultureItem } from '../functions/_lib/culture-filter';
import { distanceKm, walkMinutes, type Point } from './pick';

export type { CultureItem };

/** One weekday's read times: `spans` open from–to (minutes), `starts` a show's start times. */
export interface DayTimes {
  spans: [number, number][];
  starts: number[];
}
/** Time words read where sure: the times of each weekday it runs (0 = Sun). null = not read (the time-band rule applies). */
export type CultureTime = Partial<Record<number, DayTimes>>;

const DAYS = '일월화수목금토';
const ALL = [0, 1, 2, 3, 4, 5, 6];
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

/** A day group: 평일·주말·매일, ranges 「화-일」, lists 「수, 목, 금」 (요일 optional). */
const DAY = '[월화수목금토일](?:요일)?';
const GROUP = new RegExp(`평일|주말(?:\\s*[.·,]?\\s*공휴일)?|매일|(?:매주\\s*)?${DAY}(?:\\s*[-~,·.]\\s*${DAY})*`, 'g');
function groupDays(g: string): number[] {
  if (/평일/.test(g)) return [1, 2, 3, 4, 5];
  if (/주말/.test(g)) return [0, 6];
  if (/매일/.test(g)) return ALL;
  const t = g.replace(/요일|매주/g, '');
  const out = new Set<number>();
  for (const m of t.matchAll(/([월화수목금토일])\s*[-~]\s*([월화수목금토일])/g)) dayRange(m[1], m[2]).forEach((d) => out.add(d));
  for (const m of t.replace(/([월화수목금토일])\s*[-~]\s*([월화수목금토일])/g, ' ').matchAll(/[월화수목금토일]/g)) out.add(dayIdx(m[0]));
  return [...out];
}

/** Closed weekdays: the day words in the clause that ends in 휴관·휴무·공연없음. */
// (the clause holds no clock time: 「10:00~18:00 수요일 휴관」 keeps its hours)
const CLOSED = /([^/※()\n\d:~|]{0,30}?)(?:휴관|휴무|공연\s*없음)/g;
function closedIn(s: string): number[] {
  const out = new Set<number>();
  for (const m of s.matchAll(CLOSED)) {
    const clause = m[1].replace(/공휴일|명절|추석|설날|개교기념일|\d+\/\d+|\d+\.\d+/g, ' ');
    for (const g of clause.match(GROUP) ?? []) groupDays(g).forEach((d) => out.add(d));
  }
  return [...out];
}

function timesIn(seg: string): DayTimes {
  const spans: [number, number][] = [];
  for (const m of seg.matchAll(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g)) {
    const a = toMin(m[1], m[2]);
    const b = toMin(m[3], m[4]);
    if (b > a) spans.push([a, b]);
  }
  const rest = seg.replace(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g, ' ');
  const starts = [...rest.matchAll(/(?<![\d:])(\d{1,2}):(\d{2})(?!\s*까지)/g)].map((m) => toMin(m[1], m[2])).filter((m) => m >= 360 && m < 1440);
  return { spans, starts: [...new Set(starts)].sort((a, b) => a - b) };
}
const empty = (t: DayTimes) => !t.spans.length && !t.starts.length;

/** Read the time words, each weekday's own. null: not sure (several programmes, dates, 협의, 상시, no clock time). */
export function parseCultureTime(raw: string): CultureTime | null {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || /상이|협의|상시|운영시간 내|조정|소요시간|\d+\s*월\s*\d+\s*일|\d+\.\s*\d+\.|\d+\/\d+\(|격주|마지막\s*주|째\s*주|주차|하절기|동절기|\d+\s*-\s*\d+\s*월/.test(s)) return null;
  // 입장 마감·이용 시간 같은 덧말과 「…까지 연장/야간개관」은 시각으로 읽지 않는다
  const body = s
    .replace(/[(（][^)）]*(마감|입장|이용|까지)[^)）]*[)）]/g, ' ')
    .replace(/(입장|관람)\s*마감\s*:?\s*\d{1,2}:\d{2}/g, ' ')
    .replace(new RegExp(`(${DAY}\\s*)?\\d{1,2}:\\d{2}\\s*까지[^/,]*`, 'g'), ' ');
  const closed = closedIn(body);
  const open = body.replace(CLOSED, ' ');
  // day groups in order; the times after a group (up to the next) are that group's
  const groups = [...open.matchAll(GROUP)].filter((m) => groupDays(m[0]).length);
  const out: CultureTime = {};
  const lead = timesIn(groups.length ? open.slice(0, groups[0].index) : open);
  const give = (days: number[], t: DayTimes) => {
    for (const d of days) {
      if (closed.includes(d)) continue;
      const cur = out[d] ?? { spans: [], starts: [] };
      out[d] = { spans: [...cur.spans, ...t.spans], starts: [...new Set([...cur.starts, ...t.starts])].sort((a, b) => a - b) };
    }
  };
  if (!groups.length) {
    if (empty(lead)) return null;
    give(ALL, lead);
    return out;
  }
  let any = false;
  groups.forEach((g, i) => {
    const seg = open.slice(g.index! + g[0].length, i + 1 < groups.length ? groups[i + 1].index : undefined);
    const t = timesIn(seg);
    if (!empty(t)) {
      give(groupDays(g[0]), t);
      any = true;
    }
  });
  // 「10:00~18:00, 화-일」처럼 시각이 앞에 오고 요일 묶음이 뒤에 붙은 꼴: 앞 시각이 그 요일들의 것
  if (!any && !empty(lead)) {
    give([...new Set(groups.flatMap((g) => groupDays(g[0])))], lead);
    any = true;
  } else if (!empty(lead)) give(ALL.filter((d) => out[d] === undefined), lead);
  return any ? out : null;
}

const INDOOR_SHUT: [number, number] = [19 * 60, 9 * 60];
const within = (m: number, [from, to]: [number, number]) => (from <= to ? m >= from && m < to : m >= from || m < to);
/** Night is what these are for: an unread time keeps them in the evening (ADR-0112 4). */
const NIGHT_KIND = (it: CultureItem) => /야간|夜|밤|나이트|night|야경|야시장|빛|라이트/i.test(`${it.title} ${it.time}`);
/** A show is entered at its start: its span's start is a start time. */
const SHOW = /연극|뮤지컬|콘서트|클래식|국악|무용|오페라|공연|영화/;

export interface Now {
  day: string; // YYYY-MM-DD (KST)
  weekday: number; // 0 = Sun
  minute: number;
}

/** Open now, by today's own read times; a show only before its start (`travel`: minutes to get there); with no time read, the
 * time-band rule (ADR-0111 3 as ADR-0112 4 widens it) — and a festival whose time is not read is left out (no time, no place to
 * be at). */
export function openNow(it: CultureItem, now: Now, t: CultureTime | null = parseCultureTime(it.time), travel = 0): 'open' | 'later' | 'shut' | 'unknown' {
  if (now.day < it.start || now.day > it.end) return 'shut';
  if (!t) {
    if (it.kind.startsWith('축제') && !NIGHT_KIND(it)) return 'shut';
    return !NIGHT_KIND(it) && within(now.minute, INDOOR_SHUT) ? 'shut' : 'unknown';
  }
  const today = t[now.weekday];
  if (!today) return 'shut';
  const show = SHOW.test(it.kind);
  const starts = show ? [...today.starts, ...today.spans.map(([a]) => a)] : today.starts;
  if (!show && today.spans.some(([a, b]) => now.minute >= a && now.minute + Math.min(travel, 30) < b)) return 'open';
  if (starts.some((s) => now.minute + travel <= s) || (!show && today.spans.some(([a]) => now.minute + travel <= a))) return 'later';
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

/** 이름난 곳(박물관·미술관·궁·큰 공연장)의 기획은 앞으로, 동네 시설의 안내·소모임은 뒤로 (품질 01 원인 4). */
const MAJOR = /박물관|미술관|궁$|궁 |궁\]|궁궐|DDP|동대문디자인플라자|세종문화회관|예술의전당|국립|시립|서울공예|아트센터|문화비축기지|한옥마을|SeMA|MMCA/;
const MINOR = /도서관|주민센터|복지관|구청|동 행정|평생학습|청소년센터|작은도서관|강의실|세미나실/;
export const prominence = (it: CultureItem) => (MAJOR.test(`${it.place} ${it.title}`) ? 0 : MINOR.test(`${it.place} ${it.title}`) ? 2 : 1);

/** 서울에서 걸어서(1.2km 안) 또는 차·대중교통으로 걸리는 분: 출발·주차 10분 + km당 3분(시속 20km). 제주 기준 driveMinutes는 서울에서 짧다. */
export function seoulMinutes(km: number): { walk: boolean; minutes: number } {
  if (km < 1.2) return { walk: true, minutes: walkMinutes(km) };
  return { walk: false, minutes: Math.round((10 + km * 3) / 5) * 5 };
}

/** The why line's words (ADR-0093: another language's table replaces them, culture-view.ts words). `until`: the weekday it
 * ends (0 = Sun); times as 19:30. */
export const WHY_TEXT = {
  only: '오늘만',
  today: '오늘까지',
  until: (weekday: number) => `${DAY_NAMES[weekday]}요일까지`,
  openTill: (time: string) => `지금 열림 · ${time}까지`,
  starts: (time: string) => `${time} 시작`,
  free: '무료',
};

/** The one line: why now. */
export function whyNow(it: CultureItem, now: Now, t: CultureTime | null, state: string): string {
  const parts: string[] = [];
  const left = daysBetween(now.day, it.end);
  if (it.start === it.end) parts.push(WHY_TEXT.only);
  else if (left <= 0) parts.push(WHY_TEXT.today);
  else if (left <= 6) parts.push(WHY_TEXT.until((now.weekday + left) % 7));
  const today = t?.[now.weekday];
  const show = SHOW.test(it.kind);
  const closes = today?.spans.find(([a, b]) => now.minute >= a && now.minute < b)?.[1];
  const next = [...(today?.starts ?? []), ...(show ? (today?.spans ?? []).map(([a]) => a) : [])].filter((s) => s > now.minute).sort((a, b) => a - b)[0] ?? today?.spans.find(([a]) => a > now.minute)?.[0];
  if (state === 'open' && closes !== undefined) parts.push(WHY_TEXT.openTill(hhmm(closes)));
  else if (state === 'later' && next !== undefined) parts.push(WHY_TEXT.starts(hhmm(next)));
  if (it.free) parts.push(WHY_TEXT.free);
  return parts.join(' · ');
}

export interface Pick {
  item: CultureItem;
  minutes: number;
  walk: boolean;
  why: string;
}

/** 홈 2, 목록 6 (ADR-0112 2·5): open now or later today with time to get there; 3km 안 > 5km 안 (그 밖은 뺌);
 * then 이름난 곳과 지금성(오늘·이번 주 끝남은 더 앞으로), then read time, then 누구나·무료, then distance; 같은 종류 둘(전시 셋)·같은 장소 하나.
 * 홈은 3km 안만. */
export function pickCulture(items: CultureItem[], origin: Point, now: Now): { home: Pick[]; list: Pick[] } {
  const ranked = items
    .map((item) => {
      const km = distanceKm(origin, item);
      const { walk, minutes } = seoulMinutes(km);
      const t = parseCultureTime(item.time);
      const state = openNow(item, now, t, minutes);
      return { item, t, state, km, walk, minutes, band: km <= 3 ? 0 : km <= 5 ? 1 : 3, weight: nowness(item, now.day) + 2 * prominence(item) - (nowness(item, now.day) <= 1 ? 2 : 0) };
    })
    .filter((c) => c.state !== 'shut' && c.band <= 2)
    .sort(
      (a, b) =>
        a.band - b.band ||
        a.weight - b.weight ||
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
    // 같은 종류 둘까지 — 전시는 셋(볼 만한 전시가 몰린 동네에서 잘리지 않게, 품질 02)
    if ((kinds.get(c.item.kind) ?? 0) >= (c.item.kind.startsWith('전시') ? 3 : 2) || places.has(place)) continue;
    kinds.set(c.item.kind, (kinds.get(c.item.kind) ?? 0) + 1);
    places.add(place);
    list.push({ item: c.item, minutes: c.minutes, walk: c.walk, why: whyNow(c.item, now, c.t, c.state) });
  }
  const home = list.filter((p) => distanceKm(origin, p.item) <= 3).slice(0, 2);
  return { home, list };
}
