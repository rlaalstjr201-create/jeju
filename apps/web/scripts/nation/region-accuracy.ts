/**
 * 위치 판정 정확도 (ADR-0104): 곳마다 그 좌표를 앱과 같은 규칙(src/region/nation.ts nearestSgg·regionOf)으로 판정해 자기 시군구로 나오는 몫.
 *
 *   npx tsx scripts/nation/region-accuracy.ts [index.json …]     기본은 data/nation/index.json
 *
 * 자동 지역 곳(data/nation/*.json)은 레코드의 sgg, 강원 검수한 곳(data/gangwon/spots-gangwon.json)은 area의 시군구와 견준다.
 * 부산·제주 곳(public/spots-busan.json·spots.json)은 경계로 판정하므로 그 여행지로 나오는 몫만 센다. 네트워크·API를 쓰지 않는다.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { destOf } from '../../src/region/busan';
import { DEST } from '../../src/region/dest';
import { nearestSgg, parseIndex, regionOf } from '../../src/region/nation';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => JSON.parse(readFileSync(resolve(web, p), 'utf8'));
type P = { id: string; name: string; lat: number; lng: number; sgg?: string; area?: string; famous?: boolean };
const AREA: Record<string, string> = { 강릉: '51150', 속초: '51210', 춘천: '51110', 양양: '51830', 평창: '51760' };
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}% (${a}/${b})`;

for (const path of process.argv.slice(2).length ? process.argv.slice(2) : ['data/nation/index.json']) {
  const text = readFileSync(resolve(web, path), 'utf8');
  const ix = parseIndex(JSON.parse(text))!;
  const nation: P[] = Object.keys(ix.files).flatMap((f) => read(`data/nation/${f}.json`));
  const gangwon: P[] = read('data/gangwon/spots-gangwon.json');
  const at = (p: P) => nearestSgg(p, ix.sgg)?.c ?? null;
  const cur = { gangwon: DEST.gangwon.sgg! };
  console.log(`# ${path}: raw ${Buffer.byteLength(text)} B, gzip ${gzipSync(text, { level: 9 }).length} B`);
  console.log(`자동 지역 곳 전체: ${pct(nation.filter((p) => at(p) === p.sgg).length, nation.length)}`);
  const gw = gangwon.filter((p) => at(p) === AREA[p.area!]);
  console.log(`강원 검수한 곳: ${pct(gw.length, gangwon.length)}, 강원으로 나옴 ${pct(gangwon.filter((p) => regionOf(p, ix.sgg, destOf, cur)?.k === 'dest').length, gangwon.length)}`);
  for (const [a, c] of Object.entries(AREA)) {
    const list = gangwon.filter((p) => p.area === a);
    const miss: Record<string, number> = {};
    for (const p of list) if (at(p) !== c) miss[ix.sgg.find((s) => s.c === at(p))?.n ?? 'none'] = (miss[ix.sgg.find((s) => s.c === at(p))?.n ?? 'none'] ?? 0) + 1;
    const fam = list.filter((p) => p.famous);
    console.log(`  ${a}: ${pct(list.length - Object.values(miss).reduce((x, y) => x + y, 0), list.length)}, 유명한 곳 ${pct(fam.filter((p) => at(p) === c).length, fam.length)}, 다른 곳 ${JSON.stringify(miss)}`);
  }
  for (const [f, d] of [['public/spots-busan.json', 'busan'], ['public/spots.json', 'jeju']] as const) {
    const list: P[] = read(f);
    console.log(`${d} 곳이 ${d}로: ${pct(list.filter((p) => { const r = regionOf(p, ix.sgg, destOf, cur); return r?.k === 'dest' && r.dest === d; }).length, list.length)}`);
  }
  // 시도마다, 아래 다섯 시군구
  const bySido = new Map<string, [number, number]>();
  const bySgg = new Map<string, [number, number]>();
  for (const p of nation) {
    const ok = at(p) === p.sgg ? 1 : 0;
    const s = ix.sgg.find((x) => x.c === p.sgg)!.s;
    const a = bySido.get(s) ?? [0, 0];
    bySido.set(s, [a[0] + ok, a[1] + 1]);
    const b = bySgg.get(p.sgg!) ?? [0, 0];
    bySgg.set(p.sgg!, [b[0] + ok, b[1] + 1]);
  }
  console.log(`시도: ${[...bySido].map(([s, [a, b]]) => `${ix.sido.find((x) => x.c === s)?.s} ${((100 * a) / b).toFixed(0)}`).join(', ')}`);
  const worst = [...bySgg].sort((x, y) => x[1][0] / x[1][1] - y[1][0] / y[1][1]).slice(0, 5);
  console.log(`낮은 시군구: ${worst.map(([c, [a, b]]) => `${ix.sgg.find((x) => x.c === c)?.n} ${((100 * a) / b).toFixed(0)}% (${b})`).join(', ')}`);
}
