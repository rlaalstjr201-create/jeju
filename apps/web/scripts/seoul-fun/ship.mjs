/**
 * 서울 즐길 거리 출하 (criteria-07.md 5·7절). 판정 keep(감사를 통과한 갈래만) → data/seoul/fun-seoul.json. 호출 없음.
 *   node scripts/seoul-fun/ship.mjs [--g4] [--skip G2,G6]   판정 08(G4 빼고) + --g4면 판정 09의 G4; 떨어진 갈래는 --skip
 * 카드 문장은 틀로만 만든다: 「<카카오 카테고리 끝 말> · <동네 또는 구>」, KOPIS 공연장은 「라이브 공연장 · 최근 반년 공연 n회」.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-fun');
const read = (p) => JSON.parse(readFileSync(resolve(dir, p), 'utf8'));
const skip = new Set((process.argv[process.argv.indexOf('--skip') + 1] ?? '').split(',').filter((g) => /^G\d$/.test(g)));
/** 동네 반경(m): 이 안이면 카드 문장에 동네 이름 */
export const HOOD_M = 700;
const hoods = read('hoods-01.json');
const cand = new Map(read('judge-input-01.json').places.map((p) => [p.id, p]));
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return 6371 * Math.hypot(x, y);
};
const out = [];
const seen = new Set();
/** 판정 08의 keep(G4 빼고, criteria-09.md 0절) + --g4면 판정 09의 keep(감사 09 통과 뒤) */
const sources = [['judge-08', 21, (j) => j.g !== 'G4'], ...(process.argv.includes('--g4') ? [['judge-09', 7, () => true]] : [])];
for (const [folder, n, take] of sources) {
  for (let i = 1; i <= n; i++) {
    for (const j of read(`${folder}/out-${String(i).padStart(2, '0')}.json`)) {
      if (!j.keep || !take(j) || skip.has(j.g) || j.g === 'G3' || seen.has(j.id)) continue;
      seen.add(j.id);
      const p = cand.get(j.id);
      const hood = hoods.map((h) => ({ h, d: km(h, p) })).sort((a, b) => a.d - b.d)[0];
      const near = hood.d * 1000 <= HOOD_M;
      const where = near ? hood.h.name : (String(p.address).split(' ')[1] ?? '');
      const kind = String(p.category).split('>').pop().replace(/,/g, '·');
      const line = p.word === 'KOPIS 대중음악' ? `라이브 공연장 · 최근 반년 공연 ${p.shows}회` : `${kind} · ${where}`;
      out.push({ id: p.id, name: p.name, g: j.g, word: p.word, lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5, line, walkin: j.walkin, url: String(p.url).replace(/^http:/, 'https:'), ...(near ? { hood: hood.h.name } : {}) });
    }
  }
}
out.sort((a, b) => (a.id < b.id ? -1 : 1));
const file = { note: 'ADR-0115 서울 즐길 거리(둘러보기 전용). review/seoul-fun/ship.mjs가 짓는다.', hoods: hoods.map(({ name, lat, lng }) => ({ name, lat, lng })), places: out };
writeFileSync(resolve(webRoot, 'data/seoul/fun-seoul.json'), JSON.stringify(file) + '\n');
const byG = {};
for (const p of out) byG[p.g] = (byG[p.g] ?? 0) + 1;
console.log(JSON.stringify({ shipped: out.length, skipped: [...skip], byG }));
