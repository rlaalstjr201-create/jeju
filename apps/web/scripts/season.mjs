/**
 * 철 (ADR-0080, specs/seasonal-spots.md): `season` on the places judged from their own source text
 * (review/season/season-NN.json, the latest round). Only kinds whose blind re-judging passed
 * (review/season/audit-NN.json, agreement.perKind[kind].pass) ship. Two shapes:
 * - 원문 기간형 (rapeseed · hydrangea · silvergrass · camellia · tangerine · muhly): `{ kind, months }` when the source
 *   names whole months; none when it does not. 귤 따기 without months: 노지 or unknown → [11, 12], 하우스 → none.
 * - 관측형 (cherry · plum · maple): `{ kind, from, to }` from this year's data/season/blooms-YYYY.json, the nearest
 *   station that observes the species (data/season/stations.json); nothing when that station has no date (never
 *   borrowed from another one) or the files are missing.
 * Never on 오일장 or 먹기. A judgment for a place that does not ship stops the run. No basis text is copied.
 * build-spots.mjs applies it after the market days; run this file directly to apply it to the shipped
 * public/spots.json in place (season last, before a 체험's booking fields; nothing else changes). Idempotent.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** ADR-0080 5: observed kinds first, then the source-text kinds. Also the order a place's entries ship in. */
export const SEASON_KINDS = ['cherry', 'plum', 'maple', 'rapeseed', 'hydrangea', 'silvergrass', 'camellia', 'tangerine', 'muhly'];
/** 관측형 window: firstBloom .. firstBloom + N days (both ends, Jeju dates; specs/seasonal-spots.md 「창 규칙」). */
const WINDOW_DAYS = { cherry: 9, plum: 13, maple: 20 };
/** 귤 따기 노지·미상 (ADR-0080 결정 D): the whole months of the 노지 harvest. */
const TANGERINE_OPEN_FIELD = [11, 12];
// sunsetView·sunsetSea (ADR-0083) and trail (ADR-0091) come after 철 too: rerunning this file keeps the build's key order
const BOOKING_KEYS = new Set(['sunsetView', 'sunsetSea', 'trail', 'book', 'hide']);

/** The latest judging round and its audit: { calls: [{ id, kind, months, cultivation? }], pass: Set<kind> }. */
export function loadSeasonCalls(dir = resolve(root, 'review/season')) {
  const rounds = readdirSync(dir).map((f) => /^season-(\d{2})\.json$/.exec(f)?.[1]).filter(Boolean).sort();
  const nn = rounds.at(-1);
  if (!nn) throw new Error(`no season-NN.json in ${dir}`);
  const audit = read(resolve(dir, `audit-${nn}.json`));
  const pass = new Set(Object.entries(audit.agreement?.perKind ?? {}).filter(([, v]) => v?.pass === true).map(([k]) => k));
  const calls = read(resolve(dir, `season-${nn}.json`)).map(({ id, kind, months, cultivation }) => ({ id, kind, months, cultivation }));
  return { calls, pass };
}

/** Observation records for `year`, or null when that year's file does not exist. */
export function loadBlooms(year, dir = resolve(root, 'data/season')) {
  const p = resolve(dir, `blooms-${year}.json`);
  return existsSync(p) ? read(p) : null;
}

/** The stations ({ stn, name, lat, lon, species }), or [] when the file does not exist. */
export function loadStations(dir = resolve(root, 'data/season')) {
  const p = resolve(dir, 'stations.json');
  return existsSync(p) ? read(p) : [];
}

/** The Seoul calendar year now. */
const jejuYear = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).getUTCFullYear();

const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** The 관측형 window for one place, or null: the nearest station observing `species`, its date this year only. */
export function observedWindow(spot, species, stations, blooms, year) {
  if (!blooms || blooms.year !== year) return null;
  const status = blooms.status?.[species];
  if (status === 'none' || status === 'failed') return null;
  let near = null;
  for (const st of stations) {
    if (!Array.isArray(st.species) || !st.species.includes(species)) continue;
    const d = km(spot, { lat: st.lat, lng: st.lon });
    if (!near || d < near.d || (d === near.d && st.stn < near.st.stn)) near = { st, d };
  }
  if (!near) return null;
  const rec = (blooms.records ?? []).find((r) => r.species === species && r.station === near.st.stn);
  if (!rec || typeof rec.firstBloom !== 'string' || !rec.firstBloom.startsWith(`${year}-`)) return null;
  return { from: rec.firstBloom, to: addDays(rec.firstBloom, WINDOW_DAYS[species]) };
}

/** One judgment's entry for a place, or null (not shipped: months unknown, 하우스, no observed date). */
function entryOf(call, spot, obs) {
  if (call.kind in WINDOW_DAYS) {
    const w = observedWindow(spot, call.kind, obs.stations, obs.blooms, obs.year);
    return w && { kind: call.kind, ...w };
  }
  if (Array.isArray(call.months)) return call.months.length ? { kind: call.kind, months: [...new Set(call.months)].sort((a, b) => a - b) } : null;
  if (call.kind === 'tangerine' && (call.cultivation === '노지' || call.cultivation == null)) return { kind: 'tangerine', months: TANGERINE_OPEN_FIELD };
  return null;
}

/**
 * Spots with `season` (an array, ADR-0080 5 order) where a passing judgment gives one this year; any old `season`
 * is replaced, so last year's windows never stay. Throws on a judgment for a place that does not ship or an unknown
 * kind, months that are not whole months 1~12, or the same place and kind judged twice. `obs`: { stations, blooms, year } for the observed kinds.
 */
export function applySeason(spots, { calls, pass } = loadSeasonCalls(), obs = defaultObs()) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const add = new Map();
  const seen = new Set();
  for (const c of calls) {
    if (!SEASON_KINDS.includes(c.kind)) throw new Error(`season judgment ${c.id}: unknown kind ${c.kind}`);
    if (c.months != null && !(Array.isArray(c.months) && c.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12))) {
      throw new Error(`season judgment ${c.id} ${c.kind}: months ${JSON.stringify(c.months)} are not whole months 1~12`);
    }
    const key = `${c.id}|${c.kind}`;
    if (seen.has(key)) throw new Error(`season judgment ${c.id} ${c.kind} appears twice — keep one in review/season`);
    seen.add(key);
    const spot = byId.get(c.id);
    if (!spot) throw new Error(`season judgment for ${c.id}, which is not shipped — remove it from review/season`);
    if (!pass.has(c.kind) || spot.market || spot.mood === 'food') continue;
    const e = entryOf(c, spot, obs);
    if (!e) continue;
    add.set(c.id, [...(add.get(c.id) ?? []), e]);
  }
  return spots.map((s) => {
    const { season: _old, ...rest } = s;
    const season = add.get(s.id)?.sort((a, b) => SEASON_KINDS.indexOf(a.kind) - SEASON_KINDS.indexOf(b.kind));
    if (!season) return rest;
    // last, but before a 체험's booking fields — the order build-spots.mjs makes (철 → 체험 예약 경로)
    const out = {};
    let placed = false;
    for (const [k, v] of Object.entries(rest)) {
      if (!placed && BOOKING_KEYS.has(k)) {
        out.season = season;
        placed = true;
      }
      out[k] = v;
    }
    if (!placed) out.season = season;
    return out;
  });
}

function defaultObs() {
  const year = jejuYear();
  return { stations: loadStations(), blooms: loadBlooms(year), year };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = read(path);
  const loaded = loadSeasonCalls();
  const after = applySeason(before, loaded);
  const kinds = {};
  for (const s of after) for (const e of s.season ?? []) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  const skipped = loaded.calls.filter((c) => loaded.pass.has(c.kind) && !after.find((s) => s.id === c.id)?.season?.some((e) => e.kind === c.kind)).length;
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length}); season ${JSON.stringify(kinds)}`);
  else {
    writeFileSync(path, JSON.stringify(after));
    console.log(`spots.json: season ${JSON.stringify(kinds)}; ${skipped} passing judgment(s) not shipped (no months, 하우스, no observed date)`);
  }
}
