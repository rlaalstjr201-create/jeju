// Outbound links (ADR-0025: 예약은 외부 링크; ADR-0071: 지도 앱은 네이버지도 기본, 카카오맵 · TMAP 선택).
import { inJeju } from './areas';
import { cleanName } from './data';
import { distanceKm, islandOf, withinReach, type Island, type Point, type Spot } from './pick';

// No kakaoPlaceId → Kakao Map name search (ADR-0028). Short names ('담다', '회심') match places all over
// Korea, so the query is scoped to 제주 unless the name already says where it is (S56). To switch to an
// exact coordinate pin instead (design/SPEC.md decision D4), return
// `https://map.kakao.com/link/map/${encodeURIComponent(name)},${s.lat},${s.lng}`.
export function kakaoUrl(s: Spot): string {
  if (s.kakaoPlaceId) return `https://place.map.kakao.com/${encodeURIComponent(s.kakaoPlaceId)}`;
  return searchUrl(s);
}

function searchUrl(s: Spot): string {
  const name = cleanName(s.name);
  const q = /제주|서귀포/.test(name) ? name : `제주 ${name}`;
  return `https://map.kakao.com/link/search/${encodeURIComponent(q)}`;
}

/** The map app the cards open (ADR-0071), chosen at the foot of 저장한 곳. */
export type MapApp = 'naver' | 'kakao' | 'tmap';
export const MAP_APPS: readonly MapApp[] = ['naver', 'kakao', 'tmap'];
export const DEFAULT_MAP_APP: MapApp = 'naver';
export const MAP_APP_NAME: Record<MapApp, string> = { naver: '네이버지도', kakao: '카카오맵', tmap: 'TMAP' };

/** Naver Map place search for "{이름} 제주" (ADR-0071: no Naver place ids in the data). Like Kakao's search, the
 * name is scoped to 제주 unless it already says where it is. On a phone Naver sends it on to its app-or-web page. */
export function naverSearchUrl(s: Spot): string {
  const name = cleanName(s.name);
  const q = /제주|서귀포/.test(name) ? name : `${name} 제주`;
  return `https://map.naver.com/p/search/${encodeURIComponent(q)}`;
}

/** The card's own link (its name and photo, ADR-0071): Kakao keeps its place page; Naver and TMAP (which has
 * no web page to open) use the Naver search. */
export const placeApp = (app: MapApp): Exclude<MapApp, 'tmap'> => (app === 'kakao' ? 'kakao' : 'naver');
export const placeUrl = (s: Spot, app: MapApp): string => (placeApp(app) === 'kakao' ? kakaoUrl(s) : naverSearchUrl(s));

/** 길찾기 in Naver Map (ADR-0071): the web directions page with only the end (`-` = no start), so it starts where
 * the phone is. On a phone Naver sends it on to its app-or-web page (`m.map.naver.com/appLink.naver`) and from
 * there to `app.map.naver.com/launchApp/…` (the app when installed, else Naver's mobile-web directions with the
 * same end and mode); on a PC it is the directions page. A comma or a slash would split the link: spaces. */
export function naverDirectionsUrl(s: Spot, by: 'car' | 'foot'): string {
  if (!inJeju(s)) return naverSearchUrl(s);
  const name = cleanName(s.name.replace(/[,/]/g, ' '));
  return `https://map.naver.com/p/directions/-/${s.lng},${s.lat},${encodeURIComponent(name)},,/-/${by === 'foot' ? 'walk' : 'car'}`;
}

/** 길찾기 in TMAP (ADR-0071): its app scheme, car only, end only. TMAP has no web page to fall back on without
 * an API key, so this opens only where the app is (the setting says so). */
export function tmapUrl(s: Spot): string {
  if (!inJeju(s)) return naverSearchUrl(s);
  return `tmap://route?goalname=${encodeURIComponent(cleanName(s.name))}&goalx=${s.lng}&goaly=${s.lat}`;
}

/** 길찾기 (ADR-0067): Kakao Map car directions to the spot, starting where the phone is. One https link for every
 * phone: on mobile Kakao redirects it to its own mobile-web scheme (`m.map.kakao.com/scheme/route?ep=…&by=car`),
 * which opens the app when installed and the mobile web otherwise; on a PC it opens the 자동차 tab. A comma or a
 * slash would split the link, so they become spaces. No usable coordinates → the name search. */
export function directionsUrl(s: Spot): string {
  if (!inJeju(s)) return searchUrl(s);
  const name = cleanName(s.name.replace(/[,/]/g, ' '));
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${s.lat},${s.lng}`;
}

/** 걸어서 길찾기 (ADR-0069): Kakao's mobile-web scheme with no start (`sp`), so it starts where the phone is and
 * nothing about the phone leaves it. It is the same link Kakao itself sends `link/to` on to for cars, with
 * `by=foot`: the app when installed, else Kakao's own app-or-web page; on a PC Kakao turns it into its
 * directions page with the place as the end. No usable coordinates → the name search. */
export function walkDirectionsUrl(s: Spot): string {
  if (!inJeju(s)) return searchUrl(s);
  const name = cleanName(s.name);
  return `https://m.map.kakao.com/scheme/route?ep=${s.lat},${s.lng}&en=${encodeURIComponent(name)}&by=foot`;
}

/** Where each small island's boat leaves from (ADR-0069). Pins: Kakao Map place search, 2026-10-01 (`kakao` =
 * its place id). 마라도 also has a cruise from 산이수동항(송악산); 운진항 is the regular ferry for both islands. */
export const TERMINALS: Record<Island, { name: string; lat: number; lng: number; kakao: string }> = {
  우도: { name: '성산포항 종합여객터미널', lat: 33.47342, lng: 126.93369, kakao: '17561678' },
  비양도: { name: '한림항 비양도행 도선대합실', lat: 33.41909, lng: 126.26255, kakao: '13723625' },
  가파도: { name: '운진항 가파도·마라도 여객터미널', lat: 33.21007, lng: 126.25828, kakao: '1292299003' },
  마라도: { name: '운진항 가파도·마라도 여객터미널', lat: 33.21007, lng: 126.25828, kakao: '1292299003' },
  차귀도: { name: '자구내포구 차귀도 유람선', lat: 33.30931, lng: 126.16537, kakao: '25046666' },
  추자도: { name: '제주항 연안여객터미널', lat: 33.51959, lng: 126.535, kakao: '18376658' },
};

/** A card's 길찾기 (ADR-0067, ADR-0069, ADR-0071) in the chosen map app. `from`: where the trips are measured from —
 * it only picks the link and is never put in it; null = unknown. `walk`: 얼마나 is 걸어서. `isPoint`: `from` is a
 * real position (travel()).
 * - a spot on a small island the start is not on → to the pier its boat leaves from, `배 타는 곳까지 길찾기`;
 * - the way there is a walk (걸어서 and within its reach, or a card that says 걸어서) → walking directions;
 * - else car directions.
 * `app` = the app the link opens: TMAP's scheme has no walking mode, so its walks open in Naver Map. */
export function goLink(s: Spot, from: Point | null, walk: boolean, isPoint: boolean, app: MapApp = DEFAULT_MAP_APP): { href: string; text: string; mode: 'car' | 'foot'; terminal?: string; app: MapApp } {
  const island = islandOf(s);
  const t = island && (!from || islandOf(from) !== island) ? TERMINALS[island] : null;
  const to: Spot = t ? { ...s, name: t.name, lat: t.lat, lng: t.lng } : s;
  const foot = !!from && ((walk && withinReach('walk', from, to)) || (isPoint && distanceKm(from, to) < 1));
  const via: MapApp = app === 'tmap' && foot ? 'naver' : app;
  const href = via === 'kakao' ? (foot ? walkDirectionsUrl(to) : directionsUrl(to)) : via === 'tmap' ? tmapUrl(to) : naverDirectionsUrl(to, foot ? 'foot' : 'car');
  return { href, text: t ? '배 타는 곳까지 길찾기' : '길찾기', mode: foot ? 'foot' : 'car', terminal: t?.name, app: via };
}

export const bookingUrl = (s: Spot) => `https://www.myrealtrip.com/search?q=${encodeURIComponent(cleanName(s.name))}`;
