/**
 * 유명한 곳 인기 측정 (ADR-0092 Amendment 2, docs/research/famous-popularity/criteria.md): one run, fixed before it.
 * For every `famous: true` place in public/spots.json, two Naver search calls — blog and cafearticle, display=1 — and
 * their `total`. One attempt per call, no retry; a call that fails is recorded as null (확인 실패), never 0.
 * `--round 02` (Amendment 3, docs/research/famous-popularity/criteria-02.md) uses popQuery02 and writes pop-02.json.
 * Writes review/famous/pop-NN.json and refuses to run if it is already there (run once). The API keys come from the
 * repo-root .env (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET) and are never printed or written.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUND = process.argv.includes('--round') ? process.argv[process.argv.indexOf('--round') + 1] : '01';
const OUT = resolve(root, `review/famous/pop-${ROUND}.json`);
const CRITERIA = ROUND === '01' ? 'docs/research/famous-popularity/criteria.md' : `docs/research/famous-popularity/criteria-${ROUND}.md`;
const ENDPOINTS = { blog: 'https://openapi.naver.com/v1/search/blog', cafe: 'https://openapi.naver.com/v1/search/cafearticle' };
const MAX_CALLS = 150;
const GAP_MS = 150;

/** criteria §2: the name's main part (a trailing 「(…)」 alias dropped, spaces collapsed), then 「 제주」 unless it says 제주. */
export function popQuery(name) {
  const main = name.replace(/\s+/g, ' ').trim().replace(/\s*\([^)]*\)$/, '').trim();
  return main.includes('제주') ? main : `${main} 제주`;
}

/** criteria-02 §2: the same main part, with `~` and `/` as spaces and the operator's long name shortened (a leading
 * 「제주도립」 or 「서귀포시립」 dropped, then 「제주특별자치도 」 → 「제주」), as one exact phrase in double quotes, then 「 제주」 for every
 * place (outside the quotes). */
export function popQuery02(name) {
  const main = name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[~/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(제주도립|서귀포시립)/, '')
    .replace(/^제주특별자치도 /, '제주');
  return `"${main}" 제주`;
}

// --- round 03 (Amendment 4, docs/research/famous-popularity/criteria-03.md): 검색량, Naver 검색광고 keywordstool ---

/** criteria-03 §2 alias column: where the name on the card is not what people type, decided before any volume was seen. */
export const ALIAS03 = {
  '신창~차귀해안도로': ['신창풍차해안도로', '흔히 부르는 이름(풍차가 서 있는 신창~차귀 해안도로)'],
  '어승생(어승생악)': ['어승생악', '괄호 안의 정식 이름. 「어승생」만으로는 잘 쓰지 않음'],
  '항파두리항몽유적지': ['항파두리', '흔히 부르는 이름. 「항몽유적지」는 문화재 지정 명칭'],
  '민속자연사박물관': ['제주민속자연사박물관', '정식 이름의 지역명. 없으면 다른 지역 박물관과 섞임'],
  '애월한담해안산책로': ['한담해안산책로', '흔히 부르는 이름. 「애월」은 동네 이름'],
};

/** criteria-03 §2: the alias if listed, else the name — a trailing 「(…)」 dropped, the operator's long name shortened as in
 * round 02 (a leading 「제주도립」/「서귀포시립」 off, 「제주특별자치도 」 → 「제주」) — with every space and every mark
 * that is not a letter or digit removed (keywordstool takes no spaces). */
export function keyword03(name) {
  const alias = ALIAS03[name]?.[0];
  const base = alias ?? name.replace(/\s*\([^)]*\)\s*$/, '').trim().replace(/^(제주도립|서귀포시립)/, '').replace(/^제주특별자치도 /, '제주');
  return base.replace(/[^\p{L}\p{N}]/gu, '');
}

/** criteria-03 §3: monthlyPcQcCnt + monthlyMobileQcCnt, a 「< 10」 counted as 5; null when not a number. */
export function volume03(row) {
  const one = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : typeof v === 'string' && /^<\s*10$/.test(v.trim()) ? 5 : null);
  const pc = one(row?.monthlyPcQcCnt);
  const mo = one(row?.monthlyMobileQcCnt);
  return pc === null || mo === null ? null : pc + mo;
}

/** criteria-03 §4: keywordstool for up to 5 keywords; the rows whose relKeyword is one of them (spaces removed). */
async function keywordstool(keywords, keys) {
  const { createHmac } = await import('node:crypto');
  const ts = String(Date.now());
  const sig = createHmac('sha256', keys.secret).update(`${ts}.GET./keywordstool`).digest('base64');
  const url = `https://api.searchad.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keywords.join(','))}&showDetail=1`;
  try {
    const res = await fetch(url, { headers: { 'X-Timestamp': ts, 'X-API-KEY': keys.api, 'X-Customer': keys.customer, 'X-Signature': sig } });
    if (!res.ok) return { status: res.status, rows: null };
    const data = await res.json();
    const want = new Set(keywords);
    const rows = (data.keywordList ?? []).filter((r) => typeof r.relKeyword === 'string' && want.has(r.relKeyword.replace(/\s+/g, '')));
    return { status: res.status, rows };
  } catch {
    return { status: 'network', rows: null };
  }
}

async function run03() {
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing in the repo-root .env');
  const famous = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8'))
    .filter((s) => s.famous === true)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const rows = famous.map((s) => ({ id: s.id, name: s.name, keyword: keyword03(s.name), ...(ALIAS03[s.name] ? { aliasReason: ALIAS03[s.name][1] } : {}) }));
  let calls = 0;
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const r = await keywordstool(batch.map((x) => x.keyword), keys);
    calls++;
    const at = new Date().toISOString();
    for (const row of batch) {
      row.at = at;
      const hit = r.rows?.find((x) => x.relKeyword.replace(/\s+/g, '') === row.keyword);
      if (!hit) {
        row.volume = null;
        row.status = r.rows ? 'keyword missing from the response' : r.status;
        continue;
      }
      row.pc = hit.monthlyPcQcCnt;
      row.mobile = hit.monthlyMobileQcCnt;
      row.volume = volume03(hit);
      if (row.volume === null) row.status = 'not a number';
    }
    await new Promise((ok) => setTimeout(ok, 300));
  }
  const failed = rows.filter((r) => r.volume === null).length;
  writeFileSync(OUT, `${JSON.stringify({ round: ROUND, criteria: CRITERIA, source: 'Naver 검색광고 keywordstool', calls, failed, rows }, null, 1)}\n`);
  console.log(`pop-${ROUND}.json: ${rows.length} places, ${calls} calls, 확인 실패 ${failed}`);
}

function env(key) {
  for (const line of readFileSync(resolve(root, '../../.env'), 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0 && line.slice(0, eq).trim() === key) return line.slice(eq + 1).trim();
  }
  return '';
}

async function total(endpoint, query, headers) {
  try {
    const res = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&display=1`, { headers });
    if (!res.ok) return { total: null, status: res.status };
    const data = await res.json();
    return Number.isInteger(data.total) && data.total >= 0 ? { total: data.total, status: res.status } : { total: null, status: res.status };
  } catch {
    return { total: null, status: 'network' };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(OUT)) throw new Error(`${OUT} exists — the measurement runs once (re-running needs the owner's approval)`);
  if (ROUND === '03') {
    await run03();
    process.exit(0);
  }
  const id = env('NAVER_CLIENT_ID');
  const secret = env('NAVER_CLIENT_SECRET');
  if (!id || !secret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET missing in the repo-root .env');
  const headers = { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret };
  const famous = JSON.parse(readFileSync(resolve(root, 'public/spots.json'), 'utf8'))
    .filter((s) => s.famous === true)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (famous.length * 2 > MAX_CALLS) throw new Error(`${famous.length * 2} calls is over ${MAX_CALLS}`);
  const rows = [];
  for (const s of famous) {
    const query = ROUND === '01' ? popQuery(s.name) : popQuery02(s.name);
    const row = { id: s.id, name: s.name, query };
    for (const [k, url] of Object.entries(ENDPOINTS)) {
      const r = await total(url, query, headers);
      row[k] = r.total;
      if (r.total === null) row[`${k}Status`] = r.status;
      await new Promise((ok) => setTimeout(ok, GAP_MS));
    }
    row.at = new Date().toISOString();
    rows.push(row);
  }
  const failed = rows.filter((r) => r.blog === null || r.cafe === null).length;
  writeFileSync(OUT, `${JSON.stringify({ round: ROUND, criteria: CRITERIA, calls: rows.length * 2, failed, rows }, null, 1)}\n`);
  console.log(`pop-${ROUND}.json: ${rows.length} places, ${rows.length * 2} calls, 확인 실패 ${failed}`);
}
