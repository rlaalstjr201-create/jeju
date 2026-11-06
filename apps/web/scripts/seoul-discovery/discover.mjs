/**
 * 서울 매일 발굴 (ADR-0123, review/seoul-discovery/criteria-02.md — 기준 01에서 장소 확인·끝나는 날·로고 그림을 고친 것, specs/seoul-discovery.md). 단계마다 한 명령, 그날 한 번씩.
 *   node scripts/seoul-discovery/discover.mjs seed                 장부 처음 채우기(이미 있으면 멈춤): 즐길 거리·이번 주 서울 01회
 *   node scripts/seoul-discovery/discover.mjs collect [--day D]    1절 네이버 → days/D/raw.json, extract/in-NN.txt
 *   (하위 에이전트) extract/in-NN.txt → extract/out-NN.json       2절
 *   node scripts/seoul-discovery/discover.mjs queue [--day D]      3절 → days/D/pick.json, queue.json
 *   node scripts/seoul-discovery/discover.mjs enrich [--day D]     4절 네이버·카카오 → days/D/judge/in-NN.json
 *   (새 Opus) judge/in-NN.json → judge/out-NN.json                 5·6절
 *   node scripts/seoul-discovery/discover.mjs ship [--day D] [--hold]   7절 → data/seoul/discovery-seoul.json (--hold: days/D/hold.json)
 *   node scripts/seoul-discovery/discover.mjs images [--day D]     10절 그날 실린 것(또는 hold)의 og:image
 *   node scripts/seoul-discovery/discover.mjs sweep [--day D]      9절 끝남·신상 8주·폐업
 *   node scripts/seoul-discovery/discover.mjs audit-sample [--day D]   8절 → audit/in-D.json (+ audit/key-D.json)
 *   (새 Opus) audit/in-D.json → audit/out-D.json
 *   node scripts/seoul-discovery/discover.mjs audit-result [--day D]   8절 게이트, 미달이면 되돌림 → audit/result-D.md
 *   node scripts/seoul-discovery/discover.mjs release [--day D]    첫 회차: 감사 통과한 hold를 자료로
 * 키는 저장소 루트 .env(NAVER_CLIENT_ID·NAVER_CLIENT_SECRET·KAKAO_REST_API_KEY)이고 출력·파일 어디에도 남기지 않는다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../famous-measure.mjs';
import * as L from './lib.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-discovery');
const DATA = resolve(webRoot, 'data/seoul/discovery-seoul.json');
const FUN = resolve(webRoot, 'data/seoul/fun-seoul.json');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const DAY = arg('--day') ?? L.kstDay();
const dayDir = resolve(dir, 'days', DAY);
const readJ = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const writeJ = (p, v, pretty = true) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, (pretty ? JSON.stringify(v, null, 1) : JSON.stringify(v)) + '\n');
};
const LEDGER = resolve(dir, 'ledger.json');
const ledger = () => readJ(LEDGER, null) ?? (() => { throw new Error('ledger.json missing: run seed first'); })();
const saveLedger = (l) => writeJ(LEDGER, l);
const data = () => readJ(DATA, { note: 'ADR-0123 서울 매일 발굴. scripts/seoul-discovery/discover.mjs가 짓는다.', items: [] });
const saveData = (d) => writeJ(DATA, d);
const once = (p) => {
  if (existsSync(p)) throw new Error(`${p} exists (one run a day)`);
};
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

// ── 호출 ──
const keys = () => {
  const k = { id: env('NAVER_CLIENT_ID'), secret: env('NAVER_CLIENT_SECRET'), kakao: env('KAKAO_REST_API_KEY') };
  if (!k.id || !k.secret || !k.kakao) throw new Error('NAVER_CLIENT_* or KAKAO_REST_API_KEY missing in the repo-root .env');
  return k;
};
export async function naver(kind, q, display, k = keys()) {
  for (let t = 0; t < 3; t++) {
    const res = await fetch(`https://openapi.naver.com/v1/search/${kind}.json?${new URLSearchParams({ query: q, display: String(display), sort: kind === 'local' ? 'random' : 'date' })}`, { headers: { 'X-Naver-Client-Id': k.id, 'X-Naver-Client-Secret': k.secret } }).catch(() => null);
    if (res?.status === 200) {
      const b = await res.json();
      await sleep(110);
      return b;
    }
    await res?.body?.cancel();
    await sleep(1500);
  }
  throw new Error(`naver ${kind} failed`);
}
const KAKAO_LOG = resolve(dir, 'kakao-calls.log');
const kakaoUsed = () =>
  readdirSync(resolve(webRoot, 'review'))
    .map((d) => resolve(webRoot, 'review', d, 'kakao-calls.log'))
    .filter(existsSync)
    .reduce((n, f) => n + readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.startsWith(`${L.kstDay()}\t`)).length, 0);
export async function kakao(q, size = 15, k = keys()) {
  if (kakaoUsed() >= 3000) throw new Error('kakao daily limit (3,000, ADR-0115 Amendment 1)');
  for (let t = 0; t < 3; t++) {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query: q, size: String(size) })}`, { headers: { Authorization: `KakaoAK ${k.kakao}` } }).catch(() => null);
    appendFileSync(KAKAO_LOG, `${L.kstDay()}\t${new Date().toISOString()}\tdiscovery:${q}\t${res?.status ?? 'net'}\n`);
    if (res?.status === 200) {
      const docs = (await res.json()).documents.map((d) => ({ id: d.id, name: d.place_name, address: d.road_address_name || d.address_name, jibun: d.address_name, category: d.category_name, lat: Number(d.y), lng: Number(d.x), url: String(d.place_url).replace(/^http:/, 'https:') }));
      await sleep(100);
      return docs;
    }
    await res?.body?.cancel();
    await sleep(1000);
  }
  throw new Error('kakao failed');
}
const posts = (b) => b.items.map((i) => ({ title: L.strip(i.title), desc: L.strip(i.description).slice(0, 200), day: L.dayOf(i), link: i.originallink || i.link }));

// ── seed ──
function seed() {
  once(LEDGER);
  const names = {};
  const kk = {};
  const fun = JSON.parse(readFileSync(FUN, 'utf8')).places;
  for (const p of fun) {
    names[L.norm(p.name)] = { status: 'known', day: DAY, from: 'fun-seoul' };
    const id = /kk-(\d+)/.exec(p.id)?.[1];
    if (id) kk[id] = { status: 'known', day: DAY, name: p.name };
  }
  const wk = readJ(resolve(webRoot, 'review/seoul-weekly/candidates-01.json'), []);
  for (const c of wk) names[L.norm(c.name)] ??= { status: 'seed', day: DAY, from: 'seoul-weekly 01' };
  for (const i of readJ(resolve(webRoot, 'data/seoul/weekly-seoul.json'), { items: [] }).items) names[L.norm(i.name)] ??= { status: 'seed', day: DAY, from: 'weekly-seoul' };
  saveLedger({ note: 'ADR-0123 장부. 이름(norm)·카카오 id·본 글(해시)을 다시 판정하지 않으려고 둔다.', names, kakao: kk, posts: {}, audits: [], lastAudit: null });
  console.log(JSON.stringify({ names: Object.keys(names).length, kakao: Object.keys(kk).length }));
}

// ── 1절 collect ──
async function collect() {
  const out = resolve(dayDir, 'raw.json');
  once(out);
  const Q = readJ(resolve(dir, 'queries-01.json'));
  const led = ledger();
  const first = !Object.keys(led.posts).length;
  const from = L.addDays(DAY, -(first ? Q.windowFirst : Q.window) + 1);
  const seenPost = new Set(Object.values(led.posts).flat());
  const k = keys();
  const byQ = [];
  let calls = 0;
  let received = 0;
  for (const q of Q.queries) {
    const list = [];
    for (const src of ['blog', 'news']) {
      const b = await naver(src, q, Q.display, k);
      calls++;
      received += b.items.length;
      for (const i of b.items) list.push({ q, src, title: L.strip(i.title), desc: L.strip(i.description).slice(0, 200), day: L.dayOf(i), link: i.originallink || i.link });
    }
    byQ.push(list.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)));
  }
  const links = new Set();
  const titles = new Set();
  const okOf = (i) => {
    if (!i.day || i.day < from || i.day > DAY) return false;
    const t = L.norm(i.title);
    if (links.has(i.link) || titles.has(t) || seenPost.has(L.hash(i.link))) return false;
    links.add(i.link);
    titles.add(t);
    return true;
  };
  const kept = [];
  const queues = byQ.map((l) => l.filter(okOf));
  const total = queues.reduce((n, l) => n + l.length, 0);
  while (kept.length < Math.min(L.MAX_POSTS, total)) for (const l of queues) if (l.length && kept.length < L.MAX_POSTS) kept.push(l.shift());
  const raw = kept.map((i, n) => ({ n: n + 1, ...i }));
  writeJ(out, { day: DAY, from, calls, received, passed: total, items: raw }, false);
  led.posts[DAY] = raw.map((i) => L.hash(i.link));
  for (const d of Object.keys(led.posts)) if (d < L.addDays(DAY, -6)) delete led.posts[d];
  saveLedger(led);
  mkdirSync(resolve(dayDir, 'extract'), { recursive: true });
  let files = 0;
  for (let i = 0; i < raw.length; i += L.PER_EXTRACT) {
    const nn = String(++files).padStart(2, '0');
    writeFileSync(resolve(dayDir, 'extract', `in-${nn}.txt`), raw.slice(i, i + L.PER_EXTRACT).map((p) => `#${p.n} | ${p.day} | ${p.src} | ${p.title} | ${p.desc}`).join('\n') + '\n');
  }
  console.log(JSON.stringify({ day: DAY, from, calls, received, passed: total, kept: raw.length, extractFiles: files }));
}

// ── 3절 queue ──
function queue() {
  const out = resolve(dayDir, 'pick.json');
  once(out);
  const raw = new Map(readJ(resolve(dayDir, 'raw.json')).items.map((i) => [i.n, i]));
  const merged = new Map();
  const files = readdirSync(resolve(dayDir, 'extract')).filter((f) => /^out-\d\d\.json$/.test(f)).sort();
  const ins = readdirSync(resolve(dayDir, 'extract')).filter((f) => /^in-\d\d\.txt$/.test(f));
  if (files.length !== ins.length) throw new Error(`extract outputs ${files.length} ≠ inputs ${ins.length}`);
  for (const f of files) {
    for (const c of JSON.parse(readFileSync(resolve(dayDir, 'extract', f), 'utf8'))) {
      const k = L.norm(c.name);
      if (!k) continue;
      const m = merged.get(k);
      const first = (c.from ?? []).map((n) => raw.get(n)).filter(Boolean).map(({ title, desc, day, link }) => ({ title, desc, day, link }));
      if (!m) merged.set(k, { name: c.name, kind: c.kind, word: c.word ?? '', placeText: c.placeText ?? '', start: c.start ?? '', end: c.end ?? '', time: c.time ?? '', reserveText: c.reserveText ?? '', first });
      else {
        for (const key of ['placeText', 'start', 'end', 'time', 'reserveText', 'word']) if (!m[key] && c[key]) m[key] = c[key];
        for (const p of first) if (!m.first.some((x) => x.link === p.link)) m.first.push(p);
      }
    }
  }
  const qPath = resolve(dir, 'queue.json');
  const q = readJ(qPath, { items: [] }).items;
  const { pick, rest, skipped } = L.pickDay([...merged.values()].map((c) => ({ ...c, first: c.first.slice(0, 8) })), q, ledger(), DAY);
  const ids = pick.map((c, i) => ({ cid: `${DAY.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`, ...c }));
  writeJ(out, { day: DAY, extracted: merged.size, skipped, picked: ids.length, queued: rest.length, items: ids });
  writeJ(qPath, { note: '3절 줄: 하루 상한에 못 든 후보(7일까지)', day: DAY, items: rest });
  const byLane = {};
  for (const c of ids) byLane[L.laneOf(c)] = (byLane[L.laneOf(c)] ?? 0) + 1;
  console.log(JSON.stringify({ extracted: merged.size, skipped, picked: ids.length, queued: rest.length, byLane }));
}

// ── 4절 enrich ──
async function enrich() {
  const out = resolve(dayDir, 'judge', 'in-01.json');
  once(out);
  const part = resolve(dayDir, 'enrich.part.json');
  const pick = readJ(resolve(dayDir, 'pick.json')).items;
  const led = ledger();
  const fun = JSON.parse(readFileSync(FUN, 'utf8')).places;
  const shipped = [...fun.map((p) => p.name), ...data().items.map((i) => i.name)];
  const brands = new Map(shipped.map((n) => [L.brandOf(n), n]));
  const funIds = new Set(fun.map((p) => /kk-(\d+)/.exec(p.id)?.[1]).filter(Boolean));
  const dataIds = new Set(data().items.map((i) => /place\.map\.kakao\.com\/(\d+)/.exec(i.kakao)?.[1]));
  const k = keys();
  const hoods = readJ(resolve(webRoot, 'review/seoul-fun/hoods-01.json'));
  const done = readJ(part, {});
  for (const c of pick) {
    if (done[c.cid]) continue;
    const blog = await naver('blog', c.name, 10, k);
    const news = await naver('news', c.name, 5, k);
    const seoul = (docs) => docs.filter((d) => /^서울/.test(d.address));
    // 기준 02 4절: 장소 글자·주소 먼저, 글의 동네와 맞는 결과만
    const area = L.areaOf(c.placeText, c.first, hoods);
    const empty = !area.gus.length && !area.dongs.length && !area.hoods.length;
    let byName = null;
    let place = null;
    if (c.placeText && !empty) place = L.placeOf(await kakao(c.placeText, 15, k), area, hoods);
    const isPlace = c.kind === '새로 연 곳';
    if ((!place && !empty) || isPlace) {
      byName = seoul(await kakao(c.name, 15, k));
      if (!place && !empty) place = L.placeOf(byName, area, hoods);
    }
    const brand = L.brandOf(place?.name ?? c.name);
    const chain = byName ? new Set(byName.filter((d) => L.brandOf(d.name) === brand).map((d) => d.id)).size : 0;
    done[c.cid] = { blog: { total: blog.total, posts: posts(blog) }, news: posts(news), kakao: place, chain, area };
    writeFileSync(part, JSON.stringify(done));
  }
  const rows = [];
  const known = [];
  for (const c of pick) {
    const e = done[c.cid];
    const id = e.kakao?.id;
    if (c.kind === '새로 연 곳' && id && (funIds.has(id) || dataIds.has(id) || led.kakao[id])) {
      known.push({ cid: c.cid, name: c.name, id });
      continue;
    }
    const brand = L.brandOf(e.kakao?.name ?? c.name);
    rows.push({
      cid: c.cid,
      copied: { name: c.name, kind: c.kind, word: c.word, placeText: c.placeText, start: c.start, end: c.end, time: c.time, reserveText: c.reserveText },
      first: c.first,
      posts: e.blog.posts,
      blogTotal: e.blog.total,
      news: e.news,
      kakao: e.kakao,
      ...(e.area ? { area: e.area } : {}),
      ...(e.chain >= 3 ? { chain: e.chain } : {}),
      ...(c.kind === '새로 연 곳' && brands.has(brand) ? { brandKnown: brands.get(brand) } : {}),
    });
  }
  for (const x of known) {
    led.names[L.norm(x.name)] = { status: 'known', day: DAY, cid: x.cid };
  }
  saveLedger(led);
  for (let i = 0, n = 1; i < rows.length; i += L.PER_JUDGE, n++) writeJ(resolve(dayDir, 'judge', `in-${String(n).padStart(2, '0')}.json`), { day: DAY, criteria: L.CRITERIA, rows: rows.slice(i, i + L.PER_JUDGE) });
  if (!rows.length) writeJ(out, { day: DAY, criteria: L.CRITERIA, rows: [] });
  unlinkSync(part); // the rows are in judge/in-NN.json now
  console.log(JSON.stringify({ picked: pick.length, known: known.length, judge: rows.length, kakaoFound: rows.filter((r) => r.kakao).length, kakaoUsedToday: kakaoUsed() }));
}

// ── 7절 ship ──
const inputs = (d = dayDir) =>
  new Map(
    readdirSync(resolve(d, 'judge'))
      .filter((f) => /^in-\d\d\.json$/.test(f))
      .flatMap((f) => readJ(resolve(d, 'judge', f)).rows)
      .map((r) => [r.cid, r]),
  );
const verdicts = (d = dayDir) => {
  const ins = readdirSync(resolve(d, 'judge')).filter((f) => /^in-\d\d\.json$/.test(f));
  const outs = readdirSync(resolve(d, 'judge')).filter((f) => /^out-\d\d\.json$/.test(f));
  if (ins.length !== outs.length) throw new Error(`judge outputs ${outs.length} ≠ inputs ${ins.length}`);
  const v = outs.sort().flatMap((f) => readJ(resolve(d, 'judge', f)));
  const rows = inputs(d);
  const ids = new Set(v.map((x) => x.cid));
  if (v.length !== rows.size || [...rows.keys()].some((id) => !ids.has(id)) || v.some((x) => typeof x.keep !== 'boolean')) throw new Error('judge outputs do not match the inputs');
  return { v, rows };
};
function ship() {
  const hold = process.argv.includes('--hold');
  const marker = resolve(dayDir, 'shipped.json');
  once(marker);
  const { v, rows } = verdicts();
  const led = ledger();
  const file = data();
  const fun = JSON.parse(readFileSync(FUN, 'utf8')).places;
  const hoods = readJ(resolve(webRoot, 'review/seoul-fun/hoods-01.json'));
  const bad = {};
  const keeps = [];
  for (const j of v.filter((x) => x.keep)) {
    const why = L.badKeep(j, rows.get(j.cid), DAY);
    if (why) bad[j.cid] = why;
    else keeps.push(j);
  }
  const brandDrop = L.sameBrandOnce(
    keeps.map((j) => ({ cid: j.cid, name: rows.get(j.cid).copied.name, kind: j.kind, total: rows.get(j.cid).blogTotal })),
    [...fun.map((p) => ({ name: p.name })), ...file.items.map((i) => ({ name: i.name }))],
  );
  const items = [];
  const taken = new Set(file.items.map((i) => i.id));
  for (const j of keeps) {
    if (brandDrop[j.cid]) continue;
    const r = rows.get(j.cid);
    const k = r.kakao;
    const id = `dc-${k.id}-${j.start.replace(/-/g, '')}`;
    if (taken.has(id)) { brandDrop[j.cid] = 'same place and start already shipped'; continue; }
    taken.add(id);
    const p = { lat: Math.round(k.lat * 1e5) / 1e5, lng: Math.round(k.lng * 1e5) / 1e5 };
    const at = L.whereOf(p, hoods, k.address);
    items.push({
      id,
      name: r.copied.name,
      kind: j.kind,
      word: j.kind === '새로 연 곳' ? j.word : '',
      start: j.start,
      end: j.end,
      time: j.time ?? '',
      place: k.name,
      ...p,
      kakao: k.url,
      src: j.src,
      reserve: j.reserve,
      ...(j.kind === '새로 연 곳' ? { line: `${j.word} · ${at.where}` } : {}),
      ...(at.hood ? { hood: at.hood } : {}),
      gu: String(k.address).split(' ')[1] ?? '',
      added: DAY,
    });
  }
  const status = (cid) => (bad[cid] ? 'bad' : brandDrop[cid] ? 'dropped' : v.find((x) => x.cid === cid).keep ? (hold ? 'held' : 'shipped') : 'dropped');
  for (const j of v) {
    const r = rows.get(j.cid);
    led.names[L.norm(r.copied.name)] = { status: status(j.cid), day: DAY, cid: j.cid, ...(bad[j.cid] ? { why: bad[j.cid] } : brandDrop[j.cid] ? { why: brandDrop[j.cid] } : {}) };
    if (r.kakao && (j.kind === '새로 연 곳' || r.copied.kind === '새로 연 곳')) led.kakao[r.kakao.id] = { status: status(j.cid), day: DAY, name: r.copied.name };
  }
  saveLedger(led);
  if (hold) writeJ(resolve(dayDir, 'hold.json'), { day: DAY, items });
  else {
    file.items = [...file.items, ...items].sort((a, b) => (a.id < b.id ? -1 : 1));
    saveData(file);
  }
  const byKind = {};
  for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  writeJ(marker, { day: DAY, hold, judged: v.length, keep: v.filter((x) => x.keep).length, shipped: items.length, bad, sameBrand: brandDrop, byKind });
  console.log(JSON.stringify({ judged: v.length, keep: v.filter((x) => x.keep).length, shipped: items.length, hold, bad: Object.keys(bad).length, sameBrand: Object.keys(brandDrop).length, byKind }));
}

// ── 10절 images ──
const UA = 'Mozilla/5.0 (compatible; yeochana-discovery/1.0; +https://yeochana.com)';
async function get(url, max, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: ctl.signal });
    if (res.status !== 200) {
      await res.body?.cancel();
      return { status: res.status };
    }
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > max) {
      await res.body?.cancel();
      return { status: 200, tooBig: true, type: res.headers.get('content-type') ?? '', url: res.url };
    }
    const chunks = [];
    let n = 0;
    for await (const c of res.body) {
      chunks.push(c);
      n += c.length;
      if (n > max) {
        ctl.abort();
        return { status: 200, tooBig: true, type: res.headers.get('content-type') ?? '', url: res.url };
      }
    }
    return { status: 200, body: Buffer.concat(chunks), type: res.headers.get('content-type') ?? '', url: res.url };
  } catch (e) {
    return { status: 'net', error: String(e?.name ?? e) };
  } finally {
    clearTimeout(t);
  }
}
/** 페이지 하나에서 그림 하나: { img, imgFrom, imgPage } 또는 { why } */
export async function pictureOf(page) {
  if (!L.okPage(page)) return { why: 'blocked page' };
  const html = await get(page, 1.5 * 1024 * 1024);
  if (!html.body) return { why: `page ${html.status}${html.tooBig ? ' too big' : ''}` };
  if (!L.okPage(html.url ?? page)) return { why: 'redirected to a blocked page' };
  const text = html.body.toString('utf8');
  const og = L.ogOf(text, html.url ?? page);
  if (!og.image) return { why: 'no og:image' };
  const img = await get(og.image, L.MAX_IMAGE);
  if (img.status !== 200) return { why: `image ${img.status}` };
  if (!/^image\/(jpeg|png|webp|gif)/i.test(img.type)) return { why: `image type ${img.type}` };
  const why = L.badImage(og.image, img.body ? L.imageSize(img.body) : null, img.tooBig ? L.MAX_IMAGE + 1 : img.body.length);
  if (why) return { why };
  const host = new URL(html.url ?? page).hostname.replace(/^www\./, '');
  const site = L.strip(og.site || '').slice(0, 30);
  return { img: og.image, imgFrom: site && !/^https?:/.test(site) ? site : host, imgPage: html.url ?? page };
}
/** 네이버 지역 검색 홈페이지: 이름으로, 좌표 300m 안 첫 결과의 link */
export async function homepageOf(name, p, k = keys()) {
  const b = await naver('local', name, 5, k);
  for (const i of b.items) {
    const at = { lng: Number(i.mapx) / 1e7, lat: Number(i.mapy) / 1e7 };
    if (!Number.isFinite(at.lat) || L.km(at, p) > 0.3) continue;
    return i.link && L.okPage(i.link) ? i.link : '';
  }
  return '';
}
async function images() {
  const marker = resolve(dayDir, 'images.json');
  once(marker);
  const holdPath = resolve(dayDir, 'hold.json');
  const held = existsSync(holdPath) && !existsSync(resolve(dayDir, 'released.json'));
  const file = held ? readJ(holdPath) : data();
  const rows = inputs();
  const k = keys();
  const log = [];
  for (const it of file.items.filter((i) => i.added === DAY || held)) {
    const cid = (readJ(LEDGER).names[L.norm(it.name)] ?? {}).cid;
    const r = rows.get(cid);
    const core = L.norm(L.coreWord(it.name));
    const pages = [];
    for (const n of r?.news ?? []) if (core && L.norm(n.title).includes(core) && L.okPage(n.link)) pages.push(n.link);
    if (it.kind === '새로 연 곳') {
      const h = await homepageOf(it.name, it, k).catch(() => '');
      if (h) pages.push(h);
    }
    let got = null;
    const tried = [];
    for (const page of [...new Set(pages)].slice(0, 4)) {
      const x = await pictureOf(page);
      tried.push({ page, ...(x.why ? { why: x.why } : { img: x.img }) });
      if (x.img) { got = x; break; }
    }
    if (got) Object.assign(it, { img: got.img, imgFrom: got.imgFrom, imgPage: got.imgPage });
    log.push({ id: it.id, name: it.name, tried, img: got?.img ?? null });
  }
  // 10절: 서로 다른 둘 이상이 같은 그림이면 쓰지 않는다
  const count = new Map();
  for (const it of file.items) if (it.img) count.set(it.img, (count.get(it.img) ?? 0) + 1);
  let shared = 0;
  for (const it of file.items)
    if (it.img && count.get(it.img) > 1) {
      delete it.img;
      delete it.imgFrom;
      delete it.imgPage;
      shared++;
    }
  if (held) writeJ(holdPath, file);
  else saveData(file);
  writeJ(marker, { day: DAY, held, items: log.length, withImage: log.filter((x) => x.img).length - shared, shared, log });
  console.log(JSON.stringify({ items: log.length, withImage: log.filter((x) => x.img).length - shared, shared }));
}

// ── 9절 sweep ──
async function sweep() {
  const marker = resolve(dayDir, 'sweep.json');
  once(marker);
  const file = data();
  const before = file.items.length;
  const led = ledger();
  const k = keys();
  const out = [];
  const keep = [];
  for (const it of file.items) {
    const d = L.sweepOf(it, DAY);
    const id = /place\.map\.kakao\.com\/(\d+)/.exec(it.kakao)?.[1];
    const mark = (status, why = '') => {
      led.names[L.norm(it.name)] = { ...(led.names[L.norm(it.name)] ?? {}), status, day: DAY, ...(why ? { why } : {}) };
      if (id && it.kind === '새로 연 곳') led.kakao[id] = { status, day: DAY, name: it.name };
      out.push({ id: it.id, name: it.name, status, why });
    };
    if (d === 'ended') { mark('ended'); continue; }
    if (it.kind !== '새로 연 곳') { keep.push(it); continue; }
    // 폐업 신호: 7일마다 (8주 확인 날엔 함께)
    const due = d === 'check' || !it.checked || it.checked <= L.addDays(DAY, -L.CLOSE_EVERY);
    if (!due) { keep.push(it); continue; }
    const docs = await kakao(it.name, 15, k);
    const blog = await naver('blog', `${it.name} ${String(it.gu ?? '').replace(/구$/, '')}`.trim(), 10, k);
    const titles = posts(blog);
    const closed = L.closedSignal(it, docs.map((x) => x.id), titles.map((x) => x.title));
    if (closed) { mark('closed', closed); continue; }
    if (d === 'check') {
      const stay = L.stayOf(it.word);
      if (stay && L.stillLoved(it, titles, DAY)) {
        keep.push({ ...it, stay, checked: DAY });
        out.push({ id: it.id, name: it.name, status: `stay ${stay}` });
      } else mark('retired', stay ? 'blog evidence under 3 in 30 days' : 'no shelf for this kind (G9)');
      continue;
    }
    keep.push({ ...it, checked: DAY });
  }
  file.items = keep;
  saveData(file);
  saveLedger(led);
  writeJ(marker, { day: DAY, before, after: keep.length, changes: out });
  console.log(JSON.stringify({ after: keep.length, changes: out.length, byStatus: out.reduce((m, x) => ((m[x.status.split(' ')[0]] = (m[x.status.split(' ')[0]] ?? 0) + 1), m), {}) }));
}

// ── 8절 감사 ──
const auditDir = resolve(dir, 'audit');
function auditTargets(led) {
  const since = led.lastAudit ?? '0000-00-00';
  const holdPath = resolve(dayDir, 'hold.json');
  const shipped = existsSync(holdPath) && !existsSync(resolve(dayDir, 'released.json')) ? readJ(holdPath).items.map((i) => i.name) : data().items.filter((i) => i.added > since).map((i) => i.name);
  const cids = (names) => names.map((n) => led.names[L.norm(n)]?.cid).filter(Boolean);
  const dropNames = Object.entries(led.names).filter(([, x]) => x.status === 'dropped' && x.day > since && x.cid && !x.why).map(([, x]) => x.cid);
  return { keep: cids(shipped), drop: dropNames };
}
function auditSample() {
  const out = resolve(auditDir, `in-${DAY}.json`);
  once(out);
  const led = ledger();
  const t = auditTargets(led);
  const seedN = Number(DAY.replace(/-/g, ''));
  const keep = L.sampleOf(t.keep, L.AUDIT_KEEP, seedN);
  const drop = L.sampleOf(t.drop, L.AUDIT_DROP, seedN + 1);
  const all = new Map();
  for (const d of readdirSync(resolve(dir, 'days'))) if (existsSync(resolve(dir, 'days', d, 'judge'))) for (const [cid, r] of inputs(resolve(dir, 'days', d))) all.set(cid, r);
  const rows = [...keep, ...drop].sort().map((cid) => all.get(cid));
  if (rows.some((r) => !r)) throw new Error('an audited cid has no judge input');
  writeJ(out, { day: DAY, criteria: L.CRITERIA, since: led.lastAudit, n: rows.length, rows });
  writeJ(resolve(auditDir, `key-${DAY}.json`), { day: DAY, seed: seedN, keep, drop });
  console.log(JSON.stringify({ since: led.lastAudit, shipped: t.keep.length, dropped: t.drop.length, sample: { keep: keep.length, drop: drop.length } }));
}
function auditResult() {
  const md = resolve(auditDir, `result-${DAY}.md`);
  once(md);
  const key = readJ(resolve(auditDir, `key-${DAY}.json`));
  const out = readJ(resolve(auditDir, `out-${DAY}.json`));
  const audit = Object.fromEntries(out.map((x) => [x.cid, x.keep ? 'keep' : 'drop']));
  const missing = [...key.keep, ...key.drop].filter((c) => !(c in audit));
  if (missing.length) throw new Error(`audit output misses ${missing.length}`);
  const g = L.gateOf(key.keep, key.drop, audit);
  const led = ledger();
  const holdPath = resolve(dayDir, 'hold.json');
  const held = existsSync(holdPath) && !existsSync(resolve(dayDir, 'released.json'));
  let reverted = 0;
  if (!g.pass) {
    const since = led.lastAudit ?? '0000-00-00';
    const back = held ? readJ(holdPath).items : data().items.filter((i) => i.added > since);
    for (const it of back) {
      led.names[L.norm(it.name)] = { ...(led.names[L.norm(it.name)] ?? {}), status: 'reverted', day: DAY };
      const id = /place\.map\.kakao\.com\/(\d+)/.exec(it.kakao)?.[1];
      if (id && led.kakao[id]) led.kakao[id] = { ...led.kakao[id], status: 'reverted', day: DAY };
    }
    reverted = back.length;
    if (held) writeJ(holdPath, { day: DAY, items: [], reverted: back.map((i) => i.id) });
    else {
      const f = data();
      const ids = new Set(back.map((i) => i.id));
      f.items = f.items.filter((i) => !ids.has(i.id));
      saveData(f);
    }
  }
  led.audits.push({ day: DAY, since: led.lastAudit, keep: g.keep, drop: g.drop, pass: g.pass, reverted });
  led.lastAudit = DAY;
  saveLedger(led);
  const pct = (x) => (x.rate === null ? '—' : `${x.agree}/${x.n} (${(x.rate * 100).toFixed(1)}%)`);
  const mism = [...key.keep.filter((c) => audit[c] !== 'keep').map((c) => `- ${c}: 판정 keep, 감사 drop — ${out.find((x) => x.cid === c)?.why ?? ''}`), ...key.drop.filter((c) => audit[c] !== 'drop').map((c) => `- ${c}: 판정 drop, 감사 keep — ${out.find((x) => x.cid === c)?.why ?? ''}`)];
  writeFileSync(
    md,
    `# 매일 발굴 감사 ${DAY} (${L.CRITERIA} 8절)\n\n- 대상: ${led.audits.at(-1).since ?? '첫 회차'} 뒤 실린 것${held ? '(첫 회차: 싣기 전 hold)' : ''}\n- 실린 표본 keep 일치: ${pct(g.keep)} — 게이트 90%\n- drop 표본 일치(보고만): ${pct(g.drop)}\n- **게이트: ${g.pass ? '통과' : '미달'}**${g.pass ? '' : ` — 그 기간 실린 ${reverted}곳 되돌림`}\n\n## 불일치\n\n${mism.join('\n') || '- 없음'}\n`,
  );
  console.log(JSON.stringify({ ...g, reverted }));
}
function release() {
  const marker = resolve(dayDir, 'released.json');
  once(marker);
  const res = readFileSync(resolve(auditDir, `result-${DAY}.md`), 'utf8');
  if (!/게이트: 통과/.test(res)) throw new Error('audit gate not passed: nothing shipped');
  const hold = readJ(resolve(dayDir, 'hold.json'));
  const file = data();
  file.items = [...file.items, ...hold.items].sort((a, b) => (a.id < b.id ? -1 : 1));
  saveData(file);
  const led = ledger();
  for (const it of hold.items) {
    led.names[L.norm(it.name)] = { ...led.names[L.norm(it.name)], status: 'shipped' };
    const id = /place\.map\.kakao\.com\/(\d+)/.exec(it.kakao)?.[1];
    if (id && led.kakao[id]) led.kakao[id] = { ...led.kakao[id], status: 'shipped' };
  }
  saveLedger(led);
  writeJ(marker, { day: DAY, released: hold.items.length });
  console.log(JSON.stringify({ released: hold.items.length }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = { seed, collect, queue, enrich, ship, images, sweep, 'audit-sample': auditSample, 'audit-result': auditResult, release }[process.argv[2]];
  if (!run) {
    console.error('seed | collect | queue | enrich | ship [--hold] | images | sweep | audit-sample | audit-result | release   [--day YYYY-MM-DD]');
    process.exit(1);
  }
  await run();
}
