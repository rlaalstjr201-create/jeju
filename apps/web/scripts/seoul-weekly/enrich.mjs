/**
 * 이번 주 서울 근거 붙이기 (ADR-0118, specs/seoul-weekly.md 「후보 추출」 2·3). 옮겨 적은 후보(extract/out-*.json)를 같은 이름끼리
 * 합쳐 candidates-NN.json으로 두고, 후보마다 네이버 블로그를 이름으로 한 번(최신순 10건), 카카오 로컬을 장소 글자(없으면 이름)로
 * 한 번, 서울 결과가 없으면 이름으로 한 번 더 묻는다. 결과 judge-input-NN.json. 한 번만 돈다(있으면 멈춤, 끊기면 .part에서 이어 감).
 *
 *   node scripts/seoul-weekly/enrich.mjs [NN]
 *
 * 키는 .env의 NAVER_CLIENT_ID·NAVER_CLIENT_SECRET·KAKAO_REST_API_KEY이고 출력·파일 어디에도 남기지 않는다. 카카오 호출은
 * review/seoul-weekly/kakao-calls.log에 날짜·검색어·응답 코드만 남기고, 강원·서울·즐길 거리 로그와 합산해 하루 3,000회에서 멈춘다.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsOn, kstDay } from '../busan/collect.mjs';
import { env } from '../famous-measure.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-weekly');
const round = process.argv.find((a) => /^\d\d$/.test(a)) ?? '01';
const out = resolve(dir, `judge-input-${round}.json`);
const part = `${out}.part`;
if (existsSync(out)) throw new Error(`${out} exists (one run only)`);
const LIMIT = 3000;
const logPath = resolve(dir, 'kakao-calls.log');
const logs = [logPath, ...['gangwon', 'seoul', 'seoul-fun'].map((d) => resolve(webRoot, 'review', d, 'kakao-calls.log'))];
const norm = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
const strip = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

// 1. 합치기: 같은 이름(공백·기호 뺀 것)은 하나, 빈 칸은 뒤의 것이 채운다, 글 번호는 모두
const raw = new Map(JSON.parse(readFileSync(resolve(dir, `raw-${round}.json`), 'utf8')).items.map((i) => [i.n, i]));
const merged = new Map();
for (const f of readdirSync(resolve(dir, 'extract')).filter((f) => /^out-\d\d\.json$/.test(f)).sort()) {
  for (const c of JSON.parse(readFileSync(resolve(dir, 'extract', f), 'utf8'))) {
    const k = norm(c.name);
    const m = merged.get(k);
    if (!m) merged.set(k, { ...c, from: [...c.from] });
    else {
      for (const key of ['placeText', 'start', 'end', 'time', 'reserveText']) if (!m[key] && c[key]) m[key] = c[key];
      m.from = [...new Set([...m.from, ...c.from])].sort((a, b) => a - b);
    }
  }
}
const cands = [...merged.values()].map((c, i) => ({ cid: `c${String(i + 1).padStart(3, '0')}`, ...c }));
writeFileSync(resolve(dir, `candidates-${round}.json`), JSON.stringify(cands, null, 1) + '\n');

// 2. 근거
const nid = env('NAVER_CLIENT_ID');
const nsecret = env('NAVER_CLIENT_SECRET');
const kkey = env('KAKAO_REST_API_KEY');
if (!nid || !nsecret || !kkey) throw new Error('NAVER_CLIENT_* or KAKAO_REST_API_KEY missing in the repo-root .env');
const day = kstDay(new Date());
const used = () => logs.reduce((n, f) => n + (existsSync(f) ? callsOn(readFileSync(f, 'utf8'), day) : 0), 0);
async function naver(q) {
  for (let t = 0; t < 3; t++) {
    const res = await fetch(`https://openapi.naver.com/v1/search/blog.json?${new URLSearchParams({ query: q, display: '10', sort: 'date' })}`, { headers: { 'X-Naver-Client-Id': nid, 'X-Naver-Client-Secret': nsecret } }).catch(() => null);
    if (res?.status === 200) return (await res.json()).items.map((i) => ({ title: strip(i.title), desc: strip(i.description), day: `${i.postdate.slice(0, 4)}-${i.postdate.slice(4, 6)}-${i.postdate.slice(6, 8)}`, link: i.link }));
    await res?.body?.cancel();
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error('naver failed');
}
async function kakao(q) {
  if (used() >= LIMIT) throw new Error('kakao daily limit');
  for (let t = 0; t < 3; t++) {
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query: q, size: '5' })}`, { headers: { Authorization: `KakaoAK ${kkey}` } }).catch(() => null);
    appendFileSync(logPath, `${day}\t${new Date().toISOString()}\tweekly:${q}\t${res?.status ?? 'net'}\n`);
    if (res?.status === 200) {
      const d = (await res.json()).documents.find((x) => /^서울/.test(x.road_address_name || x.address_name));
      return d ? { id: d.id, name: d.place_name, address: d.road_address_name || d.address_name, category: d.category_name, lat: Number(d.y), lng: Number(d.x), url: String(d.place_url).replace(/^http:/, 'https:'), q } : null;
    }
    await res?.body?.cancel();
    await new Promise((s) => setTimeout(s, 1000));
  }
  throw new Error('kakao failed');
}
const done = existsSync(part) ? JSON.parse(readFileSync(part, 'utf8')) : {};
for (const c of cands) {
  if (done[c.cid]) continue;
  const posts = await naver(c.name);
  let place = c.placeText ? await kakao(c.placeText) : null;
  if (!place) place = await kakao(c.name);
  done[c.cid] = { posts, place };
  writeFileSync(part, JSON.stringify(done));
  await new Promise((s) => setTimeout(s, 120));
}
const rows = cands.map((c) => ({
  cid: c.cid,
  copied: { name: c.name, kind: c.kind, placeText: c.placeText, start: c.start, end: c.end, time: c.time, reserveText: c.reserveText },
  first: c.from.map((n) => raw.get(n)).filter(Boolean).slice(0, 8).map(({ title, desc, day, link }) => ({ title, desc, day, link })),
  posts: done[c.cid].posts,
  kakao: done[c.cid].place,
}));
writeFileSync(out, JSON.stringify({ day: '2026-11-05', rows }, null, 1) + '\n');
renameSync(part, `${part}.done`);
console.log(JSON.stringify({ candidates: cands.length, kakaoFound: rows.filter((r) => r.kakao).length }));
