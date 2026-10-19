/**
 * 부산 카카오 대조 S3b (plans/busan.md S3b, specs/busan.md 3.1, ADR-0050, 사전등록 review/busan/kakao-criteria.md).
 *
 *   node scripts/busan/kakao.mjs          S3 keep 995곳을 카카오 로컬 키워드 검색으로 대조 → review/busan/kakao-01.json
 *   node scripts/busan/kakao.mjs --count  결과 파일의 수만 다시 센다(호출 없음)
 *
 * - 곳마다 1회(응답을 못 받았을 때만 최대 3번). 이미 쓴 곳은 건너뛴다(멱등, 끊겨도 같은 명령으로 이어 간다).
 * - 호출은 KST 날짜별로 review/busan/kakao-calls.log에 한 줄씩(키·응답 없이), 하루 1,200회에서 멈춘다.
 * - 저장은 장소 ID·place_url만. 카카오의 이름·좌표·분류는 판정에만 쓰고 버린다.
 * 키는 저장소 루트 .env의 KAKAO_REST_API_KEY. 출력·로그·파일 어디에도 남기지 않는다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsOn, kstDay } from './collect.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const DAY_LIMIT = 1200;
export const PASS_RATE = 0.5;
export const FOOD_TYPE = 39;
export const RADIUS = { food: 300, other: 1000 };
const DROP_CODES = new Set(['PK6', 'SW8', 'OL7', 'BK9', 'AG2', 'CS2', 'PS3', 'AC5', 'HP8', 'PM9', 'AD5', 'MT1']);
const FOOD_CODES = new Set(['FD6', 'CE7']);
const FACILITY_TAIL = /(주차장|화장실|매표소|정류장|정류소|승강장|입구|출구|관리사무소|관리소|안내소|매점|편의점|정문|후문|역)(\d+번출구|\d+)?$/;
const CLOSED = /폐업|폐점|휴업|영업종료/;

const stripBrackets = (s) => String(s).replace(/[(（[][^)）\]]*[)）\]]/g, ' ');

/** 검색어(2절): 괄호와 안 글자를 지우고 공백을 줄인다. 비면 원래 이름. */
export function queryOf(title) {
  const q = stripBrackets(title).replace(/\s+/g, ' ').trim();
  return q || String(title).replace(/\s+/g, ' ').trim();
}

/** 이름 다듬기(3절 3). */
export function normName(s) {
  return stripBrackets(String(s).normalize('NFKC')).replace(/[\s·,./&'\-_]/g, '').toLowerCase();
}
const variants = (s) => {
  const n = normName(s);
  const cut = n.replace(/^(부산광역시|부산)/, '');
  return cut && cut !== n ? [n, cut] : [n];
};

/** 두 이름의 규칙: 'exact' | 'contains' | null. */
export function nameRule(ours, theirs) {
  const a = variants(ours);
  const b = variants(theirs);
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

export function haversine(lat1, lng1, lat2, lng2) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export const radiusOf = (place) => (place.contenttypeid === FOOD_TYPE ? RADIUS.food : RADIUS.other);

/**
 * 응답 documents에서 고르기(3절). place = { title, lat, lng, contenttypeid, mood }.
 * 돌려주는 값은 저장할 칸만: { status, rule, kakaoPlaceId, placeUrl }.
 */
export function pick(place, docs) {
  const limit = radiusOf(place);
  const cands = [];
  docs.forEach((d, i) => {
    const dist = haversine(place.lat, place.lng, Number(d.y), Number(d.x));
    if (!(dist <= limit)) return;
    const code = d.category_group_code ?? '';
    if (DROP_CODES.has(code)) return;
    if (place.contenttypeid === FOOD_TYPE && !FOOD_CODES.has(code)) return;
    if (place.mood !== 'food' && FOOD_CODES.has(code)) return;
    const rule = nameRule(place.title, d.place_name ?? '');
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

/** 대상(1절): S3 keep만, id 순. */
export function targets(dir) {
  const keep = new Map();
  const judgeDir = resolve(dir, 'judge-01');
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of readJson(resolve(judgeDir, f))) if (v.keep) keep.set(v.id, v.mood);
  }
  return readJson(resolve(dir, 'scope.json'))
    .items.filter((it) => keep.has(it.id))
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

/**
 * 한 번 돌린다. search(query, {x, y, radius}) → { status, body? }(status는 HTTP 상태, 네트워크 오류면 0).
 * 돌려주는 값: { calls, stopped: 'done' | 'limit' | 'auth' | 'errors', summary }.
 */
export async function run({ dir, search, now = () => new Date(), limit = DAY_LIMIT, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pause = 100 }) {
  const outPath = resolve(dir, 'kakao-01.json');
  const logPath = resolve(dir, 'kakao-calls.log');
  const list = targets(dir);
  const prev = existsSync(outPath) ? readJson(outPath).rows : [];
  const byId = new Map(prev.map((r) => [r.id, r]));
  let calls = 0;
  let tried = 0;
  let failed = 0;
  let stopped = 'done';

  const save = () => {
    const rows = list.filter((p) => byId.has(p.id)).map((p) => byId.get(p.id));
    const callsTotal = existsSync(logPath) ? readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).length : 0;
    writeJson(outPath, { criteria: 'review/busan/kakao-criteria.md', source: 'Kakao Local keyword search (id·place_url만 저장)', calls: callsTotal, ...summarize(rows, list.length), rows });
  };

  async function call(place) {
    const day = kstDay(now());
    const used = existsSync(logPath) ? callsOn(readFileSync(logPath, 'utf8'), day) : 0;
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
      byId.set(place.id, { id: place.id, query: queryOf(place.title), ...pick(place, res.body?.documents ?? []) });
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

/** 실제 카카오 로컬. 키는 머리에만 들어간다. */
export function kakaoLocal(key) {
  return async (query, { x, y, radius }) => {
    const q = new URLSearchParams({ query, x: String(x), y: String(y), radius: String(radius), size: '15', page: '1' });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword?${q}`, { headers: { Authorization: `KakaoAK ${key}` } });
    if (res.status !== 200) {
      await res.body?.cancel();
      return { status: res.status };
    }
    return { status: 200, body: await res.json() };
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(webRoot, 'review/busan');
  if (process.argv.includes('--count')) {
    const out = readJson(resolve(dir, 'kakao-01.json'));
    const { rows, ...head } = { ...out, ...summarize(out.rows, targets(dir).length) };
    console.log(JSON.stringify(head, null, 1));
  } else {
    const key = env('KAKAO_REST_API_KEY');
    if (!key) throw new Error('KAKAO_REST_API_KEY missing in the repo-root .env');
    const r = await run({ dir, search: kakaoLocal(key) });
    const { rows, ...head } = r.summary;
    console.log(JSON.stringify({ callsThisRun: r.calls, stopped: r.stopped, failed: r.failed, ...head }, null, 1));
    if (r.stopped !== 'done') process.exitCode = 1;
  }
}
