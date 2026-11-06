// 여행지 (ADR-0094, specs/busan.md, plans/busan.md): the destinations and an id's destination. Pure — it reads no
// build-time define — so the server functions and the tsx scripts may import it as they import areas.ts. Which
// destination a point is in is src/busan.ts's (destOf, with Busan's boundary); whether a destination is open to
// visitors yet is src/release.ts's question, asked only where the app takes a point in.

import type { Kind, Mood } from '../pick/pick';

/** 검수한 곳 (ADR-0101): the destinations whose places were checked one by one. `gangwon` (ADR-0102): 강원's, named by
 * 시군구 — 강릉·속초·춘천 (Amendment 2)·양양 (Amendment 3)·평창 (Amendment 4) now; the others stay 자동 지역 until theirs are checked. */
export type Curated = 'jeju' | 'busan' | 'gangwon' | 'seoul';
/** `nation`: the 자동 지역 as a whole (plans/nationwide-app.md 1.2); which 시군구 is State.sgg. */
export type Dest = Curated | 'nation';
/** the 검수한 곳, in the order the 여행지 row lists them */
export const DESTS: readonly Curated[] = ['jeju', 'busan', 'gangwon', 'seoul'];
/** the 검수한 곳 named by 시군구 that open with the 자동 지역's part (강원 ADR-0102, 서울 ADR-0106) */
export type SggDest = 'gangwon' | 'seoul';
export const SGG_DESTS: readonly SggDest[] = ['gangwon', 'seoul'];
export const isSggDest = (d: unknown): d is SggDest => SGG_DESTS.includes(d as SggDest);

/** One destination's row (plans/nationwide-app.md 1.2): a new 검수한 곳 is one more row. */
export interface DestRow {
  /** its place list under public/ */
  file: string;
  /** its ids' prefix (specs/busan.md 3.1): Busan's are `bs-<contentid>`; '' = Jeju's UUIDs. 강원's keep the 자동 지역's
   * `nt-` (plans/nationwide-app.md 13 R11: a place saved there stays saved), so destOfId says 'nation' for both. */
  idPrefix: string;
  /** the sunset's place while the basis is not known yet */
  cityHall: { lat: number; lng: number };
  /** whose places and photos: 비짓제주 or 한국관광공사 */
  credit: 'visitjeju' | 'tour';
  /** a map search is scoped by `word` unless the name already says where it is (`said`, plans/busan.md M7) */
  word: string;
  said: RegExp;
  /** the moods it offers (ADR-0101 2: no 유명한 데 in the 자동 지역; 쉬기 there since rules v2, ADR-0105 4), and the ones
   * 아무거나 takes a card from */
  moods: readonly Kind[];
  any: readonly Mood[];
  /** what the 이름 줄 says after the colon: the destination's name (a 검수한 곳 with `sgg`: its 시군구 in use, named in
   * the page's language, render.ts destNameOf), or the 시군구's (sggShort) */
  label: 'name' | 'sgg';
  /** a 검수한 곳 named by 시군구 (plans/nationwide-app.md 1.3): its codes, which the 자동 지역 then leaves to it; one is in
   * use at a time (State.sgg) and its list is that 시군구's places (their `area`, the 시군구's short name) */
  sgg?: readonly string[];
  /** its list is every one of its 시군구's places, by reach from the basis, not only the one in use (서울 ADR-0106
   * Amendment 2: its 구 are small and a GPS read near a border names the next one); the 시군구 still names the 동네 */
  allSgg?: true;
}

const ALL: readonly Kind[] = ['rest', 'walk', 'new', 'famous', 'food'];
const ANY: readonly Mood[] = ['rest', 'walk', 'new'];
export const DEST: Record<Dest, DestRow> = {
  // 제주시청
  jeju: { file: 'spots.json', idPrefix: '', cityHall: { lat: 33.4996, lng: 126.5312 }, credit: 'visitjeju', word: '제주', said: /제주|서귀포/, moods: ALL, any: ANY, label: 'name' },
  // 부산광역시청 (specs/busan.md 4절; 카카오맵 장소 27284326, 연제구 중앙대로 1001)
  busan: { file: 'spots-busan.json', idPrefix: 'bs-', cityHall: { lat: 35.1797, lng: 129.0751 }, credit: 'tour', word: '부산', said: /부산/, moods: ALL, any: ANY, label: 'name' },
  // 자동 지역: its files are nation/<f>.json (src/nation-part.ts); 서울시청 until a 시군구 is known; a map search by the
  // name alone (plans/nationwide-app.md U13 scopes it)
  nation: { file: '', idPrefix: 'nt-', cityHall: { lat: 37.5663, lng: 126.9779 }, credit: 'tour', word: '', said: /(?:)/, moods: ['rest', 'walk', 'new', 'food'], any: ANY, label: 'sgg' },
  // 강원 (ADR-0102): 강릉시청 (강릉대로 33); its 시군구 강릉·속초·춘천 (Amendment 2)·양양 (Amendment 3)·평창 (Amendment 4),
  // which the 자동 지역 leaves to it — the first is the one used when none is known. A map search is scoped by the place's
  // own 시군구 (links.ts); `word` only before the 자동 지역's part is in
  gangwon: { file: 'spots-gangwon.json', idPrefix: 'nt-', cityHall: { lat: 37.7519, lng: 128.8761 }, credit: 'tour', word: '강원', said: /강원|강릉|속초|춘천|양양|평창/, moods: ALL, any: ANY, label: 'name', sgg: ['51150', '51210', '51110', '51830', '51760'] },
  // 서울 (ADR-0106): 서울시청 (세종대로 110); its 구 whose places passed the checks (종로·중구·용산·성동·광진·동대문·중랑·성북·강북·도봉·노원·은평·서대문·마포·양천·강서·구로·금천·영등포·동작·관악·서초·강남·송파·강동), which
  // the 자동 지역 leaves to it — the others stay 자동 지역 until theirs pass
  seoul: { file: 'spots-seoul.json', idPrefix: 'nt-', cityHall: { lat: 37.5663, lng: 126.9779 }, credit: 'tour', word: '서울', said: /서울|종로|중구|용산|성동|광진|동대문|중랑|성북|강북|도봉|노원|은평|서대문|마포|양천|강서|구로|금천|영등포|동작|관악|서초|강남|송파|강동/, moods: ALL, any: ANY, label: 'name', sgg: ['11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305', '11320', '11350', '11380', '11410', '11440', '11470', '11500', '11530', '11545', '11560', '11590', '11620', '11650', '11680', '11710', '11740'], allSgg: true },
};

export const isDest = (v: unknown): v is Dest => DESTS.includes(v as Curated) || v === 'nation';

/** A destination's id prefix (specs/busan.md 3.1); an id with none is Jeju's. */
export const destOfId = (id: string): Dest => (Object.keys(DEST) as Dest[]).find((d) => DEST[d].idPrefix && id.startsWith(DEST[d].idPrefix)) ?? 'jeju';
