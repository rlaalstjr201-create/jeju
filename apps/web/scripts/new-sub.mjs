/**
 * 새로운 거 sub (ADR-0064, specs/new-sub.md): every mood:'new' spot gets sub 'sight' (구경) or 'do' (체험).
 * experience → do; sightseeing·cultural_space → sight; cafe·restaurant → the hand call in review/copy/new-sub.json.
 * build-spots.mjs applies the rule; run this file directly to apply it to the shipped public/spots.json in place
 * (adds sub to new spots only, at the key position build-spots.mjs would give it). Idempotent.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BY_CATEGORY = { experience: 'do', sightseeing: 'sight', cultural_space: 'sight' };

/** Source category by id, from review/input/batch-NNN.json. */
export function loadCategories(inputDir = resolve(root, 'review/input')) {
  const out = new Map();
  for (const f of readdirSync(inputDir).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort()) {
    for (const item of JSON.parse(readFileSync(resolve(inputDir, f), 'utf8'))) out.set(item.id, item.category);
  }
  return out;
}

/** cafe·restaurant calls by id, from review/copy/new-sub.json. */
export function loadNewSubCalls(path = resolve(root, 'review/copy/new-sub.json')) {
  return new Map(JSON.parse(readFileSync(path, 'utf8')).map((v) => [v.id, v.sub]));
}

/** 'sight' | 'do' for a new spot; throws when neither the category nor a recorded call decides it. */
export function newSub(id, category, calls) {
  const sub = BY_CATEGORY[category] ?? calls.get(id);
  if (sub !== 'sight' && sub !== 'do') throw new Error(`new spot ${id} (${category}) has no sub (sight|do) — add it to review/copy/new-sub.json`);
  return sub;
}

/** Spots with sub set on every new spot (inserted before score); other spots are returned as they are. */
export function applyNewSub(spots, categories = loadCategories(), calls = loadNewSubCalls()) {
  return spots.map((s) => {
    if (s.mood !== 'new') return s;
    const sub = newSub(s.id, categories.get(s.id), calls);
    const { score, sub: _old, ...rest } = s;
    return score === undefined ? { ...rest, sub } : { ...rest, sub, score };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = JSON.parse(readFileSync(path, 'utf8'));
  const after = applyNewSub(before);
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length})`);
  else {
    writeFileSync(path, JSON.stringify(after));
    console.log(`spots.json: sub on ${after.filter((s) => s.mood === 'new').length} new spots`);
  }
}
