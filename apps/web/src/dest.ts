// 여행지 (ADR-0094, specs/busan.md, plans/busan.md): the destinations and an id's destination. Pure — it reads no
// build-time define — so the server functions and the tsx scripts may import it as they import areas.ts. Which
// destination a point is in is src/busan.ts's (destOf, with Busan's boundary); whether a destination is open to
// visitors yet is src/release.ts's question, asked only where the app takes a point in.

export type Dest = 'jeju' | 'busan';
export const DESTS: readonly Dest[] = ['jeju', 'busan'];

/** One destination's row (plans/nationwide-app.md 1.2): a new 검수한 곳 is one more row. */
export interface DestRow {
  /** its place list under public/ */
  file: string;
  /** its ids' prefix (specs/busan.md 3.1): Busan's are `bs-<contentid>`; '' = Jeju's UUIDs */
  idPrefix: string;
  /** the sunset's place while the basis is not known yet */
  cityHall: { lat: number; lng: number };
  /** whose places and photos: 비짓제주 or 한국관광공사 */
  credit: 'visitjeju' | 'tour';
  /** a map search is scoped by `word` unless the name already says where it is (`said`, plans/busan.md M7) */
  word: string;
  said: RegExp;
}

export const DEST: Record<Dest, DestRow> = {
  // 제주시청
  jeju: { file: 'spots.json', idPrefix: '', cityHall: { lat: 33.4996, lng: 126.5312 }, credit: 'visitjeju', word: '제주', said: /제주|서귀포/ },
  // 부산광역시청 (specs/busan.md 4절; 카카오맵 장소 27284326, 연제구 중앙대로 1001)
  busan: { file: 'spots-busan.json', idPrefix: 'bs-', cityHall: { lat: 35.1797, lng: 129.0751 }, credit: 'tour', word: '부산', said: /부산/ },
};

export const isDest = (v: unknown): v is Dest => DESTS.includes(v as Dest);

/** A destination's id prefix (specs/busan.md 3.1); an id with none is Jeju's. */
export const destOfId = (id: string): Dest => DESTS.find((d) => DEST[d].idPrefix && id.startsWith(DEST[d].idPrefix)) ?? 'jeju';
