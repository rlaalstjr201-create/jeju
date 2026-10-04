#!/usr/bin/env node
// 의견 보내기 읽기 (ADR-0081 5, specs/survey.md "읽기"): the D1 `feedback` rows → a summary on stdout only.
//   node scripts/feedback-report.mjs                    last 28 days (needs `npx wrangler login`; reads only, remote)
//   node scripts/feedback-report.mjs --days 7
//   node scripts/feedback-report.mjs --count-since 2026-10-05   one line: 설문 새 응답 N건 (the weekly task)
// Nothing is written to a file: the answers' own words never go into the repository.
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWranglerJson, seoulDay } from './analytics-report.mjs';

const WENT = { went: '갔어요', not: '안 갔어요', yet: '아직' };
const PAINS = { far: '생각보다 멀었어요', closed: '가 보니 닫혀 있었어요', meh: '골라 준 곳이 별로였어요', gps: '위치가 잘 안 잡혔어요', slow: '느리거나 잘 안 열렸어요' };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const minus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

function day(v) {
  if (!DAY.test(v ?? '')) throw new Error(`not a day: ${v}`);
  return v;
}
/** the rows from `since` on, oldest first (no double quotes: the same command line in cmd.exe and sh) */
export const reportSql = (since) => `SELECT day, went, pains, pain, wish, v FROM feedback WHERE day >= '${day(since)}' ORDER BY day, rowid`;
export const countSql = (since) => `SELECT COUNT(*) AS n FROM feedback WHERE day >= '${day(since)}'`;

function pains(raw) {
  try {
    const v = JSON.parse(raw ?? 'null');
    return Array.isArray(v) ? v.filter((p) => p in PAINS) : [];
  } catch {
    return [];
  }
}

/** rows: { day, went, pains, pain, wish, v }[] */
export function renderFeedback(rows, since, today) {
  const out = [`설문 응답 ${since}~${today} (서울 날짜): ${rows.length}건`];
  if (!rows.length) return `${out[0]}\n`;
  if (rows.length < 10) out.push(`응답이 ${rows.length}건뿐이라 비율로 결론 내지 않아요.`);
  const byDay = new Map();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + 1);
  out.push('', '날짜별:', ...[...byDay].map(([d, n]) => `  ${d} ${n}`));
  const count = (list) => {
    const m = new Map();
    for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const went = count(rows.map((r) => r.went).filter((w) => w in WENT));
  out.push('', `골라 준 곳에 실제로 갔나요? (답한 ${[...went.values()].reduce((a, b) => a + b, 0)}건)`, ...Object.entries(WENT).map(([k, label]) => `  ${label} ${went.get(k) ?? 0}`));
  const pain = count(rows.flatMap((r) => pains(r.pains)));
  out.push('', '불편했던 점(여러 개):', ...Object.entries(PAINS).map(([k, label]) => `  ${label} ${pain.get(k) ?? 0}`));
  for (const [key, label] of [['pain', '그 밖에 불편했던 점'], ['wish', '있었으면 하는 것']]) {
    const texts = rows.filter((r) => r[key]);
    out.push('', `${label} (${texts.length}건):`, ...texts.map((r) => `  [${r.day} ${r.v}] ${String(r[key]).replace(/\s+/g, ' ')}`));
  }
  return `${out.join('\n')}\n`;
}

function query(sql) {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    return parseWranglerJson(
      execSync(`npx wrangler d1 execute yeogwi-events --remote --json --command "${sql}"`, { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }),
    );
  } catch (e) {
    console.error(`D1 조회 실패: ${e.message.split('\n')[0]} (\`npx wrangler login\` 뒤 다시 돌려 주세요)`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const today = seoulDay();
  const countSince = opt('--count-since');
  if (countSince) {
    const n = Number(query(countSql(countSince))[0]?.n ?? 0);
    console.log(`설문 새 응답 ${n}건 (${countSince} 이후)`);
  } else {
    const days = Number(opt('--days') ?? 28);
    if (!Number.isInteger(days) || days < 1) throw new Error(`--days ${days}`);
    const since = minus(today, days - 1);
    process.stdout.write(renderFeedback(query(reportSql(since)), since, today));
  }
}
