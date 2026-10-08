// 시뮬레이터 출력(work/out-r{1,2}-*.jsonl)을 엔진으로 재생해 done·taps·막힘을 센다(R5).
//   node sim/replay.mjs r1   → work/replay-r1.jsonl
//   node sim/replay.mjs r2   → work/replay-r2.jsonl (work/r2-meta.jsonl 필요)
//   node sim/replay.mjs noise → work/replay-noise.jsonl (work/out-noise-*.jsonl)
//   node sim/replay.mjs cross → work/replay-cross-r{1,2}.jsonl (work/out-cross-r{1,2}-*.jsonl)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, judge } from './engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'work');
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const outs = (prefix) => fs.readdirSync(W).filter((n) => n.startsWith(prefix) && n.endsWith('.jsonl')).flatMap((n) => readJsonl(path.join(W, n)));

function replay(records, metaFor, file) {
  const res = [];
  const seen = new Set();
  for (const r of records) {
    const key = `${r.id}|${r.flow}|${r.round}`;
    if (seen.has(key)) continue; // 중복 줄은 첫 줄만
    seen.add(key);
    const m = metaFor(r);
    const before = m.saved ?? [];
    const st = run(r.flow, m.day ?? 0, before, Array.isArray(r.actions) ? r.actions : [], { needArea: r.scenario === 'S3' });
    const pastHidden = r.flow === 'Y' && st.invalid.some((x) => x.startsWith('saved:go')) && before.some((s) => s.day < (m.day ?? 0));
    res.push({
      id: r.id, flow: r.flow, round: r.round, scenario: r.scenario, done: judge(r.scenario, st, before), taps: st.taps, invalid: st.invalid,
      hearts: st.hearts.length, go: st.go?.from ?? null, savedAfter: st.saved, pastHidden,
      again: r.again, stuck: r.stuck, recheck: r.recheck, burden: r.burden, why: r.why,
    });
  }
  fs.writeFileSync(path.join(W, file), res.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`${file}: ${res.length} rows, done ${(res.filter((x) => x.done).length / res.length * 100).toFixed(1)}%, invalid ${res.filter((x) => x.invalid.length).length}`);
}

const cmd = process.argv[2];
if (cmd === 'r1') replay(outs('out-r1-'), () => ({ day: 0, saved: [] }), 'replay-r1.jsonl');
else if (cmd === 'noise') replay(outs('out-noise-'), () => ({ day: 0, saved: [] }), 'replay-noise.jsonl');
else if (cmd === 'r2' || cmd === 'cross') {
  const meta = new Map(readJsonl(path.join(W, 'r2-meta.jsonl')).map((m) => [`${m.id}|${m.flow}`, m]));
  if (cmd === 'r2') replay(outs('out-r2-'), (r) => meta.get(`${r.id}|${r.flow}`) ?? {}, 'replay-r2.jsonl');
  else {
    replay(outs('out-cross-r1-'), () => ({ day: 0, saved: [] }), 'replay-cross-r1.jsonl');
    const cm = fs.existsSync(path.join(W, 'cross-r2-meta.jsonl')) ? new Map(readJsonl(path.join(W, 'cross-r2-meta.jsonl')).map((m) => [`${m.id}|${m.flow}`, m])) : new Map();
    replay(outs('out-cross-r2-'), (r) => cm.get(`${r.id}|${r.flow}`) ?? {}, 'replay-cross-r2.jsonl');
  }
} else console.error('사용: node sim/replay.mjs r1|r2|noise|cross');
