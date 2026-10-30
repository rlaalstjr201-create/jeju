/**
 * 큐레이팅 목적지 상세 수집 (plans/nationwide.md C1, ADR-0095 모델): 전국 범위 파일의 범위 안 곳마다 detailCommon2 1회.
 *
 * - 목록 호출은 없다. review/nation/scope-<시도>.json(범위 안 줄인 레코드)에서 도시를 골라 상세만 받는다.
 * - 목적지(DESTS): gangwon = 강원 51의 강릉 150·속초 210·양양 830·춘천 110·평창 760(이 순서),
 *   seoul = 서울 11 전체(시군구 코드 순). 목적지 순서는 gangwon -> seoul.
 * - 원문은 review/<dest>/raw/detail/<contentid>.json(커밋한다, 부산과 같은 모양). 같은 modifiedtime으로 받은 곳은 건너뛴다.
 * - 호출은 KST 날짜별로 review/curated/calls.log(커밋, 주소·키 없음)에 한 줄씩 센다. 하루 한도 900회는
 *   부산 raw/calls.log + 전국 calls.log + 이 로그를 합산하며, 닿으면 스스로 멈춘다. 다음 날 같은 명령으로 이어 간다.
 * - 실패(resultCode가 0000이 아님·네트워크)는 로그에 남기고 한 번만 다시 시도한다. 또 실패하면 그 곳은 다음 실행으로 남기고
 *   다음 곳으로 간다. 연달아 5곳이 실패하면 장애로 보고 멈춘다.
 * - 끝나면 review/<dest>/scope.json(부산 scope.json과 같은 모양, 곳마다 detail 여부)과 review/curated/progress.json을 다시 쓴다.
 * - id는 전국 층과 맞추려고 부산의 bs-가 아니라 `nt-<contentid>`를 쓴다(전국 scope 레코드의 id를 그대로 가져옴).
 *
 * 키는 환경 변수 또는 저장소 루트 .env의 DATA_GO_KR_SERVICE_KEY, 있으면 _2(다른 포털 계정 키, 제 한도·calls-2.log)로
 * 첫 키가 한도에 닿은 뒤 이어 간다. 출력·로그·파일 어디에도 키를 남기지 않는다.
 *
 *   node scripts/curated/collect.mjs
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_LIMIT, callsOn, itemsOf, kstDay, needsDetail, tourApi } from '../busan/collect.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');

/** 목적지 설정. cities가 없으면 그 시도의 모든 시군구(코드 순). */
export const DESTS = [
  {
    dest: 'gangwon',
    sido: 51,
    cities: [
      { code: '150', name: '강릉' },
      { code: '210', name: '속초' },
      { code: '830', name: '양양' },
      { code: '110', name: '춘천' },
      { code: '760', name: '평창' },
    ],
  },
  { dest: 'seoul', sido: 11, cities: null },
];
export { DAY_LIMIT };
export const MAX_CONSECUTIVE_FAILS = 5;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function writeAtomic(p, text) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, text);
  renameSync(`${p}.tmp`, p);
}
const writeJson = (p, value) => writeAtomic(p, `${JSON.stringify(value, null, 1)}\n`);

/** 하루 호출 수: 주어진 로그들의 합. */
export function usedOn(day, logs) {
  let n = 0;
  for (const p of logs) if (p && existsSync(p)) n += callsOn(readFileSync(p, 'utf8'), day);
  return n;
}

/** 전국 scope 파일에서 목적지의 도시별 레코드. 반환: [{ code, name, items }] (수집 순서). */
export function citiesOf(cfg, nationDir) {
  const path = resolve(nationDir, `scope-${cfg.sido}.json`);
  if (!existsSync(path)) return [];
  const items = readJson(path).items;
  const by = new Map();
  for (const it of items) {
    const c = String(it.lDongSignguCd);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(it);
  }
  const cities = cfg.cities ?? [...by.keys()].sort().map((code) => ({ code, name: code }));
  return cities.map((c) => ({ ...c, items: by.get(c.code) ?? [] }));
}

const detailPath = (outDir, dest, id) => resolve(outDir, dest, 'raw', 'detail', `${id}.json`);
const contentidOf = (rec) => rec.id.replace(/^nt-/, '');
const isDetailed = (outDir, dest, rec) => {
  const p = detailPath(outDir, dest, contentidOf(rec));
  return existsSync(p) && !needsDetail(rec, readJson(p));
};

class StopError extends Error {}

/**
 * 한 번 돌린다. fetchJson(op, params) -> 원문 JSON(실패면 throw).
 * outDir: review 폴더, nationDir: review/nation, otherLogs: 합산할 다른 로그 경로들(부산·전국).
 * stopped: 'done' | 'limit' | 'error'.
 */
export async function collect({ outDir, nationDir, fetchJson, otherLogs = [], now = () => new Date(), limit = DAY_LIMIT, dests = DESTS, logName = 'calls.log' }) {
  const curatedDir = resolve(outDir, 'curated');
  const ownLog = resolve(curatedDir, logName);
  mkdirSync(curatedDir, { recursive: true });
  const logs = [...otherLogs, ownLog];
  let calls = 0;

  async function call(op, arg, params) {
    const day = kstDay(now());
    const used = usedOn(day, logs);
    if (used >= limit) throw new StopError(`KST ${day} 호출 ${used}회 - ${limit}회 한도에서 멈춤`);
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
      appendFileSync(ownLog, `${day}\t${now().toISOString().slice(11, 19)}Z\t${op}\t${arg}\t${status}\n`);
    }
  }

  const plan = dests.map((cfg) => ({ cfg, cities: citiesOf(cfg, nationDir) }));
  const errors = [];
  let stopped = 'done';
  let message;
  let consecutive = 0;
  try {
    for (const { cfg, cities } of plan) {
      for (const city of cities) {
        for (const rec of city.items) {
          if (isDetailed(outDir, cfg.dest, rec)) continue;
          const id = contentidOf(rec);
          let body = null;
          for (let attempt = 0; attempt < 2 && !body; attempt++) {
            try {
              body = await call('detailCommon2', id, { contentId: id });
            } catch (e) {
              if (e instanceof StopError) throw e;
              if (attempt === 1) errors.push(e.message);
            }
          }
          if (!body) {
            if (++consecutive >= MAX_CONSECUTIVE_FAILS) throw new Error(`연달아 ${consecutive}곳 실패 - 장애로 보고 멈춤`);
            continue;
          }
          consecutive = 0;
          writeJson(detailPath(outDir, cfg.dest, id), { contentid: id, modifiedtime: rec.modifiedtime, fetchedAt: now().toISOString(), body });
        }
      }
    }
  } catch (e) {
    stopped = e instanceof StopError ? 'limit' : 'error';
    message = e.message;
  }

  const summary = writeOutputs({ outDir, plan, logs, now, calls });
  return { calls, stopped, message, errors, summary };
}

/** scope.json(곳마다 detail 여부) + progress.json. */
function writeOutputs({ outDir, plan, logs, now, calls }) {
  const progress = {};
  for (const { cfg, cities } of plan) {
    const places = [];
    const perCity = {};
    for (const city of cities) {
      let detailed = 0;
      for (const rec of city.items) {
        const done = isDetailed(outDir, cfg.dest, rec);
        if (done) detailed += 1;
        const cpyrht = done ? (itemsOf(readJson(detailPath(outDir, cfg.dest, contentidOf(rec))).body)[0]?.cpyrhtDivCd ?? '') : '';
        places.push({ ...rec, city: city.name, cpyrhtDivCd: cpyrht, detail: done });
      }
      perCity[`${city.code} ${city.name}`] = { inScope: city.items.length, detailed, remaining: city.items.length - detailed };
    }
    const counts = {};
    for (const p of places) {
      const c = (counts[p.contenttypeid] ??= { inScope: 0, detailed: 0 });
      c.inScope += 1;
      if (p.detail) c.detailed += 1;
    }
    const detailed = places.filter((p) => p.detail).length;
    progress[cfg.dest] = { lDongRegnCd: cfg.sido, inScope: places.length, detailed, remaining: places.length - detailed, cities: perCity };
    const header = {
      source: `TourAPI KorService2 detailCommon2, lDongRegnCd=${cfg.sido} (목록은 review/nation/scope-${cfg.sido}.json, id는 전국 층과 같은 nt-<contentid>)`,
      counts,
      places: places.length,
      detailed,
    };
    const head = JSON.stringify(header).slice(0, -1);
    writeAtomic(resolve(outDir, cfg.dest, 'scope.json'), `${head},"items":[\n${places.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`);
  }
  const day = kstDay(now());
  writeJson(resolve(outDir, 'curated', 'progress.json'), { updatedAt: now().toISOString(), kstDay: day, callsThisRun: calls, callsToday: usedOn(day, logs), dests: progress });
  return progress;
}

/** 환경 변수(클라우드 예약 작업) 먼저, 없으면 저장소 루트 .env. */
function env(key) {
  if (process.env[key]) return process.env[key].trim();
  const path = resolve(webRoot, '../../.env');
  if (!existsSync(path)) return '';
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(webRoot, 'review');
  // 키마다 하루 한도가 따로다. 첫 키는 부산·전국 로그와 합산하고, 둘째 키(다른 포털 계정)는 제 로그만 센다.
  const KEYS = [
    { name: 'DATA_GO_KR_SERVICE_KEY', logName: 'calls.log', otherLogs: [resolve(outDir, 'busan/raw/calls.log'), resolve(outDir, 'nation/calls.log')] },
    { name: 'DATA_GO_KR_SERVICE_KEY_2', logName: 'calls-2.log', otherLogs: [] },
  ];
  if (!env(KEYS[0].name)) throw new Error('DATA_GO_KR_SERVICE_KEY missing (env or repo-root .env)');
  for (const k of KEYS) {
    const key = env(k.name);
    if (!key) continue;
    const r = await collect({ outDir, nationDir: resolve(outDir, 'nation'), fetchJson: tourApi(key), otherLogs: k.otherLogs, logName: k.logName });
    console.log(JSON.stringify({ key: k.name, calls: r.calls, stopped: r.stopped, message: r.message, errors: r.errors, dests: r.summary }, null, 1));
    if (r.stopped === 'error') process.exitCode = 1;
    if (r.stopped !== 'limit') break;
  }
}
