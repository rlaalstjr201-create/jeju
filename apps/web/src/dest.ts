// 여행지 (ADR-0094, specs/busan.md, plans/busan.md): which destination a point is in. Pure — it reads no build-time
// define — so the server functions and the tsx scripts may import it as they import areas.ts. Whether a destination
// is open to visitors yet is src/release.ts's question, asked only where the app takes a point in.
import { inJeju } from './areas';
import type { Point } from './pick';

export type Dest = 'jeju' | 'busan';

/** The destination a point is in, or null outside them all. Busan's boundary comes with its areas (plans/busan.md S5). */
export const destOf = (p: Point): Dest | null => (inJeju(p) ? 'jeju' : null);
