// Outbound links (ADR-0025: 길찾기는 카카오맵, 예약은 외부 링크).
import { inJeju } from './areas';
import { cleanName } from './data';
import type { Spot } from './pick';

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

/** 길찾기 (ADR-0067): Kakao Map car directions to the spot, starting where the phone is. One https link for every
 * phone: on mobile Kakao redirects it to its own mobile-web scheme (`m.map.kakao.com/scheme/route?ep=…&by=car`),
 * which opens the app when installed and the mobile web otherwise; on a PC it opens the 자동차 tab. A comma or a
 * slash would split the link, so they become spaces. No usable coordinates → the name search. */
export function directionsUrl(s: Spot): string {
  if (!inJeju(s)) return searchUrl(s);
  const name = cleanName(s.name.replace(/[,/]/g, ' '));
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${s.lat},${s.lng}`;
}

export const bookingUrl = (s: Spot) => `https://www.myrealtrip.com/search?q=${encodeURIComponent(cleanName(s.name))}`;
