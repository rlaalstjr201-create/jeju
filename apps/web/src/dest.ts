// 여행지 (ADR-0094, specs/busan.md, plans/busan.md): the destinations and an id's destination. Pure — it reads no
// build-time define — so the server functions and the tsx scripts may import it as they import areas.ts. Which
// destination a point is in is src/busan.ts's (destOf, with Busan's boundary); whether a destination is open to
// visitors yet is src/release.ts's question, asked only where the app takes a point in.

export type Dest = 'jeju' | 'busan';
export const DESTS: readonly Dest[] = ['jeju', 'busan'];

/** A destination's id prefix (specs/busan.md 3.1): Busan ids are `bs-<contentid>`, Jeju's are UUIDs. */
export const destOfId = (id: string): Dest => (id.startsWith('bs-') ? 'busan' : 'jeju');
