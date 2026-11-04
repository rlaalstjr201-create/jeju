// 서울시 문화행사(culturalEventInfo) → 지금 주변 문화생활 항목 (ADR-0112 3, plans/now-culture.md §1·§2-1).
// The function (functions/api/culture.ts) and the tests share this: what is left out never reaches the app.

export interface SeoulRow {
  CODENAME?: string;
  GUNAME?: string;
  TITLE?: string;
  DATE?: string;
  PLACE?: string;
  ORG_NAME?: string;
  USE_TRGT?: string;
  USE_FEE?: string;
  PLAYER?: string;
  PROGRAM?: string;
  ETC_DESC?: string;
  ORG_LINK?: string;
  MAIN_IMG?: string;
  STRTDATE?: string;
  END_DATE?: string;
  LOT?: string;
  LAT?: string;
  IS_FREE?: string;
  HMPG_ADDR?: string;
  PRO_TIME?: string;
}

/** What the app gets: one row per event, its time words as written (the app reads them, src/culture.ts). */
export interface CultureItem {
  id: string;
  title: string;
  kind: string;
  place: string;
  gu: string;
  lat: number;
  lng: number;
  start: string; // YYYY-MM-DD
  end: string;
  time: string;
  free: boolean;
  forAll: boolean;
  link: string;
  image: string;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ', middot: '·' };
export const decode = (s: string | undefined) =>
  String(s ?? '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      ENTITY[e.toLowerCase()] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m),
    )
    .replace(/\s+/g, ' ')
    .trim();

/** 서울 안(넉넉한 상자): 위도·경도가 뒤바뀌었거나 0이면 밖이다. */
const inSeoul = (lat: number, lng: number) => lat >= 37.41 && lat <= 37.72 && lng >= 126.76 && lng <= 127.19;

/** 교육/체험: 신청·회차로 들어가는 강좌는 여행자가 지금 갈 수 없다. 야간·투어·현장 체험만 남긴다. */
const SERIES = /강좌|강의|강연|수업|교실|모집|접수|회차|학급|단체|인문학|아카데미|워크숍|클래스|\d+\s*기|기수|과정|특강|세미나|독서|토론|북클럽|스터디|프로그램 안내|문화프로그램|정기|심화|입문/;
const DROP_IN = /야간|夜|밤|투어|탐방|산책|축제|현장\s*체험|자유\s*체험|상설\s*체험|체험존|공연/;
/** 대상이 아이 단체·유아만이면 여행자 대상이 아니다. */
const KIDS_ONLY = /단체|학급|유아|영유아|미취학|초등|어린이\s*\(|아동/;
const FOR_ALL = /누구나|전체|제한\s*없|시민/;
const ONLINE = /온라인|비대면|zoom|유튜브\s*라이브/i;

export const day10 = (s: string | undefined) => String(s ?? '').slice(0, 10);
const normTitle = (t: string) => t.replace(/[\s[\]()「」『』<>《》〈〉【】·,.:'"!?~\-]/g, '').toLowerCase();

/** Why a row is left out, or null to keep it. */
export function dropReason(r: SeoulRow, day: string): string | null {
  const title = decode(r.TITLE);
  const kind = decode(r.CODENAME);
  const time = decode(r.PRO_TIME);
  const trgt = decode(r.USE_TRGT);
  if (!title) return 'no-title';
  const start = day10(r.STRTDATE);
  const end = day10(r.END_DATE);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return 'no-period';
  if (!(start <= day && day <= end)) return 'not-today';
  const lat = Number(r.LAT);
  const lng = Number(r.LOT);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inSeoul(lat, lng)) return 'coords';
  if (ONLINE.test(`${time} ${decode(r.PLACE)}`)) return 'online';
  if (KIDS_ONLY.test(trgt) && !FOR_ALL.test(trgt)) return 'kids-only';
  // 대상 칸이 비었거나 「누구나」여도, 제목이 아이 행사(어린이열람실·어린이박물관 체험 등)면 여행자 대상이 아니다
  if (/어린이|키즈|유아|아동|그림책|동화|맘껏|놀이터|가족\s*놀이/.test(title)) return 'kids-only';
  // 안내문·모집 글·강좌는 어느 종류로 올라와도 지금 갈 행사가 아니다 (품질 01 원인 5)
  if (/프로그램\s*안내|안내\s*$|모집|강좌|교실|수강/.test(title)) return 'class';
  if (kind.startsWith('교육') && (SERIES.test(`${title} ${time}`) || !DROP_IN.test(`${title} ${time}`))) return 'class';
  return null;
}

/** Rows kept for `day`, one per title (a 회차 repeated as rows is one event), as items. */
export function cultureItems(rows: SeoulRow[], day: string): CultureItem[] {
  const seen = new Set<string>();
  const out: CultureItem[] = [];
  for (const r of rows) {
    if (dropReason(r, day)) continue;
    const title = decode(r.TITLE);
    const key = normTitle(title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `sc-${key.slice(0, 40)}-${day10(r.STRTDATE)}`,
      title,
      kind: decode(r.CODENAME),
      place: decode(r.PLACE),
      gu: decode(r.GUNAME),
      lat: Number(r.LAT),
      lng: Number(r.LOT),
      start: day10(r.STRTDATE),
      end: day10(r.END_DATE),
      time: decode(r.PRO_TIME),
      free: decode(r.IS_FREE) === '무료',
      forAll: FOR_ALL.test(decode(r.USE_TRGT)),
      link: decode(r.ORG_LINK) || decode(r.HMPG_ADDR),
      image: decode(r.MAIN_IMG).replace(/^http:\/\//i, 'https://'),
    });
  }
  return out;
}
