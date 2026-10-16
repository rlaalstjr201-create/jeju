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
