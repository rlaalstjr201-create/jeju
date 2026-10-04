// 일본 실현성 측정(criteria.md): 가나자와시 Wikidata 장소의 사진율과 Commons 라이선스. 한 번만 돌린다.
// node docs/research/japan-feasibility/measure.mjs  →  result.json, 표준 출력에 요약
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const UA = 'yeochana-research/0.1 (https://yeochana.pages.dev)';
const CITY = 'Q191130';
const NON_FOOD = ['Q570116', 'Q33506', 'Q22698', 'Q1107656', 'Q5393308', 'Q845945', 'Q23413', 'Q177380', 'Q6017969'];
const FOOD = ['Q11707', 'Q30022', 'Q37654'];

const query = `SELECT ?item ?cls ?img ?ko ?jw WHERE {
  ?item wdt:P131+ wd:${CITY}; wdt:P625 ?coord.
  FILTER NOT EXISTS { ?item wdt:P576 ?gone }
  VALUES ?cls { ${[...NON_FOOD, ...FOOD].map((q) => 'wd:' + q).join(' ')} }
  ?item wdt:P31/wdt:P279* ?cls.
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item rdfs:label ?ko FILTER(LANG(?ko) = "ko") }
  OPTIONAL { ?jw schema:about ?item; schema:isPartOf <https://ja.wikipedia.org/> }
}`;

function fail(step, e) {
  const out = { measuredAt: new Date().toISOString(), status: '확인 실패', step, error: String(e?.message ?? e) };
  writeFileSync(path.join(DIR, 'result.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out));
  process.exit(0);
}

let rows;
try {
  const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(query), {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  rows = (await r.json()).results.bindings;
} catch (e) {
  fail('sparql', e);
}

const qid = (u) => u.slice(u.lastIndexOf('/') + 1);
const items = new Map();
for (const b of rows) {
  const id = qid(b.item.value);
  const it = items.get(id) ?? { id, classes: new Set(), images: new Set(), ko: false, jawiki: false };
  it.classes.add(qid(b.cls.value));
  if (b.img) it.images.add(decodeURIComponent(b.img.value.slice(b.img.value.lastIndexOf('/') + 1)).replace(/_/g, ' '));
  if (b.ko) it.ko = true;
  if (b.jw) it.jawiki = true;
  items.set(id, it);
}

// 쓸 수 있음: 퍼블릭 도메인, CC0, CC BY, CC BY-SA (NC·ND 제외)
const usable = (lic) =>
  !!lic && (/^cc0\b/i.test(lic) || /public domain|^pd\b|^pd-/i.test(lic) || /^cc[ -]by(-sa)?[ -]\d/i.test(lic)) && !/nc|nd/i.test(lic.replace(/^cc[ -]/i, ''));

const files = [...new Set([...items.values()].map((it) => [...it.images].sort()[0]).filter(Boolean))];
const license = new Map();
let readFails = 0;
for (let i = 0; i < files.length; i += 50) {
  const batch = files.slice(i, i + 50);
  try {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    u.search = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'extmetadata',
      iiextmetadatafilter: 'LicenseShortName', titles: batch.map((f) => 'File:' + f).join('|'),
    });
    const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const norm = new Map((j.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of j.query.pages ?? []) {
      const from = (norm.get(p.title) ?? p.title).replace(/^File:/, '');
      const lic = p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? null;
      license.set(from, lic);
    }
  } catch {
    readFails += batch.length;
  }
}

const list = [...items.values()].map((it) => {
  const file = [...it.images].sort()[0] ?? null;
  const lic = file ? (license.has(file) ? license.get(file) : undefined) : null;
  return {
    id: it.id,
    group: [...it.classes].some((c) => NON_FOOD.includes(c)) ? 'nonfood' : 'food',
    photo: !!file,
    license: lic === undefined ? '읽기 실패' : lic,
    usable: !!file && usable(lic),
    ko: it.ko,
    jawiki: it.jawiki,
  };
});

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
function sum(group) {
  const g = list.filter((x) => x.group === group);
  const photo = g.filter((x) => x.photo).length;
  const usableN = g.filter((x) => x.usable).length;
  return {
    n: g.length, photo, photoPct: pct(photo, g.length), usable: usableN, usablePct: pct(usableN, g.length),
    licenseReadFail: g.filter((x) => x.license === '읽기 실패').length,
    ko: pct(g.filter((x) => x.ko).length, g.length), jawiki: pct(g.filter((x) => x.jawiki).length, g.length),
  };
}
const nonfood = sum('nonfood');
const food = sum('food');
const verdict =
  nonfood.usable >= 300 && nonfood.usablePct >= 50 ? '성립' : nonfood.usable < 150 || nonfood.usablePct < 30 ? '불성립' : '보강 필요';
const licenses = {};
for (const x of list) if (x.photo) licenses[x.license ?? '없음'] = (licenses[x.license ?? '없음'] ?? 0) + 1;

const out = { measuredAt: new Date().toISOString(), city: CITY, criteria: 'criteria.md', status: 'ok', sparqlRows: rows.length, readFails, nonfood, food, verdict, licenses, places: list };
writeFileSync(path.join(DIR, 'result.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ nonfood, food, verdict, readFails, licenses }, null, 1));
