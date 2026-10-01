/**
 * 실내 (ADR-0065, specs/indoor.md): every spot gets indoor true|false, judged from the VisitJeju source only.
 * cafe·restaurant → true unless review/copy/indoor.json says otherwise; sightseeing·experience·cultural_space
 * need their own call there (with its basis). build-spots.mjs applies the rule; run this file directly to apply
 * it to the shipped public/spots.json in place (adds indoor right after bookable, nothing else changes). Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadCategories } from './new-sub.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDOOR_CATEGORIES = new Set(['cafe', 'restaurant']);

/** Recorded calls by id, from review/copy/indoor.json. */
export function loadIndoorCalls(path = resolve(root, 'review/copy/indoor.json')) {
  return new Map(JSON.parse(readFileSync(path, 'utf8')).map((v) => [v.id, v.indoor]));
}

/** true | false for one spot; throws when neither the category nor a recorded call decides it. */
export function indoorOf(id, category, calls) {
  const call = calls.get(id);
  if (typeof call === 'boolean') return call;
  if (INDOOR_CATEGORIES.has(category)) return true;
  throw new Error(`spot ${id} (${category}) has no indoor call — add it to review/copy/indoor.json`);
}

/** Spots with indoor set (placed right after bookable). */
export function applyIndoor(spots, categories = loadCategories(), calls = loadIndoorCalls()) {
  return spots.map((s) => {
    const indoor = indoorOf(s.id, categories.get(s.id), calls);
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'indoor') continue;
      out[k] = v;
      if (k === 'bookable') out.indoor = indoor;
    }
    if (!('indoor' in out)) out.indoor = indoor;
    return out;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = JSON.parse(readFileSync(path, 'utf8'));
  const after = applyIndoor(before);
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length})`);
  else {
    writeFileSync(path, JSON.stringify(after));
    const n = after.filter((s) => s.indoor).length;
    console.log(`spots.json: indoor ${n}, outdoor ${after.length - n}`);
  }
}
