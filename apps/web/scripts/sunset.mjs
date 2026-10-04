/**
 * 노을 볼 곳 (ADR-0083, specs/sunset-view.md): `sunsetView` — the sunset azimuths (of 242·264·298) a place sees the
 * sun go down over open sea at — on the places whose own source text confirmed it (review/sunset/sunset-NN.json,
 * the latest round), and only when that round's blind re-judging passed (review/sunset/audit-NN.json,
 * agreement.pass). The azimuths come from the frozen coastline (data/coast/jeju-coast.geojson, sunset-geo.mjs);
 * an 오름 candidate, or a confirmed place the calculation does not see, gets all three (its height or its text
 * stands in for the calculation). Never on 오일장. A judgment for a place that does not ship stops the run. No
 * basis text is copied.
 *
 * build-spots.mjs applies it after 철; run this file directly to apply it to the shipped public/spots.json in place
 * (after `season`, before a 체험's booking fields; nothing else changes). Idempotent.
 * `--candidates` writes review/sunset/candidates.json (who gets judged) instead.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AZIMUTHS, prepareCoast, ringsOf, sunsetAzimuths } from './sunset-geo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const BOOKING_KEYS = new Set(['book', 'hide']);
export const BASIS_MAX = 40;

const SEA_WORDS = /바다|오션|해변|해안|포구|노을|일몰|석양|해넘이|수평선|해수욕/;
const SUNSET_WORDS = /노을|일몰|석양|해넘이/;

export function loadCoast(path = resolve(root, 'data/coast/jeju-coast.geojson')) {
  return prepareCoast(ringsOf(read(path)));
}

/** Every source item (review/input/*.json) by id. */
export function loadInputs(dir = resolve(root, 'review/input')) {
  const m = new Map();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) for (const i of read(resolve(dir, f))) m.set(i.id, i);
  return m;
}

/** The source text a judgment reads and a basis must come from: name, tags, intro, comment, summary. */
export function sourceText(item) {
  return [item.name, (item.tags ?? []).join(' '), item.intro ?? '', item.comment ?? '', item.summary ?? ''].join('\n');
}

/** 오름 후보: 걷기, named 오름 / …봉 / …산. */
export const isOreum = (spot) => spot.mood === 'walk' && /오름|봉$|봉\(|산$/.test(spot.name.trim());

/** Who gets judged, by id: [{ id, why: ('geo'|'word'|'oreum')[], az }]. 오일장 and hidden places are left out. */
export function candidates(spots, inputs, coast) {
  const out = [];
  for (const s of spots) {
    if (s.hide || s.market) continue;
    const text = sourceText(inputs.get(s.id) ?? { name: s.name });
    const az = sunsetAzimuths(s, coast);
    const why = [];
    if (az.length && (s.indoor === false || SEA_WORDS.test(text))) why.push('geo');
    if (SUNSET_WORDS.test(text)) why.push('word');
    if (isOreum(s)) why.push('oreum');
    if (why.length) out.push({ id: s.id, why, az });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The blind re-judging sample (criteria.md): ceil(5%) of the candidates, drawn with mulberry32(seed), in list order. */
export function sampleIds(ids, seed = 20261004, frac = 0.05) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = ids.map((id) => ({ id, r: rnd() })).sort((x, y) => x.r - y.r);
  const pick = new Set(order.slice(0, Math.ceil(ids.length * frac)).map((x) => x.id));
  return ids.filter((id) => pick.has(id));
}

/** The latest judging round and whether its audit passed: { calls: [{ id, sunset, basis }], pass, round }. */
export function loadSunsetCalls(dir = resolve(root, 'review/sunset')) {
  const rounds = readdirSync(dir).map((f) => /^sunset-(\d{2})\.json$/.exec(f)?.[1]).filter(Boolean).sort();
  const nn = rounds.at(-1);
  if (!nn) return { calls: [], pass: false, round: null };
  let pass = false;
  try {
    pass = read(resolve(dir, `audit-${nn}.json`)).agreement?.pass === true;
  } catch {
    pass = false;
  }
  return { calls: read(resolve(dir, `sunset-${nn}.json`)), pass, round: nn };
}

/** Basis problems: missing, longer than 40 characters, or not word for word in the place's source text. */
export function basisProblems(calls, inputs) {
  const bad = [];
  for (const c of calls) {
    const item = inputs.get(c.id);
    if (!item) bad.push(`${c.id}: no source item`);
    else if (typeof c.basis !== 'string' || !c.basis.trim()) bad.push(`${c.id}: no basis`);
    else if ([...c.basis].length > BASIS_MAX) bad.push(`${c.id}: basis over ${BASIS_MAX} characters`);
    else if (!sourceText(item).includes(c.basis)) bad.push(`${c.id}: basis not in the source text`);
  }
  return bad;
}

/**
 * Spots with `sunsetView` where a confirmed judgment of a passed round gives one; any old `sunsetView` is
 * replaced. `viewOf(spot)` → azimuths (defaults to the frozen coastline). Throws on a judgment for a place that
 * does not ship, the same place twice, or a `sunset` that is not true/false.
 */
export function applySunset(spots, { calls, pass } = loadSunsetCalls(), viewOf = defaultView()) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  const add = new Map();
  for (const c of calls) {
    if (typeof c.sunset !== 'boolean') throw new Error(`sunset judgment ${c.id}: sunset ${JSON.stringify(c.sunset)} is not true/false`);
    if (add.has(c.id) || (c.sunset === false && calls.filter((x) => x.id === c.id).length > 1)) throw new Error(`sunset judgment ${c.id} appears twice — keep one in review/sunset`);
    const spot = byId.get(c.id);
    if (!spot) throw new Error(`sunset judgment for ${c.id}, which is not shipped — remove it from review/sunset`);
    if (!pass || !c.sunset || spot.market) continue;
    add.set(c.id, viewOf(spot));
  }
  return spots.map((s) => {
    const { sunsetView: _old, ...rest } = s;
    const view = add.get(s.id);
    if (!view?.length) return rest;
    const out = {};
    let placed = false;
    for (const [k, v] of Object.entries(rest)) {
      if (!placed && BOOKING_KEYS.has(k)) {
        out.sunsetView = view;
        placed = true;
      }
      out[k] = v;
    }
    if (!placed) out.sunsetView = view;
    return out;
  });
}

/** The azimuths for a confirmed place: the calculation's, or all three for an 오름 or a place it does not see. */
export function viewWith(coast) {
  return (spot) => {
    const az = sunsetAzimuths(spot, coast);
    return isOreum(spot) || !az.length ? [...AZIMUTHS] : az;
  };
}

function defaultView() {
  let coast = null;
  return (spot) => viewWith((coast ??= loadCoast()))(spot);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = read(path);
  if (process.argv.includes('--candidates')) {
    const list = candidates(before, loadInputs(), loadCoast());
    writeFileSync(resolve(root, 'review/sunset/candidates.json'), `[\n${list.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
    const n = (w) => list.filter((c) => c.why.includes(w)).length;
    const sample = sampleIds(list.map((c) => c.id));
    writeFileSync(resolve(root, 'review/sunset/sample-01.json'), `${JSON.stringify({ seed: 20261004, frac: 0.05, ids: sample }, null, 1)}\n`);
    console.log(`candidates ${list.length}: geo ${n('geo')}, word ${n('word')}, oreum ${n('oreum')}; audit sample ${sample.length}`);
  } else {
    const loaded = loadSunsetCalls();
    const bad = basisProblems(loaded.calls, loadInputs());
    if (bad.length) throw new Error(`sunset basis problems:\n${bad.join('\n')}`);
    const after = applySunset(before, loaded);
    const by = Object.fromEntries(AZIMUTHS.map((az) => [az, after.filter((s) => s.sunsetView?.includes(az)).length]));
    const n = after.filter((s) => s.sunsetView).length;
    if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length}); sunsetView ${n} ${JSON.stringify(by)} (audit pass: ${loaded.pass})`);
    else {
      writeFileSync(path, JSON.stringify(after));
      console.log(`spots.json: sunsetView ${n} ${JSON.stringify(by)} (round ${loaded.round}, audit pass: ${loaded.pass})`);
    }
  }
}
