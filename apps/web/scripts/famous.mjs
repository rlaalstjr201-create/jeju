/**
 * 유명한 곳 (ADR-0092, specs/famous-places.md §1): `famous: true` — 「여기 왔으면 보는」 이름난 경관·명소, the places
 * 「유명한 데 가 보고 싶어」 picks from whatever their mood (the app keeps the indoor ones for 비 와요). A fixed rule on
 * the source item (review/input/*.json: its category and VisitJeju tags) and the shipped score — no judging round:
 *   in:  a 관광지 (`category: sightseeing`) with score 5, or a VisitJeju 공영관광지 (tag) with score 4 or more;
 *   out: 먹기, hidden, a restaurant / cafe / shopping source, a cafe word in the name or tags, or a 제주올레 course
 *        (one end of a long course, not a place to go and see).
 * Score 5 alone is not it: it takes in the ocean-view cafes of 쉬기. Besides the rule: the places the owner named, by id
 * (OWNER_INCLUDE).
 *
 * build-spots.mjs applies it after 밤 산길; run this file directly to apply it to the shipped public/spots.json in
 * place (after `trail`, before a 체험's booking fields; nothing else changes). Idempotent.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInputs } from './sunset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOOKING_KEYS = new Set(['book', 'hide', 'walkin']);
const NOT_SIGHTS = new Set(['restaurant', 'cafe', 'shopping']);
const CAFE_WORDS = /카페|커피|빵|베이커리|디저트/;
const PUBLIC_TAGS = new Set(['공영관광지', '공영관광지인증']);
const OLLE_COURSE = /^제주올레 \d+코스/;
/** ADR-0092 Amendment 1 (owner, 2026-10-16): 쇠소깍, 국립제주박물관 — in whatever the rule says (not the shops named 쇠소깍…). */
const OWNER_INCLUDE = new Set(['056167bb-a013-49eb-894a-cefa6592257b', 'a01f0b63-31ac-4898-8286-da9686bf8895']);

/** §1: whether a shipped place is a 유명한 곳, by its source item (missing: never). */
export function isFamous(spot, item) {
  if (OWNER_INCLUDE.has(spot.id)) return !spot.hide && spot.mood !== 'food';
  if (!item || spot.hide || spot.mood === 'food' || NOT_SIGHTS.has(item.category) || OLLE_COURSE.test(spot.name.trim())) return false;
  const tags = item.tags ?? [];
  if (CAFE_WORDS.test(spot.name) || tags.some((t) => CAFE_WORDS.test(t))) return false;
  return (item.category === 'sightseeing' && spot.score === 5) || (tags.some((t) => PUBLIC_TAGS.has(t)) && spot.score >= 4);
}

/** 인기 측정 (ADR-0092 Amendment 2, docs/research/famous-popularity/criteria.md): the latest review/famous/pop-NN.json
 * as id → blog + cafe (null when either call failed: 확인 실패); from round 03 (Amendment 4) the monthly search
 * `volume` (null: 확인 실패). */
export function loadPop(dir = resolve(root, 'review/famous')) {
  const nn = readdirSync(dir).map((f) => /^pop-(\d{2})\.json$/.exec(f)?.[1]).filter(Boolean).sort().at(-1);
  if (!nn) return new Map();
  const { rows } = JSON.parse(readFileSync(resolve(dir, `pop-${nn}.json`), 'utf8'));
  const count = (r) => ('volume' in r ? (Number.isInteger(r.volume) ? r.volume : null) : Number.isInteger(r.blog) && Number.isInteger(r.cafe) ? r.blog + r.cafe : null);
  return new Map(rows.map((r) => [r.id, count(r)]));
}

/** criteria §4: pop = log10(1 + n) placed between the lowest and highest of `ids`, 0–1, 3 decimals. Throws on an id
 * with no count or a 확인 실패. */
export function popScores(counts, ids) {
  const logs = new Map();
  for (const id of ids) {
    const n = counts.get(id);
    if (!Number.isInteger(n) || n < 0) throw new Error(`유명한 곳 ${id}: no measured count (${n}) in review/famous — measure it (owner approval) before shipping`);
    logs.set(id, Math.log10(1 + n));
  }
  const lo = Math.min(...logs.values());
  const hi = Math.max(...logs.values());
  return new Map([...logs].map(([id, l]) => [id, hi > lo ? Math.round(((l - lo) / (hi - lo)) * 1000) / 1000 : 1]));
}

/** Spots with `famous: true` where isFamous says so, and their `pop` (criteria §4); any old `famous`/`pop` is taken
 * off first. */
export function applyFamous(spots, inputs = loadInputs(), counts = loadPop()) {
  const pops = popScores(counts, spots.filter((s) => isFamous(s, inputs.get(s.id))).map((s) => s.id));
  return spots.map((s) => {
    const { famous: _old, pop: _oldPop, ...rest } = s;
    if (!isFamous(rest, inputs.get(s.id))) return rest;
    // last, but before a 체험's booking fields — the order build-spots.mjs makes (밤 산길 → 유명한 곳 → 체험 예약 경로)
    const out = {};
    let placed = false;
    for (const [k, v] of Object.entries(rest)) {
      if (!placed && BOOKING_KEYS.has(k)) {
        out.famous = true;
        out.pop = pops.get(s.id);
        placed = true;
      }
      out[k] = v;
    }
    if (!placed) {
      out.famous = true;
      out.pop = pops.get(s.id);
    }
    return out;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = JSON.parse(readFileSync(path, 'utf8'));
  const after = applyFamous(before);
  const n = after.filter((s) => s.famous).length;
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length}); famous ${n}`);
  else {
    writeFileSync(path, JSON.stringify(after));
    console.log(`spots.json: famous ${n}`);
  }
}
