/**
 * 체험 예약 경로 (ADR-0074, specs/booking-routes.md): every 체험 (mood new, sub do) gets `book: { k, u }` — the best
 * verified route from review/booking/routes.json (only a route whose verdict is accepted) — or a recorded call in
 * review/copy/booking.json saying why it has none:
 * - closed: gone from VisitJeju and not found on Naver Map (폐업·이전 의심) → `hide: 'closed'`; the app and the
 *   landing pages leave it out everywhere;
 * - noroute: open, but no verified route → no `book`; the app leaves it out of 체험 and 섞어서;
 * - walkin: no route, and none is needed — tickets on site or free entry (ADR-0074 Amendment 1, ADR-0105) →
 *   `walkin: true`; the app shows it. A route, when there is one, still wins (book, no walkin).
 * A 체험 with neither stops the build. build-spots.mjs applies it last; run this file directly to apply it to the
 * shipped public/spots.json in place (book / hide are the last keys; nothing else changes). Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const BOOK_KINDS = ['naver', 'mrt', 'visitjeju', 'homepage', 'phone'];

/** id → { k, u }: the first accepted route of the spot's `best` kind. */
export function loadBookRoutes(path = resolve(root, 'review/booking/routes.json')) {
  const out = new Map();
  for (const [id, r] of Object.entries(read(path).spots)) {
    if (!r.best) continue;
    const route = r.routes.find((x) => x.kind === r.best && x.verdict === 'accepted');
    if (!route) throw new Error(`routes.json ${id} ${r.name}: best ${r.best} has no accepted route`);
    if (!BOOK_KINDS.includes(r.best)) throw new Error(`routes.json ${id}: unknown kind ${r.best}`);
    const ok = r.best === 'phone' ? /^tel:\+?\d{7,13}$/.test(route.url) : /^https:\/\/|^http:\/\//.test(route.url);
    if (!ok) throw new Error(`routes.json ${id} ${r.name}: bad ${r.best} url ${route.url}`);
    out.set(id, { k: r.best, u: route.url });
  }
  return out;
}

/** id → 'closed' | 'noroute' | 'walkin', from review/copy/booking.json. */
export function loadBookingCalls(path = resolve(root, 'review/copy/booking.json')) {
  const out = new Map();
  for (const c of read(path)) {
    if (c.call !== 'closed' && c.call !== 'noroute' && c.call !== 'walkin') throw new Error(`booking.json ${c.id}: unknown call ${c.call}`);
    if (!c.reason?.trim() || !c.evidence?.trim()) throw new Error(`booking.json ${c.id}: reason and evidence are required`);
    out.set(c.id, c.call);
  }
  return out;
}

/** Spots with `book` on every 체험 that has a route and `hide: 'closed'` on the closed ones; throws on a 체험 with
 * neither a route nor a call. Other spots lose any stale book / hide. */
export function applyBooking(spots, routes = loadBookRoutes(), calls = loadBookingCalls()) {
  return spots.map((s) => {
    const { book: _b, hide: _h, walkin: _w, ...rest } = s;
    if (s.mood !== 'new' || s.sub !== 'do') return rest;
    const call = calls.get(s.id);
    if (call === 'closed') return { ...rest, hide: 'closed' };
    const book = routes.get(s.id);
    if (book) return { ...rest, book };
    if (call === 'noroute') return rest;
    if (call === 'walkin') return { ...rest, walkin: true };
    throw new Error(`체험 ${s.id} ${s.name} has no booking route and no call — add it to review/copy/booking.json`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = read(path);
  const after = applyBooking(before);
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length})`);
  else {
    writeFileSync(path, JSON.stringify(after));
    const kinds = {};
    for (const s of after) if (s.book) kinds[s.book.k] = (kinds[s.book.k] ?? 0) + 1;
    console.log(`spots.json: book on ${Object.values(kinds).reduce((a, b) => a + b, 0)} 체험 ${JSON.stringify(kinds)}, walkin ${after.filter((s) => s.walkin).length}, hidden ${after.filter((s) => s.hide).length}`);
  }
}
