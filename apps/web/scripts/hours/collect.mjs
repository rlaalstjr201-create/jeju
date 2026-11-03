/**
 * 영업시간·쉬는 날 수집 (specs/open-now.md 2): 제주 장소마다 TourAPI 국문 KorService2의 소개 정보(detailIntro2)를 받는다.
 *
 * - 목록 areaBasedList2: 제주(lDongRegnCd=50) 종류 5개(12·14·28·38·39)를 review/hours/raw/list-<type>.json에 그대로.
 * - 짝짓기: 제주 장소(public/spots.json)와 목록 항목을 이름(띄어쓰기·괄호 뺀)과 거리로 잇는다(matchSpots). 결과는
 *   review/hours/match.json. 짝이 없는 곳은 영업시간을 모르는 곳이다(고르기에서 빼지 않는다).
 * - 소개 detailIntro2: 짝이 있는 곳마다 1회 → raw/intro/<contentid>.json. 받은 것은 건너뛴다. 먹기부터, 그다음 실내.
 * - 호출은 KST 날짜별로 부산·전국과 같은 review/busan/raw/calls.log에 한 줄씩(주소·키 없이) 세고, 그날 900회에
 *   닿으면 스스로 멈춘다. 실패하면 다시 시도하지 않고 멈춘다(받은 것은 남는다). 다음 날 같은 명령으로 이어 간다.
 *
 * 키는 저장소 루트 .env의 DATA_GO_KR_SERVICE_KEY. 출력·로그·파일 어디에도 남기지 않는다.
 *
 *   node scripts/hours/collect.mjs [--limit=N]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_LIMIT, LIST_TYPES, NUM_OF_ROWS, callsOn, itemsOf, kstDay, pageCount, tourApi } from '../busan/collect.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`);

/** 이름 비교용: 괄호 안, 띄어쓰기·가운뎃점·「제주」 앞머리를 뺀 소문자. */
export function normName(name) {
  return String(name)
    .replace(/[(（][^)）]*[)）]/g, '')
    .replace(/[\s·.,\-_'"]/g, '')
    .replace(/^제주(도|특별자치도)?/, '')
    .toLowerCase();
}

export function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * spots ↔ TourAPI 목록 항목. 같은 이름이면 1km 안, 한쪽 이름이 다른 쪽을 품으면(3자 이상, 짧은 쪽이 긴 쪽의 절반 이상)
 * 300m 안. 먹기는 음식점(39)하고만, 나머지는 음식점이 아닌 것하고만 잇는다(「원조마라도짜장면」 ≠ 섬 「마라도」).
 * 여럿이면 가장 가까운 것. 한 항목은 한 장소에만 (먼저 가까운 짝부터).
 */
export function matchSpots(spots, items, exclude = new Set()) {
  const cands = [];
  const prepared = items
    .filter((i) => i.mapx && i.mapy)
    .map((i) => ({ i, n: normName(i.title), p: { lat: Number(i.mapy), lng: Number(i.mapx) } }));
  for (const s of spots) {
    if (exclude.has(String(s.id))) continue;
    const n = normName(s.name);
    if (n.length < 2) continue;
    for (const c of prepared) {
      const d = km(s, c.p);
      if (d > 1) continue;
      if ((s.mood === 'food') !== (Number(c.i.contenttypeid) === 39)) continue;
      const same = c.n === n;
      const short = Math.min(n.length, c.n.length);
      const contains = !same && short >= 3 && short * 2 >= Math.max(n.length, c.n.length) && (c.n.includes(n) || n.includes(c.n));
      if ((same && d <= 1) || (contains && d <= 0.3)) cands.push({ id: s.id, contentid: String(c.i.contentid), type: Number(c.i.contenttypeid), title: c.i.title, km: Math.round(d * 1000) / 1000, same });
    }
  }
  cands.sort((a, b) => Number(b.same) - Number(a.same) || a.km - b.km);
  const bySpot = new Map();
  const used = new Set();
  for (const c of cands) {
    if (bySpot.has(c.id) || used.has(c.contentid)) continue;
    bySpot.set(c.id, c);
    used.add(c.contentid);
  }
  return [...bySpot.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

class StopError extends Error {}

export async function collect({ dir, logPath, spots, fetchJson, now = () => new Date(), limit = DAY_LIMIT, max = Infinity }) {
  const rawDir = resolve(dir, 'raw');
  mkdirSync(resolve(rawDir, 'intro'), { recursive: true });
  let calls = 0;
  async function call(op, arg, params) {
    const day = kstDay(now());
    const used = existsSync(logPath) ? callsOn(readFileSync(logPath, 'utf8'), day) : 0;
    if (used >= limit) throw new StopError(`KST ${day} 호출 ${used}회 — ${limit}회 한도에서 멈춤`);
    let status = 'ok';
    try {
      const body = await fetchJson(op, params);
      const code = body?.response?.header?.resultCode;
      if (code !== '0000') {
        status = `resultCode ${code ?? '?'}`;
        throw new Error(`${op} ${arg}: ${status}`);
      }
      return body;
    } catch (e) {
      if (status === 'ok') status = 'error';
      throw e;
    } finally {
      calls += 1;
      appendFileSync(logPath, `${day}\t${now().toISOString()}\t${op}\t${arg}\t${status}\n`);
    }
  }

  let stopped = 'done';
  let message;
  let fetched = 0;
  const items = [];
  try {
    for (const type of LIST_TYPES) {
      const path = resolve(rawDir, `list-${type}.json`);
      if (!existsSync(path)) {
        const pages = [];
        let total = 0;
        for (let page = 1; page <= (pages.length ? pageCount(total) : 1); page++) {
          const body = await call('areaBasedList2', `hours:50:${type}:${page}`, { contentTypeId: type, lDongRegnCd: 50, numOfRows: NUM_OF_ROWS, pageNo: page, arrange: 'A' });
          total = Number(body.response.body.totalCount);
          pages.push(body);
        }
        writeJson(path, { contenttypeid: type, lDongRegnCd: 50, fetchedAt: now().toISOString(), totalCount: total, pages });
      }
      items.push(...readJson(path).pages.flatMap(itemsOf));
    }
    const excludePath = resolve(dir, 'exclude.json');
    const exclude = new Set(existsSync(excludePath) ? readJson(excludePath).map((e) => String(e.id)) : []);
    const match = matchSpots(spots, items, exclude);
    writeJson(resolve(dir, 'match.json'), { spots: spots.length, listed: items.length, matched: match.length, items: match });
    // 먹기, 그다음 실내, 그다음 나머지: 지금 닫혀 있을 수 있는 곳부터
    const rank = (s) => (s.mood === 'food' ? 0 : s.indoor ? 1 : 2);
    const byId = new Map(spots.map((s) => [s.id, s]));
    const order = [...match].sort((a, b) => rank(byId.get(a.id)) - rank(byId.get(b.id)));
    for (const m of order) {
      if (fetched >= max) break;
      const path = resolve(rawDir, 'intro', `${m.contentid}.json`);
      if (existsSync(path)) continue;
      const body = await call('detailIntro2', `hours:${m.contentid}`, { contentId: m.contentid, contentTypeId: m.type });
      writeJson(path, { contentid: m.contentid, fetchedAt: now().toISOString(), item: itemsOf(body)[0] ?? null });
      fetched += 1;
    }
  } catch (e) {
    stopped = e instanceof StopError ? 'limit' : 'error';
    message = e.message;
  }
  return { calls, fetched, stopped, message };
}

function env(key) {
  for (const line of readFileSync(resolve(webRoot, '../../.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const key = env('DATA_GO_KR_SERVICE_KEY');
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY missing in the repo-root .env');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const spots = readJson(resolve(webRoot, 'public/spots.json')).filter((s) => !s.hide);
  const r = await collect({
    dir: resolve(webRoot, 'review/hours'),
    logPath: resolve(webRoot, 'review/busan/raw/calls.log'),
    spots,
    fetchJson: tourApi(key),
    max: limitArg ? Number(limitArg.slice(8)) : Infinity,
  });
  console.log(JSON.stringify(r));
  if (r.stopped === 'error') process.exitCode = 1;
}
