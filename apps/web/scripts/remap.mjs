/**
 * 검수한 곳 기분 다시 나누기 v5 (ADR-0105, 사전등록 review/gangwon/criteria-05.md). 모델을 부르지 않는다.
 *
 *   node scripts/remap.mjs scope    출하 파일 → 대상 R, 결정적 규칙 결과 review/remap/scope-05.json, 애매한 곳 judge-05/input-NN.json
 *   node scripts/remap.mjs check    judge-05/out-NN.json 기계 검사 → judge-05/check.json
 *   node scripts/remap.mjs sample   R에서 120곳(씨앗 20261104) → audit-05-sample.json (기분·walkin·이유 없음)
 *   node scripts/remap.mjs score    audit-05-judgments.json → audit-05.json
 *   node scripts/remap.mjs apply    통과했을 때만: 제주 corrections-05.json·booking.json, review/remap/busan.json·gangwon.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkinByRule } from './walkin.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(webRoot, 'review/remap');
const judgeDir = resolve(dir, 'judge-05');
export const SEED = 20261104;
export const SAMPLE_N = 120;
export const BATCH = 50;
export const THRESHOLDS = { mood: 0.9, walkin: 0.9 };
const TYPE_NAME = { 12: '관광지', 14: '문화시설', 28: '레포츠', 38: '쇼핑(전통시장)', 39: '음식점' };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
};
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const two = (n) => String(n).padStart(2, '0');
/** 이름 끝 괄호를 뗀 카드 이름 */
const bare = (name) => norm(name).replace(/\s*\([^)]*\)\s*$/, '');

/** 1절 무리 */
export function groupsOf(spot, code) {
  const g = [];
  const name = norm(spot.name);
  if (spot.mood === 'new' && spot.sub === 'do' && !spot.book) g.push('H');
  if (spot.mood === 'food') return g;
  if (/계곡/.test(name) || code === 'NA010400') g.push('V');
  if (/낚시/.test(name) || code === 'LS020500' || code === 'LS020600') g.push('F');
  if (/목장|농장|농원|팜/.test(name) || code === 'EX030200' || code === 'EX030300') g.push('R');
  if (/(해변|해수욕장)$/.test(bare(name))) g.push('B');
  return g;
}

/** 2절 결정적 규칙: { by, after } 또는 { ask } */
export function decide(spot, code, groups) {
  const name = norm(spot.name);
  const has = (x) => groups.includes(x);
  if (has('B')) return { by: 'D1', after: { mood: 'rest' } };
  if (has('V') && spot.mood === 'rest') return { by: 'D2', after: { mood: 'new', sub: 'do', walkin: true } };
  if (has('F') && /배낚시|선상낚시/.test(name)) return { by: 'D3a', after: { mood: 'new', sub: 'do', walkin: false } };
  if (has('F') && /낚시터|낚시공원/.test(name)) return { by: 'D3b', after: { mood: 'new', sub: 'do', walkin: true } };
  if (has('R') && spot.mood === 'new' && spot.sub === 'do' && code === 'EX030200') return { by: 'D4', after: { mood: 'new', sub: 'do', walkin: true } };
  if (groups.length === 1 && has('H')) {
    const w = walkinByRule(code, name);
    if (w !== null) return { by: 'D5', after: { mood: 'new', sub: 'do', walkin: w } };
    return { ask: 'walkin' };
  }
  return { ask: 'mood' };
}

let catNames = null;
function codeName(code) {
  if (!catNames) {
    catNames = {};
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (/^[A-Z]{2}\d{6}$/.test(k) && v && typeof v === 'object' && v.name) catNames[k] = v.name;
        walk(v);
      }
    };
    walk(readJson(resolve(webRoot, 'review/nation/categories.json')));
  }
  return catNames[code] ?? '';
}

/** 여행지마다 출하 레코드와 원문 */
export function loadDests() {
  const jejuSrc = new Map();
  for (const f of readdirSync(resolve(webRoot, 'review/input')).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort()) for (const i of readJson(resolve(webRoot, 'review/input', f))) jejuSrc.set(i.id, i);
  const tour = (dest, scopePath, rawDir) => {
    const items = new Map(readJson(scopePath).items.map((i) => [i.id, i]));
    return (id) => {
      const it = items.get(id);
      if (!it) return null;
      const cid = String(it.contentid ?? it.id).replace(/^(nt|bs)-/, '');
      const f = resolve(rawDir, `${cid}.json`);
      const d = existsSync(f) ? readJson(f).body.response.body.items.item[0] : {};
      return { code: it.lclsSystm3 ?? '', text: { type: TYPE_NAME[it.contenttypeid] ?? String(it.contenttypeid), lclsSystm3: it.lclsSystm3 ?? '', lclsName: codeName(it.lclsSystm3), addr: it.addr1 ?? '', overview: norm(d.overview) } };
    };
  };
  return [
    {
      dest: 'jeju',
      spots: readJson(resolve(webRoot, 'public/spots.json')),
      src: (id) => {
        const i = jejuSrc.get(id);
        return i ? { code: '', text: { category: i.category, tags: norm(Array.isArray(i.tags) ? i.tags.join(', ') : i.tags), intro: norm(i.intro), summary: norm(i.summary) } } : null;
      },
    },
    { dest: 'busan', spots: readJson(resolve(webRoot, 'public/spots-busan.json')), src: tour('busan', resolve(webRoot, 'review/busan/scope.json'), resolve(webRoot, 'review/busan/raw/detail')) },
    { dest: 'gangwon', spots: readJson(resolve(webRoot, 'data/gangwon/spots-gangwon.json')), src: tour('gangwon', resolve(webRoot, 'review/gangwon/scope.json'), resolve(webRoot, 'review/gangwon/raw/detail')) },
  ];
}

const nowOf = (s) => ({ mood: s.mood, ...(s.sub ? { sub: s.sub } : {}), ...(s.walkin ? { walkin: true } : {}) });

export function scope(dests = loadDests()) {
  const rows = [];
  for (const { dest, spots, src } of dests) {
    for (const s of spots) {
      if (s.hide) continue;
      const source = src(s.id);
      if (!source) throw new Error(`${dest} ${s.id} ${s.name}: no source`);
      const groups = groupsOf(s, source.code);
      if (!groups.length) continue;
      const d = decide(s, source.code, groups);
      rows.push({ dest, id: s.id, name: s.name, groups, code: source.code, now: nowOf(s), ...d, text: source.text });
    }
  }
  return rows;
}

const inputOf = (r) => ({ id: r.id, name: r.name, dest: r.dest, ask: r.ask, ...r.text });

function loadOuts() {
  const out = new Map();
  if (!existsSync(judgeDir)) return out;
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) for (const v of readJson(resolve(judgeDir, f))) out.set(v.id, v);
  return out;
}

const sourceText = (inp) => [inp.name, inp.overview, inp.intro, inp.summary, inp.tags, inp.category, inp.lclsName].map(norm).join(' ');

/** 3절 출력 한 줄의 문제들 */
export function outProblems(inp, o) {
  const p = [];
  if (!o) return ['missing'];
  if (o.ask !== undefined && o.ask !== inp.ask) p.push('ask changed');
  if (inp.ask === 'walkin') {
    if (o.mood !== 'new' || o.sub !== 'do') p.push(`walkin ask: mood/sub ${o.mood}/${o.sub}`);
    if (typeof o.walkin !== 'boolean') p.push(`walkin ${o.walkin}`);
  } else {
    if (!['rest', 'walk', 'new', 'same'].includes(o.mood)) p.push(`mood ${o.mood}`);
    if (o.mood === 'new' && !['sight', 'do'].includes(o.sub)) p.push(`sub ${o.sub}`);
    if (o.mood === 'new' && o.sub === 'do' && typeof o.walkin !== 'boolean') p.push(`walkin ${o.walkin}`);
  }
  if (!Array.isArray(o.basis) || o.basis.length < 1 || o.basis.length > 3) p.push('basis count');
  else {
    const src = sourceText(inp).replace(/\s+/g, '');
    for (const b of o.basis) if (typeof b !== 'string' || [...b].length > 40 || !src.includes(String(b).replace(/\s+/g, ''))) p.push(`basis not in source: ${b}`);
  }
  if (!['high', 'low'].includes(o.confidence)) p.push(`confidence ${o.confidence}`);
  return p;
}

/** 결정 하나(결정적 규칙 또는 판정) → 이 회차 결과 { mood, sub?, walkin? } */
export function resultOf(r, o) {
  if (r.after) return r.after;
  if (r.ask === 'walkin') return { mood: 'new', sub: 'do', walkin: o.walkin };
  if (o.mood === 'same') return { ...r.now };
  if (o.mood === 'new') return o.sub === 'do' ? { mood: 'new', sub: 'do', walkin: o.walkin } : { mood: 'new', sub: 'sight' };
  return { mood: o.mood };
}

/** 부산·강원 빌드가 읽는 이 회차의 덮개(review/remap/<dest>.json). 없으면 []. */
export function loadRemap(dest, root = dir) {
  const p = resolve(root, `${dest}.json`);
  return existsSync(p) ? readJson(p) : [];
}

/** 판정(verdicts: id → v) 위에 덮개를 덮은 새 Map과 walkin id 모음. before가 판정과 다르면 멈춘다. `only`에 든 id만. */
export function applyRemap(verdicts, records, only = null) {
  const out = new Map(verdicts);
  const walkin = new Set();
  for (const r of records) {
    if (only && !only.has(r.id)) continue;
    const v = verdicts.get(r.id);
    const sameSub = r.before.mood !== 'new' || v?.sub === r.before.sub;
    if (!v || v.mood !== r.before.mood || !sameSub) throw new Error(`remap ${r.id} ${r.name}: verdict ${v?.mood}/${v?.sub} ≠ before ${JSON.stringify(r.before)}`);
    out.set(r.id, { ...v, mood: r.after.mood, sub: r.after.sub ?? null });
    if (r.after.walkin) walkin.add(r.id);
  }
  return { verdicts: out, walkin };
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function drawSample(ids, seed = SEED, n = SAMPLE_N) {
  const a = [...ids].sort();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** 4절 지표 */
export function scoreAudit(rows, outs, judgments) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let moodN = 0;
  let moodSame = 0;
  let wN = 0;
  let wSame = 0;
  let subN = 0;
  let subSame = 0;
  const misses = [];
  for (const j of judgments) {
    const r = byId.get(j.id);
    if (!r) continue;
    const mine = resultOf(r, outs.get(r.id));
    const askOf = r.groups.length === 1 && r.groups[0] === 'H' ? 'walkin' : 'mood';
    const theirs = askOf === 'walkin' ? { mood: 'new', sub: 'do', walkin: j.walkin } : resultOf({ ...r, after: undefined, ask: 'mood' }, j);
    if (askOf === 'mood') {
      moodN++;
      if (theirs.mood === mine.mood) moodSame++;
      else misses.push({ id: r.id, name: r.name, dest: r.dest, what: 'mood', mine: mine.mood, audit: theirs.mood, by: r.by ?? 'judge' });
    }
    if (mine.mood === 'new' && theirs.mood === 'new') {
      subN++;
      if (mine.sub === theirs.sub) subSame++;
    }
    if (mine.mood === 'new' && mine.sub === 'do' && theirs.mood === 'new' && theirs.sub === 'do') {
      wN++;
      if (Boolean(mine.walkin) === Boolean(theirs.walkin)) wSame++;
      else misses.push({ id: r.id, name: r.name, dest: r.dest, what: 'walkin', mine: Boolean(mine.walkin), audit: Boolean(theirs.walkin), by: r.by ?? 'judge' });
    }
  }
  const rate = (a, b) => (b ? a / b : 0);
  return {
    n: judgments.length,
    mood: { same: moodSame, of: moodN, rate: rate(moodSame, moodN), pass: rate(moodSame, moodN) >= THRESHOLDS.mood },
    walkin: { same: wSame, of: wN, rate: rate(wSame, wN), pass: rate(wSame, wN) >= THRESHOLDS.walkin },
    sub: { same: subSame, of: subN, rate: rate(subSame, subN) },
    misses,
  };
}

/** 이 회차가 실제로 바꾸는 곳: 여행지별 [{ id, name, before, after, by, why }] */
export function changes(rows, outs) {
  const out = { jeju: [], busan: [], gangwon: [] };
  for (const r of rows) {
    const o = outs.get(r.id);
    const after = resultOf(r, o);
    const same = after.mood === r.now.mood && (after.sub ?? null) === (r.now.sub ?? null) && Boolean(after.walkin) === Boolean(r.now.walkin);
    if (same) continue;
    // 경로(book)가 있는 곳의 walkin은 적지 않는다(ADR-0074 Amendment 1 3)
    out[r.dest].push({ id: r.id, name: r.name, before: r.now, after, by: r.by ?? 'judge', groups: r.groups, basis: o?.basis ?? [] });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const scopePath = resolve(dir, 'scope-05.json');
  if (cmd === 'scope') {
    if (existsSync(scopePath)) throw new Error('scope-05.json이 이미 있다 — 대상은 한 번만 뽑는다');
    const rows = scope();
    writeJson(scopePath, rows);
    const ask = rows.filter((r) => r.ask).sort((a, b) => (a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let i = 0; i * BATCH < ask.length; i++) writeJson(resolve(judgeDir, `input-${two(i + 1)}.json`), ask.slice(i * BATCH, (i + 1) * BATCH).map(inputOf));
    const count = {};
    for (const r of rows) {
      const k = `${r.dest} ${r.by ?? 'ask:' + r.ask}`;
      count[k] = (count[k] ?? 0) + 1;
    }
    console.log(`R ${rows.length}, 판정 ${ask.length} (${Math.ceil(ask.length / BATCH)} 묶음)`, JSON.stringify(count, null, 1));
  } else if (cmd === 'check') {
    const rows = readJson(scopePath);
    const outs = loadOuts();
    const problems = [];
    const inputs = readdirSync(judgeDir).filter((f) => /^input-\d{2}\.json$/.test(f)).flatMap((f) => readJson(resolve(judgeDir, f)));
    for (const inp of inputs) for (const p of outProblems(inp, outs.get(inp.id))) problems.push(`${inp.id} ${inp.name}: ${p}`);
    const known = new Set(inputs.map((i) => i.id));
    for (const id of outs.keys()) if (!known.has(id)) problems.push(`${id}: not an input`);
    writeJson(resolve(judgeDir, 'check.json'), { inputs: inputs.length, outs: outs.size, rows: rows.length, problems });
    console.log(`판정 ${outs.size}/${inputs.length}, 문제 ${problems.length}`);
    for (const p of problems.slice(0, 40)) console.log('  ' + p);
  } else if (cmd === 'sample') {
    const samplePath = resolve(dir, 'audit-05-sample.json');
    if (existsSync(samplePath)) throw new Error('audit-05-sample.json이 이미 있다 — 표본은 한 번만 뽑는다');
    const rows = readJson(scopePath);
    const ids = drawSample(rows.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids.map((id) => {
      const r = byId.get(id);
      const ask = r.groups.length === 1 && r.groups[0] === 'H' ? 'walkin' : 'mood';
      return { id: r.id, name: r.name, dest: r.dest, ask, beach: r.groups.includes('B') || undefined, ...r.text };
    });
    const leak = items.filter((i) => 'mood' in i || 'walkin' in i || 'reason' in i || 'sub' in i);
    if (leak.length) throw new Error('표본에 답이 섞였다');
    writeJson(samplePath, { seed: SEED, n: items.length, items });
    console.log(`표본 ${items.length}곳`);
  } else if (cmd === 'score') {
    const rows = readJson(scopePath);
    const s = scoreAudit(rows, loadOuts(), readJson(resolve(dir, 'audit-05-judgments.json')));
    writeJson(resolve(dir, 'audit-05.json'), s);
    const { misses, ...head } = s;
    console.log(JSON.stringify(head, null, 1), `\n불일치 ${misses.length}`);
  } else if (cmd === 'apply') {
    const audit = readJson(resolve(dir, 'audit-05.json'));
    if (!audit.mood.pass || !audit.walkin.pass) throw new Error('감사 기준을 넘지 못했다 — 싣지 않는다(criteria-05 5절)');
    const rows = readJson(scopePath);
    const ch = changes(rows, loadOuts());
    const shipped = Object.fromEntries(loadDests().map((d) => [d.dest, new Map(d.spots.map((s) => [s.id, s]))]));
    // 경로(book)가 있는 곳에는 walkin을 적지 않는다(ADR-0074 Amendment 1 3). 그것뿐인 줄은 바뀌는 것이 없다
    for (const dest of Object.keys(ch)) {
      ch[dest] = ch[dest]
        .map((c) => {
          const s = shipped[dest].get(c.id);
          const after = { ...c.after };
          if (!(after.mood === 'new' && after.sub === 'do') || s.book || !after.walkin) delete after.walkin;
          return { ...c, after };
        })
        .filter((c) => c.after.mood !== c.before.mood || (c.after.sub ?? null) !== (c.before.sub ?? null) || Boolean(c.after.walkin) !== Boolean(c.before.walkin));
    }
    writeJson(resolve(dir, 'changes-05.json'), ch);
    const why = (c) => `ADR-0105 기분 다시 나누기 v5(review/gangwon/criteria-05.md ${c.by === 'judge' ? '3절 판정' : `2절 ${c.by}`}): ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`;
    const evidence = (c) => (c.basis?.length ? `원문: ${c.basis.join(' / ')}` : 'review/remap/scope-05.json(결정적 규칙)');
    // 부산·강원: 빌드가 판정 위에 덮는다(before가 다르면 멈춘다)
    for (const dest of ['busan', 'gangwon']) writeJson(resolve(dir, `${dest}.json`), ch[dest].map((c) => ({ id: c.id, name: c.name, before: c.before, after: c.after, by: c.by, why: why(c), evidence: evidence(c) })));
    // 제주: 기분·sub는 corrections-05.json(새 파일, 04는 예약 검수 기록), 예약 없이 가는지는 booking.json(ADR-0105 5)
    const copy = resolve(webRoot, 'review/copy');
    const moodSets = ch.jeju.filter((c) => c.after.mood !== c.before.mood || (c.after.sub ?? null) !== (c.before.sub ?? null));
    writeJson(resolve(copy, 'corrections-05.json'), moodSets.map((c) => ({ id: c.id, action: 'set', fields: { mood: c.after.mood, ...(c.after.sub ? { sub: c.after.sub } : {}) }, reason: `${c.name}: ${why(c)}`, evidence: evidence(c) })));
    const booking = readJson(resolve(copy, 'booking.json'));
    for (const c of ch.jeju) {
      const s = shipped.jeju.get(c.id);
      if (!(c.after.mood === 'new' && c.after.sub === 'do') || s.book) continue;
      const call = c.after.walkin
        ? { id: c.id, name: c.name, call: 'walkin', reason: `예약 없이 가는 곳(ADR-0074 Amendment 1). ${why(c)}`, evidence: evidence(c) }
        : { id: c.id, name: c.name, call: 'noroute', reason: `예약해야만 할 수 있는 곳인데 확인된 경로가 없다(ADR-0074 Amendment 1). ${why(c)}`, evidence: evidence(c) };
      const i = booking.findIndex((b) => b.id === c.id);
      if (i >= 0) booking[i] = call;
      else booking.push(call);
    }
    writeFileSync(resolve(copy, 'booking.json'), JSON.stringify(booking, null, 1) + '\n');
    console.log(Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.length])), `제주 기분 ${moodSets.length}`);
  } else {
    console.log('scope | check | sample | score | apply');
  }
}
