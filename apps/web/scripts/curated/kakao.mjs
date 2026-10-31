/**
 * 큐레이팅 도시 카카오 대조 S3b (부산 scripts/busan/kakao.mjs의 도시 인자판, 사전등록 review/<dest>/kakao-criteria.md).
 *
 *   node scripts/curated/kakao.mjs gangwon 강릉          keep 곳을 카카오 로컬 키워드 검색으로 대조 → review/gangwon/kakao-강릉-01.json
 *   node scripts/curated/kakao.mjs gangwon 강릉 --count  결과 파일의 수만 다시 센다(호출 없음)
 *
 * 부산 규칙 그대로: 곳마다 1회(응답을 못 받았을 때만 최대 3번), 이미 쓴 곳은 건너뛴다(멱등, 끊겨도 같은 명령으로 이어 간다),
 * 호출은 KST 날짜별로 review/<dest>/kakao-calls.log에 한 줄씩(키·응답 없이, 도시 구분 없이 합산), 하루 1,200회에서 멈춘다.
 * 저장은 장소 ID·place_url만. 이름 규칙의 「부산」 머리말 떼기만 도시 이름으로 바뀐다. 키는 저장소 루트 .env의 KAKAO_REST_API_KEY이고
 * 출력·로그·파일 어디에도 남기지 않는다. 부산 파일은 고치지 않고, 부산에서 내보낸 값(queryOf·normName·haversine·radiusOf·상수)을 쓴다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsOn, kstDay } from '../busan/collect.mjs';
import { DAY_LIMIT, FOOD_TYPE, PASS_RATE, haversine, kakaoLocal, normName, queryOf, radiusOf } from '../busan/kakao.mjs';
import { cityHeads, judgeRound } from './rounds.mjs';

export { DAY_LIMIT, PASS_RATE, queryOf, kakaoLocal };
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// 부산 kakao.mjs의 비공개 상수와 같은 값(kakao-criteria.md 3절)
const DROP_CODES = new Set(['PK6', 'SW8', 'OL7', 'BK9', 'AG2', 'CS2', 'PS3', 'AC5', 'HP8', 'PM9', 'AD5', 'MT1']);
const FOOD_CODES = new Set(['FD6', 'CE7']);
const FACILITY_TAIL = /(주차장|화장실|매표소|정류장|정류소|승강장|입구|출구|관리사무소|관리소|안내소|매점|편의점|정문|후문|역)(\d+번출구|\d+)?$/;
const CLOSED = /폐업|폐점|휴업|영업종료/;

// 머리말(rounds.mjs cityHeads): 강원은 「도시시」·「도시」, 서울 구는 「서울특별시」·「서울시」·「서울」·구 이름(review/seoul/kakao-criteria.md 3절)
const variants = (s, city) => {
  const n = normName(s);
  const cut = n.replace(new RegExp(`^(${cityHeads(city).map(normName).join('|')})`), '');
  return cut && cut !== n ? [n, cut] : [n];
};

/** 두 이름의 규칙: 'exact' | 'contains' | null (부산 nameRule과 같고 앞 머리말만 도시 이름). */
export function nameRule(ours, theirs, city) {
  const a = variants(ours, city);
  const b = variants(theirs, city);
  if (a.some((x) => b.includes(x))) return 'exact';
  for (const x of a) {
    for (const y of b) {
      const short = x.length <= y.length ? x : y;
      if ([...short].length < 2) continue;
      if (y.length > x.length && y.includes(x) && !FACILITY_TAIL.test(y)) return 'contains';
      if (x.length > y.length && x.includes(y)) return 'contains';
    }
  }
  return null;
}

/** place = { title, lat, lng, contenttypeid, mood }; 돌려주는 값은 저장할 칸만. */
export function pick(place, docs, city) {
  const limit = radiusOf(place);
  const cands = [];
  docs.forEach((d, i) => {
    const dist = haversine(place.lat, place.lng, Number(d.y), Number(d.x));
    if (!(dist <= limit)) return;
    const code = d.category_group_code ?? '';
    if (DROP_CODES.has(code)) return;
    if (place.contenttypeid === FOOD_TYPE && !FOOD_CODES.has(code)) return;
    if (place.mood !== 'food' && FOOD_CODES.has(code)) return;
    const rule = nameRule(place.title, d.place_name ?? '', city);
    if (rule) cands.push({ d, i, dist, rule });
  });
  const order = (x, y) => x.dist - y.dist || x.i - y.i;
  const best = cands.filter((c) => c.rule === 'exact').sort(order)[0] ?? cands.filter((c) => c.rule === 'contains').sort(order)[0];
  if (!best) return { status: 'unmatched', rule: 'none', kakaoPlaceId: null, placeUrl: null };
  return {
    status: CLOSED.test(best.d.place_name ?? '') ? 'closed' : 'matched',
    rule: best.rule,
    kakaoPlaceId: String(best.d.id),
    placeUrl: best.d.place_url ? String(best.d.place_url) : `https://place.map.kakao.com/${best.d.id}`,
  };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function writeJson(p, value) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(`${p}.tmp`, p);
}

/** 대상(1절): 도시의 keep만, id 순. dir = review/<dest>. */
export function targets(dir, city) {
  const keep = new Map();
  const judgeDir = resolve(dir, `judge-${city}-${judgeRound(city)}`);
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of readJson(resolve(judgeDir, f))) if (v.keep) keep.set(v.id, v.mood);
  }
  return readJson(resolve(dir, 'scope.json'))
    .items.filter((it) => it.city === city && keep.has(it.id))
    .map((it) => ({ id: it.id, title: it.title, lat: it.lat, lng: it.lng, contenttypeid: it.contenttypeid, mood: keep.get(it.id) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function summarize(rows, total) {
  const count = (k, v) => rows.filter((r) => r[k] === v).length;
  const matched = count('status', 'matched');
  return {
    targets: total,
    done: rows.length,
    status: { matched, unmatched: count('status', 'unmatched'), closed: count('status', 'closed') },
    rule: { exact: count('rule', 'exact'), contains: count('rule', 'contains'), none: count('rule', 'none') },
    matchedRate: total ? matched / total : 0,
    pass: rows.length === total ? matched / total >= PASS_RATE : null,
  };
}

class StopError extends Error {}

/** 한 번 돌린다(부산 run과 같은 흐름). search(query, {x, y, radius}) → { status, body? }. */
export async function run({ dir, city, search, now = () => new Date(), limit = DAY_LIMIT, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pause = 100, otherLogs = [] }) {
  const outPath = resolve(dir, `kakao-${city}-01.json`);
  const logPath = resolve(dir, 'kakao-calls.log');
  const list = targets(dir, city);
  const prev = existsSync(outPath) ? readJson(outPath).rows : [];
  const byId = new Map(prev.map((r) => [r.id, r]));
  let calls = 0;
  let tried = 0;
  let failed = 0;
  let stopped = 'done';

  const save = () => {
    const rows = list.filter((p) => byId.has(p.id)).map((p) => byId.get(p.id));
    const callsTotal = existsSync(logPath) ? readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).length : 0;
    writeJson(outPath, { criteria: `review/${basename(dir)}/kakao-criteria.md`, city, source: 'Kakao Local keyword search (id·place_url만 저장)', callsAllCities: callsTotal, ...summarize(rows, list.length), rows });
  };

  async function call(place) {
    const day = kstDay(now());
    // 하루 한도는 같은 키를 쓰는 다른 목적지 로그와 합쳐 센다(review/seoul/kakao-criteria.md 2절)
    const used = [logPath, ...otherLogs].reduce((n, f) => n + (existsSync(f) ? callsOn(readFileSync(f, 'utf8'), day) : 0), 0);
    if (used >= limit) throw new StopError('limit');
    let res;
    try {
      res = await search(queryOf(place.title), { x: place.lng, y: place.lat, radius: radiusOf(place) });
    } catch {
      res = { status: 0 };
    }
    calls += 1;
    appendFileSync(logPath, `${day}\t${now().toISOString()}\t${place.id}\t${res.status}\n`);
    return res;
  }

  try {
    for (const place of list) {
      if (byId.has(place.id)) continue;
      let res;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (calls) await sleep(pause);
        res = await call(place);
        if (res.status === 401 || res.status === 403) throw new StopError('auth');
        if (res.status === 200) break;
        if (attempt < 2) await sleep(1000 * 2 ** attempt);
      }
      tried += 1;
      if (res.status !== 200) {
        failed += 1;
        if (tried >= 20 && failed / tried > 0.05) throw new StopError('errors');
        continue;
      }
      byId.set(place.id, { id: place.id, query: queryOf(place.title), ...pick(place, res.body?.documents ?? [], city) });
      if (byId.size % 50 === 0) save();
    }
  } catch (e) {
    if (!(e instanceof StopError)) throw e;
    stopped = e.message;
  }
  if (stopped === 'done' && failed) stopped = 'errors';
  save();
  return { calls, stopped, failed, summary: readJson(outPath) };
}

function env(key) {
  for (const line of readFileSync(resolve(webRoot, '../../.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dest, city] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!dest || !city) throw new Error('usage: node scripts/curated/kakao.mjs <dest> <city> [--count]');
  const dir = resolve(webRoot, 'review', dest);
  if (process.argv.includes('--count')) {
    const out = readJson(resolve(dir, `kakao-${city}-01.json`));
    const { rows, ...head } = { ...out, ...summarize(out.rows, targets(dir, city).length) };
    console.log(JSON.stringify(head, null, 1));
  } else {
    const key = env('KAKAO_REST_API_KEY');
    if (!key) throw new Error('KAKAO_REST_API_KEY missing in the repo-root .env');
    const otherLogs = ['gangwon', 'seoul'].filter((d) => d !== dest).map((d) => resolve(webRoot, 'review', d, 'kakao-calls.log'));
    const r = await run({ dir, city, search: kakaoLocal(key), otherLogs });
    const { rows, ...head } = r.summary;
    console.log(JSON.stringify({ callsThisRun: r.calls, stopped: r.stopped, failed: r.failed, ...head }, null, 1));
    if (r.stopped !== 'done') process.exitCode = 1;
  }
}
