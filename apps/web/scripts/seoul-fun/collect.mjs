/**
 * 서울 즐길 거리 후보 수집 (ADR-0115 3). 카카오 로컬 키워드 검색으로 구 × 갈래 검색어(review/seoul-fun/queries-01.json, 실행 전에 커밋)를
 * 한 번씩 묻는다. 쪽은 많아야 3(15건씩), 마지막 쪽(is_end)이면 멈춘다.
 *
 *   node scripts/seoul-fun/collect.mjs          모자란 검색어만 묻는다(멱등, 끊겨도 같은 명령으로 이어 간다)
 *   node scripts/seoul-fun/collect.mjs --count  받은 수만 센다(호출 없음)
 *   node scripts/seoul-fun/collect.mjs 02       2차 검색어(queries-02 → kakao-02)
 *
 * 결과: review/seoul-fun/kakao-01/<구>.json (검색어마다 받은 장소: id·이름·카테고리·주소·좌표·place_url만). 호출은 KST 날짜별로
 * review/seoul-fun/kakao-calls.log에 한 줄씩(키·응답 없이) 남기고, 강원·서울 카카오 로그와 합산해 하루 1,200회에서 멈춘다.
 * 키는 저장소 루트 .env의 KAKAO_REST_API_KEY이고 출력·로그·파일 어디에도 남기지 않는다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsOn, kstDay } from '../busan/collect.mjs';
import { env } from '../famous-measure.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = resolve(webRoot, 'review/seoul-fun');
// 회차: 01(queries-01 → kakao-01), 02(queries-02 → kakao-02). 하루 한도는 ADR-0115 Amendment 1(3,000, 강원·서울 로그와 합산)
const round = process.argv.find((a) => /^0\d$/.test(a)) ?? '01';
const outDir = resolve(dir, `kakao-${round}`);
const LIMIT = round === '01' ? 1200 : 3000;
const PAGES = 3;
const logPath = resolve(dir, 'kakao-calls.log');
const otherLogs = ['gangwon', 'seoul'].map((d) => resolve(webRoot, 'review', d, 'kakao-calls.log'));

const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const keep = (d) => ({ id: d.id, name: d.place_name, category: d.category_name, group: d.category_group_code, address: d.road_address_name || d.address_name, lat: Number(d.y), lng: Number(d.x), url: d.place_url });

const Q = read(resolve(dir, `queries-${round}.json`));
const jobs = [];
for (const gu of Q.gu) for (const [g, words] of Object.entries(Q.perGu)) for (const w of words) jobs.push({ file: gu, g, query: `${gu} ${w}` });
for (const [g, words] of Object.entries(Q.citywide)) for (const w of words) jobs.push({ file: '서울', g, query: `서울 ${w}` });

if (process.argv.includes('--count')) {
  let q = 0;
  let n = 0;
  const ids = new Set();
  for (const f of new Set(jobs.map((j) => j.file))) {
    const r = read(resolve(outDir, `${f}.json`), {});
    for (const v of Object.values(r)) {
      q++;
      n += v.places.length;
      for (const p of v.places) ids.add(p.id);
    }
  }
  console.log(JSON.stringify({ queries: jobs.length, done: q, places: n, unique: ids.size }));
} else {
  const key = env('KAKAO_REST_API_KEY');
  if (!key) throw new Error('KAKAO_REST_API_KEY missing in the repo-root .env');
  mkdirSync(outDir, { recursive: true });
  const day = kstDay(new Date());
  const used = () => [logPath, ...otherLogs].reduce((n, f) => n + (existsSync(f) ? callsOn(readFileSync(f, 'utf8'), day) : 0), 0);
  let calls = 0;
  let stopped = 'done';
  outer: for (const j of jobs) {
    const path = resolve(outDir, `${j.file}.json`);
    const r = read(path, {});
    if (r[j.query]) continue;
    const places = [];
    let total = 0;
    for (let page = 1; page <= PAGES; page++) {
      if (used() >= LIMIT) {
        stopped = 'limit';
        break outer;
      }
      const q = new URLSearchParams({ query: j.query, size: '15', page: String(page) });
      let res;
      for (let t = 0; t < 3; t++) {
        res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword?${q}`, { headers: { Authorization: `KakaoAK ${key}` } }).catch(() => null);
        appendFileSync(logPath, `${day}\t${new Date().toISOString()}\t${j.query}#${page}\t${res?.status ?? 'net'}\n`);
        calls++;
        if (res?.status === 200) break;
        await res?.body?.cancel();
        await new Promise((s) => setTimeout(s, 1000));
      }
      if (res?.status !== 200) {
        stopped = 'failed';
        break outer;
      }
      const body = await res.json();
      total = body.meta?.pageable_count ?? 0;
      places.push(...body.documents.map(keep));
      await new Promise((s) => setTimeout(s, 120));
      if (body.meta?.is_end) break;
    }
    r[j.query] = { g: j.g, total, places };
    writeFileSync(path, JSON.stringify(r, null, 1) + '\n');
  }
  console.log(JSON.stringify({ callsThisRun: calls, stopped, usedToday: used() }));
  if (stopped !== 'done') process.exitCode = 1;
}
