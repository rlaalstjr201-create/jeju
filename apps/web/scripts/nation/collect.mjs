/**
 * 전국 목록 수집 (plans/nationwide.md N1, ADR-0095 모델): TourAPI 국문 KorService2 areaBasedList2 목록만(상세 없음).
 *
 * - 시도 12곳(부산 26·제주 50은 큐레이팅 층이라 건너뜀) x 종류 5개(12·14·28·38·39), numOfRows=1000, totalCount로 쪽을 넘긴다.
 * - 원문은 review/nation/raw/list-<시도>-<종류>.json(gitignore). 이미 있으면 건너뛴다(--refresh 때만 다시).
 * - 호출은 KST 날짜별로 raw/calls.log와 커밋하는 review/nation/calls.log에 한 줄씩(주소·키 없이) 센다.
 *   하루 한도 900회는 부산 raw/calls.log와 합산하며, 닿으면 스스로 멈춘다. 실패하면 다시 시도하지 않고 멈춘다.
 * - 끝나면 raw-manifest.json(해시·수), scope-<시도>.json(범위 안 줄인 레코드), categories.json을 다시 쓴다.
 *
 * 키는 저장소 루트 .env의 DATA_GO_KR_SERVICE_KEY. 출력·로그·파일 어디에도 남기지 않는다.
 *
 *   node scripts/nation/collect.mjs [--refresh]
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_LIMIT, NUM_OF_ROWS, callsOn, imageOf, inScope, itemsOf, kstDay, pageCount, tourApi } from '../busan/collect.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');

export const SIDOS = [11, 27, 28, 30, 31, 36110, 41, 43, 44, 47, 48, 12];
export const SKIPPED_SIDOS = [26, 50];
export const LIST_TYPES = [12, 14, 28, 38, 39];
export { DAY_LIMIT, NUM_OF_ROWS };

export const spotId = (item) => `nt-${item.contentid}`;

/** scope-<시도>.json 한 줄. */
export function scopeRecord(item, sido) {
  const rec = {
    id: spotId(item),
    title: item.title,
    addr1: item.addr1 ?? '',
    lDongRegnCd: String(item.lDongRegnCd ?? sido),
    lDongSignguCd: String(item.lDongSignguCd ?? ''),
    lat: Number(item.mapy),
    lng: Number(item.mapx),
    contenttypeid: Number(item.contenttypeid),
    lclsSystm1: item.lclsSystm1 ?? '',
    lclsSystm2: item.lclsSystm2 ?? '',
    lclsSystm3: item.lclsSystm3 ?? '',
  };
  for (const k of ['cat1', 'cat2', 'cat3']) if (item[k]) rec[k] = item[k];
  rec.image = imageOf(item);
  rec.modifiedtime = item.modifiedtime ?? '';
  return rec;
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function writeAtomic(p, text) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, text);
  renameSync(`${p}.tmp`, p);
}
const writeJson = (p, value) => writeAtomic(p, `${JSON.stringify(value, null, 1)}\n`);

class StopError extends Error {}

/** 하루 호출 수: 부산 raw/calls.log + 전국 review/nation/calls.log. */
export function usedOn(day, { busanLog, nationLog }) {
  let n = 0;
  for (const p of [busanLog, nationLog]) if (p && existsSync(p)) n += callsOn(readFileSync(p, 'utf8'), day);
  return n;
}

/**
 * 한 번 돌린다. fetchJson(op, params) → 원문 JSON(실패면 throw).
 * busanLog: 합산할 부산 calls.log 경로(없으면 무시). stopped: 'done' | 'limit' | 'error'.
 */
export async function collect({ dir, fetchJson, busanLog, now = () => new Date(), limit = DAY_LIMIT, sidos = SIDOS, types = LIST_TYPES, refresh = false }) {
  const rawDir = resolve(dir, 'raw');
  const rawLog = resolve(rawDir, 'calls.log');
  const nationLog = resolve(dir, 'calls.log');
  mkdirSync(rawDir, { recursive: true });
  let calls = 0;

  async function call(op, arg, params) {
    const day = kstDay(now());
    const used = usedOn(day, { busanLog, nationLog });
    if (used >= limit) throw new StopError(`KST ${day} 호출 ${used}회 — ${limit}회 한도에서 멈춤`);
    let status = 'ok';
    try {
      const body = await fetchJson(op, params);
      const code = body?.response?.header?.resultCode;
      if (code !== '0000') {
        status = `resultCode ${code ?? '?'}`;
        throw new Error(`${op} ${arg}: ${status} ${body?.response?.header?.resultMsg ?? JSON.stringify(body).slice(0, 200)}`.trim());
      }
      return body;
    } catch (e) {
      if (status === 'ok') status = 'error';
      throw e;
    } finally {
      calls += 1;
      const t = now();
      const line = `${day}\t${t.toISOString().slice(11, 19)}Z\t${op}\t${arg}\t${status}\n`;
      appendFileSync(rawLog, line);
      appendFileSync(nationLog, line);
    }
  }

  let stopped = 'done';
  let message;
  try {
    for (const sido of sidos) {
      for (const type of types) {
        const path = resolve(rawDir, `list-${sido}-${type}.json`);
        if (existsSync(path) && !refresh) continue;
        const pages = [];
        let total = 0;
        for (let page = 1; page <= (pages.length ? pageCount(total) : 1); page++) {
          const body = await call('areaBasedList2', `${sido}:${type}:${page}`, { contentTypeId: type, lDongRegnCd: sido, numOfRows: NUM_OF_ROWS, pageNo: page, arrange: 'A' });
          total = Number(body.response.body.totalCount);
          pages.push(body);
        }
        writeJson(path, { lDongRegnCd: sido, contenttypeid: type, fetchedAt: now().toISOString(), totalCount: total, pages });
      }
    }
    // 분류 이름표: lclsSystmListYn=Y 한 번에 전체 목록.
    const lclsPath = resolve(rawDir, 'lcls-names.json');
    if (!existsSync(lclsPath) || refresh) {
      const body = await call('lclsSystmCode2', 'all', { lclsSystmListYn: 'Y', numOfRows: NUM_OF_ROWS, pageNo: 1 });
      writeJson(lclsPath, { fetchedAt: now().toISOString(), body });
    }
  } catch (e) {
    stopped = e instanceof StopError ? 'limit' : 'error';
    message = e.message;
  }

  const summary = writeOutputs(dir, sidos, types);
  return { calls, stopped, message, summary };
}

/** 분류 이름표 → { 코드: 이름 }. */
export function lclsNames(body) {
  const names = {};
  for (const it of itemsOf(body)) {
    for (const [c, n] of [
      [it.lclsSystm1Cd, it.lclsSystm1Nm],
      [it.lclsSystm2Cd, it.lclsSystm2Nm],
      [it.lclsSystm3Cd, it.lclsSystm3Nm],
      [it.code, it.name],
    ]) if (c && n) names[c] = n;
  }
  return names;
}

function writeOutputs(dir, sidos, types) {
  const rawDir = resolve(dir, 'raw');
  const manifest = [];
  const summary = {};
  const freq = { lclsSystm1: {}, lclsSystm2: {}, lclsSystm3: {} };
  const bump = (level, code, type) => {
    if (!code) return;
    const row = (freq[level][code] ??= { total: 0, byType: {} });
    row.total += 1;
    row.byType[type] = (row.byType[type] ?? 0) + 1;
  };
  for (const sido of sidos) {
    const kept = [];
    const counts = {};
    let fetchedAt = '';
    for (const type of types) {
      const path = resolve(rawDir, `list-${sido}-${type}.json`);
      if (!existsSync(path)) continue;
      const list = readJson(path);
      const items = list.pages.flatMap(itemsOf);
      const inn = items.filter(inScope);
      counts[type] = { listed: items.length, totalCount: list.totalCount, inScope: inn.length };
      manifest.push({ file: `list-${sido}-${type}.json`, sha256: sha256(path), lDongRegnCd: sido, contenttypeid: type, fetchedAt: list.fetchedAt, pages: list.pages.length, totalCount: list.totalCount, items: items.length });
      if (list.fetchedAt > fetchedAt) fetchedAt = list.fetchedAt;
      for (const item of inn) {
        kept.push(scopeRecord(item, sido));
        const t = Number(item.contenttypeid);
        bump('lclsSystm1', item.lclsSystm1, t);
        bump('lclsSystm2', item.lclsSystm2, t);
        bump('lclsSystm3', item.lclsSystm3, t);
      }
    }
    if (!kept.length) continue;
    const header = { source: 'TourAPI KorService2 areaBasedList2 (목록만)', lDongRegnCd: String(sido), fetchedAt, counts, total: kept.length };
    const head = JSON.stringify(header).slice(0, -1);
    writeAtomic(resolve(dir, `scope-${sido}.json`), `${head},"items":[\n${kept.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
    summary[sido] = kept.length;
  }
  const lclsPath = resolve(rawDir, 'lcls-names.json');
  if (existsSync(lclsPath)) {
    manifest.push({ file: 'lcls-names.json', sha256: sha256(lclsPath), fetchedAt: readJson(lclsPath).fetchedAt });
  }
  const names = existsSync(lclsPath) ? lclsNames(readJson(lclsPath).body) : {};
  const sorted = (level) => Object.fromEntries(Object.entries(freq[level]).sort((a, b) => b[1].total - a[1].total).map(([c, v]) => [c, { name: names[c] ?? '', ...v }]));
  writeJson(resolve(dir, 'categories.json'), {
    source: 'review/nation/scope-*.json 범위 안 전체 + TourAPI lclsSystmCode2 이름표',
    namesAvailable: Object.keys(names).length,
    lclsSystm1: sorted('lclsSystm1'),
    lclsSystm2: sorted('lclsSystm2'),
    lclsSystm3: sorted('lclsSystm3'),
  });
  writeJson(resolve(dir, 'raw-manifest.json'), { note: 'raw/는 gitignore. 파일별 sha256과 수만 기록.', files: manifest });
  return summary;
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
  const dir = resolve(webRoot, 'review/nation');
  const r = await collect({ dir, fetchJson: tourApi(key), busanLog: resolve(webRoot, 'review/busan/raw/calls.log'), refresh: process.argv.includes('--refresh') });
  console.log(JSON.stringify({ calls: r.calls, stopped: r.stopped, message: r.message, scope: r.summary }, null, 1));
  if (r.stopped === 'error') process.exitCode = 1;
}
