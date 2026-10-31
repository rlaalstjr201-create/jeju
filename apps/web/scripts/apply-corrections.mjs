/**
 * Fact-check corrections (ADR-0063 item 5): review/copy/corrections-NN.json, arrays of
 * {id, action: 'remove'|'set', fields, reason, evidence}. build-spots.mjs applies them after the fixes and
 * scores; run this file directly to apply the same records to the shipped public/spots.json in place.
 * Idempotent: a removed id that is already gone and a field that already has its value change nothing.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// lat/lng: a pin moved to where Kakao Map has the place (corrections-02, the 비양도 pin, ADR-0071)
// mood/sub: 기분 다시 나누기 v5 (ADR-0105, corrections-04) — mood new needs sub sight|do; rest/walk drop sub
const SETTABLE = new Set(['name', 'score', 'kakaoPlaceId', 'lat', 'lng', 'mood', 'sub']);
const MOOD_SUB = { rest: null, walk: null, new: ['sight', 'do'] };

/** Every correction record, corrections-NN.json in sorted order. */
export function loadCorrections(copyDir = resolve(root, 'review/copy')) {
  const out = [];
  for (const f of readdirSync(copyDir).filter((f) => /^corrections-\d{2}\.json$/.test(f)).sort()) {
    for (const c of JSON.parse(readFileSync(resolve(copyDir, f), 'utf8'))) {
      if (c.action !== 'remove' && c.action !== 'set') throw new Error(`${f} ${c.id}: unknown action ${c.action}`);
      for (const k of Object.keys(c.fields ?? {})) if (!SETTABLE.has(k)) throw new Error(`${f} ${c.id}: field ${k} cannot be set`);
      const set = c.fields ?? {};
      if ('sub' in set && !('mood' in set)) throw new Error(`${f} ${c.id}: sub is set only with mood`);
      if ('mood' in set) {
        if (!(set.mood in MOOD_SUB)) throw new Error(`${f} ${c.id}: mood ${set.mood} cannot be set`);
        const subs = MOOD_SUB[set.mood];
        if (subs ? !subs.includes(set.sub) : 'sub' in set) throw new Error(`${f} ${c.id}: mood ${set.mood} with sub ${set.sub}`);
      }
      out.push(c);
    }
  }
  return out;
}

/** A copy of `s` with `fields` set. A set mood puts sub just before score (where build-spots.mjs puts it) and drops it
 * for rest/walk, so the in-place file and a rebuild agree byte for byte. */
function setFields(s, fields) {
  if (!('mood' in fields)) return { ...s, ...fields };
  const { sub, ...rest } = fields;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'sub') continue;
    if (k === 'score' && sub) out.sub = sub;
    out[k] = k in rest ? rest[k] : v;
  }
  if (sub && !('sub' in out)) out.sub = sub;
  for (const [k, v] of Object.entries(rest)) if (!(k in out)) out[k] = v;
  return out;
}

/** Spots with the corrections applied (a new array; corrected spots are copies). A `set` whose id is missing throws. */
export function applyCorrections(spots, corrections) {
  const removed = new Set(corrections.filter((c) => c.action === 'remove').map((c) => c.id));
  const sets = new Map();
  for (const c of corrections) if (c.action === 'set') sets.set(c.id, { ...sets.get(c.id), ...c.fields });
  const out = spots.filter((s) => !removed.has(s.id)).map((s) => (sets.has(s.id) ? setFields(s, sets.get(s.id)) : s));
  const missing = [...sets.keys()].filter((id) => !out.some((s) => s.id === id));
  if (missing.length) throw new Error(`corrections: no spot to set for ${missing.join(', ')}`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = JSON.parse(readFileSync(path, 'utf8'));
  const after = applyCorrections(before, loadCorrections());
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length})`);
  else {
    writeFileSync(path, JSON.stringify(after));
    console.log(`spots.json ${before.length} → ${after.length}`);
  }
}
