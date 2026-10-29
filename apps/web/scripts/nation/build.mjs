/**
 * 자동 지역 출하 파일 N3 (plans/nationwide.md N3, plans/nationwide-app.md 0절).
 *
 *   node scripts/nation/build.mjs     review/nation/scope-*.json + rules-01.json → data/nation/
 *
 * 입력은 파일뿐이고 같은 입력이면 같은 바이트를 쓴다. public/이 아니라 data/nation/에 쓴다
 * (앱 단위가 스위치가 켜진 빌드에서만 dist로 옮긴다).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const IN_DIR = resolve(webRoot, 'review/nation');
export const OUT_DIR = resolve(webRoot, 'data/nation');

/** 앱이 보여 주는 순서. 26 부산·50 제주는 검수한 곳이라 파일이 없다(앱이 목록에만 올린다). */
export const SIDO_LIST = [
  ['11', '서울특별시', '서울'],
  ['26', '부산광역시', '부산'],
  ['27', '대구광역시', '대구'],
  ['28', '인천광역시', '인천'],
  ['30', '대전광역시', '대전'],
  ['31', '울산광역시', '울산'],
  ['36110', '세종특별자치시', '세종'],
  ['41', '경기도', '경기'],
  ['43', '충청북도', '충북'],
  ['44', '충청남도', '충남'],
  ['47', '경상북도', '경북'],
  ['48', '경상남도', '경남'],
  ['50', '제주특별자치도', '제주'],
  ['51', '강원특별자치도', '강원'],
  ['52', '전북특별자치도', '전북'],
  ['12', '전남광주통합특별시', '전남광주'],
];
export const GZIP_LIMIT = 300 * 1024;

export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const validPoint = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.lat >= 32 && r.lat <= 39.5 && r.lng >= 123 && r.lng <= 132.5;
const idNum = (id) => Number(String(id).replace(/^nt-/, ''));

export function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const round = (x) => Math.round(x * 1e5) / 1e5;

/** addr1의 시군구 이름: 둘째 토큰, 「○○시 ○○구」면 구까지. 세종은 시군구가 없어 시 이름을 쓴다. */
export function sggNameOf(addr1, sidoCode) {
  if (sidoCode === '36110') return '세종시';
  const t = cleanName(addr1).split(' ');
  if (!t[1]) return '';
  return t[1].endsWith('시') && t[2] && t[2].endsWith('구') ? `${t[1]} ${t[2]}` : t[1];
}

/** 레코드 하나 → 출하 한 줄. 지울 곳이면 null. */
export function shipRecord(r, rule) {
  if (!rule || !rule.keep || !validPoint(r)) return null;
  const mood = rule.mood;
  if (mood !== 'walk' && mood !== 'new' && mood !== 'food') return null;
  let sub;
  if (mood === 'food') {
    if (rule.sub !== 'meal' && rule.sub !== 'cafe') return null;
    sub = rule.sub;
  } else if (mood === 'new') sub = 'sight';
  // 시군구 코드가 없는 곳(다른 시도 주소가 섞인 레코드)은 뺀다. 세종은 시도 코드 하나가 곧 시군구다.
  if (!r.lDongSignguCd) return null;
  const sgg = r.lDongRegnCd === r.lDongSignguCd ? String(r.lDongSignguCd) : `${r.lDongRegnCd}${r.lDongSignguCd}`;
  const out = {
    id: r.id,
    name: cleanName(r.title),
    lat: r.lat,
    lng: r.lng,
    sgg,
    cat: [r.lclsSystm1, r.lclsSystm2, r.lclsSystm3],
    image: r.image,
    moods: [mood],
  };
  if (sub) out.sub = sub;
  if (rule.indoor === true) out.indoor = true;
  return out;
}

/** scopes: { [sidoCode]: record[] }, results: rules-01 results[] → { files, sgg, sido, rules, ambiguous, dropped } */
export function build({ scopes, results, rules = { moods: ['walk', 'new', 'food'], indoor: true } }) {
  const ruleById = new Map(results.map((x) => [x.id, x]));
  const files = {};
  const bySgg = new Map();
  let dropped = 0;
  for (const code of Object.keys(scopes)) {
    const rows = [];
    for (const r of scopes[code]) {
      const s = shipRecord(r, ruleById.get(r.id));
      if (!s) {
        dropped++;
        continue;
      }
      rows.push(s);
      let g = bySgg.get(s.sgg);
      if (!g) bySgg.set(s.sgg, (g = { sido: code, lats: [], lngs: [], names: new Map() }));
      g.lats.push(s.lat);
      g.lngs.push(s.lng);
      const n = sggNameOf(r.addr1, code);
      g.names.set(n, (g.names.get(n) ?? 0) + 1);
    }
    rows.sort((a, b) => idNum(a.id) - idNum(b.id));
    files[code] = rows;
  }
  const ambiguous = [];
  const sgg = [...bySgg.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([c, g]) => {
      const names = [...g.names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      if (names.length > 1) ambiguous.push({ c, names });
      return { c, n: names[0][0], s: g.sido, lat: round(median(g.lats)), lng: round(median(g.lngs)), f: g.sido };
    });
  const sido = SIDO_LIST.map(([c, n, s]) => ({ c, n, s }));
  return { files, sgg, sido, rules, ambiguous, dropped };
}

export const serialize = (v) => JSON.stringify(v);
export const hash10 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

/** build() 결과 → { texts: {파일명: 본문}, index }  (index.files는 시도 파일 해시) */
export function render(b) {
  const texts = {};
  const hashes = {};
  for (const code of Object.keys(b.files).sort()) {
    const t = serialize(b.files[code]);
    texts[`${code}.json`] = t;
    hashes[code] = hash10(t);
  }
  const index = { v: 1, rules: b.rules, sido: b.sido, sgg: b.sgg, files: hashes };
  texts['index.json'] = serialize(index);
  return { texts, index };
}

export function loadInputs(dir = IN_DIR) {
  const scopes = {};
  for (const f of readdirSync(dir).sort()) {
    const m = /^scope-(\d+)\.json$/.exec(f);
    if (m) scopes[m[1]] = JSON.parse(readFileSync(resolve(dir, f), 'utf8')).items;
  }
  const results = JSON.parse(readFileSync(resolve(dir, 'rules-01.json'), 'utf8')).results;
  return { scopes, results };
}

const kb = (n) => (n / 1024).toFixed(1);

function main() {
  const b = build(loadInputs());
  const { texts } = render(b);
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  let tRaw = 0;
  let tGz = 0;
  let tN = 0;
  for (const [name, text] of Object.entries(texts)) {
    writeFileSync(resolve(OUT_DIR, name), text);
    const raw = Buffer.byteLength(text);
    const gz = gzipSync(text, { level: 9 }).length;
    const n = b.files[name.replace('.json', '')]?.length;
    rows.push({ name, n, raw, gz });
    tRaw += raw;
    tGz += gz;
    if (n) tN += n;
  }
  const lines = [
    '# 자동 지역 출하 파일 크기 (scripts/nation/build.mjs)',
    '',
    '기준: 파일 하나 gzip 300KB 이하(plans/nationwide-app.md 2절). 넘으면 index `f`만 바꿔 시군구 단위로 쪼갠다.',
    '',
    '| 파일 | 곳 | raw KB | gzip KB | 300KB 초과 |',
    '|---|---:|---:|---:|---|',
    ...rows.map((r) => `| ${r.name} | ${r.n ?? ''} | ${kb(r.raw)} | ${kb(r.gz)} | ${r.gz > GZIP_LIMIT ? '예' : ''} |`),
    `| 합계 | ${tN} | ${kb(tRaw)} | ${kb(tGz)} | |`,
    '',
    `시군구 ${b.sgg.length}곳, 빠진 레코드(keep 아님·좌표 이상) ${b.dropped}건.`,
    '',
  ];
  writeFileSync(resolve(OUT_DIR, 'SIZES.md'), lines.join('\n'));
  for (const r of rows) console.log(`${r.name}\t${r.n ?? '-'}\t${kb(r.raw)}KB\tgzip ${kb(r.gz)}KB${r.gz > GZIP_LIMIT ? '  > 300KB' : ''}`);
  console.log(`total\t${tN}\t${kb(tRaw)}KB\tgzip ${kb(tGz)}KB\tsgg ${b.sgg.length}\tdropped ${b.dropped}`);
  for (const a of b.ambiguous) console.log('ambiguous', a.c, JSON.stringify(a.names));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
