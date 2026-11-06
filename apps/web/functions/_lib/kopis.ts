// KOPIS 공연예술통합전산망 → 지금 주변 문화생활 항목 (ADR-0113 2·3·4). Pure: the function (functions/api/culture.ts), the
// tests and the quality run (kopisItems on saved raw data) share it. KOPIS answers XML only; its records are flat enough
// for a tag look-up.
import { decode, inSeoul, normTitle, type CultureItem } from './culture-filter';

/** Each <db>…</db> record of an answer. */
export const xmlRecords = (xml: string): string[] => [...xml.matchAll(/<db>([\s\S]*?)<\/db>/g)].map((m) => m[1]);
/** The first <tag>'s text, entities undone and spaces folded ('' when absent or empty). */
export function xmlTag(rec: string, tag: string): string {
  const m = rec.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : '';
}

/** A show's detail (pblprfr/{mt20id}), the fields used. */
export interface KopisShow {
  id: string; // mt20id
  title: string;
  from: string; // YYYY-MM-DD
  to: string;
  venue: string; // mt10id
  place: string; // fcltynm
  cast: string; // prfcast as written
  genre: string;
  child: boolean;
  dt: string; // dtguidance as written
  age: string;
  price: string;
  poster: string;
  link: string;
}

const ymd = (s: string) => s.replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, '$1-$2-$3');

/** pblprfr/{id}'s answer, or null when it holds no show. */
export function parseShow(xml: string): KopisShow | null {
  const r = xmlRecords(xml)[0];
  if (!r) return null;
  const id = xmlTag(r, 'mt20id');
  if (!id) return null;
  return {
    id,
    title: xmlTag(r, 'prfnm'),
    from: ymd(xmlTag(r, 'prfpdfrom')),
    to: ymd(xmlTag(r, 'prfpdto')),
    venue: xmlTag(r, 'mt10id'),
    // 「극장 (홀)」; a hall named as its venue once: 「아스트라홀 (아스트라홀)」 → 「아스트라홀」; otherwise as the Seoul list writes
    // it, 「세종문화회관 (세종대극장)」 → 「세종문화회관 세종대극장」, so one hall is one place in the picks (품질 04: 라보엠 twice)
    place: xmlTag(r, 'fcltynm').replace(/^(.+?)\s*\(\s*\1\s*\)$/, '$1').replace(/\s*\(\s*([^()]+?)\s*\)\s*$/, ' $1').trim(),
    cast: xmlTag(r, 'prfcast'),
    genre: xmlTag(r, 'genrenm'),
    child: xmlTag(r, 'child') === 'Y',
    dt: xmlTag(r, 'dtguidance'),
    age: xmlTag(r, 'prfage'),
    price: xmlTag(r, 'pcseguidance'),
    poster: xmlTag(r, 'poster'),
    link: xmlTag(r, 'relateurl'),
  };
}

/** pblprfr (the day's list): the show ids. */
export const listIds = (xml: string): string[] => xmlRecords(xml).map((r) => xmlTag(r, 'mt20id')).filter((id) => /^PF\d{5,8}$/.test(id));

/** 종류 (ADR-0113 2): KOPIS 장르 → the Seoul list's own kinds, so 「같은 종류 둘」 counts both alike. */
export function kopisKind(genre: string): string {
  if (genre.startsWith('연극')) return '연극';
  if (genre.startsWith('뮤지컬')) return '뮤지컬/오페라';
  if (genre.startsWith('서양음악')) return '클래식';
  if (genre.startsWith('대중음악')) return '콘서트';
  if (genre.startsWith('한국음악')) return '국악';
  if (genre.startsWith('무용')) return '무용';
  return '기타';
}

const WD = '[월화수목금토일]';
const DAYS_OK = new RegExp(`^${WD}(-${WD})?(, ${WD}(-${WD})?)*$`);
/** 회차 (ADR-0113 2): 「화요일 ~ 금요일(20:00), 토요일(15:00,19:00)」 → 「화-금요일 20:00 / 토요일 15:00, 19:00」, the Seoul
 * list's time words (src/culture/culture.ts parseCultureTime reads them). A group not read (HOL, words in place of a time) is left
 * out; '' when none is read — that show is left out. */
export function kopisTime(dt: string): string {
  const out: string[] = [];
  for (const m of decode(dt).matchAll(/([^()]*)\(([^()]*)\)/g)) {
    const days = m[1].replace(/^[\s,]+|[\s,]+$/g, '').replace(/요일/g, '').replace(/\s*~\s*/g, '-').replace(/\s*,\s*/g, ', ');
    const times = m[2].split(',').map((t) => t.trim());
    if (!DAYS_OK.test(days) || !times.every((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))) continue;
    out.push(`${days}요일 ${times.join(', ')}`);
  }
  return out.join(' / ');
}

/** 출연 (ADR-0113 4): the first two names, 「김상우·이원우」; '' when none. */
export function kopisCast(cast: string): string {
  const names = cast
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,，、/]/)
    .map((n) => n.replace(/\s*등\s*$/, '').trim())
    .filter((n) => n && n !== '등');
  return names.slice(0, 2).join('·');
}

/** Why a show is left out on `day` (ADR-0113 3), or null to keep it. `venues`: mt10id → [lat, lng]. */
export function kopisDrop(s: KopisShow, venues: Record<string, readonly [number, number]>, day: string): string | null {
  if (!s.title) return 'no-title';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.from) || !/^\d{4}-\d{2}-\d{2}$/.test(s.to) || s.to < s.from) return 'no-period';
  if (!(s.from <= day && day <= s.to)) return 'not-today';
  if (s.child || /어린이|키즈|가족/.test(s.title)) return 'kids-only';
  const at = venues[s.venue];
  if (!at || !inSeoul(at[0], at[1])) return 'coords';
  if (!kopisTime(s.dt)) return 'no-time';
  return null;
}

/** The shows kept for `day`, one per title, as items (id `kp-{mt20id}`). The quality run calls this on saved raw data. */
export function kopisItems(shows: readonly KopisShow[], venues: Record<string, readonly [number, number]>, day: string): CultureItem[] {
  const seen = new Set<string>();
  const out: CultureItem[] = [];
  for (const s of shows) {
    if (kopisDrop(s, venues, day)) continue;
    const key = normTitle(s.title);
    if (seen.has(key)) continue;
    seen.add(key);
    const [lat, lng] = venues[s.venue];
    const cast = kopisCast(s.cast);
    out.push({
      id: `kp-${s.id}`,
      title: s.title,
      kind: kopisKind(s.genre),
      place: s.place,
      gu: '',
      lat,
      lng,
      start: s.from,
      end: s.to,
      time: kopisTime(s.dt),
      free: /무료/.test(s.price) && !/\d\s*원/.test(s.price),
      forAll: /전체/.test(s.age),
      link: s.link,
      image: s.poster.replace(/^http:\/\//i, 'https://'),
      ...(cast ? { cast } : {}),
    });
  }
  return out;
}

/** The Seoul list and the shows together; a show whose title the Seoul list already has is left out (Seoul's is kept). */
export function mergeCulture(seoul: readonly CultureItem[], shows: readonly CultureItem[]): CultureItem[] {
  const seen = new Set(seoul.map((i) => normTitle(i.title)));
  return [...seoul, ...shows.filter((i) => !seen.has(normTitle(i.title)))];
}
