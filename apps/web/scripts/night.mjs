/**
 * 밤 산길 (ADR-0091, specs/night-trails.md §1): `trail: true` — 걷는 게 주인, 밤에 어두운 야외 산길(오름·산·숲길·
 * 계곡 탐방로·산간 둘레길) — on the places whose own source text confirmed it (review/night/trail-NN.json, the latest
 * round), and only when that round's blind re-judging passed (review/night/audit-NN.json, agreement.pass). The app
 * puts them after the other candidates at night (ADR-0091 4). A judgment for a place that does not ship stops the
 * run. No basis text is copied.
 *
 * build-spots.mjs applies it after 노을; run this file directly to apply it to the shipped public/spots.json in place
 * (after `sunsetView`, before a 체험's booking fields; nothing else changes). Idempotent.
 * `--candidates` writes review/night/candidates.json (who gets judged) instead. `--sample` draws the blind
 * re-judging sample of the latest round (review/night/audit-NN-sample.json: id, name and source text, no judgment).
 * `--score` scores the blind judge's review/night/audit-NN-judgments.json (`[{ id, trail, reason? }]`) against the
 * round and writes review/night/audit-NN.json.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadInputs } from './sunset.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const BOOKING_KEYS = new Set(['book', 'hide']);
const BASIS_MAX = 40;
/** A basis may say the text was unclear (and the call therefore false): this, then the source words. */
const UNSURE = '애매: ';

/** §1 후보, fixed before judging: a place whose source text or name has one of these (besides every 걷기). */
const TRAIL_WORDS = /오름|악$|악\)|산$|봉$|숲|휴양림|곶자왈|계곡|탐방|둘레길|등반|등산|정상|트레킹|산책로|올레/;
/** §1 blind re-judging: this many `true` and as many `false` of the round, drawn with mulberry32(SAMPLE_SEED). */
const SAMPLE_SEED = 20261016;
const PER_SIDE = 60;
/** §1 pass: agreement ≥ 95% over the sample, and at most 3 first-round `true` the blind judge calls `false`. */
const AGREE_MIN = 0.95;
const TRUE_TO_FALSE_MAX = 3;

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The source text a judgment reads and a basis must come from: name, tags, intro, comment, summary. */
function sourceText(item) {
  return [item.name, (item.tags ?? []).join(' '), item.intro ?? '', item.comment ?? '', item.summary ?? ''].join('\n');
}

/** What a judge reads of a place besides its name: the source text fields, not the whole source item. */
const textOf = (item) => ({ tags: item.tags ?? [], intro: item.intro ?? null, comment: item.comment ?? null, summary: item.summary ?? null });

/**
 * Who gets judged (§1), by id: every shipped place whose source text or name has a TRAIL_WORDS word, and every
 * 걷기 — [{ id, name, mood, tags, intro, comment, summary }].
 */
export function candidates(spots, inputs) {
  const out = [];
  for (const s of spots) {
    const item = inputs.get(s.id) ?? { name: s.name };
    if (s.mood !== 'walk' && !TRAIL_WORDS.test(sourceText(item)) && !TRAIL_WORDS.test(s.name.trim())) continue;
    out.push({ id: s.id, name: s.name, mood: s.mood, ...textOf(item) });
  }
  return out.sort(byId);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The blind re-judging sample (§1), as ids: `per` judged true and `per` judged false, each drawn in id order with
 * mulberry32(seed), then shuffled together with the same stream. Throws when a side has fewer than `per`.
 */
export function drawSample(calls, seed = SAMPLE_SEED, per = PER_SIDE) {
  const rnd = mulberry32(seed);
  const shuffle = (ids) => ids.map((id) => ({ id, r: rnd() })).sort((x, y) => x.r - y.r).map((x) => x.id);
  const side = (trail) => {
    const ids = calls.filter((c) => c.trail === trail).sort(byId).map((c) => c.id);
    if (ids.length < per) throw new Error(`only ${ids.length} judgments with trail ${trail}; the sample needs ${per}`);
    return shuffle(ids).slice(0, per);
  };
  return shuffle([...side(true), ...side(false)]);
}

/** The latest judging round and whether its audit passed: { calls: [{ id, trail, basis }], pass, round }. */
export function loadNightCalls(dir = resolve(root, 'review/night')) {
  const rounds = readdirSync(dir).map((f) => /^trail-(\d{2})\.json$/.exec(f)?.[1]).filter(Boolean).sort();
  const nn = rounds.at(-1);
  if (!nn) return { calls: [], pass: false, round: null };
  let pass = false;
  try {
    pass = read(resolve(dir, `audit-${nn}.json`)).agreement?.pass === true;
  } catch {
    pass = false;
  }
  return { calls: read(resolve(dir, `trail-${nn}.json`)), pass, round: nn };
}

/** Basis problems: missing, longer than 40 characters, or (after an optional 「애매: 」) not word for word in the place's source text. */
export function basisProblems(calls, inputs) {
  const bad = [];
  for (const c of calls) {
    const item = inputs.get(c.id);
    const words = typeof c.basis === 'string' && c.basis.startsWith(UNSURE) ? c.basis.slice(UNSURE.length) : c.basis;
    if (!item) bad.push(`${c.id}: no source item`);
    else if (typeof words !== 'string' || !words.trim()) bad.push(`${c.id}: no basis`);
    else if ([...c.basis].length > BASIS_MAX) bad.push(`${c.id}: basis over ${BASIS_MAX} characters`);
    else if (!sourceText(item).includes(words)) bad.push(`${c.id}: basis not in the source text`);
  }
  return bad;
}

/** A round's problems: a candidate not judged, a place judged twice or not a candidate, a `trail` not true/false, and its basisProblems. */
export function roundProblems(calls, candidateIds, inputs) {
  const want = new Set(candidateIds);
  const seen = new Set();
  const bad = [];
  for (const c of calls) {
    if (seen.has(c.id)) bad.push(`${c.id}: judged twice`);
    else if (!want.has(c.id)) bad.push(`${c.id}: not a candidate`);
    seen.add(c.id);
    if (typeof c.trail !== 'boolean') bad.push(`${c.id}: trail ${JSON.stringify(c.trail)} is not true/false`);
  }
  for (const id of want) if (!seen.has(id)) bad.push(`${id}: candidate not judged`);
  return [...bad, ...basisProblems(calls, inputs)];
}

/**
 * The blind judge against the round (§1): rows in sample order and the agreement — n, agree, rate and trueToFalse
 * (first `true`, blind `false`: pushing back a place that should not be is the worse mistake) — with pass = rate ≥ 95%
 * and trueToFalse ≤ 3. Throws unless every sampled place has a first judgment and exactly one blind true/false.
 */
export function scoreAudit(calls, ids, judgments) {
  const first = new Map(calls.map((c) => [c.id, c.trail]));
  const sampled = new Set(ids);
  const blind = new Map();
  for (const j of judgments) {
    if (!sampled.has(j.id)) throw new Error(`blind judgment for ${j.id}, which is not in the sample`);
    if (blind.has(j.id)) throw new Error(`blind judgment ${j.id} appears twice`);
    if (typeof j.trail !== 'boolean') throw new Error(`blind judgment ${j.id}: trail ${JSON.stringify(j.trail)} is not true/false`);
    blind.set(j.id, j);
  }
  const rows = ids.map((id) => {
    if (typeof first.get(id) !== 'boolean') throw new Error(`sampled ${id} has no first judgment`);
    const j = blind.get(id);
    if (!j) throw new Error(`sampled ${id} has no blind judgment`);
    const row = { id, first: first.get(id), audit: j.trail, agree: first.get(id) === j.trail };
    return typeof j.reason === 'string' ? { ...row, reason: j.reason } : row;
  });
  const n = rows.length;
  const agree = rows.filter((r) => r.agree).length;
  const trueToFalse = rows.filter((r) => r.first && !r.audit).length;
  const rate = n ? agree / n : 0;
  const pass = n > 0 && rate >= AGREE_MIN && trueToFalse <= TRUE_TO_FALSE_MAX;
  return { agreement: { n, agree, rate, threshold: AGREE_MIN, trueToFalse, trueToFalseMax: TRUE_TO_FALSE_MAX, pass }, rows };
}

/**
 * Spots with `trail: true` where a `true` judgment of a passed round says so; any old `trail` is taken off first.
 * Throws on a judgment for a place that does not ship, the same place twice, or a `trail` that is not true/false.
 */
export function applyNight(spots, { calls, pass } = loadNightCalls()) {
  const shipped = new Set(spots.map((s) => s.id));
  const seen = new Set();
  const on = new Set();
  for (const c of calls) {
    if (typeof c.trail !== 'boolean') throw new Error(`night judgment ${c.id}: trail ${JSON.stringify(c.trail)} is not true/false`);
    if (seen.has(c.id)) throw new Error(`night judgment ${c.id} appears twice — keep one in review/night`);
    seen.add(c.id);
    if (!shipped.has(c.id)) throw new Error(`night judgment for ${c.id}, which is not shipped — remove it from review/night`);
    if (pass && c.trail) on.add(c.id);
  }
  return spots.map((s) => {
    const { trail: _old, ...rest } = s;
    if (!on.has(s.id)) return rest;
    // last, but before a 체험's booking fields — the order build-spots.mjs makes (노을 → 밤 산길 → 체험 예약 경로)
    const out = {};
    let placed = false;
    for (const [k, v] of Object.entries(rest)) {
      if (!placed && BOOKING_KEYS.has(k)) {
        out.trail = true;
        placed = true;
      }
      out[k] = v;
    }
    if (!placed) out.trail = true;
    return out;
  });
}

/** Jeju's calendar day now. */
const jejuDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(root, 'public/spots.json');
  const dir = resolve(root, 'review/night');
  const before = read(path);
  if (process.argv.includes('--candidates')) {
    const list = candidates(before, loadInputs());
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'candidates.json'), `[\n${list.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
    const walk = list.filter((c) => c.mood === 'walk').length;
    console.log(`candidates ${list.length}: 걷기 ${walk}, others by word ${list.length - walk}`);
  } else if (process.argv.includes('--sample')) {
    const { calls, round } = loadNightCalls(dir);
    if (!round) throw new Error('no review/night/trail-NN.json to draw from');
    const inputs = loadInputs();
    const bad = roundProblems(calls, read(resolve(dir, 'candidates.json')).map((c) => c.id), inputs);
    if (bad.length) throw new Error(`trail-${round}.json problems:\n${bad.join('\n')}`);
    const names = new Map(before.map((s) => [s.id, s.name]));
    const items = drawSample(calls, SAMPLE_SEED).map((id) => ({ id, name: names.get(id), ...textOf(inputs.get(id)) }));
    writeFileSync(resolve(dir, `audit-${round}-sample.json`), `${JSON.stringify({ round, seed: SAMPLE_SEED, items }, null, 1)}\n`);
    console.log(`audit-${round}-sample.json: ${items.length} places (seed ${SAMPLE_SEED}) from trail-${round}.json`);
  } else if (process.argv.includes('--score')) {
    const { calls, round } = loadNightCalls(dir);
    if (!round) throw new Error('no review/night/trail-NN.json to score against');
    const sample = read(resolve(dir, `audit-${round}-sample.json`));
    const ids = sample.items.map((i) => i.id);
    if (drawSample(calls, sample.seed).join() !== ids.join()) {
      throw new Error(`audit-${round}-sample.json is not what seed ${sample.seed} draws from trail-${round}.json — was the round changed after the draw?`);
    }
    const { agreement, rows } = scoreAudit(calls, ids, read(resolve(dir, `audit-${round}-judgments.json`)));
    const out = {
      round,
      date: jejuDay(),
      criteria: 'specs/night-trails.md §1',
      sample: `audit-${round}-sample.json (seed ${sample.seed})`,
      judgments: `audit-${round}-judgments.json`,
      agreement,
      rows,
    };
    writeFileSync(resolve(dir, `audit-${round}.json`), `${JSON.stringify(out, null, 1)}\n`);
    console.log(`audit-${round}.json: agree ${agreement.agree}/${agreement.n}, true→false ${agreement.trueToFalse}, pass ${agreement.pass}`);
  } else {
    const loaded = loadNightCalls(dir);
    const bad = basisProblems(loaded.calls, loadInputs());
    if (bad.length) throw new Error(`night basis problems:\n${bad.join('\n')}`);
    const after = applyNight(before, loaded);
    const n = after.filter((s) => s.trail).length;
    if (JSON.stringify(after) === JSON.stringify(before)) console.log(`spots.json unchanged (${after.length}); trail ${n} (audit pass: ${loaded.pass})`);
    else {
      writeFileSync(path, JSON.stringify(after));
      console.log(`spots.json: trail ${n} (round ${loaded.round}, audit pass: ${loaded.pass})`);
    }
  }
}
