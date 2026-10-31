#!/usr/bin/env node
// 분석 프로그램 (ADR-0078 6): the D1 counters → docs/analytics/YYYY-MM-DD.md, last 7 and 28 days.
//   npm run analytics:report        (needs `npx wrangler login`; reads only, from the remote yeogwi-events)
// Mood taps, cards shown → map opened, the most saved places (net of unsave) and how often date mode was used;
// then 저장 목록 흐름 (ADR-0085, specs/saved-flow-events.md): Q1–Q3 from the counters that are not places;
// then 숙소 링크 (ADR-0089): per partner tag, 들어옴 · 기분 누름 · 길찾기 and the two ratios;
// then 시작 화면 (specs/busan.md 7): seen, started (how · why · 여행지) and the rule set in advance for its 4th week.
// Little or no data is said as such, never presented as a finding.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOODS = { rest: '푹 쉬고 싶어', walk: '좀 걷고 싶어', new: '놀러', famous: '유명한 데', food: '배고파', any: '아무거나' };
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
/** 숙소 링크 counters (ADR-0089): `src:<tag>`, not places and not the overall taps / maps */
const SRC = /^src:/;
const OPS = [['up', '위로'], ['down', '아래로'], ['move', '다른 날로'], ['past', '지난 날 펼치기·접기']];
/** 시작 화면 counters (events/handler.ts START_IDS): `start:view`, `start:<how>:<why>:<dest>` — not places */
const START = /^start:/;
const HOW = { gps: '내 위치', pick: '직접 고름' };
const WHY = { none: '', denied: '거절 뒤', unavailable: '못 찾은 뒤', outside: '밖 문구 뒤' };
const DEST = { jeju: '제주', busan: '부산', gangwon: '강릉', nation: '다른 곳' };

/** 시작 화면 for one window. The rule set in advance (plans/busan.md 결과 생성 표): 4 weeks after the release, with
 * start_view ≥ 100, start_done ÷ start_view < 70% reopens its form; under 100 it is 판단 보류. */
function startLines(rows, key) {
  const n = (pred) => rows.filter(pred).reduce((s, r) => s + Number(r[key] || 0), 0);
  const view = n((r) => r.event === 'start_view' && r.id === 'start:view');
  const done = rows.filter((r) => r.event === 'start_done' && START.test(r.id));
  const doneN = n((r) => done.includes(r));
  if (!view && !doneN) return ['데이터 없음.'];
  const by = new Map();
  for (const r of done) {
    const [, how, why, dest] = r.id.split(':');
    const k = `${HOW[how] ?? how}${WHY[why] ? `(${WHY[why]})` : ''} → ${DEST[dest] ?? dest}`;
    by.set(k, (by.get(k) ?? 0) + Number(r[key] || 0));
  }
  const parts = [...by].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return [
    `- 보임 ${view}회 → 시작 ${doneN}회${view ? ` (${pct(doneN, view)})` : ''}`,
    ...(parts.length ? [`- 시작한 길: ${parts.map(([k, x]) => `${k} ${x}`).join(', ')}`] : []),
    view >= 100
      ? `- 미리 정한 기준(출시 4주 뒤 한 번): 시작÷보임 ${pct(doneN, view)} — 70% 미만이면 시작 화면 꼴을 다시 열어요.`
      : `- 보임이 ${view}회라 100회 전에는 판단 보류예요.`,
  ];
}

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

/** 숙소 링크 for one window: one line per tag, most arrivals first. The rule set in advance (ADR-0089 5) is
 * for 2 weeks per 숙소; under 100 taps the ratios are 판단 보류. */
function srcLines(rows, key) {
  const by = new Map();
  for (const r of rows) {
    if (!SRC.test(r.id) || !['open', 'tap', 'map'].includes(r.event)) continue;
    const t = by.get(r.id.slice(4)) ?? { open: 0, tap: 0, map: 0 };
    t[r.event] += Number(r[key] || 0);
    by.set(r.id.slice(4), t);
  }
  const list = [...by].filter(([, t]) => t.open + t.tap + t.map > 0).sort((a, b) => b[1].open - a[1].open || (a[0] < b[0] ? -1 : 1));
  if (!list.length) return ['데이터 없음.'];
  return list.map(([tag, t]) => {
    const ratios = `기분÷들어옴 ${t.open ? pct(t.tap, t.open) : '-'}, 길찾기÷기분 ${t.tap ? pct(t.map, t.tap) : '-'}`;
    const notes = [...(t.open < 10 ? ['들어옴 10 미만'] : []), ...(t.tap < 100 ? ['기분 누름 100 미만이라 판단 보류'] : [])];
    return `- ${tag}: 들어옴 ${t.open}, 기분 누름 ${t.tap}, 길찾기 ${t.map} — ${ratios}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  });
}

/** rows: { event, id, n7, n28 }[]; names: id → place name. */
export function renderReport(allRows, names, today) {
  const rows = allRows.filter((r) => !FLOW.test(r.id) && !SRC.test(r.id) && !START.test(r.id));
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
  out.push('## 숙소 링크', '', 'ADR-0089. 숙소마다 2주로 판단해요: 들어옴 10 미만이면 접고, 기분÷들어옴 60% 이상·길찾기÷기분 30% 이상이면 통과.', '');
  for (const [label, key] of [['지난 7일', 'n7'], ['지난 28일', 'n28']]) out.push(`### ${label}`, '', ...srcLines(allRows, key), '');
  out.push('## 시작 화면', '', 'specs/busan.md 7. 1초 넘게 보인 덮개만 「보임」, 그 뒤에 시작한 것만 「시작」으로 세요(자동화 브라우저는 빼요). 판정은 이 수치로 하고 GA4는 보조예요.', '');
  for (const [label, key] of [['지난 7일', 'n7'], ['지난 28일', 'n28']]) out.push(`### ${label}`, '', ...startLines(allRows, key), '');
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
  // both destinations' places (부산's file where there is one, plans/busan.md) and the 자동 지역's (nt-, plans/nationwide-app.md U15)
  const nation = resolve(app, 'data/nation');
  const nationFiles = existsSync(nation) ? readdirSync(nation).filter((f) => /^\d+\.json$/.test(f)).map((f) => `data/nation/${f}`) : [];
  const lists = ['public/spots.json', 'public/spots-busan.json', 'data/gangwon/spots-gangwon.json', ...nationFiles].map((f) => resolve(app, f)).filter((f) => existsSync(f));
  const names = new Map(lists.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).map((s) => [s.id, s.name])));
  const dir = resolve(app, '../../docs/analytics');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${today}.md`);
  writeFileSync(file, renderReport(rows, names, today));
  console.log(`${rows.length} rows → ${file}`);
}
