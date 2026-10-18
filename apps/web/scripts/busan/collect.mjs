/**
 * 부산 수집 (plans/busan.md S2, ADR-0095, specs/busan.md 3.1·3.2): TourAPI 국문 KorService2, lDongRegnCd=26.
 *
 * - 목록 areaBasedList2: 종류 5개(관광지 12·문화시설 14·레포츠 28·쇼핑 38·음식점 39), numOfRows=1000, totalCount가
 *   넘치면 쪽을 넘긴다. 원문을 review/busan/raw/list-<type>.json에 그대로 둔다(이미 있으면 --refresh 때만 다시).
 * - 상세 detailCommon2: 장소 범위(3.2)를 통과한 곳만, 곳마다 1회 → raw/detail/<contentid>.json. 받은 것은 건너뛰고,
 *   목록의 modifiedtime이 바뀐 곳만 다시 받는다. 축제·행사(15)·숙박·여행코스는 받지 않는다(3.2).
 * - 호출은 KST 날짜별로 raw/calls.log에 한 줄씩(주소·키 없이) 세고, 그날 900회에 닿으면 스스로 멈춘다.
 * - 실패하면 다시 시도하지 않고 그 자리에서 멈춘다(받은 것은 남는다). 다음 날 같은 명령으로 이어 간다.
 * - 끝나면 review/busan/scope.json(범위 안 목록 + 수)을 다시 쓴다.
 *
 * 키는 저장소 루트 .env의 DATA_GO_KR_SERVICE_KEY. 출력·로그·파일 어디에도 남기지 않는다.
 *
 *   node scripts/busan/collect.mjs [--types=12,14,28,38] [--refresh] [--check-https]
 *     --types   상세를 받을 종류(기본: 5개 전부). 목록은 늘 5개.
 *     --refresh 목록을 다시 받는다(갱신). modifiedtime이 바뀐 곳만 상세를 다시 받는다.
 *     --check-https  범위 안 사진 몇 곳의 https 주소가 답하는지 raw/https-check.json에 남긴다(TourAPI 호출 아님).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');

export const LIST_TYPES = [12, 14, 28, 38, 39];
export const DAY_LIMIT = 900;
export const NUM_OF_ROWS = 1000;
export const MARKET_LCLS = new Set(['SH060100', 'SH060200']);
const IN_SCOPE_TYPES = new Set([12, 14, 28, 39]);
const BASE = 'https://apis.data.go.kr/B551011/KorService2';

/** 3.2 장소 범위: 관광지·문화시설·레포츠·음식점 전부, 쇼핑은 전통시장(lclsSystm3 SH060100·SH060200)만. */
export function inScope(item) {
  const type = Number(item.contenttypeid);
  if (IN_SCOPE_TYPES.has(type)) return true;
  return type === 38 && MARKET_LCLS.has(item.lclsSystm3);
}

export const spotId = (item) => `bs-${item.contentid}`;
export const toHttps = (url) => (url ? String(url).replace(/^http:\/\//i, 'https://') : '');
/** firstimage → firstimage2 → '' (https로). */
export const imageOf = (item) => toHttps(item.firstimage || item.firstimage2 || '');

/** KST 날짜 YYYY-MM-DD. */
export function kstDay(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** calls.log에서 그 KST 날짜의 호출 수. */
export function callsOn(logText, day) {
  return logText.split(/\r?\n/).filter((l) => l.startsWith(`${day}\t`)).length;
}

export const pageCount = (totalCount, rows = NUM_OF_ROWS) => Math.max(1, Math.ceil(Number(totalCount) / rows));

/** 상세를 (다시) 받을지: 없거나, 받은 때의 목록 modifiedtime과 지금 목록 값이 다르면. */
export const needsDetail = (item, saved) => !saved || saved.modifiedtime !== item.modifiedtime;

export function itemsOf(body) {
  const items = body?.response?.body?.items;
  if (!items || !items.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

/** scope.json 한 줄(판정·빌드 입력). 이름 다듬기는 빌드(S4)가 한다. */
export function scopeRecord(item, detailed) {
  return {
    id: spotId(item),
    contentid: String(item.contentid),
    contenttypeid: Number(item.contenttypeid),
    title: item.title,
    addr1: item.addr1 ?? '',
    lat: Number(item.mapy),
    lng: Number(item.mapx),
    image: imageOf(item),
    cpyrhtDivCd: item.cpyrhtDivCd ?? '',
    cat1: item.cat1 ?? '',
    cat2: item.cat2 ?? '',
    cat3: item.cat3 ?? '',
    lclsSystm1: item.lclsSystm1 ?? '',
    lclsSystm2: item.lclsSystm2 ?? '',
    lclsSystm3: item.lclsSystm3 ?? '',
    modifiedtime: item.modifiedtime ?? '',
    detail: detailed,
  };
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function writeJson(p, value) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, `${JSON.stringify(value, null, 1)}\n`);
  renameSync(`${p}.tmp`, p);
}

class StopError extends Error {}

/**
 * 한 번 돌린다. fetchJson(op, params) → 원문 JSON(실패면 throw). 돌려주는 값: { calls, stopped, message?, summary }.
 * stopped: 'done' | 'limit' | 'error'.
 */
export async function collect({ dir, fetchJson, now = () => new Date(), limit = DAY_LIMIT, types = LIST_TYPES, refresh = false }) {
  const rawDir = resolve(dir, 'raw');
  const logPath = resolve(rawDir, 'calls.log');
  mkdirSync(resolve(rawDir, 'detail'), { recursive: true });
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
        throw new Error(`${op} ${arg}: ${status} ${body?.response?.header?.resultMsg ?? ''}`.trim());
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
  const lists = new Map();
  try {
    for (const type of LIST_TYPES) {
      const path = resolve(rawDir, `list-${type}.json`);
      if (existsSync(path) && !refresh) {
        lists.set(type, readJson(path));
        continue;
      }
      const pages = [];
      let total = 0;
      for (let page = 1; page <= (pages.length ? pageCount(total) : 1); page++) {
        const body = await call('areaBasedList2', `${type}:${page}`, { contentTypeId: type, lDongRegnCd: 26, numOfRows: NUM_OF_ROWS, pageNo: page, arrange: 'A' });
        total = Number(body.response.body.totalCount);
        pages.push(body);
      }
      const list = { contenttypeid: type, lDongRegnCd: 26, fetchedAt: now().toISOString(), totalCount: total, pages };
      writeJson(path, list);
      lists.set(type, list);
    }
    for (const type of LIST_TYPES.filter((t) => types.includes(t))) {
      for (const item of lists.get(type).pages.flatMap(itemsOf).filter(inScope)) {
        const path = resolve(rawDir, 'detail', `${item.contentid}.json`);
        if (!needsDetail(item, existsSync(path) ? readJson(path) : null)) continue;
        const body = await call('detailCommon2', String(item.contentid), { contentId: item.contentid });
        writeJson(path, { contentid: String(item.contentid), modifiedtime: item.modifiedtime, fetchedAt: now().toISOString(), body });
      }
    }
  } catch (e) {
    stopped = e instanceof StopError ? 'limit' : 'error';
    message = e.message;
  }

  const summary = writeScope(dir, lists);
  return { calls, stopped, message, summary };
}

function writeScope(dir, lists) {
  const rawDir = resolve(dir, 'raw');
  const places = [];
  const counts = {};
  for (const type of LIST_TYPES) {
    const list = lists.get(type) ?? (existsSync(resolve(rawDir, `list-${type}.json`)) ? readJson(resolve(rawDir, `list-${type}.json`)) : null);
    if (!list) continue;
    const items = list.pages.flatMap(itemsOf);
    const kept = items.filter(inScope).map((item) => {
      const path = resolve(rawDir, 'detail', `${item.contentid}.json`);
      return scopeRecord(item, existsSync(path) && !needsDetail(item, readJson(path)));
    });
    counts[type] = { listed: items.length, totalCount: list.totalCount, inScope: kept.length, detailed: kept.filter((p) => p.detail).length };
    places.push(...kept);
  }
  const summary = { source: 'TourAPI KorService2 areaBasedList2 · detailCommon2, lDongRegnCd=26', counts, places: places.length, detailed: places.filter((p) => p.detail).length };
  writeJson(resolve(dir, 'scope.json'), { ...summary, items: places });
  return summary;
}

function env(key) {
  for (const line of readFileSync(resolve(webRoot, '../../.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

/** 실제 TourAPI. 키는 주소에만 들어가고 오류 글에서는 지운다. */
export function tourApi(key) {
  const encoded = /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
  const scrub = (s) => String(s).split(key).join('<key>').split(encoded).join('<key>');
  return async (op, params) => {
    const q = new URLSearchParams({ MobileOS: 'ETC', MobileApp: 'yeochana', _type: 'json', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    let res;
    try {
      res = await fetch(`${BASE}/${op}?serviceKey=${encoded}&${q}`);
    } catch (e) {
      throw new Error(scrub(`${op}: network ${e.message}`));
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(scrub(`${op}: HTTP ${res.status}, JSON 아님: ${text.slice(0, 200)}`));
    }
  };
}

async function checkHttps(dir) {
  const scope = readJson(resolve(dir, 'scope.json'));
  const withImage = scope.items.filter((p) => p.image);
  const step = Math.max(1, Math.floor(withImage.length / 8));
  const sample = withImage.filter((_, i) => i % step === 0).slice(0, 8);
  const rows = [];
  for (const p of sample) {
    let status;
    try {
      const res = await fetch(p.image, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      status = res.status;
      await res.body?.cancel();
    } catch (e) {
      status = `network ${e.message}`;
    }
    rows.push({ id: p.id, image: p.image, status });
  }
  writeJson(resolve(dir, 'raw/https-check.json'), { checkedAt: new Date().toISOString(), rows });
  return rows;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = resolve(webRoot, 'review/busan');
  if (args.includes('--check-https')) {
    for (const r of await checkHttps(dir)) console.log(`${r.status}\t${r.id}`);
  } else {
    const key = env('DATA_GO_KR_SERVICE_KEY');
    if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY missing in the repo-root .env');
    const typesArg = args.find((a) => a.startsWith('--types='));
    const types = typesArg ? typesArg.slice(8).split(',').map(Number) : LIST_TYPES;
    const r = await collect({ dir, fetchJson: tourApi(key), types, refresh: args.includes('--refresh') });
    console.log(JSON.stringify({ calls: r.calls, stopped: r.stopped, message: r.message, ...r.summary }, null, 1));
    if (r.stopped === 'error') process.exitCode = 1;
  }
}
