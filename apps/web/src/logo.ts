/** The logo 「꺾이는 길」 (ADR-0088 5, specs/visual-refresh.md): a line that goes straight, turns once and
 * climbs, a 귤 dot at its end. One place for its geometry: the top line of index.html (a copy, checked by
 * tests/logo.test.ts), the landing pages' header (scripts/landing.ts) and the icons (scripts/make-icons.ts). */

/** On a 64 grid: the stroke's path, its width (round caps and joins), the dot's centre and radius. */
export const MARK = { d: 'M12 46 L30 46 Q36 46 38 40 L46 16', width: 7, dot: { x: 46, y: 16, r: 5 } } as const;

/** The symbol for a page: the stroke in currentColor (--main), the dot filled by CSS (`.logo .dot`, --accent). */
export function markSvg(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="${MARK.d}" fill="none" stroke="currentColor" stroke-width="${MARK.width}" stroke-linecap="round" stroke-linejoin="round"/><circle class="dot" cx="${MARK.dot.x}" cy="${MARK.dot.y}" r="${MARK.dot.r}"/></svg>`;
}

/** The symbol, the wordmark and the grey region after the colon: 「여차나:제주」. */
export function logoInner(region = '제주'): string {
  return `${markSvg(22)}여차나<span class="rg">:${region}</span>`;
}
