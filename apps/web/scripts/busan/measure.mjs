/**
 * 부산 검색수 측정 S4 (plans/busan.md S4, specs/busan.md 3.4, 사전등록 docs/research/busan-popularity/criteria-01.md).
 *
 *   node scripts/busan/measure.mjs --plan   keep 995곳의 키워드(규칙대로) → review/busan/pop-01-plan.json (호출 없음)
 *   node scripts/busan/measure.mjs          네이버 검색광고 keywordstool로 한 번 잰다 → review/busan/pop-01.json
 *
 * 측정은 한 번이다: pop-01.json이 있으면 멈춘다(다시 재려면 주인 승인). 키는 저장소 루트 .env의 NAVER_AD_*이고 출력·
 * 파일 어디에도 남기지 않는다. 키워드 규칙은 제주 4회차(criteria-04)의 꼴을 부산에 맞춘 것이고, 측정 전에 고정한다.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, keywordstool, volume03 } from '../famous-measure.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const busanDir = resolve(webRoot, 'review/busan');
export const CRITERIA = 'docs/research/busan-popularity/criteria-01.md';
export const BATCH = 5;
export const GAP_MS = 500;
/** criteria-01 §5: a call with no answer (network, 429, 5xx) is tried again at most twice; any other status is final. */
export const RETRIES = 2;
export const RETRY_WAIT_MS = [3000, 6000];
export const FOOD_TYPE = 39;

/** criteria-01 §2 K4: Jeju's kinds of place (criteria-04 R4), longest first. */
export const SUFFIX = ['해안산책로', '해안도로', '해수욕장', '민속마을', '자연휴양림', '휴양림', '산책로', '식물원', '수목원', '해변', '폭포', '숲길', '계곡'];

/** criteria-01 §3: a made variant (K2~K5) naming something broader or another place — not measured. Fixed before measuring. */
export const BROAD = new Set([
  // 구·동·마을·해변 동네 이름 (그 이름의 검색은 동네 전체에 관한 것)
  '해운대', '광안리', '다대포', '송도', '부산송도', '송정', '일광', '임랑', '화명', '오시리아', '절영', '감지',
  // 같은 이름의 다른 곳(산·절·길)
  '달음산', '장안사', '이바구길',
  // 흔한 낱말·다른 도시에도 있는 이름
  '금강', '홍연', '사계', '차이나타운', '중앙공원', '중앙시장', '어린이대공원', '영화의거리', '올림픽동산', '치유의숲', '가톨릭센터',
  '수학문화관', '119안전체험관',
]);

const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Letters and digits only (keywordstool takes no spaces), Latin upper-cased (the tool answers in capitals). */
export const squash = (s) => String(s).replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
const len = (s) => [...s].length;

/** The card name without a trailing 「(…)」. */
export const mainOf = (name) => cleanName(name).replace(/\s*\([^)]*\)\s*$/, '').trim();

/** criteria-01 §2 K1: the card-name keyword. 「(부산)」 on the name (TourAPI's mark for a name another region shares) and a
 * 음식점 name of 3 letters or fewer (a common shop name) are measured as 「부산」 + the name. */
export function keyword1(place) {
  const name = cleanName(place.title);
  const main = squash(mainOf(name));
  if (/\(부산\)\s*$/.test(name)) return { k: `부산${main}`, why: '이름 끝 「(부산)」: 다른 지역에 같은 이름이 있음 → 부산 + 이름' };
  if (place.contenttypeid === FOOD_TYPE && len(main) <= 3) return { k: `부산${main}`, why: '세 글자 이하 음식점 이름(흔한 가게 이름) → 부산 + 이름' };
  return { k: main, why: '카드 이름' };
}

/** criteria-01 §2: every keyword of one place, the first being K1 — no duplicates, no BROAD, no other place's K1. */
export function keywordsOf(place, otherK1 = new Set()) {
  const name = cleanName(place.title);
  const main = mainOf(name);
  const k1 = keyword1(place);
  const out = [k1];
  const add = (raw, why) => {
    const k = squash(raw);
    if (len(k) >= 2 && !BROAD.has(k) && !otherK1.has(k) && !out.some((x) => x.k === k)) out.push({ k, why });
  };
  // K2: a leading 「부산 」·「부산광역시 」 (its own word) or 「국립」 taken off, again if another follows; 3 letters or more left
  let p = main;
  for (;;) {
    const next = p.replace(/^(부산광역시|부산)\s+/, '').replace(/^국립/, '');
    if (next === p || len(squash(next)) < 3) break;
    p = next;
    add(p, '앞의 「부산」·「국립」을 뗀 이름');
  }
  // K3: the other names in a trailing 「(…)」, split at commas — not a qualifier (it says 부산) or a stretch (it has ~)
  const paren = /\(([^)]*)\)\s*$/.exec(name)?.[1];
  if (paren && !/부산|~/.test(paren)) for (const a of paren.split(',')) add(a, '이름 괄호 안의 다른 이름');
  // K5: a 음식점's 본점 word taken off (the shop's own name); 3 letters or fewer left → 부산 + it
  if (place.contenttypeid === FOOD_TYPE) {
    const words = main.split(' ');
    const base = words.length > 1 && words.at(-1).endsWith('본점') ? words.slice(0, -1).join(' ') : main.endsWith('본점') ? main.slice(0, -2) : null;
    if (base !== null && len(squash(base)) >= 2) {
      const b = squash(base);
      if (len(b) <= 3) add(`부산${b}`, '「본점」을 뗀 이름(세 글자 이하 → 부산 + 이름)');
      else add(b, '「본점」을 뗀 이름');
    }
  }
  // K4: a trailing kind of place taken off any keyword so far, 2 letters or more left (not a 음식점: those words name places)
  if (place.contenttypeid !== FOOD_TYPE) for (const { k } of [...out]) {
    const s = SUFFIX.find((x) => k.endsWith(x) && len(k) - len(x) >= 2);
    if (s) add(k.slice(0, -s.length), `끝의 「${s}」를 뗀 짧은 이름`);
  }
  return out;
}

/** criteria-01 §1: the places measured — every S3 keep, in id order, with their source type and mood. */
export function targets(dir = busanDir) {
  const verdicts = new Map();
  const judgeDir = resolve(dir, 'judge-01');
  for (const f of readdirSync(judgeDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort()) {
    for (const v of JSON.parse(readFileSync(resolve(judgeDir, f), 'utf8'))) verdicts.set(v.id, v);
  }
  return JSON.parse(readFileSync(resolve(dir, 'scope.json'), 'utf8'))
    .items.filter((it) => verdicts.get(it.id)?.keep === true)
    .map((it) => ({ id: it.id, title: it.title, contenttypeid: it.contenttypeid, mood: verdicts.get(it.id).mood }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The keyword plan for every target: [{ id, name, keywords: [{ keyword, why }] }]. */
export function plan(list = targets()) {
  const k1 = list.map((p) => keyword1(p).k);
  return list.map((p, i) => {
    const others = new Set(k1.filter((_, j) => j !== i));
    return { id: p.id, name: cleanName(p.title), keywords: keywordsOf(p, others).map(({ k, why }) => ({ keyword: k, why })) };
  });
}

/** criteria-01 §4: a place's value — the K1 volume must be there (else null: 확인 실패); other missing ones are left out. */
export function placeVolume(keywords) {
  if (!Number.isInteger(keywords[0]?.volume)) return null;
  return keywords.reduce((n, x) => n + (Number.isInteger(x.volume) ? x.volume : 0), 0);
}

const answered = (status) => typeof status === 'number' && status !== 429 && status < 500;

/** One keywordstool call with the §5 retries. Returns { status, rows, tries }. */
export async function callWithRetry(batch, keys, tool = keywordstool, sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))) {
  let r;
  let tries = 0;
  for (;;) {
    r = await tool(batch, keys);
    tries++;
    if (r.rows || answered(r.status) || tries > RETRIES) return { ...r, tries };
    await sleep(RETRY_WAIT_MS[tries - 1]);
  }
}

async function measure() {
  const out = resolve(busanDir, 'pop-01.json');
  if (existsSync(out)) throw new Error(`${out} exists — the measurement runs once (re-running needs the owner's approval)`);
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing in the repo-root .env');
  const committed = JSON.parse(readFileSync(resolve(busanDir, 'pop-01-plan.json'), 'utf8'));
  const rows = plan();
  if (JSON.stringify(rows) !== JSON.stringify(committed.rows)) throw new Error('pop-01-plan.json is not what the rules make now — the plan is fixed before measuring');
  const all = [...new Set(rows.flatMap((r) => r.keywords.map((x) => x.keyword)))].sort();
  const found = new Map();
  const calls = [];
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const r = await callWithRetry(batch, keys);
    const hits = batch.map((k) => r.rows?.find((x) => x.relKeyword.replace(/\s+/g, '') === k) ?? null);
    calls.push({ at: new Date().toISOString(), batch, status: r.status, tries: r.tries, raw: hits.filter(Boolean).map((h) => ({ relKeyword: h.relKeyword, monthlyPcQcCnt: h.monthlyPcQcCnt, monthlyMobileQcCnt: h.monthlyMobileQcCnt })) });
    batch.forEach((k, j) => {
      const hit = hits[j];
      found.set(k, hit ? { pc: hit.monthlyPcQcCnt, mobile: hit.monthlyMobileQcCnt, volume: volume03(hit) } : { volume: null, status: r.rows ? 'keyword missing from the response' : r.status });
    });
    process.stdout.write(`\r${calls.length}/${Math.ceil(all.length / BATCH)}`);
    await new Promise((ok) => setTimeout(ok, GAP_MS));
  }
  for (const row of rows) {
    for (const x of row.keywords) Object.assign(x, found.get(x.keyword));
    row.volume = placeVolume(row.keywords);
  }
  const failed = rows.filter((r) => r.volume === null).map((r) => r.id);
  const missingKeywords = rows.flatMap((r) => r.keywords.filter((x) => x.volume === null).map((x) => x.keyword));
  const failedCalls = calls.filter((c) => !c.raw.length && c.status !== 200).map(({ batch, status, tries }) => ({ batch, status, tries }));
  const totalTries = calls.reduce((n, c) => n + c.tries, 0);
  writeFileSync(
    out,
    `${JSON.stringify({ round: '01', criteria: CRITERIA, source: 'Naver 검색광고 keywordstool, showDetail=1', places: rows.length, keywords: all.length, calls: calls.length, tries: totalTries, failed, missingKeywords, failedCalls, rows, callLog: calls }, null, 1)}\n`,
  );
  console.log(`\npop-01.json: ${rows.length} places, ${all.length} keywords, ${calls.length} calls (${totalTries} tries), 확인 실패 곳 ${failed.length}, 빠진 키워드 ${missingKeywords.length}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--plan')) {
    const rows = plan();
    const n = new Set(rows.flatMap((r) => r.keywords.map((x) => x.keyword))).size;
    writeFileSync(resolve(busanDir, 'pop-01-plan.json'), `${JSON.stringify({ criteria: CRITERIA, places: rows.length, keywords: n, calls: Math.ceil(n / BATCH), rows }, null, 1)}\n`);
    console.log(`pop-01-plan.json: ${rows.length} places, ${n} keywords, ${Math.ceil(n / BATCH)} calls`);
  } else await measure();
}
