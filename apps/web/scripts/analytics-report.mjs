#!/usr/bin/env node
// 분석 프로그램 (ADR-0078 6): the D1 counters → docs/analytics/YYYY-MM-DD.md, last 7 and 28 days.
//   npm run analytics:report        (needs `npx wrangler login`; reads only, from the remote yeogwi-events)
// Mood taps, cards shown → map opened, the most saved places (net of unsave) and how often date mode was used;
// then 저장 목록 흐름 (ADR-0085, specs/saved-flow-events.md): Q1–Q3 from the counters that are not places.
// Little or no data is said as such, never presented as a finding.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOODS = { rest: '푹 쉬고 싶어', walk: '좀 걷고 싶어', new: '새로운 거', food: '배고파', any: '아무거나' };
const KST = 9 * 3600_000;
export const seoulDay = (ms = Date.now()) => new Date(ms + KST).toISOString().slice(0, 10);
const minus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** One query for both windows: per event × id, the 7-day and the 28-day sums. */
export function reportSql(today) {
  return (
    `SELECT event, id, SUM(CASE WHEN day >= '${minus(today, 6)}' THEN n ELSE 0 END) AS n7, SUM(n) AS n28 ` +
    `FROM counters WHERE day >= '${minus(today, 27)}' AND day <= '${today}' GROUP BY event, id`
  );
}

const pct = (a, b) => `${((100 * a) / b).toFixed(1)}%`;
/** the saved-list flow counters (events/handler.ts FLOW_IDS): not places */
const FLOW = /^(open(:|$)|arrange:|saved:|save:)/;
const OPS = [['up', '위로'], ['down', '아래로'], ['move', '다른 날로'], ['past', '지난 날 펼치기·접기']];

/** 저장 목록 흐름 for one window (`key` n7 / n28). */
function flowLines(rows, key) {
  const n = (pred) => rows.filter(pred).reduce((s, r) => s + Number(r[key] || 0), 0);
  const id = (x) => n((r) => r.id === x);
  if (!n((r) => FLOW.test(r.id))) return ['데이터 없음.'];
  const dated = id('save:dated');
  const saves = dated + id('save:now');
  const opens = n((r) => r.event === 'open' && /^open(:|$)/.test(r.id));
  const both = id('open:live0:past');
  const ages = ['0', '1', '2', 'x'].map((a) => n((r) => r.event === 'map' && r.id.startsWith(`saved:a${a}:`)));
  const maps = ages.reduce((s, x) => s + x, 0);
  const past = n((r) => r.event === 'map' && /^saved:a.:p$/.test(r.id));
  const later = ages[1] + ages[2];
  const ops = OPS.map(([op, name]) => [name, id(`arrange:${op}`)]);
  const arranged = ops.reduce((s, [, x]) => s + x, 0);
  const out = [
    '- 이 절의 카운터는 저장 목록 흐름 기록이 배포된 날부터 쌓여요. 그 전 날은 0이 아니라 기록이 없는 날이에요(창 안 횟수가 적게 보여요).',
    `- Q1 날짜를 고른 상태의 저장: ${saves ? `${dated} / ${saves} (${pct(dated, saves)})` : '저장 0회'}`,
    `- Q2-a 저장 목록 열기 ${opens}회${opens ? ` 중 ♥ 0이면서 지난 날이 접힌 채: ${both} (${pct(both, opens)})` : ''}`,
    `- Q2-b 목록에서 연 길찾기 ${maps}회${maps ? ` — 담은 날 0일 ${ages[0]}, 1일 ${ages[1]}, 2일 이상 ${ages[2]}, 모름 ${ages[3]}; 그중 지난 날 줄 ${past} (${pct(past, maps)})` : ''}`,
    `- Q2-c 다음 날 이어짐(근사): 목록 길찾기 중 1일 이상 ${later} / 저장 ${saves}${saves ? ` (${pct(later, saves)})` : ''} — 사람 단위가 아니라 전체 비율이라 근사예요.`,
    `- Q3 정리 ${arranged}회${opens ? ` (열기 대비 ${pct(arranged, opens)})` : ''}: ${ops.map(([name, x]) => `${name} ${x}`).join(', ')}`,
  ];
  if (opens < 30) out.push(`- 저장 목록 열기가 ${opens}회뿐이라 비율은 참고만 해요.`);
  return out;
}

/** rows: { event, id, n7, n28 }[]; names: id → place name. */
export function renderReport(allRows, names, today) {
  const rows = allRows.filter((r) => !FLOW.test(r.id));
  const out = [`# 사용 분석 ${today}`, '', `자체 익명 기록(D1 \`yeogwi-events\`) 기준. 7일 = ${minus(today, 6)}~${today}, 28일 = ${minus(today, 27)}~${today} (서울 날짜).`, ''];
  for (const [label, key] of [['지난 7일', 'n7'], ['지난 28일', 'n28']]) {
    const sum = (e, pred = () => true) => rows.filter((r) => r.event === e && pred(r)).reduce((s, r) => s + Number(r[key] || 0), 0);
    out.push(`## ${label}`, '');
    const taps = sum('tap');
    if (!taps && !sum('shown') && !sum('save')) {
      out.push('데이터 없음.', '');
      continue;
    }
    const byMood = Object.entries(MOODS)
      .map(([m, name]) => [name, sum('tap', (r) => r.id === `mood:${m}`)])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    out.push(`- 기분 탭 ${taps}회${taps ? `: ${byMood.map(([name, n]) => `${name} ${n}(${pct(n, taps)})`).join(', ')}` : ''}`);
    const shown = sum('shown');
    const map = sum('map');
    out.push(shown ? `- 카드 노출 ${shown}장 → 지도 열기 ${map}회 (${pct(map, shown)})` : '- 카드 노출 데이터 없음');
    const net = new Map();
    for (const r of rows) {
      if (r.event !== 'save' && r.event !== 'unsave') continue;
      net.set(r.id, (net.get(r.id) ?? 0) + (r.event === 'save' ? 1 : -1) * Number(r[key] || 0));
    }
    const top = [...net].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10);
    if (top.length) {
      out.push('- 저장 상위(저장 − 해제):');
      for (const [id, n] of top) out.push(`  - ${names.get(id) ?? `(지금 데이터에 없는 곳 ${id})`} ${n}`);
    } else out.push('- 저장 데이터 없음');
    out.push('- 날짜 모드 비율: 저장은 아래 「저장 목록 흐름」 Q1, 기분 탭은 GA4 `mood_tap`의 `dated` 값으로 봐요.');
    if (taps < 30) out.push(`- 기분 탭이 ${taps}회뿐이라 비율은 참고만 해요.`);
    out.push('');
  }
  out.push('## 저장 목록 흐름', '', 'ADR-0085. 시각 없이 센 값이에요. 「담은 날」은 기기 안에만 있고, 날 수(0·1·2 이상)만 와요.', '');
  for (const [label, key] of [['지난 7일', 'n7'], ['지난 28일', 'n28']]) out.push(`### ${label}`, '', ...flowLines(allRows, key), '');
  return `${out.join('\n').trimEnd()}\n`;
}

/** `wrangler d1 execute --json` prints [{ results, success, meta }]. */
export function parseWranglerJson(stdout) {
  const v = JSON.parse(stdout);
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || first.success === false || !Array.isArray(first.results)) throw new Error(`unexpected wrangler output: ${stdout.slice(0, 200)}`);
  return first.results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const today = seoulDay();
  // the SQL has no double quotes, so the same command line works in cmd.exe and sh
  let stdout;
  try {
    stdout = execSync(`npx wrangler d1 execute yeogwi-events --remote --json --command "${reportSql(today)}"`, {
      cwd: app,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    console.error(`D1 조회 실패: ${e.message.split('\n')[0]} — \`npx wrangler login\` 뒤 다시 돌려 주세요.`);
    process.exit(1);
  }
  const rows = parseWranglerJson(stdout);
  const names = new Map(JSON.parse(readFileSync(resolve(app, 'public/spots.json'), 'utf8')).map((s) => [s.id, s.name]));
  const dir = resolve(app, '../../docs/analytics');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${today}.md`);
  writeFileSync(file, renderReport(rows, names, today));
  console.log(`${rows.length} rows → ${file}`);
}
