/**
 * 오일장 (ADR-0066, specs/market-days.md): the 9 five-day markets added from VisitJeju (review/input/batch-900.json,
 * category shopping). Their verdicts (keep · mood · reason) are review/market/verdicts.json, scores
 * review/score/score-07.json, indoor calls review/copy/indoor.json, and their market days
 * review/copy/market-days.json. build-spots.mjs merges them like any other input and ends with applyMarketDays.
 * Run this file directly to add them to the shipped public/spots.json in place (the same records, appended,
 * then the days); nothing else changes. Idempotent.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { indoorOf, loadIndoorCalls } from './indoor.mjs';
import { loadCategories, newSub } from './new-sub.mjs';
import { reasonPunctuationProblem, shipReason } from './reason.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** { id, keep, mood, reason, basis }[] for the markets. */
export function loadMarketVerdicts(path = resolve(root, 'review/market/verdicts.json')) {
  return read(path);
}

/** The rule each market ships with, by id: { days, label, noFirstAfter31? }. */
export function loadMarketDays(path = resolve(root, 'review/copy/market-days.json')) {
  return new Map(
    read(path).markets.map((m) => [m.id, { days: m.days, label: m.label, ...(m.noFirstAfter31 ? { noFirstAfter31: true } : {}) }]),
  );
}

/** Spots with `market` set (last key) on every shopping spot; throws on a market without a rule or a rule for a
 * place that does not ship. */
export function applyMarketDays(spots, rules = loadMarketDays(), categories = loadCategories()) {
  for (const id of rules.keys()) {
    if (!spots.some((s) => s.id === id)) throw new Error(`market-days rule for ${id}, which is not shipped`);
  }
  return spots.map((s) => {
    const rule = rules.get(s.id);
    if (!rule) {
      if (categories.get(s.id) === 'shopping') throw new Error(`market ${s.id} ${s.name} has no market-days rule — add it to review/copy/market-days.json`);
      return s;
    }
    const { market: _old, ...rest } = s;
    return { ...rest, market: rule };
  });
}

/** The shipped record of each kept market, as build-spots.mjs would make it (before applyMarketDays). */
export function marketSpots(inputPath = resolve(root, 'review/input/batch-900.json')) {
  const verdicts = new Map(loadMarketVerdicts().map((v) => [v.id, v]));
  const scores = new Map();
  for (const f of readdirSync(resolve(root, 'review/score')).filter((f) => /^score-\d{2}\.json$/.test(f)).sort()) {
    for (const v of read(resolve(root, 'review/score', f))) scores.set(v.id, v.score);
  }
  const indoorCalls = loadIndoorCalls();
  const out = [];
  for (const item of read(inputPath)) {
    const v = verdicts.get(item.id);
    if (!v) throw new Error(`market ${item.id} ${item.name} has no verdict in review/market/verdicts.json`);
    if (!v.keep) continue;
    const reason = shipReason(v.reason);
    const n = [...reason].length;
    if (n < 15 || n > 70 || reasonPunctuationProblem(reason)) throw new Error(`market ${item.id} reason breaks §10: ${reason}`);
    const score = scores.get(item.id);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`market ${item.id} has no score 1–5`);
    out.push({
      id: item.id,
      name: String(item.name).replace(/\s+/g, ' ').trim(),
      lat: item.lat,
      lng: item.lng,
      mood: v.mood,
      reason,
      image: item.image,
      kakaoPlaceId: item.kakaoPlaceId ?? null,
      bookable: item.category === 'experience',
      indoor: indoorOf(item.id, item.category, indoorCalls),
      ...(v.mood === 'new' ? { sub: newSub(item.id, item.category, new Map()) } : {}),
      score,
    });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const before = read(path);
  const add = marketSpots().filter((m) => !before.some((s) => s.id === m.id));
  const after = applyMarketDays([...before, ...add]);
  if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length})`);
  else {
    writeFileSync(path, JSON.stringify(after));
    console.log(`spots.json: ${add.length} market(s) added, ${after.filter((s) => s.market).length} with market days, ${after.length} in all`);
  }
}
