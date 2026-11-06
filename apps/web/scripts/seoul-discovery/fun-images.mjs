/**
 * 즐길 거리 그림 일괄 1회 (ADR-0123 6, criteria-01 10절). data/seoul/fun-seoul.json의 곳마다 네이버 지역 검색(이름, 좌표 300m 안)의
 * 홈페이지 링크가 공식 사이트일 때만(블로그·SNS·지도·예약 플랫폼 아님) 그 og:image를 검사해 붙인다. 카카오 place 페이지·블로그 그림은
 * 쓰지 않는다. 한 번만 돈다(결과 review/seoul-discovery/fun-images-01.json이 있으면 멈춤, 끊기면 .part에서 이어 감).
 *   node scripts/seoul-discovery/fun-images.mjs
 *   node scripts/seoul-discovery/fun-images.mjs --refilter   호출 없이, 받아 둔 결과에 지금의 lib.mjs 거르기(BLOCKED·BAD_IMAGE)와
 *                                                           OWNER_DROP을 다시 적용해 fun-seoul.json을 다시 쓴다
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homepageOf, pictureOf } from './discover.mjs';
import { BAD_IMAGE, okPage } from './lib.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(webRoot, 'review/seoul-discovery/fun-images-01.json');
const part = `${out}.part`;
const FUN = resolve(webRoot, 'data/seoul/fun-seoul.json');
const FUNFILE = JSON.parse(readFileSync(FUN, 'utf8'));
/** 첫 실행 결과를 눈으로 본 뒤 손으로 뺀 것 (다른 업체의 사이트로 이어진 링크): id → 까닭 */
export const OWNER_DROP = { 'kk-992535148': 'LG아트센터 서울 — 네이버 지역 링크가 다른 업체(오복수산) 사이트' };
function apply(file, done) {
  const byG = {};
  for (const p of file.places) {
    const r = done[p.id];
    delete p.img;
    delete p.imgFrom;
    delete p.imgPage;
    if (r?.img) Object.assign(p, { img: r.img, imgFrom: r.imgFrom, imgPage: r.imgPage });
    byG[p.g] ??= { n: 0, img: 0 };
    byG[p.g].n++;
    if (r?.img) byG[p.g].img++;
  }
  writeFileSync(FUN, JSON.stringify(file) + '\n');
  return byG;
}
if (process.argv.includes('--refilter')) {
  const res = JSON.parse(readFileSync(out, 'utf8'));
  let n = 0;
  for (const [id, r] of Object.entries(res.places)) {
    if (!r.img) continue;
    const why = OWNER_DROP[id] ? `owner: ${OWNER_DROP[id]}` : !okPage(r.imgPage) || !okPage(r.home) ? 'blocked page (refilter)' : BAD_IMAGE.test(r.img) ? 'logo-like address (refilter)' : '';
    if (why) {
      r.why = why;
      r.refiltered = r.img;
      delete r.img;
      n++;
    }
  }
  res.byG = apply(FUNFILE, res.places);
  res.refiltered = n;
  writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
  console.log(JSON.stringify({ refiltered: n, byG: res.byG }));
  process.exit(0);
}
if (existsSync(out)) throw new Error(`${out} exists (one run only)`);
const file = FUNFILE;
const done = existsSync(part) ? JSON.parse(readFileSync(part, 'utf8')) : {};
let n = 0;
for (const p of file.places) {
  if (done[p.id]) continue;
  const home = await homepageOf(p.name, p).catch((e) => `!${e.message}`);
  const r = { name: p.name, g: p.g, home: home.startsWith('!') ? '' : home, ...(home.startsWith('!') ? { why: home.slice(1) } : {}) };
  if (r.home) Object.assign(r, await pictureOf(r.home));
  else r.why ??= 'no official homepage in Naver local';
  done[p.id] = r;
  if (++n % 20 === 0) writeFileSync(part, JSON.stringify(done));
}
writeFileSync(part, JSON.stringify(done));
// 서로 다른 둘 이상이 같은 그림이면(사이트 공통 그림·체인 대표 그림) 쓰지 않는다
const count = new Map();
for (const r of Object.values(done)) if (r.img) count.set(r.img, (count.get(r.img) ?? 0) + 1);
for (const r of Object.values(done))
  if (r.img && count.get(r.img) > 1) {
    r.why = 'shared picture';
    delete r.img;
  }
const byG = {};
for (const p of file.places) {
  const r = done[p.id];
  delete p.img;
  delete p.imgFrom;
  delete p.imgPage;
  if (r.img) Object.assign(p, { img: r.img, imgFrom: r.imgFrom, imgPage: r.imgPage });
  byG[p.g] ??= { n: 0, img: 0 };
  byG[p.g].n++;
  if (r.img) byG[p.g].img++;
}
writeFileSync(FUN, JSON.stringify(file) + '\n');
const why = {};
for (const r of Object.values(done)) if (!r.img) why[r.why] = (why[r.why] ?? 0) + 1;
writeFileSync(part, JSON.stringify({ day: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), byG, why, places: done }, null, 1) + '\n');
renameSync(part, out);
console.log(JSON.stringify({ byG, why }));
