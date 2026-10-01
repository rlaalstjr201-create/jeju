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
const SETTABLE = new Set(['name', 'score', 'kakaoPlaceId']);

/** Every correction record, corrections-NN.json in sorted order. */
export function loadCorrections(copyDir = resolve(root, 'review/copy')) {
  const out = [];
  for (const f of readdirSync(copyDir).filter((f) => /^corrections-\d{2}\.json$/.test(f)).sort()) {
    for (const c of JSON.parse(readFileSync(resolve(copyDir, f), 'utf8'))) {
      if (c.action !== 'remove' && c.action !== 'set') throw new Error(`${f} ${c.id}: unknown action ${c.action}`);
      for (const k of Object.keys(c.fields ?? {})) if (!SETTABLE.has(k)) throw new Error(`${f} ${c.id}: field ${k} cannot be set`);
      out.push(c);
    }
  }
  return out;
}

/** Spots with the corrections applied (a new array; corrected spots are copies). A `set` whose id is missing throws. */
export function applyCorrections(spots, corrections) {
  const removed = new Set(corrections.filter((c) => c.action === 'remove').map((c) => c.id));
  const sets = new Map();
  for (const c of corrections) if (c.action === 'set') sets.set(c.id, { ...sets.get(c.id), ...c.fields });
  const out = spots.filter((s) => !removed.has(s.id)).map((s) => (sets.has(s.id) ? { ...s, ...sets.get(s.id) } : s));
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
