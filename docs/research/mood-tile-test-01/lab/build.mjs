// 묶음 파일 만들기 (00-prereg.md 5절). 결과를 보기 전에 한 번 실행하고 출력을 커밋한다.
//   node docs/research/mood-tile-test-01/lab/build.mjs   → work/main/, work/retest/
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from './cards.mjs';
import { newState } from './tile.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(HERE, '../work');
const PANEL = resolve(HERE, '../../p-persona-sim-02/work/stage0c/panel.jsonl');

// 씨앗 있는 난수 (mulberry32)
function rng(seed) {
  let h = 1779033703;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const R = rng('mood-tile-test-01-2026-10-31');
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const sid = () => Math.floor(R() * 36 ** 8).toString(36).padStart(8, '0');

// 사람: 0c 패널 240명 중 짝수 줄 120명. 상황(장소·동행)은 카드가 정하므로 습관 칸만 남긴다.
const KEEP = ['나이', '성별', '직업', '저장습관', '폰쓰는때', '폰솜씨', '제약'];
const DROP_CONSTRAINT = ['동행이 옆에서 말을 건다', '아이를 챙기느라 자주 끊긴다'];
const people = readFileSync(PANEL, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((_, i) => i % 2 === 0);
if (people.length !== 120) throw new Error(`사람 ${people.length}명`);
const person = (p) => {
  const attrs = { 유형: p.type };
  for (const k of KEEP) if (p.attrs[k] != null) attrs[k] = p.attrs[k];
  if (DROP_CONSTRAINT.includes(attrs.제약)) attrs.제약 = '특별한 제약 없음';
  return { id: p.id, group: p.group, type: p.type, name: p.name, attrs };
};

// 판 코드(눈가림): 묶음 파일엔 코드만, 이름은 key.json
const ARMS = ['cur', 'A', 'C'];
const codes = shuffle(['k314', 'k582', 'k947']);
const KEY = Object.fromEntries(ARMS.map((a, i) => [codes[i], a]));
const CODE = Object.fromEntries(ARMS.map((a, i) => [a, codes[i]]));

// 짝: 사람 i ↔ 카드 (i mod 12) → 카드마다 10명. 묶음 j = 사람 10j…10j+9(카드 10장이 서로 다름). 세 판이 같은 묶음 구성.
const groups = Array.from({ length: 12 }, (_, j) => people.slice(10 * j, 10 * j + 10).map((p, k) => ({ p, card: CARDS[(10 * j + k) % 12] })));
const RETEST = [0, 3, 6, 9];

function write(dir, jobs) {
  mkdirSync(resolve(dir, 'calls'), { recursive: true });
  const order = shuffle(jobs);
  const manifest = order.map((job, i) => {
    const file = `c${String(i + 1).padStart(3, '0')}.json`;
    const call = {
      lang: 'ko', narrative: false, engine: 'tile',
      sessions: groups[job.g].map(({ p, card }) => { const id = sid(); return { sid: id, pid: p.id, card: card.n, situation: card.text, state: newState(id, CODE[job.arm]) }; }),
      persons: Object.fromEntries(groups[job.g].map(({ p }) => [p.id, person(p)])),
    };
    writeFileSync(resolve(dir, 'calls', file), JSON.stringify(call, null, 1));
    return { file, arm: job.arm, group: job.g, model: 'sonnet', n: 10 };
  });
  writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  writeFileSync(resolve(dir, 'key.json'), JSON.stringify(KEY, null, 1));
}
write(resolve(WORK, 'main'), ARMS.flatMap((arm) => groups.map((_, g) => ({ arm, g }))));
write(resolve(WORK, 'retest'), ARMS.flatMap((arm) => RETEST.map((g) => ({ arm, g }))));
console.log('main 36묶음 · retest 12묶음, 판 코드', KEY);
