/**
 * 큐레이팅 도시 검색수 측정 S4 (부산 scripts/busan/measure.mjs의 도시 인자판, 사전등록 review/<dest>/pop-criteria.md).
 *
 *   node scripts/curated/measure.mjs gangwon 강릉 --plan   keep 곳의 키워드(규칙대로) → review/gangwon/pop-강릉-01-plan.json (호출 없음)
 *   node scripts/curated/measure.mjs gangwon 강릉          네이버 검색광고 keywordstool로 한 번 잰다 → review/gangwon/pop-강릉-01.json
 *
 * 부산 규칙 그대로(K1~K5, 5개씩 묶음, 0.5초, 재시도 두 번, 「< 10」=5). 바뀐 것은 도시 이름뿐이다: 「부산」+이름 자리가 「도시」+이름,
 * 이름 끝 「(부산)」이 「(도시)」, K2의 앞 「부산」이 「도시」·「도시시」, 뺄 말(BROAD)이 도시별 표. 측정은 한 번이다: pop-<도시>-01.json이
 * 있으면 멈춘다. 중간에 끊기면 같은 실행의 이어 하기(--resume: 이미 받은 호출 묶음은 다시 부르지 않음)만 쓴다. 키는 저장소 루트
 * .env의 NAVER_AD_*이고 출력·파일 어디에도 남기지 않는다. 부산 파일은 고치지 않는다.
 *
 *   node scripts/curated/measure.mjs gangwon 양양 --add   판정 회차가 바뀌어 keep이 달라졌을 때(criteria-03.md 6절), 계획에서 키워드가
 *                                                          pop-<도시>-01.json과 다른 곳만 한 번 잰다 → pop-<도시>-01-add.json(있으면 멈춘다)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, keywordstool, volume03 } from '../famous-measure.mjs';
import { BATCH, FOOD_TYPE, GAP_MS, SUFFIX, callWithRetry, mainOf, placeVolume, squash } from '../busan/measure.mjs';
import { cityHeads, cityMark, cityWord, judgeRound } from './rounds.mjs';

export { BATCH, GAP_MS, placeVolume, callWithRetry };
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** pop-criteria.md 3절: 재지 않는 변형(K2~K5)의 도시별 표. 측정 전에 고정한다. */
export const BROAD = {
  강릉: new Set([
    // 동네·해변·산 이름 (그 이름의 검색은 동네·지역 전체에 관한 것)
    '경포', '주문진', '안목', '사천', '사천진', '강문', '연곡', '옥계', '송정', '안인', '영진', '등명', '사근진', '순포', '소돌', '향호',
    '순긋', '염전', '금진', '도직', '남항진', '임해', '대관령', '국립대관령', '구룡',
    // 흔한 낱말·다른 도시에도 있는 이름
    '중앙시장', '동부시장', '남산공원', '한우타운', '빵명장', '메타버스체험관', '31운동기념공원', '철새도래지', '버스정류장', '홍게무한리필', '솔향', '강릉솔향', '두티',
  ]),
  // pop-criteria.md 10절 (2026-10-30, 측정 전 고정)
  속초: new Set([
    // 도시·동네·산 이름
    '속초', '설악산', '외설악', '청호', '외옹치',
    // 흔한 낱말·다른 도시에도 있는 이름
    '등대', '노리', '비룡', '천당', '범바위', '엑스포타워',
  ]),
  춘천: new Set([
    // 동네·산·절 이름(그 이름의 검색은 산·절 전체에 관한 것)
    '삼악산', '용화산', '국립용화산', '청평사', '강원',
    // 흔한 낱말·다른 도시에도 있는 이름
    '구성', '구곡', '중앙시장', '동부시장', '풍물시장', '7일', '수변공원', '자전거길', 'PIZZAPASTA', 'HWR',
  ]),
  // pop-criteria.md 11절 (2026-10-31, 양양 02 감사 통과 뒤, 측정 전 고정)
  양양: new Set([
    // 동네·해변·산·계곡 이름(그 이름의 검색은 동네·지역 전체에 관한 것)
    '남설악', '낙산', '송전', '죽도', '정암', '물치', '인구', '설악', '기사문', '잔교리', '동산', '동산포', '광진', '원포리', '갯마을',
    '남애1리', '북분리', '중광정', '둔전', '공수전', '법수치', '어성전', '미천골', '국립미천골', '양양지경리', '양양동호',
    // 흔한 낱말·다른 도시에도 있는 이름
    '강원', '9일', '에너지팜',
  ]),
  // pop-criteria.md 13절 (2026-10-31, 평창 04 감사 통과 뒤, 측정 전 고정)
  평창: new Set([
    // 동네·산·계곡 이름(그 이름의 검색은 마을·지역 전체에 관한 것)
    '평창', '평창수하', '오대산', '용평', '뇌운', '금당', '흥정', '장전', '막동', '수항', '원당', '두타산', '국립두타산',
    // 흔한 낱말·다른 도시에도 있는 이름
    '7일', '강원고생대국가지질공원', '한국자생', '국립한국자생', '바위공원', '평화길', '남산둘레길', '라벤다팜',
  ]),
  // review/seoul/pop-criteria.md 3절 (2026-10-31, 서울 판정 전 고정 — 구 코드가 도시 칸이다)
  110: new Set(['외국어사이트용', '선암', '수성동', '어린이과학관', '낙지볶음골목']),
  140: new Set(['중앙시장', '평화시장', '일본군위안부', '남산자락', 'THEROOF']),
  170: new Set(['남산야외', 'GONGI']),
  200: new Set(['서울숲곤충']),
  215: new Set(['실외', '워커힐', '중국음식문화거리', '긴고랑']),
  230: new Set(['이진', '산림과학원', '약령시장']),
  260: new Set([]),
};

const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
const len = (s) => [...s].length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** pop-criteria.md 2절 K1: 카드 이름. 이름 끝 「(도시)」, 세 글자 이하 음식점은 「도시」 + 이름. 서울 구(rounds.mjs)는 표시가 「(서울)」 →
 * 「서울」 + 이름, 짧은 음식점은 구 낱말(「종로」) + 이름(review/seoul/pop-criteria.md 2절). 강원은 둘 다 도시 이름이라 그대로다. */
export function keyword1(place, city) {
  const name = cleanName(place.title);
  const main = squash(mainOf(name));
  const mark = cityMark(city);
  const word = cityWord(city);
  if (new RegExp(`\\(${esc(mark)}\\)\\s*$`).test(name)) return { k: `${mark}${main}`, why: `이름 끝 「(${mark})」: 다른 지역에 같은 이름이 있음 → ${mark} + 이름` };
  if (place.contenttypeid === FOOD_TYPE && len(main) <= 3) return { k: `${word}${main}`, why: `세 글자 이하 음식점 이름(흔한 가게 이름) → ${word} + 이름` };
  return { k: main, why: '카드 이름' };
}

/** pop-criteria.md 2절: 한 곳의 모든 키워드(첫째가 K1). 중복·BROAD·다른 곳의 K1 제외. */
export function keywordsOf(place, city, otherK1 = new Set()) {
  const broad = BROAD[city] ?? new Set();
  const name = cleanName(place.title);
  const main = mainOf(name);
  const k1 = keyword1(place, city);
  const out = [k1];
  const add = (raw, why) => {
    const k = squash(raw);
    if (len(k) >= 2 && !broad.has(k) && !otherK1.has(k) && !out.some((x) => x.k === k)) out.push({ k, why });
  };
  const word = cityWord(city);
  const head = new RegExp(`^(${cityHeads(city).map(esc).join('|')})\\s+`);
  let p = main;
  for (;;) {
    const next = p.replace(head, '').replace(/^국립/, '');
    if (next === p || len(squash(next)) < 3) break;
    p = next;
    add(p, `앞의 「${word}」·「국립」을 뗀 이름`);
  }
  const paren = /\(([^)]*)\)\s*$/.exec(name)?.[1];
  if (paren && !new RegExp(`${[...new Set([city, cityMark(city), word])].map(esc).join('|')}|~`).test(paren)) for (const a of paren.split(',')) add(a, '이름 괄호 안의 다른 이름');
  if (place.contenttypeid === FOOD_TYPE) {
    const words = main.split(' ');
    const base = words.length > 1 && words.at(-1).endsWith('본점') ? words.slice(0, -1).join(' ') : main.endsWith('본점') ? main.slice(0, -2) : null;
    if (base !== null && len(squash(base)) >= 2) {
      const b = squash(base);
      if (len(b) <= 3) add(`${word}${b}`, `「본점」을 뗀 이름(세 글자 이하 → ${word} + 이름)`);
      else add(b, '「본점」을 뗀 이름');
    }
  }
  if (place.contenttypeid !== FOOD_TYPE) for (const { k } of [...out]) {
    const s = SUFFIX.find((x) => k.endsWith(x) && len(k) - len(x) >= 2);
    if (s) add(k.slice(0, -s.length), `끝의 「${s}」를 뗀 짧은 이름`);
  }
  return out;
}

/** pop-criteria.md 1절: 도시의 keep 곳 전부, id 순. */
export function targets(dir, city) {
  const verdicts = new Map();
  const judgeDir = resolve(dir, `judge-${city}-${judgeRound(city)}`);
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of JSON.parse(readFileSync(resolve(judgeDir, f), 'utf8'))) verdicts.set(v.id, v);
  }
  return JSON.parse(readFileSync(resolve(dir, 'scope.json'), 'utf8'))
    .items.filter((it) => it.city === city && verdicts.get(it.id)?.keep === true)
    .map((it) => ({ id: it.id, title: it.title, contenttypeid: it.contenttypeid, mood: verdicts.get(it.id).mood }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 키워드 계획: [{ id, name, keywords: [{ keyword, why }] }]. */
export function plan(list, city) {
  const k1 = list.map((p) => keyword1(p, city).k);
  return list.map((p, i) => {
    const others = new Set(k1.filter((_, j) => j !== i));
    return { id: p.id, name: cleanName(p.title), keywords: keywordsOf(p, city, others).map(({ k, why }) => ({ keyword: k, why })) };
  });
}

async function measure(dir, city, resume) {
  const criteria = `review/${basename(dir)}/pop-criteria.md`;
  const out = resolve(dir, `pop-${city}-01.json`);
  const partial = resolve(dir, `pop-${city}-01.partial.json`);
  if (existsSync(out)) throw new Error(`${out} exists — the measurement runs once (re-running needs the owner's approval)`);
  if (existsSync(partial) && !resume) throw new Error(`${partial} exists — a run was cut off; continue the same run with --resume`);
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing in the repo-root .env');
  const committed = JSON.parse(readFileSync(resolve(dir, `pop-${city}-01-plan.json`), 'utf8'));
  const rows = plan(targets(dir, city), city);
  if (JSON.stringify(rows) !== JSON.stringify(committed.rows)) throw new Error('the plan file is not what the rules make now — the plan is fixed before measuring');
  const all = [...new Set(rows.flatMap((r) => r.keywords.map((x) => x.keyword)))].sort();
  // 이어 하기: 답을 받은 묶음(또는 재시도 상한까지 쓴 묶음)만 다시 부르지 않는다
  const finalCall = (c) => c.hasRows || (typeof c.status === 'number' && c.status !== 429 && c.status < 500) || c.tries > 2;
  const calls = existsSync(partial) ? JSON.parse(readFileSync(partial, 'utf8')).calls.filter(finalCall) : [];
  const found = new Map();
  const doneBatches = new Set(calls.map((c) => c.batch.join('|')));
  const save = () => writeFileSync(partial, `${JSON.stringify({ calls })}\n`);
  const note = (batch, r) => {
    const hits = batch.map((k) => r.rows?.find((x) => x.relKeyword.replace(/\s+/g, '') === k) ?? null);
    return { at: new Date().toISOString(), batch, status: r.status, tries: r.tries, raw: hits.filter(Boolean).map((h) => ({ relKeyword: h.relKeyword, monthlyPcQcCnt: h.monthlyPcQcCnt, monthlyMobileQcCnt: h.monthlyMobileQcCnt })), hasRows: Boolean(r.rows) };
  };
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    if (doneBatches.has(batch.join('|'))) continue;
    const r = await callWithRetry(batch, keys, keywordstool);
    calls.push(note(batch, r));
    save();
    process.stdout.write(`\r${calls.length}/${Math.ceil(all.length / BATCH)}`);
    await new Promise((ok) => setTimeout(ok, GAP_MS));
  }
  for (const c of calls) {
    for (const k of c.batch) {
      const hit = c.raw.find((x) => x.relKeyword.replace(/\s+/g, '') === k);
      found.set(k, hit ? { pc: hit.monthlyPcQcCnt, mobile: hit.monthlyMobileQcCnt, volume: volume03(hit) } : { volume: null, status: c.hasRows ? 'keyword missing from the response' : c.status });
    }
  }
  for (const row of rows) {
    for (const x of row.keywords) Object.assign(x, found.get(x.keyword));
    row.volume = placeVolume(row.keywords);
  }
  const failed = rows.filter((r) => r.volume === null).map((r) => r.id);
  const missingKeywords = rows.flatMap((r) => r.keywords.filter((x) => x.volume === null).map((x) => x.keyword));
  const failedCalls = calls.filter((c) => !c.raw.length && c.status !== 200).map(({ batch, status, tries }) => ({ batch, status, tries }));
  const totalTries = calls.reduce((n, c) => n + c.tries, 0);
  const callLog = calls.map(({ hasRows, ...c }) => c);
  writeFileSync(
    out,
    `${JSON.stringify({ round: '01', city, criteria, source: 'Naver 검색광고 keywordstool, showDetail=1', places: rows.length, keywords: all.length, calls: calls.length, tries: totalTries, failed, missingKeywords, failedCalls, rows, callLog }, null, 1)}\n`,
  );
  console.log(`\npop-${city}-01.json: ${rows.length} places, ${all.length} keywords, ${calls.length} calls (${totalTries} tries), 확인 실패 곳 ${failed.length}, 빠진 키워드 ${missingKeywords.length}`);
}

/** 새로 keep됐거나 키워드가 바뀐 곳만 한 번 잰다. 이미 잰 곳의 값은 pop-<도시>-01.json 그대로 둔다. */
async function measureAdd(dir, city) {
  const out = resolve(dir, `pop-${city}-01-add.json`);
  if (existsSync(out)) throw new Error(`${out} exists — the measurement runs once`);
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing in the repo-root .env');
  const committed = JSON.parse(readFileSync(resolve(dir, `pop-${city}-01-plan.json`), 'utf8'));
  const now = plan(targets(dir, city), city);
  if (JSON.stringify(now) !== JSON.stringify(committed.rows)) throw new Error('the plan file is not what the rules make now — the plan is fixed before measuring');
  const before = new Map(JSON.parse(readFileSync(resolve(dir, `pop-${city}-01.json`), 'utf8')).rows.map((r) => [r.id, r.keywords.map((x) => x.keyword).join('|')]));
  const rows = now.filter((r) => before.get(r.id) !== r.keywords.map((x) => x.keyword).join('|'));
  const all = [...new Set(rows.flatMap((r) => r.keywords.map((x) => x.keyword)))].sort();
  const calls = [];
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const r = await callWithRetry(batch, keys, keywordstool);
    const hits = batch.map((k) => r.rows?.find((x) => x.relKeyword.replace(/\s+/g, '') === k) ?? null);
    calls.push({ at: new Date().toISOString(), batch, status: r.status, tries: r.tries, raw: hits.filter(Boolean).map((h) => ({ relKeyword: h.relKeyword, monthlyPcQcCnt: h.monthlyPcQcCnt, monthlyMobileQcCnt: h.monthlyMobileQcCnt })) });
    await new Promise((ok) => setTimeout(ok, GAP_MS));
  }
  for (const row of rows) {
    for (const x of row.keywords) {
      const hit = calls.flatMap((c) => c.raw).find((h) => h.relKeyword.replace(/\s+/g, '') === x.keyword);
      Object.assign(x, hit ? { pc: hit.monthlyPcQcCnt, mobile: hit.monthlyMobileQcCnt, volume: volume03(hit) } : { volume: null });
    }
    row.volume = placeVolume(row.keywords);
  }
  const failed = rows.filter((r) => r.volume === null).map((r) => r.id);
  writeFileSync(out, `${JSON.stringify({ round: '01-add', city, criteria: 'review/gangwon/pop-criteria.md', source: 'Naver 검색광고 keywordstool, showDetail=1', places: rows.length, keywords: all.length, calls: calls.length, failed, rows, callLog: calls }, null, 1)}\n`);
  console.log(`pop-${city}-01-add.json: ${rows.length} places, ${all.length} keywords, ${calls.length} calls, 확인 실패 곳 ${failed.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dest, city] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!dest || !city) throw new Error('usage: node scripts/curated/measure.mjs <dest> <city> [--plan|--resume]');
  const dir = resolve(webRoot, 'review', dest);
  if (process.argv.includes('--plan')) {
    const rows = plan(targets(dir, city), city);
    const n = new Set(rows.flatMap((r) => r.keywords.map((x) => x.keyword))).size;
    writeFileSync(resolve(dir, `pop-${city}-01-plan.json`), `${JSON.stringify({ criteria: `review/${basename(dir)}/pop-criteria.md`, city, places: rows.length, keywords: n, calls: Math.ceil(n / BATCH), rows }, null, 1)}\n`);
    console.log(`pop-${city}-01-plan.json: ${rows.length} places, ${n} keywords, ${Math.ceil(n / BATCH)} calls`);
  } else if (process.argv.includes('--add')) await measureAdd(dir, city);
  else await measure(dir, city, process.argv.includes('--resume'));
}
